const { sql, conectarBD } = require('../config/db');
const clean = (value) => String(value ?? '').trim().toUpperCase();
const owners = {
    buses: 'SELECT ID_COP_PER AS OWNER FROM dbo.BUSES WHERE ID_BUS = @id',
    resoluciones: 'SELECT ID_COP_PER AS OWNER FROM dbo.RESOLUCIONES_ANT WHERE ID_RES = @id',
    frecuencias: 'SELECT R.ID_COP_PER AS OWNER FROM dbo.FRECUENCIAS F JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER WHERE F.ID_FRE = @id',
    'hojas-ruta': 'SELECT R.ID_COP_PER AS OWNER, B.ID_COP_PER AS BUS_OWNER FROM dbo.HOJAS_RUTAS H JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER WHERE H.ID_HOJ = @id',
    asientos: 'SELECT B.ID_COP_PER AS OWNER FROM dbo.ASIENTOS_BUS A JOIN dbo.BUSES B ON B.ID_BUS = A.ID_BUS_PER WHERE A.ID_ASI = @id',
    controlador: "SELECT ID_COP_PER AS OWNER FROM dbo.USUARIOS WHERE ID_USU = @id AND ID_ROL_PER = 'R004' AND EST_USU = '1'"
};
function scopeChecks(req) {
    const company = clean(req.auth?.cooperativaId);
    if (!company || !req.auth?.cooperativaActiva) throw new Error('Cooperativa no asignada o inactiva.');
    for (const value of [req.query?.cooperativa, req.body?.ID_COP_PER, req.headers['x-cooperativa']]) {
        if (value !== undefined && clean(value) !== company) throw new Error('No puedes acceder a otra cooperativa.');
    }
    const checks = [];
    const [resource, id] = req.path.split('/').filter(Boolean);
    const operacionLote = resource === 'hojas-ruta' &&
        ((id === 'lotes' && req.method === 'POST') || (id === 'disponibilidad' && req.method === 'GET'));
    if (id && owners[resource] && !operacionLote) checks.push([resource, id]);
    for (const [field, type] of [['ID_BUS_PER', 'buses'], ['ID_RES_PER', 'resoluciones'], ['ID_FRE_PER', 'frecuencias'], ['ID_USU_CON', 'controlador']]) {
        if (req.body?.[field]) checks.push([type, req.body[field]]);
    }
    return { company, checks };
}
async function cooperativaScope(req, res, next) {
    let scope;
    try { scope = scopeChecks(req); } catch (error) { return res.status(403).json({ success: false, message: error.message }); }
    try {
        if (scope.checks.length) {
            const pool = await conectarBD();
            for (const [type, id] of scope.checks) {
                if (!/^[A-Z0-9_-]{1,10}$/i.test(String(id))) return res.status(400).json({ success: false, message: 'Identificador no válido.' });
                const result = await pool.request().input('id', sql.VarChar(10), clean(id)).query(owners[type]);
                const row = result.recordset[0];
                if (!row || clean(row.OWNER) !== scope.company || (row.BUS_OWNER !== undefined && clean(row.BUS_OWNER) !== scope.company)) return res.status(404).json({ success: false, message: 'Registro no disponible en tu cooperativa.' });
            }
        }
        if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body.ID_COP_PER = scope.company;
        next();
    } catch { res.status(503).json({ success: false, message: 'No se pudo verificar la propiedad del registro.' }); }
}
module.exports = { cooperativaScope, scopeChecks, owners };
