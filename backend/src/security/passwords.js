const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sql } = require('../config/db');
const { failure } = require('./permissions');
const isHash = (value) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value || '');
async function ready(connection) {
    const result = await new sql.Request(connection).query("SELECT COL_LENGTH('dbo.USUARIOS','CON_USU') AS PASSWORD_LENGTH");
    if (result.recordset[0]?.PASSWORD_LENGTH < 60 || !result.recordset[0]?.PASSWORD_LENGTH) throw failure(503, 'Se requiere la migración 006 de credenciales antes de crear cuentas.', 'PASSWORD_MIGRATION_REQUIRED');
}
async function hash(password) {
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) throw failure(400, 'La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes.');
    return bcrypt.hash(password, 12);
}
async function verify(password, stored) {
    if (typeof password !== 'string' || Buffer.byteLength(password) > 72) return false;
    if (isHash(stored)) return bcrypt.compare(password, stored);
    const a = crypto.createHash('sha256').update(password).digest();
    const b = crypto.createHash('sha256').update(String(stored)).digest();
    return crypto.timingSafeEqual(a, b);
}
module.exports = { ready, hash, verify, isHash };
