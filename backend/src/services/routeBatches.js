const { createHash } = require('node:crypto');
const { sql, conectarBD } = require('../config/db');
const cc = require('./frequencyControl');
const categories = require('./routeCategories');
const trips = require('./tripOperations');

const idCode = /^[A-Z0-9_-]{1,5}$/;
const staffCode = /^[A-Z0-9]{5,10}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const clean = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const invalid = (message, fila) => Object.assign(cc.fail(422, 'LOTE_INVALIDO', message), fila ? { details: { fila } } : {});

function time(value) {
    if (typeof value !== 'string' || !timestamp.test(value) || !cc.date(value.slice(0, 10))) return null;
    const t = new Date(value);
    return Number.isFinite(+t) ? t : null;
}

function interval(inicio, fin) {
    const start = time(inicio);
    const end = time(fin);
    if (!start || !end || end <= start) throw invalid('Indica horas completas con zona horaria y una llegada posterior a la salida.');
    return { start, end, day: trips.localDay(start), last: trips.localDay(new Date(+end - 1)) };
}

function parse(body) {
    const { idLote, frecuenciaId, inicio, fin, filas } = body || {};
    if (typeof idLote !== 'string' || !uuid.test(idLote) || !idCode.test(clean(frecuenciaId)) ||
        !Array.isArray(filas) || filas.length < 1 || filas.length > 100) {
        throw invalid('Indica una frecuencia, un identificador de lote y entre 1 y 100 filas.');
    }
    const buses = new Set();
    const workers = new Set();
    const parsed = filas.map((row, i) => {
        const fila = i + 1;
        const busId = clean(row?.busId);
        const choferId = clean(row?.choferId);
        const controladorId = clean(row?.controladorId);
        const observacion = typeof row?.observacion === 'string' ? row.observacion.trim() : '';
        if (!idCode.test(busId) || !staffCode.test(choferId) || !staffCode.test(controladorId) ||
            (row?.observacion != null && typeof row.observacion !== 'string') || observacion.length > 50)
            throw invalid('Selecciona bus, chofer y controlador válidos; la observación admite hasta 50 caracteres.', fila);
        if (buses.has(busId) || workers.has(choferId) || workers.has(controladorId) || choferId === controladorId)
            throw invalid('Un bus o integrante de la tripulación no puede repetirse en el mismo intervalo.', fila);
        buses.add(busId);
        workers.add(choferId);
        workers.add(controladorId);
        return { fila, busId, choferId, controladorId, observacion: observacion || null };
    });
    return { lote: idLote.toLowerCase(), frecuencia: clean(frecuenciaId), ...interval(inicio, fin), filas: parsed };
}

async function context(db, user, id) {
    const { recordset: [row] } = await db.request().input('id', sql.VarChar(5), id)
        .input('empresa', sql.VarChar(5), user.rolId === 'R001' ? null : user.cooperativaId)
        .query(`SELECT f.ID_FRE AS ID_FRE_PER,f.CIU_ORI_FRE,f.CIU_DES_FRE,f.ID_COP_PER,c.ID_CAT,c.NOM_CAT
            FROM dbo.FRECUENCIAS f
            JOIN dbo.COOPERATIVAS cp ON cp.ID_COP=f.ID_COP_PER
            LEFT JOIN dbo.CATEGORIAS_OPERATIVAS c ON c.ID_CAT=f.ID_CAT_OP
            WHERE f.ID_FRE=@id AND cp.EST_COP='1' AND (@empresa IS NULL OR f.ID_COP_PER=@empresa)`);
    if (!row) throw cc.fail(404, 'FRECUENCIA_NO_ENCONTRADA', 'Frecuencia no disponible para tu cooperativa.');
    return row;
}

function categoryOf(row) {
    if (!row.ID_CAT) throw cc.fail(422, 'FRECUENCIA_SIN_CATEGORIA', 'Asigna una categoría operativa antes de programar esta frecuencia.');
    return { id: row.ID_CAT, nombre: row.NOM_CAT };
}

async function availability(user, query) {
    categories.requireEnabled();
    trips.canAssign(user);
    const id = clean(query.frecuenciaId);
    if (!idCode.test(id)) throw invalid('Selecciona una frecuencia.');
    const range = interval(query.inicio, query.fin);
    const db = await conectarBD();
    const frecuencia = await context(db, user, id);
    const categoria = categoryOf(frecuencia);
    await cc.checkSchedule(db, id, range.day, range.last);
    const { recordsets } = await db.request().input('empresa', sql.VarChar(5), frecuencia.ID_COP_PER)
        .input('cat', sql.VarChar(24), categoria.id).input('inicio', sql.DateTime2, range.start)
        .input('fin', sql.DateTime2, range.end).query(`
        SELECT b.ID_BUS,b.NUM_BUS,b.PLA_BUS FROM dbo.BUSES b
          JOIN dbo.BUS_CATEGORIAS c ON c.ID_BUS=b.ID_BUS AND c.ID_CAT=@cat
          WHERE b.ID_COP_PER=@empresa AND b.EST_BUS IN ('ACTIVO','1','OPERANDO')
            AND EXISTS (SELECT 1 FROM dbo.ASIENTOS_BUS a WHERE a.ID_BUS_PER=b.ID_BUS)
            AND NOT EXISTS (SELECT 1 FROM dbo.fn_CC02_HojasEnConflicto(@inicio,@fin) x WHERE x.ID_BUS=b.ID_BUS)
          ORDER BY b.NUM_BUS,b.ID_BUS;
        SELECT u.ID_USU,u.NOM_USU,u.APE_USU,u.ID_ROL_PER FROM dbo.USUARIOS u
          WHERE u.ID_COP_PER=@empresa AND u.EST_USU='1' AND u.ID_ROL_PER IN ('R006','R004')
            AND NOT EXISTS (SELECT 1 FROM dbo.fn_CC02_HojasEnConflicto(@inicio,@fin) x WHERE u.ID_USU IN (x.ID_USU_CHO,x.ID_USU_CON))
            AND NOT EXISTS (SELECT 1 FROM dbo.fn_CC02_PersonalConReserva(@inicio,@fin) x WHERE x.ID_USU_FIN=u.ID_USU)
          ORDER BY u.APE_USU,u.NOM_USU,u.ID_USU;`);
    const [buses, personal] = recordsets;
    return { categoria, buses, personal, fecha: range.day };
}

const lotRequest = (db, company, lote) => db.request().input('empresa', sql.VarChar(5), company)
    .input('lote', sql.UniqueIdentifier, lote);

async function create(user, body) {
    categories.requireEnabled();
    trips.canAssign(user);
    const data = parse(body);
    const hash = createHash('sha256').update(JSON.stringify([data.frecuencia,data.start,data.end,data.filas])).digest();
    return trips.transaction(async db => {
        await cc.lock(db);
        await trips.verifyScheduler(db, user);
        const f = await context(db, user, data.frecuencia);
        const company = f.ID_COP_PER;
        const { recordset: [previo] } = await lotRequest(db, company, data.lote)
            .query('SELECT HUELLA FROM dbo.LOTES_HOJAS_RUTA WHERE ID_COP=@empresa AND ID_LOTE=@lote');
        if (previo) {
            if (!hash.equals(previo.HUELLA)) throw cc.fail(409, 'LOTE_REUTILIZADO', 'El identificador ya corresponde a otro contenido.');
            const { recordset } = await lotRequest(db, company, data.lote).query(`
                SELECT FILA AS fila,ID_HOJ AS idHoja FROM dbo.LOTE_HOJAS_DETALLE
                WHERE ID_COP=@empresa AND ID_LOTE=@lote ORDER BY FILA`);
            return { idLote: data.lote, repetido: true, hojas: recordset };
        }

        categoryOf(f);
        await cc.checkSchedule(db, data.frecuencia, data.day, data.last);
        const recorrido = JSON.stringify(await trips.stops(db, f));
        const { recordset } = await lotRequest(db, company, data.lote)
            .input('huella', sql.Binary(32), hash).input('actor', sql.VarChar(10), user.id)
            .input('frecuencia', sql.VarChar(5), data.frecuencia).input('fecha', sql.Date, data.day)
            .input('inicio', sql.DateTime2, data.start).input('fin', sql.DateTime2, data.end)
            .input('recorrido', sql.NVarChar(sql.MAX), recorrido)
            .input('filas', sql.NVarChar(sql.MAX), JSON.stringify(data.filas)).query(`
                DECLARE @datos table(FILA smallint PRIMARY KEY,N int,ID_HOJ varchar(5),ID_BUS varchar(5),ID_CHO varchar(10),ID_CON varchar(10),OBS varchar(50));
                INSERT @datos(FILA,N,ID_BUS,ID_CHO,ID_CON,OBS)
                    SELECT fila,NEXT VALUE FOR dbo.SEQ_CC02_HOJA,busId,choferId,controladorId,observacion
                    FROM OPENJSON(@filas) WITH(fila smallint,busId varchar(5),choferId varchar(10),controladorId varchar(10),observacion varchar(50));
                DECLARE @base varchar(36)='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                UPDATE @datos SET ID_HOJ='L'+SUBSTRING(@base,(N/46656)%36+1,1)+SUBSTRING(@base,(N/1296)%36+1,1)
                    +SUBSTRING(@base,(N/36)%36+1,1)+SUBSTRING(@base,N%36+1,1);

                INSERT dbo.HOJAS_RUTAS(ID_HOJ,FEC_PRO_HOJ,EST_VIA_HOJ,ID_BUS_PER,ID_FRE_PER,ID_USU_CHO,ID_USU_CON,
                    SALIDA_PLAN_UTC,LLEGADA_PLAN_UTC,PARADA_ACTUAL,EST_MOV,RECORRIDO_JSON,OBS_HOJ)
                    SELECT ID_HOJ,@fecha,'PROGRAMADO',ID_BUS,@frecuencia,ID_CHO,ID_CON,@inicio,@fin,0,'DETENIDO',@recorrido,OBS
                    FROM @datos;
                INSERT dbo.LOTES_HOJAS_RUTA(ID_COP,ID_LOTE,HUELLA,ID_ACTOR) VALUES (@empresa,@lote,@huella,@actor);
                INSERT dbo.LOTE_HOJAS_DETALLE(ID_COP,ID_LOTE,FILA,ID_HOJ)
                    SELECT @empresa,@lote,FILA,ID_HOJ FROM @datos;
                SELECT FILA AS fila,ID_HOJ AS idHoja FROM @datos ORDER BY FILA;`);
        return { idLote: data.lote, repetido: false, hojas: recordset };
    });
}

module.exports = { availability, create };
