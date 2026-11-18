const { sql, conectarBD } = require('../config/db');
const access = require('../security/permissions');
const passwords = require('../security/passwords');
const { transaction } = require('../services/accounts');
const { validateImage } = require('../services/profileImages');
const { handle } = require('./accountController');
const { store } = require('../security/sessionStore');
const { issueSession } = require('../middleware/session');
const request = (db, id) => new sql.Request(db).input('user', sql.VarChar(10), id);
async function read(user) {
    const db = await conectarBD();
    const configured = await access.installed(db);
    const row = (await request(db, user.id).query('SELECT NOM_USU,APE_USU,COR_USU,TEL_USU FROM dbo.USUARIOS WHERE ID_USU=@user')).recordset[0];
    let foto = null;
    if (configured) {
        const image = (await request(db, user.id).query('SELECT VERSION FROM dbo.USUARIO_FOTOGRAFIAS WHERE ID_USU=@user')).recordset[0];
        if (image) foto = `/api/mi-perfil/foto?v=${image.VERSION}`;
    }
    const passwordAvailable = (await request(db, user.id).query("SELECT COL_LENGTH('dbo.USUARIOS','CON_USU') AS PASSWORD_LENGTH")).recordset[0]?.PASSWORD_LENGTH >= 60;
    const dbAuth = { ...user, ...await access.context(db, user) };
    return { ...dbAuth, passwordDisponible: configured && passwordAvailable, nombre: `${row.NOM_USU} ${row.APE_USU}`, nombres: row.NOM_USU, apellidos: row.APE_USU, correo: row.COR_USU, telefono: row.TEL_USU, foto, perfilDisponible: configured, cooperativaId: user.rolId === 'R005' ? null : user.cooperativaId, cooperativaNombre: user.rolId === 'R005' ? null : user.cooperativaNombre };
}
async function own(db, id) {
    const row = (await request(db, id).query("SELECT CON_USU,COR_USU FROM dbo.USUARIOS WITH (UPDLOCK,HOLDLOCK) WHERE ID_USU=@user AND EST_USU='1'")).recordset[0];
    if (!row) throw access.failure(401, 'La cuenta ya no está activa.');
    return row;
}
const save = handle(async (req, res) => {
    const body = req.body;
    if (!body || Object.keys(body).some((k) => !['nombres','apellidos','correo','telefono','passwordActual'].includes(k))) throw access.failure(400, 'Campos no permitidos.');
    const clean = (v) => typeof v === 'string' ? v.trim() : '';
    const name = clean(body.nombres), last = clean(body.apellidos), email = clean(body.correo).toLowerCase(), phone = clean(body.telefono);
    if (!name || !last || name.length > 15 || last.length > 15 || email.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{7,20}$/.test(phone)) throw access.failure(400, 'Revisa nombres, apellidos, correo y teléfono.');
    const changedEmail = await transaction(async (db) => {
        const before = await own(db, req.auth.id);
        const changed = before.COR_USU.trim().toLowerCase() !== email;
        if (changed && !await passwords.verify(body.passwordActual, before.CON_USU)) throw access.failure(400, 'Confirma tu contraseña actual para cambiar el correo de acceso.');
        const duplicate = await request(db, req.auth.id).input('email', sql.VarChar(40), email).query('SELECT ID_USU FROM dbo.USUARIOS WITH (UPDLOCK,HOLDLOCK) WHERE LOWER(LTRIM(RTRIM(COR_USU)))=@email AND ID_USU<>@user');
        if (duplicate.recordset.length) throw access.failure(409, 'Ese correo ya pertenece a otra cuenta.');
        await request(db, req.auth.id).input('name', sql.VarChar(15), name).input('last', sql.VarChar(15), last).input('email', sql.VarChar(40), email).input('phone', sql.VarChar(20), phone).query('UPDATE dbo.USUARIOS SET NOM_USU=@name,APE_USU=@last,COR_USU=@email,TEL_USU=@phone WHERE ID_USU=@user');
        return changed;
    });
    if (changedEmail) { store.revokeUser(req.auth.id); issueSession(req, res, req.auth.id); }
    res.json({ success: true, usuario: await read(req.auth), message: changedEmail ? 'Perfil guardado. Usa el nuevo correo para iniciar sesión; las otras sesiones se cerraron.' : 'Perfil guardado.' });
});
module.exports = {
    read: handle(async (req, res) => res.json({ success: true, usuario: await read(req.auth) })), save,
    photo: handle(async (req, res) => {
        const db = await conectarBD(); await access.ready(db);
        const row = (await request(db, req.auth.id).query('SELECT CONTENIDO,MIME FROM dbo.USUARIO_FOTOGRAFIAS WHERE ID_USU=@user')).recordset[0];
        if (!row) throw access.failure(404, 'No hay fotografía personal.');
        res.set({ 'Content-Type': row.MIME, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }).send(row.CONTENIDO);
    }),
    upload: handle(async (req, res) => {
        if (!req.file || Object.keys(req.body || {}).length) throw access.failure(400, 'Envía solamente una fotografía.');
        const image = await validateImage(req.file.buffer, 'logo');
        await transaction(async (db) => {
            await own(db, req.auth.id);
            await request(db, req.auth.id).input('content', sql.VarBinary(sql.MAX), image.data).input('mime', sql.VarChar(20), image.mime).query('IF EXISTS (SELECT 1 FROM dbo.USUARIO_FOTOGRAFIAS WITH (UPDLOCK,HOLDLOCK) WHERE ID_USU=@user) UPDATE dbo.USUARIO_FOTOGRAFIAS SET CONTENIDO=@content,MIME=@mime,VERSION=NEWID(),ACTUALIZADO_UTC=SYSUTCDATETIME() WHERE ID_USU=@user ELSE INSERT INTO dbo.USUARIO_FOTOGRAFIAS (ID_USU,CONTENIDO,MIME) VALUES (@user,@content,@mime)');
        });
        res.json({ success: true, usuario: await read(req.auth), message: 'Fotografía personal guardada.' });
    }),
    password: handle(async (req, res) => {
        if (!req.body || Object.keys(req.body).some((key) => !['actual','nueva'].includes(key))) throw access.failure(400, 'Campos no permitidos.');
        const hash = await passwords.hash(req.body.nueva);
        await transaction(async (db) => {
            await passwords.ready(db);
            const before = await own(db, req.auth.id);
            if (!await passwords.verify(req.body.actual, before.CON_USU)) throw access.failure(400, 'Contraseña actual incorrecta.');
            await request(db, req.auth.id).input('hash', sql.VarChar(255), hash).query('UPDATE dbo.USUARIOS SET CON_USU=@hash WHERE ID_USU=@user');
        });
        store.revokeUser(req.auth.id); issueSession(req, res, req.auth.id);
        res.json({ success: true, message: 'Contraseña actualizada. Las otras sesiones se cerraron.' });
    })
};
