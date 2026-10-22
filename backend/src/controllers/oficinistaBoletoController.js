const { sql, conectarBD } = require('../config/db');
const crypto = require('crypto');

/**
 * Módulo de Oficinista
 * - Venta de boletos en ventanilla
 * - Validación de reservas/boleto por QR o cédula (COR_USU)
 * - Cambio de estado de boletos
 */

const CODIGO_RE = /^[A-Z0-9_-]{1,10}$/;
const ESTADOS_BOLETO = ['RESERVADO', 'EMITIDO', 'PAGADO', 'USADO', 'CANCELADO', 'ANULADO'];
const ESTADOS_VIAJE = ['PROGRAMADA', 'EN CURSO'];
const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO'];

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const codigo = (valor) => texto(valor).toUpperCase();

function fecha(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const normalizada = String(valor).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalizada) ? normalizada : null;
}

function hoyISO() {
    const ahora = new Date();
    const desfase = ahora.getTimezoneOffset() * 60000;
    return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
}

function generarCodigoQR() {
    const token = crypto.randomBytes(16).toString('hex').toUpperCase();
    const fecha = hoyISO().replace(/-/g, '');
    return `QR-${fecha}-${token}`;
}

function siguienteCodigoBoletos() {
    const sufijo = Date.now().toString().slice(-9);
    return `B${sufijo.padStart(5, '0').slice(-5)}`;
}

function manejarError(res, contexto, error) {
    console.error(`Error en ${contexto}:`, error);
    const numero = error.number ?? error.originalError?.info?.number;

    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, message: 'Ya existe un registro con esos datos.' });
    }
    if (numero === 547) {
        return res.status(409).json({
            success: false,
            message: 'La operación no se puede completar por restricciones de integridad.'
        });
    }

    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

async function contarBoletosPorAsiento(pool, idAsiento, idHoja = null) {
    const resultado = await pool.request()
        .input('asiento', sql.VarChar(5), idAsiento)
        .input('hoja', sql.VarChar(5), idHoja)
        .query(`
            SELECT COUNT(*) AS total
            FROM dbo.BOLETOS
            WHERE ID_ASI_PER = @asiento
              AND (@hoja IS NULL OR ID_HOJ_PER = @hoja)
              AND EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')
        `);
    return resultado.recordset[0].total;
}

/* -------------------------------------------------------------------------- */
/*                            HOJAS DE RUTA PARA VENTANILLA                   */
/* -------------------------------------------------------------------------- */

async function listarHojasParaVentanilla(req, res) {
    const cooperativa = texto(req.query.cooperativa).toUpperCase();
    const fechaFiltro = fecha(req.query.fecha) || hoyISO();

    if (cooperativa && !/^[A-Z0-9_-]{1,5}$/.test(cooperativa)) {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                       B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                       F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE,
                       C.ID_COP, C.NOM_COP,
                       (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS,
                       (SELECT COUNT(*) FROM dbo.BOLETOS BO
                         WHERE BO.ID_HOJ_PER = H.ID_HOJ
                           AND BO.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')) AS ASIENTOS_OCUPADOS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
                WHERE H.FEC_PRO_HOJ = @fecha
                  AND H.EST_VIA_HOJ IN ('PROGRAMADA','EN CURSO')
                  AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                ORDER BY C.NOM_COP, F.CIU_ORI_FRE, F.CIU_DES_FRE
            `);

        const hojas = resultado.recordset.map((hoja) => {
            const total = Number(hoja.TOTAL_ASIENTOS) || 0;
            const ocupados = Number(hoja.ASIENTOS_OCUPADOS) || 0;
            const disponibles = total - ocupados;
            return {
                ...hoja,
                ASIENTOS_OCUPADOS: ocupados,
                TOTAL_ASIENTOS: total,
                ASIENTOS_DISPONIBLES: disponibles > 0 ? disponibles : 0
            };
        });

        return res.status(200).json({
            success: true,
            fecha: fechaFiltro,
            total: hojas.length,
            hojas
        });
    } catch (error) {
        return manejarError(res, 'listado de hojas para ventanilla', error);
    }
}

async function obtenerMapaAsientosHoja(req, res) {
    const idHoja = codigo(req.params.idHoja);
    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja)) {
        return res.status(400).json({ success: false, message: 'Código de hoja de ruta inválido.' });
    }

    try {
        const pool = await conectarBD();
        const hoja = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                       B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                       F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                WHERE H.ID_HOJ = @hoja
            `);

        if (hoja.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        const resultado = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER,
                       T.NOM_TIP, T.PRE_TIP,
                       BOL.ID_BOL, BOL.EST_BOL, BOL.COD_QR_BOL,
                       USU.NOM_USU, USU.APE_USU, USU.COR_USU
                FROM dbo.ASIENTOS_BUS A
                INNER JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_BUS_PER = A.ID_BUS_PER
                LEFT JOIN dbo.BOLETOS BOL ON BOL.ID_ASI_PER = A.ID_ASI AND BOL.ID_HOJ_PER = H.ID_HOJ
                LEFT JOIN dbo.USUARIOS USU ON USU.ID_USU = BOL.ID_USU_FIN
                WHERE H.ID_HOJ = @hoja
                ORDER BY A.PIS_ASI, TRY_CAST(A.ID_ASI AS INT), A.ID_ASI
            `);

        let contadorPiso1 = 0;
        let contadorPiso2 = 0;
        const asientos = resultado.recordset.map((asiento) => {
            if (asiento.PIS_ASI === 2) contadorPiso2 += 1;
            else contadorPiso1 += 1;
            const numero = asiento.PIS_ASI === 2 ? contadorPiso2 : contadorPiso1;
            const ocupado = asiento.ID_BOL && ESTADOS_BOLETO.includes(asiento.EST_BOL) && asiento.EST_BOL !== 'CANCELADO' && asiento.EST_BOL !== 'ANULADO';

            return {
                ID_ASI: asiento.ID_ASI,
                PIS_ASI: asiento.PIS_ASI,
                ETIQUETA: `${asiento.PIS_ASI}${String(numero).padStart(2, '0')}`,
                NUMERO: numero,
                ID_TIP_PER: asiento.ID_TIP_PER,
                NOM_TIP: asiento.NOM_TIP,
                PRE_TIP: asiento.PRE_TIP,
                ID_BOL: asiento.ID_BOL,
                EST_BOL: asiento.EST_BOL,
                COD_QR_BOL: asiento.COD_QR_BOL,
                PASAJERO: asiento.NOM_USU ? `${asiento.NOM_USU} ${asiento.APE_USU}` : null,
                COR_USU: asiento.COR_USU,
                DISPONIBLE: !ocupado
            };
        });

        const pisos = [1, 2]
            .map((piso) => ({
                piso,
                asientos: asientos.filter((a) => a.PIS_ASI === piso)
            }))
            .filter((grupo) => grupo.asientos.length > 0);

        return res.status(200).json({
            success: true,
            hoja: hoja.recordset[0],
            pisos,
            asientos
        });
    } catch (error) {
        return manejarError(res, 'mapa de asientos por hoja', error);
    }
}

async function crearBoletoVentanilla(req, res) {
    const {
        ID_HOJ_PER,
        ID_ASI_PER,
        ID_USU_OFI,
        ID_USU_FIN,
        ORI_TRA_BOL,
        DES_TRA_BOL,
        TIP_DES_BOL,
        PRE_FIN_BOL,
        MET_PAG_BOL,
        NOM_PASAJERO,
        APE_PASAJERO,
        COR_PASAJERO,
        TEL_PASAJERO
    } = req.body;

    const idHoja = codigo(ID_HOJ_PER);
    const idAsiento = codigo(ID_ASI_PER);
    const idOficinista = codigo(ID_USU_OFI);
    const idUsuarioFin = codigo(ID_USU_FIN);

    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja) || !/^[A-Z0-9_-]{1,5}$/.test(idAsiento)) {
        return res.status(400).json({ success: false, message: 'Hoja de ruta o asiento inválidos.' });
    }
    if (!/^[A-Z0-9_-]{1,10}$/.test(idOficinista)) {
        return res.status(400).json({ success: false, message: 'Oficinista inválido.' });
    }
    if (!METODOS_PAGO.includes(texto(MET_PAG_BOL).toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Método de pago inválido.' });
    }

    const precio = Number(PRE_FIN_BOL);
    if (!Number.isFinite(precio) || precio <= 0) {
        return res.status(400).json({ success: false, message: 'Precio del boleto inválido.' });
    }

    let transaccion;
    try {
        const pool = await conectarBD();

        const hoja = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT H.ID_HOJ, H.EST_VIA_HOJ, B.ID_BUS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                WHERE H.ID_HOJ = @hoja
            `);

        if (hoja.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }
        if (!ESTADOS_VIAJE.includes(hoja.recordset[0].EST_VIA_HOJ)) {
            return res.status(400).json({ success: false, message: 'La hoja de ruta no se encuentra disponible para venta.' });
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const ocupados = await new sql.Request(transaccion)
            .input('asiento', sql.VarChar(5), idAsiento)
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT COUNT(*) AS total
                FROM dbo.BOLETOS WITH (UPDLOCK, HOLDLOCK)
                WHERE ID_ASI_PER = @asiento
                  AND ID_HOJ_PER = @hoja
                  AND EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')
            `);

        if (ocupados.recordset[0].total > 0) {
            await transaccion.rollback();
            return res.status(409).json({ success: false, message: 'El asiento ya se encuentra ocupado para esta hoja de ruta.' });
        }

        let idPasajero = idUsuarioFin;
        if (!idPasajero && texto(COR_PASAJERO)) {
            const pasajero = await new sql.Request(transaccion)
                .input('correo', sql.VarChar(40), texto(COR_PASAJERO))
                .query('SELECT TOP 1 ID_USU FROM dbo.USUARIOS WHERE COR_USU = @correo');

            if (pasajero.recordset.length > 0) {
                idPasajero = pasajero.recordset[0].ID_USU;
            }
        }

        const idBoleto = siguienteCodigoBoletos();
        const codigoQR = generarCodigoQR();
        const fechaCompra = hoyISO();
        const metodoPago = texto(MET_PAG_BOL).toUpperCase();

        await new sql.Request(transaccion)
            .input('idBol', sql.VarChar(5), idBoleto)
            .input('ori', sql.VarChar(20), texto(ORI_TRA_BOL) || 'ORIGEN')
            .input('des', sql.VarChar(20), texto(DES_TRA_BOL) || 'DESTINO')
            .input('tip', sql.VarChar(30), texto(TIP_DES_BOL) || 'NORMAL')
            .input('precio', sql.Decimal(18, 0), precio)
            .input('metodo', sql.VarChar(15), metodoPago)
            .input('qr', sql.VarChar(500), codigoQR)
            .input('estado', sql.VarChar(15), 'EMITIDO')
            .input('fecCom', sql.Date, fechaCompra)
            .input('hoja', sql.VarChar(5), idHoja)
            .input('asiento', sql.VarChar(5), idAsiento)
            .input('usuFin', sql.VarChar(10), idPasajero || null)
            .input('usuOfi', sql.VarChar(10), idOficinista)
            .query(`
                INSERT INTO dbo.BOLETOS
                    (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL,
                     COD_QR_BOL, EST_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, ID_USU_OFI)
                VALUES
                    (@idBol, @ori, @des, @tip, @precio, @metodo, @qr, @estado, @fecCom, @hoja, @asiento, @usuFin, @usuOfi)
            `);

        await transaccion.commit();

        return res.status(201).json({
            success: true,
            message: 'Boleto emitido correctamente desde ventanilla.',
            boleto: {
                ID_BOL: idBoleto,
                ID_HOJ_PER: idHoja,
                ID_ASI_PER: idAsiento,
                COD_QR_BOL: codigoQR,
                EST_BOL: 'EMITIDO',
                PRE_FIN_BOL: precio,
                MET_PAG_BOL: metodoPago,
                FEC_COM_BOL: fechaCompra
            }
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* ignore */ }
        }
        return manejarError(res, 'venta de boleto en ventanilla', error);
    }
}

module.exports = {
    listarHojasParaVentanilla,
    obtenerMapaAsientosHoja,
    crearBoletoVentanilla
};
