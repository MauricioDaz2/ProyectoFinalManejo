const accounts = require('../services/accounts');
const { catalog } = require('../security/permissions');
const handle = (action) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await action(req, res); }
    catch (e) {
        const duplicate = [2601,2627].includes(e.number);
        res.status(e.status || (duplicate || e.number === 51000 ? 409 : 503)).json({ success: false, code: e.code, message: e.status ? e.message : duplicate ? 'Ya existe una cuenta con ese identificador o correo.' : 'No se pudo confirmar la operación. Revisa los datos y vuelve a intentarlo.' });
    }
};
module.exports = {
    handle,
    list: handle(async (req, res) => res.json({ success: true, usuarios: await accounts.list(req.auth), permisosDisponibles: catalog, principal: !!req.auth.principal })),
    get: handle(async (req, res) => {
        const usuario = (await accounts.list(req.auth)).find((u) => u.ID_USU === req.params.id);
        if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no disponible.' });
        res.json({ success: true, usuario });
    }),
    create: handle(async (req, res) => res.status(201).json({ success: true, usuario: await accounts.save(req.auth, req.body), message: 'Cuenta registrada.' })),
    edit: handle(async (req, res) => res.json({ success: true, usuario: await accounts.save(req.auth, req.body, req.params.id), message: 'Cuenta actualizada.' })),
    state: handle(async (req, res) => {
        if (!req.body || Object.keys(req.body).some((key) => !['EST_USU','estado'].includes(key))) return res.status(400).json({ success: false, message: 'Campos no permitidos.' });
        res.json({ success: true, usuario: await accounts.state(req.auth, req.params.id, req.body.EST_USU ?? req.body.estado), message: 'Estado actualizado.' });
    }),
    deactivate: handle(async (req, res) => res.json({ success: true, usuario: await accounts.state(req.auth, req.params.id, '0'), message: 'Cuenta desactivada.' })),
    designate: handle(async (req, res) => {
        if (req.body && Object.keys(req.body).length) return res.status(400).json({ success: false, message: 'No se admiten campos adicionales.' });
        res.json({ success: true, usuario: await accounts.designate(req.auth, req.params.id), message: 'Responsable principal designado. El anterior deja de tener acceso completo.' });
    })
};
