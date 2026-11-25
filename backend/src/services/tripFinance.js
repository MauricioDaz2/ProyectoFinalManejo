const { randomInt } = require('node:crypto');
const { sql, conectarBD } = require('../config/db');
const trip = require('./tripOperations');
const cc = require('./frequencyControl');
const { fail, norm } = require('./tripRules');

const categories = ['COMBUSTIBLE', 'ALIMENTACION', 'PEAJE', 'HOSPEDAJE', 'OTROS'];
const paid = "UPPER(LTRIM(RTRIM(EST_BOL))) IN ('OK','PAGADO','EMITIDO','CONFIRMADO','USADO')";
const request = (db, id) => new sql.Request(db).input('hoja', sql.VarChar(5), id);

function money(value) {
    const text = String(value ?? '');
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw fail(400, 'Introduce un importe válido.');
    return Math.round(Number(text) * 100);
}

function operation(value) {
    if (typeof value !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) {
        throw fail(400, 'Identificador de operación inválido.');
    }
    return value;
}

async function active(db, user, id, lock = false) {
    if (lock) await trip.actor(db, user);
    const h = id ? await trip.sheet(db, user, id, lock) : (await trip.sheets(db, user)).find(h => norm(h.EST_VIA_HOJ) === 'EN CURSO');
    if (!h || norm(h.EST_VIA_HOJ) !== 'EN CURSO') throw fail(409, 'No tienes un viaje en curso.');
    return h;
}

async function quote(db, h) {
    const route = await trip.stops(db, h);
    const origin = route[h.PARADA_ACTUAL ?? 0];
    const destinations = route.filter(p => p.COMERCIAL && p.ORDEN > origin?.ORDEN && p.NOMBRE.length <= 20);
    const result = await request(db, h.ID_HOJ).query(`
        SELECT F.TAR_BAS_FRE FROM dbo.HOJAS_RUTAS H JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER WHERE H.ID_HOJ=@hoja;
        SELECT A.ID_ASI,A.PIS_ASI,A.FIL_ASI,A.COL_ASI,
               CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.BOLETOS T WHERE T.ID_HOJ_PER=@hoja AND T.ID_ASI_PER=A.ID_ASI AND ${cc.activeTicket}) THEN 0 ELSE 1 END) AS libre
        FROM dbo.HOJAS_RUTAS H JOIN dbo.ASIENTOS_BUS A ON A.ID_BUS_PER=${cc.effectiveBus()}
        WHERE H.ID_HOJ=@hoja ORDER BY A.PIS_ASI,A.FIL_ASI,A.COL_ASI,A.ID_ASI;`);
    const price = result.recordsets[0][0].TAR_BAS_FRE;
    const available = Boolean(origin?.COMERCIAL && origin.NOMBRE.length <= 20 && destinations.length && price != null && price > 0);
    return { id: h.ID_HOJ, origen: origin?.NOMBRE, destinos: destinations, precio: price, disponible: available, asientos: result.recordsets[1] };
}

async function current(user) {
    const db = await conectarBD();
    return quote(db, await active(db, user));
}

async function sell(user, id, body) {
    const cash = money(body.efectivo);
    const token = operation(body.operacion);
    return trip.transaction(async db => {
        await cc.lock(db);
        const h = await active(db, user, id, true);
        const sale = request(db, h.ID_HOJ).input('token', sql.UniqueIdentifier, token);
        const prior = (await sale.query(`
            SELECT V.ID_BOL boleto, V.VUELTO vuelto, T.PRE_FIN_BOL precio, T.ID_ASI_PER asiento,
                   T.ID_HOJ_PER hoja, V.ID_USU actor, V.EFECTIVO efectivo
            FROM dbo.HOJA_VENTAS_BORDO V JOIN dbo.BOLETOS T ON T.ID_BOL=V.ID_BOL WHERE V.ID_OPERACION=@token`)).recordset[0];
        if (prior) {
            if (prior.hoja !== h.ID_HOJ || prior.actor !== user.id || prior.asiento !== body.asiento || money(prior.efectivo) !== cash) {
                throw fail(409, 'Identificador de venta en uso.');
            }
            return { boleto: prior.boleto, vuelto: prior.vuelto, precio: prior.precio };
        }

        const q = await quote(db, h);
        if (!q.disponible) throw fail(409, 'La parada actual o la tarifa no permite vender.');
        const destination = q.destinos.find(p => p.ORDEN === body.destino);
        if (!destination) throw fail(400, 'Selecciona un destino posterior autorizado.');
        if (!q.asientos.some(a => a.ID_ASI === body.asiento && a.libre)) throw fail(409, 'El asiento ya no está disponible.');
        const price = money(q.precio);
        if (cash < price) throw fail(400, 'El efectivo recibido es inferior a la tarifa.');

        for (let attempt = 0; attempt < 10; attempt++) {
            const ticket = 'V' + randomInt(36 ** 4).toString(36).toUpperCase().padStart(4, '0');
            const inserted = await request(db, h.ID_HOJ)
                .input('ticket', sql.VarChar(5), ticket).input('token', sql.UniqueIdentifier, token)
                .input('seat', sql.VarChar(5), body.asiento).input('actor', sql.VarChar(10), user.id)
                .input('origin', sql.VarChar(20), q.origen).input('destination', sql.VarChar(20), destination.NOMBRE)
                .input('price', sql.Decimal(10,2), price / 100).input('cash', sql.Decimal(10,2), cash / 100)
                .input('change', sql.Decimal(10,2), (cash-price) / 100)
                .input('controller', sql.VarChar(10), user.rolId === 'R004' ? user.id : null)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.BOLETOS WITH (UPDLOCK,HOLDLOCK) WHERE ID_BOL=@ticket)
                    BEGIN
                        INSERT dbo.BOLETOS (ID_BOL,ORI_TRA_BOL,DES_TRA_BOL,PRE_FIN_BOL,MET_PAG_BOL,EST_BOL,COD_QR_BOL,FEC_COM_BOL,ID_HOJ_PER,ID_ASI_PER,ID_USU_CON)
                        VALUES (@ticket,@origin,@destination,@price,'EFECTIVO','PAGADO',@ticket,${cc.today},@hoja,@seat,@controller);
                        INSERT dbo.HOJA_VENTAS_BORDO (ID_OPERACION,ID_BOL,ID_USU,EFECTIVO,VUELTO)
                        VALUES (@token,@ticket,@actor,@cash,@change);
                        SELECT @ticket AS boleto;
                    END;`);
            if (inserted.recordset?.length) return { boleto: ticket, precio: price / 100, vuelto: (cash-price) / 100 };
        }
        throw fail(409, 'No se pudo asignar un código. Reintenta la venta.');
    });
}

async function report(user, id) {
    const db = await conectarBD();
    await trip.sheet(db, user, id);
    const { recordsets } = await request(db, id).query(`
        SELECT COUNT(*) AS vendidos, COUNT(CASE WHEN UPPER(LTRIM(RTRIM(EST_BOL)))='USADO'
            OR E.abordo=1
            THEN 1 END) AS abordados, COALESCE(SUM(PRE_FIN_BOL),0) AS ingresos,
            (SELECT COALESCE(SUM(MONTO),0) FROM dbo.HOJA_GASTOS WHERE ID_HOJ=@hoja) AS gastos
        FROM dbo.BOLETOS T OUTER APPLY (SELECT TOP (1) 1 AS abordo FROM dbo.HOJA_EVENTOS E WHERE E.ID_HOJ=@hoja AND E.ID_BOL=T.ID_BOL AND E.TIPO='ABORDAJE') E WHERE ID_HOJ_PER=@hoja AND ${paid};
        SELECT ID_GAS,CATEGORIA,MONTO,DETALLE,FECHA_UTC FROM dbo.HOJA_GASTOS WHERE ID_HOJ=@hoja ORDER BY FECHA_UTC DESC;`);
    const totals = recordsets[0][0];
    return { ...totals, saldo: (Math.round(totals.ingresos * 100) - Math.round(totals.gastos * 100)) / 100, registros: recordsets[1] };
}

async function expense(user, id, body) {
    const amount = money(body.monto);
    const token = operation(body.operacion);
    const description = typeof body.detalle === 'string' ? body.detalle.trim() : '';
    if (!amount || !categories.includes(body.categoria) || description.length > 200) throw fail(400, 'Revisa los datos del gasto.');
    return trip.transaction(async db => {
        await active(db, user, id, true);
        const r = await request(db, id).input('token', sql.UniqueIdentifier, token).input('actor', sql.VarChar(10), user.id)
            .input('amount', sql.Decimal(10,2), amount / 100).input('category', sql.VarChar(15), body.categoria)
            .input('description', sql.NVarChar(200), description)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.HOJA_GASTOS WITH (UPDLOCK,HOLDLOCK) WHERE ID_GAS=@token)
                    INSERT dbo.HOJA_GASTOS (ID_GAS,ID_HOJ,ID_USU,CATEGORIA,MONTO,DETALLE)
                    VALUES (@token,@hoja,@actor,@category,@amount,@description);
                SELECT ID_GAS FROM dbo.HOJA_GASTOS WHERE ID_GAS=@token AND ID_HOJ=@hoja AND ID_USU=@actor
                    AND CATEGORIA=@category AND MONTO=@amount AND DETALLE=@description;`);
        if (!r.recordset.length) throw fail(409, 'Identificador de gasto en uso.');
        return { id: token };
    });
}

module.exports = { current, sell, report, expense };
