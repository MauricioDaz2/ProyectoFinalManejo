const { sql } = require('../config/db');

const enabled = () => process.env.CC01_FRECUENCIAS === '1';
const today = 'dbo.fn_CC_FechaEcuador(SYSUTCDATETIME())';
const allowedSheet = `EXISTS (SELECT 1 FROM dbo.fn_CC_HojaVigente(H.ID_HOJ,${today}))`;
const effectiveBus = () => enabled() ? 'COALESCE(H.ID_BUS_REE,H.ID_BUS_PER)' : 'H.ID_BUS_PER';
const activeTicket = "UPPER(LTRIM(RTRIM(ISNULL(EST_BOL,'')))) NOT IN ('CANCELADO','CANCELADA','ANULADO','ANULADA','INVALIDO','INVALIDA','VENCIDO','VENCIDA','RECHAZADO','RECHAZADA')";
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const sqlErrors = {
    51201: 'OPERACION_OCUPADA', 51202: 'CUPO_RESOLUCION_AGOTADO', 51203: 'TRAYECTO_NO_ADMITIDO',
    51204: 'CUPO_INFERIOR_A_COMPROMISOS', 51205: 'SALIDA_CON_BOLETOS', 51206: 'FRECUENCIA_NO_VIGENTE',
    51207: 'CUPO_UNIDADES_AGOTADO', 51208: 'SALIDA_NO_DISPONIBLE', 51209: 'CUPO_PASAJEROS_AGOTADO'
};

function respond(res, error) {
    const number = error.number ?? error.originalError?.info?.number;
    if (sqlErrors[number]) return res.status(number === 51203 ? 422 : 409)
        .json({ success: false, code: sqlErrors[number], message: error.message });
    if (enabled() && number === 1205) return res.status(409)
        .json({ success: false, code: 'OPERACION_OCUPADA', message: 'Otra operación está usando el cupo. Intenta nuevamente.' });
    if (error.status && error.code) return res.status(error.status)
        .json({ success: false, code: error.code, message: error.message });
    return null;
}

function date(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function permit(body, current = {}) {
    const previous = key => current[key] ? new Date(current[key]).toISOString().slice(0, 10) : null;
    const start = body.FEC_INI_VIG_RES === undefined ? previous('FEC_INI_VIG_RES') : date(body.FEC_INI_VIG_RES);
    const rawEnd = body.FEC_FIN_VIG_RES === undefined ? previous('FEC_FIN_VIG_RES') : body.FEC_FIN_VIG_RES;
    const end = rawEnd === null || rawEnd === '' ? null : date(rawEnd);
    const revoked = body.REVOCADA_RES === undefined ? current.REVOCADA_RES ?? false : body.REVOCADA_RES;
    if (!start || (rawEnd !== null && rawEnd !== '' && !end) || (end && end < start) || typeof revoked !== 'boolean') {
        throw fail(422, 'VIGENCIA_ANT_INVALIDA', 'Indica un inicio de vigencia válido; el fin no puede ser anterior y la revocación debe ser válida.');
    }
    return { start, end, revoked };
}

function positive(value, optional = false) {
    if (optional && (value === null || value === undefined || value === '')) return null;
    if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) value = Number(value);
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
        throw fail(422, 'CONFIGURACION_FRECUENCIA_INVALIDA', 'Los puntos y cupos deben indicarse con enteros positivos.');
    }
    return value;
}

async function frequency(db, body, dates) {
    const origin = positive(body?.ID_PUN_ORI);
    const destination = positive(body?.ID_PUN_DES);
    const units = positive(body?.MAX_UNIDADES, true);
    const passengers = positive(body?.MAX_PASAJEROS, true);
    if (origin === destination || (units === null && passengers === null) || !date(dates.start) ||
        (dates.end !== null && (!date(dates.end) || dates.end < dates.start))) {
        throw fail(422, 'CONFIGURACION_FRECUENCIA_INVALIDA', 'Selecciona puntos distintos, fechas válidas y al menos un cupo.');
    }
    const { recordset: points } = await db.request().input('origin', sql.Int, origin).input('destination', sql.Int, destination)
        .query('SELECT ID_PUN,ETIQUETA,ID_CAN,ID_PRO FROM dbo.v_CC_PuntosTrayecto WHERE ID_PUN IN (@origin,@destination)');
    const a = points.find(p => p.ID_PUN === origin);
    const b = points.find(p => p.ID_PUN === destination);
    if (!a || !b || (a.ID_PRO === b.ID_PRO && a.ID_CAN !== b.ID_CAN)) {
        throw fail(422, 'TRAYECTO_NO_ADMITIDO', 'Elige puntos del mismo cantón o de provincias distintas.');
    }
    return { origin, destination, units, passengers, from: a.ETIQUETA, to: b.ETIQUETA };
}

async function lock(tx) {
    if (enabled()) await tx.request().execute('dbo.cc_BloquearOperacion');
}

async function operation(pool, work) {
    if (!enabled()) return work(pool);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await lock(tx);
        const value = await work(tx);
        await tx.commit();
        return value;
    } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
    }
}

async function scheduled(db, id, start, last) {
    if (!enabled()) return;
    const result = await db.request().input('id', sql.VarChar(5), id)
        .input('start', sql.Date, start).input('last', sql.Date, last).query(`
        SELECT t.ID_FRE FROM dbo.v_CC_TrayectoFrecuencia t
        CROSS APPLY dbo.fn_CC_VigenciaFrecuencia(t.ID_FRE,@start) a
        CROSS APPLY dbo.fn_CC_VigenciaFrecuencia(t.ID_FRE,@last) b
        WHERE t.ID_FRE=@id AND t.TIPO_TRAYECTO IN ('INTRACANTONAL','INTERPROVINCIAL')
          AND a.EST_VIGENCIA='VIGENTE' AND b.EST_VIGENCIA='VIGENTE'`);
    if (!result.recordset.length) throw fail(409, 'FRECUENCIA_NO_VIGENTE', 'La frecuencia o su resolución no cubren la fecha completa de la salida.');
}

async function sale(db, id) {
    if (!enabled()) return;
    const result = await db.request().input('id', sql.VarChar(5), id).query(`
        SELECT H.ID_HOJ FROM dbo.HOJAS_RUTAS H JOIN dbo.BUSES B ON B.ID_BUS=${effectiveBus()}
        JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER
        JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER
        JOIN dbo.COOPERATIVAS C ON C.ID_COP=R.ID_COP_PER AND C.ID_COP=B.ID_COP_PER
        WHERE H.ID_HOJ=@id AND H.FEC_PRO_HOJ>=${today} AND C.EST_COP='1'
          AND UPPER(LTRIM(RTRIM(B.EST_BUS))) IN ('ACTIVO','1','OPERANDO')
          AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADO','PROGRAMADA','EN CURSO')
          AND ${allowedSheet}`);
    if (!result.recordset.length) throw fail(409, 'SALIDA_NO_DISPONIBLE', 'La salida no admite nuevas reservas o ventas.');
}

module.exports = { enabled, today, allowedSheet, effectiveBus, activeTicket, fail, respond, date, permit, frequency, lock, operation, scheduled, sale };
