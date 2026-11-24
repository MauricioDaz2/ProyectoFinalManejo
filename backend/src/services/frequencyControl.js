const { sql } = require('../config/db');

const enabled = () => false;
const today = "CONVERT(date, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'SA Pacific Standard Time')";
const allowedSheet = `EXISTS (SELECT 1 FROM dbo.fn_CC_HojaVigente(H.ID_HOJ,${today}))`;
const effectiveBus = () => 'COALESCE(H.ID_BUS_REE,H.ID_BUS_PER)';
const activeTicket = "UPPER(LTRIM(RTRIM(ISNULL(EST_BOL,'')))) NOT IN ('CANCELADO','CANCELADA','ANULADO','ANULADA','INVALIDO','INVALIDA','VENCIDO','VENCIDA','RECHAZADO','RECHAZADA')";
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const sqlErrors = {
    51201: 'OPERACION_OCUPADA',
    51205: 'SALIDA_CON_BOLETOS',
    51206: 'FRECUENCIA_NO_VIGENTE',
    51208: 'SALIDA_NO_DISPONIBLE',
    51303: 'BUS_O_TRIPULACION_INVALIDOS',
    51304: 'HORARIO_EN_CONFLICTO'
};

function respond(res, error) {
    const number = error.number ?? error.originalError?.info?.number;
    if (sqlErrors[number]) return res.status(number === 51303 ? 422 : 409)
        .json({ success: false, code: sqlErrors[number], message: error.message });
    if (number === 1205) return res.status(409)
        .json({ success: false, code: 'OPERACION_OCUPADA', message: 'Otra operación está en curso. Intenta nuevamente.' });
    if (error.status && error.code) return res.status(error.status)
        .json({ success: false, code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
    return null;
}

function date(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

async function lock(tx) {
    const req = tx?.request?.();
    if (typeof req?.execute === 'function') await req.execute('dbo.cc_BloquearOperacion');
}

async function operation(pool, work) {
    return work(pool);
}

async function checkSchedule(db, id, start, last) {
    const result = await db.request().input('id', sql.VarChar(5), id)
        .input('start', sql.Date, start).input('last', sql.Date, last).query(`
        SELECT f.ID_FRE
        FROM dbo.FRECUENCIAS f
        WHERE f.ID_FRE = @id
          AND ISNULL(f.EST_RES, '0') = '1'
          AND f.FEC_HOR_INI_FRE <= @start
          AND (f.FEC_HOR_FIN_FRE IS NULL OR f.FEC_HOR_FIN_FRE >= @last)`);
    if (!result.recordset.length) throw fail(409, 'FRECUENCIA_NO_VIGENTE', 'La frecuencia está inactiva o no cubre la fecha completa de la salida.');
}

async function scheduled() {}
async function sale() {}

module.exports = { enabled, today, allowedSheet, effectiveBus, activeTicket, fail, respond, date, lock, operation, checkSchedule, scheduled, sale };
