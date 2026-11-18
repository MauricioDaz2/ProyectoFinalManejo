const { store } = require('../security/sessionStore');
const { sql, conectarBD } = require('../config/db');
const cookieName = 'transporte_sid';
const clean = (value) => String(value ?? '').trim();
const cookieOptions = (req) => ({ httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/api', maxAge: store.lifetime });
function token(req) {
    return (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
function allowedOrigin(req, origin) {
    if (!origin) return true;
    if (origin === `${req.protocol}://${req.get('host')}`) return true;
    if (process.env.NODE_ENV === 'production') return false;
    try {
        const url = new URL(origin);
        return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['5500', '5501', '3000'].includes(url.port);
    } catch { return false; }
}
function guardOrigin(req, res, next) {
    if (!allowedOrigin(req, req.headers.origin)) return res.status(403).json({ success: false, message: 'Origen no permitido.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Transport-Client') !== '1') return res.status(403).json({ success: false, message: 'Solicitud no autorizada.' });
    next();
}
function issueSession(req, res, userId) {
    const nextToken = store.create(userId);
    store.revoke(token(req));
    res.cookie(cookieName, nextToken, cookieOptions(req));
}
function logout(req, res) {
    store.revoke(token(req));
    const { maxAge, ...options } = cookieOptions(req);
    res.clearCookie(cookieName, options);
    res.json({ success: true });
}
async function requireSession(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const session = store.read(token(req));
    if (!session) return res.status(401).json({ success: false, message: 'Tu sesión ha caducado. Inicia sesión nuevamente.' });
    try {
        const pool = await conectarBD();
        const result = await pool.request().input('id', sql.VarChar(10), session.userId).query(`
            SELECT U.ID_USU, U.NOM_USU, U.APE_USU, U.COR_USU, U.EST_USU, U.ID_ROL_PER, U.ID_COP_PER,
                   C.EST_COP, C.NOM_COP, C.LOG_URL_COP
            FROM dbo.USUARIOS U LEFT JOIN dbo.COOPERATIVAS C ON C.ID_COP = U.ID_COP_PER
            WHERE U.ID_USU = @id
        `);
        const row = result.recordset[0];
        if (!row || clean(row.EST_USU) !== '1') {
            store.revoke(token(req));
            return res.status(401).json({ success: false, message: 'La cuenta ya no está activa.' });
        }
        req.auth = {
            id: clean(row.ID_USU), nombre: `${clean(row.NOM_USU)} ${clean(row.APE_USU)}`,
            correo: row.COR_USU, rolId: clean(row.ID_ROL_PER), cooperativaId: clean(row.ID_COP_PER),
            cooperativaActiva: clean(row.EST_COP) === '1', cooperativaNombre: row.NOM_COP, cooperativaLogo: row.LOG_URL_COP
        };
        if (['R002', 'R003', 'R004', 'R006'].includes(req.auth.rolId) && !req.auth.cooperativaActiva) return res.status(403).json({ success: false, message: 'Tu cooperativa no está activa o no está asignada.' });
        Object.assign(req.auth, await require('../security/permissions').context(pool, req.auth));
        next();
    } catch {
        res.status(503).json({ success: false, message: 'No se pudo verificar la sesión. Inténtalo nuevamente.' });
    }
}
const requireRole = (...roles) => (req, res, next) => roles.includes(req.auth?.rolId) ? next() : res.status(403).json({ success: false, message: 'No tienes permiso para acceder a este módulo.' });
module.exports = { allowedOrigin, guardOrigin, issueSession, logout, requireSession, requireRole };
