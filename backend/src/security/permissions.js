const { sql } = require('../config/db');
const catalog = Object.freeze({ dashboard: 'Consultar Dashboard', buses: 'Gestionar buses', rutas: 'Gestionar rutas y frecuencias', resoluciones: 'Gestionar resoluciones ANT', salidas: 'Consultar salidas', reportes: 'Consultar reportes', personalizacion: 'Personalizar y publicar', trabajadores: 'Gestionar oficinistas, controladores y choferes' });
const oficinistaPermissions = Object.freeze(['rutas', 'salidas', 'ventanilla']);
const request = (connection) => connection.request ? connection.request() : new sql.Request(connection);
const failure = (status, message, code) => Object.assign(new Error(message), { status, code });
async function installed(connection) {
    const result = await request(connection).query("SELECT CASE WHEN OBJECT_ID('dbo.COOPERATIVA_RESPONSABLES','U') IS NOT NULL AND OBJECT_ID('dbo.USUARIO_PERMISOS','U') IS NOT NULL AND OBJECT_ID('dbo.USUARIO_FOTOGRAFIAS','U') IS NOT NULL THEN 1 ELSE 0 END AS PERSONAL_INSTALADO");
    return result.recordset[0]?.PERSONAL_INSTALADO === 1;
}
async function ready(connection) {
    if (!await installed(connection)) throw failure(503, 'Personal y perfiles requiere instalar la migración 005 autorizada por el administrador.', 'PERSONAL_MIGRATION_REQUIRED');
}
async function context(connection, user) {
    if (user.rolId === 'R003') {
        return { accesoConfigurado: true, principal: false, nivel: 'Oficinista operativo', permisos: [...oficinistaPermissions] };
    }
    if (user.rolId !== 'R002') return { principal: false, permisos: [] };
    if (!await installed(connection)) return { accesoConfigurado: false, principal: false, permisos: Object.keys(catalog).filter((p) => p !== 'trabajadores') };
    const scoped = () => request(connection).input('user', sql.VarChar(10), user.id).input('company', sql.VarChar(5), user.cooperativaId);
    const principal = (await scoped().query('SELECT ID_USU FROM dbo.COOPERATIVA_RESPONSABLES WHERE ID_COP=@company AND ID_USU=@user')).recordset.length > 0;
    const permisos = principal ? [...Object.keys(catalog), 'ventanilla'] : (await scoped().query('SELECT PERMISO FROM dbo.USUARIO_PERMISOS WHERE ID_USU=@user')).recordset.map((r) => r.PERMISO);
    return { accesoConfigurado: true, principal, nivel: principal ? 'Responsable principal' : 'Gestor adicional', permisos };
}
function can(user, permission) {
    if (!user?.cooperativaActiva) return false;
    if (user.rolId === 'R003') {
        return oficinistaPermissions.includes(permission) || Boolean(user.permisos?.includes(permission));
    }
    if (user.rolId === 'R002') {
        if (permission === 'ventanilla') {
            return Boolean(user.principal || user.permisos?.includes('ventanilla') || (user.accesoConfigurado === true && (user.permisos?.includes('salidas') || user.permisos?.includes('rutas'))));
        }
        return Boolean(user.principal || user.permisos?.includes(permission));
    }
    return false;
}
function requirePermission(...permissions) {
    return (req, res, next) => permissions.some((p) => can(req.auth, p)) ? next() : res.status(403).json({ success: false, message: 'No tienes permiso para esta operación.' });
}
module.exports = { catalog, oficinistaPermissions, failure, installed, ready, context, can, requirePermission };
