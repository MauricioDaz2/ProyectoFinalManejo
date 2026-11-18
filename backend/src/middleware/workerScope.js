const { sql, conectarBD } = require('../config/db');
const { failure } = require('../security/permissions');
function workerScope(kind) {
    return async (req, res, next) => {
        try {
            const user = req.auth;
            if (user.rolId === 'R001') { req.scopeCompany = req.query.cooperativa || req.body?.ID_COP_PER || null; return next(); }
            if (!user.cooperativaActiva || !user.cooperativaId) throw failure(403, 'No tienes una cooperativa activa asignada.');
            for (const value of [req.query.cooperativa, req.body?.ID_COP_PER, req.headers['x-cooperativa']]) if (value !== undefined && String(value).trim() !== user.cooperativaId) throw failure(403, 'No puedes acceder a otra cooperativa.');
            const [resource, id] = req.path.split('/').filter(Boolean);
            if (kind === 'controlador' && resource === 'hojas' && id !== user.id) throw failure(403, 'Solo puedes consultar tus hojas asignadas.');
            for (const field of ['ID_USU_OFI','ID_USU_CON','idUsuCon']) {
                if (req.body?.[field] !== undefined && String(req.body[field]).trim() !== user.id) throw failure(403, 'El operador debe coincidir con la sesión.');
            }
            req.scopeCompany = user.cooperativaId;
            const db = await conectarBD();
            const request = () => db.request().input('company', sql.VarChar(5), user.cooperativaId).input('operator', sql.VarChar(10), user.id);
            let hoja = kind === 'controlador' && resource === 'asientos' ? id : kind === 'oficinista' && resource === 'hojas' && id ? id : req.body?.ID_HOJ_PER || req.body?.idHoj;
            const ticket = kind === 'controlador' ? req.body?.idBoleto : resource === 'boletos' && id && !['buscar','validar','ventanilla'].includes(id) ? id : null;
            if (ticket) {
                const result = await request().input('ticket', sql.VarChar(5), ticket).query('SELECT H.ID_HOJ,H.ID_USU_CON FROM dbo.BOLETOS T JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ=T.ID_HOJ_PER JOIN dbo.BUSES B ON B.ID_BUS=H.ID_BUS_PER JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER WHERE T.ID_BOL=@ticket AND B.ID_COP_PER=@company AND R.ID_COP_PER=@company');
                const found = result.recordset[0];
                if (!found || (kind === 'controlador' && found.ID_USU_CON !== user.id)) throw failure(404, 'Boleto no disponible para tu cuenta.');
                hoja = found.ID_HOJ;
            }
            if (hoja) {
                const result = await request().input('sheet', sql.VarChar(5), hoja).query('SELECT H.ID_USU_CON,H.ID_BUS_PER FROM dbo.HOJAS_RUTAS H JOIN dbo.BUSES B ON B.ID_BUS=H.ID_BUS_PER JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER WHERE H.ID_HOJ=@sheet AND B.ID_COP_PER=@company AND R.ID_COP_PER=@company');
                const found = result.recordset[0];
                if (!found || (kind === 'controlador' && found.ID_USU_CON !== user.id)) throw failure(404, 'Hoja no disponible para tu cuenta.');
                const seat = req.body?.ID_ASI_PER || req.body?.idAsi;
                if (seat && !(await request().input('seat', sql.VarChar(5), seat).input('bus', sql.VarChar(5), found.ID_BUS_PER).query('SELECT ID_ASI FROM dbo.ASIENTOS_BUS WHERE ID_ASI=@seat AND ID_BUS_PER=@bus')).recordset.length) throw failure(404, 'El asiento no pertenece a esta hoja.');
            }
            if (req.body) {
                if (kind === 'controlador') req.body.idUsuCon = user.id;
                else { req.body.ID_USU_OFI = user.id; if (req.body.ID_USU_CON !== undefined) req.body.ID_USU_CON = user.id; }
            }
            next();
        } catch (e) { res.status(e.status || 503).json({ success: false, message: e.status ? e.message : 'No se pudo verificar el acceso a la operación.' }); }
    };
}
module.exports = { workerScope };
