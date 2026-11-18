const { sql, conectarBD } = require('../config/db');
const access = require('../security/permissions');
const passwords = require('../security/passwords');
const { store } = require('../security/sessionStore');
const fields = 'U.ID_USU,U.NOM_USU,U.APE_USU,U.COR_USU,U.TEL_USU,U.EST_USU,U.ID_ROL_PER,U.ID_COP_PER';
const text = (v) => typeof v === 'string' ? v.trim() : '';
const fail = access.failure;
const req = (db) => new sql.Request(db);

function validate(body, { id, create = false, company, admin = false } = {}) {
    const allowed = ['ID_USU','NOM_USU','APE_USU','COR_USU','TEL_USU','EST_USU','ID_ROL_PER','password','permisos', ...(admin ? ['ID_COP_PER'] : [])];
    if (!body || Object.keys(body).some((k) => !allowed.includes(k))) throw fail(400, 'La solicitud contiene campos no permitidos.');
    const data = Object.fromEntries(['ID_USU','NOM_USU','APE_USU','COR_USU','TEL_USU','EST_USU','ID_ROL_PER','ID_COP_PER'].map((k) => [k, text(body[k])]));
    data.ID_USU = (id || data.ID_USU).toUpperCase();
    if (id && body.ID_USU !== undefined && text(body.ID_USU).toUpperCase() !== id) throw fail(400, 'No se puede cambiar la identificación.');
    data.ID_COP_PER = admin ? data.ID_COP_PER.toUpperCase() : company;
    data.COR_USU = data.COR_USU.toLowerCase();
    data.EST_USU = data.EST_USU || '1';
    if (!/^[A-Z0-9]{5,10}$/.test(data.ID_USU)) throw fail(400, 'Identificación: entre 5 y 10 caracteres alfanuméricos.');
    if (!data.NOM_USU || data.NOM_USU.length > 15 || !data.APE_USU || data.APE_USU.length > 15) throw fail(400, 'Nombres y apellidos son obligatorios, hasta 15 caracteres cada uno.');
    if (data.COR_USU.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.COR_USU)) throw fail(400, 'Correo inválido; máximo 40 caracteres.');
    if (!/^\d{7,20}$/.test(data.TEL_USU)) throw fail(400, 'Teléfono: entre 7 y 20 dígitos.');
    if (!(admin ? ['R002','R003','R004','R005'] : ['R002','R003','R004']).includes(data.ID_ROL_PER) || !['0','1'].includes(data.EST_USU)) throw fail(400, 'Rol o estado no permitido.');
    if (data.ID_ROL_PER === 'R005') data.ID_COP_PER = null;
    else if (!/^[A-Z0-9_-]{1,5}$/.test(data.ID_COP_PER || '')) throw fail(400, 'La cooperativa es obligatoria.');
    if (!create && body.password !== undefined) throw fail(400, 'La contraseña se cambia desde Mi perfil.');
    if (body.permisos !== undefined && (!Array.isArray(body.permisos) || body.permisos.some((p) => !Object.hasOwn(access.catalog, p)) || new Set(body.permisos).size !== body.permisos.length || data.ID_ROL_PER !== 'R002')) throw fail(400, 'Permisos no válidos.');
    return { ...data, permisos: body.permisos, password: body.password };
}
async function transaction(work) {
    const pool = await conectarBD();
    await access.ready(pool);
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (e) { await tx.rollback().catch(() => {}); throw e; }
}
async function actor(db, user) {
    const r = await req(db).input('actor', sql.VarChar(10), user.id).query("SELECT ID_USU,ID_ROL_PER,ID_COP_PER,EST_USU FROM dbo.USUARIOS WITH (UPDLOCK,HOLDLOCK) WHERE ID_USU=@actor");
    const row = r.recordset[0];
    if (!row || row.EST_USU !== '1' || row.ID_ROL_PER !== user.rolId || (user.rolId === 'R002' && row.ID_COP_PER !== user.cooperativaId)) throw fail(403, 'Tu acceso cambió. Recarga la sesión.');
    const current = { ...user, ...await access.context(db, user) };
    if (current.rolId !== 'R001' && !access.can(current, 'trabajadores')) throw fail(403, 'No tienes acceso a Personal y accesos.');
    return current;
}
function authorize(user, before, after) {
    if (user.rolId === 'R001') return;
    if (!user.cooperativaActiva || (before && before.ID_COP_PER !== user.cooperativaId) || after.ID_COP_PER !== user.cooperativaId) throw fail(404, 'Cuenta no disponible en tu cooperativa.');
    if (after.ID_USU === user.id || before?.PRINCIPAL) throw fail(403, 'Esta cuenta no se administra desde Personal y accesos.');
    if (!user.principal && (before?.ID_ROL_PER === 'R002' || after.ID_ROL_PER === 'R002' || after.permisos !== undefined)) throw fail(403, 'Solo el responsable principal administra gestores R002.');
    if (before && !['R002','R003','R004'].includes(before.ID_ROL_PER)) throw fail(404, 'Cuenta no disponible.');
}
async function find(db, id) {
    return (await req(db).input('target', sql.VarChar(10), id).query(`SELECT ${fields},CASE WHEN R.ID_USU IS NULL THEN 0 ELSE 1 END AS PRINCIPAL FROM dbo.USUARIOS U WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.COOPERATIVA_RESPONSABLES R ON R.ID_USU=U.ID_USU WHERE U.ID_USU=@target`)).recordset[0];
}
async function save(user, body, id = null) {
    const data = validate(body, { id, create: !id, admin: user.rolId === 'R001', company: user.cooperativaId });
    const hash = !id ? await passwords.hash(data.password) : null;
    return transaction(async (db) => {
        const current = await actor(db, user);
        const before = id ? await find(db, id) : null;
        if (id && (!before || before.ID_ROL_PER === 'R001')) throw fail(404, 'Usuario no encontrado.');
        authorize(current, before, data);
        if (before?.PRINCIPAL && (data.EST_USU !== '1' || data.ID_ROL_PER !== 'R002' || data.ID_COP_PER !== before.ID_COP_PER)) throw fail(409, 'Designa primero otro responsable principal activo.');
        if (data.ID_COP_PER) {
            const company = (await req(db).input('company', sql.VarChar(5), data.ID_COP_PER).query("SELECT ID_COP FROM dbo.COOPERATIVAS WITH (UPDLOCK,HOLDLOCK) WHERE ID_COP=@company AND EST_COP='1'")).recordset[0];
            if (!company) throw fail(400, 'La cooperativa no existe o está inactiva.');
        }
        const duplicate = await req(db).input('id', sql.VarChar(10), data.ID_USU).input('email', sql.VarChar(40), data.COR_USU).input('editing', sql.Bit, !!id).query('SELECT ID_USU FROM dbo.USUARIOS WITH (UPDLOCK,HOLDLOCK) WHERE (ID_USU=@id OR LOWER(LTRIM(RTRIM(COR_USU)))=@email) AND (@editing=0 OR ID_USU<>@id)');
        if (duplicate.recordset.length) throw fail(409, 'Ya existe una cuenta con esa identificación o correo.');
        const r = req(db).input('id', sql.VarChar(10), data.ID_USU).input('name', sql.VarChar(15), data.NOM_USU).input('last', sql.VarChar(15), data.APE_USU).input('email', sql.VarChar(40), data.COR_USU).input('phone', sql.VarChar(20), data.TEL_USU).input('state', sql.Char(1), data.EST_USU).input('role', sql.VarChar(5), data.ID_ROL_PER).input('company', sql.VarChar(5), data.ID_COP_PER);
        if (!id) {
            await passwords.ready(db);
            await r.input('hash', sql.VarChar(255), hash).query('INSERT INTO dbo.USUARIOS (ID_USU,NOM_USU,APE_USU,COR_USU,TEL_USU,EST_USU,ID_ROL_PER,ID_COP_PER,CON_USU,FEC_REG_USU) VALUES (@id,@name,@last,@email,@phone,@state,@role,@company,@hash,GETDATE())');
        } else await r.query('UPDATE dbo.USUARIOS SET NOM_USU=@name,APE_USU=@last,COR_USU=@email,TEL_USU=@phone,EST_USU=@state,ID_ROL_PER=@role,ID_COP_PER=@company WHERE ID_USU=@id');
        if (data.permisos !== undefined || data.ID_ROL_PER !== 'R002' || before?.ID_COP_PER !== data.ID_COP_PER) {
            await req(db).input('target', sql.VarChar(10), data.ID_USU).query('DELETE FROM dbo.USUARIO_PERMISOS WHERE ID_USU=@target');
            for (const permission of data.permisos || []) await req(db).input('target', sql.VarChar(10), data.ID_USU).input('permission', sql.VarChar(24), permission).query('INSERT INTO dbo.USUARIO_PERMISOS (ID_USU,PERMISO) VALUES (@target,@permission)');
        }
        if (current.rolId === 'R001' && data.ID_ROL_PER === 'R002' && data.EST_USU === '1') {
            await req(db).input('company', sql.VarChar(5), data.ID_COP_PER).input('target', sql.VarChar(10), data.ID_USU).input('actor', sql.VarChar(10), current.id).query('IF NOT EXISTS (SELECT 1 FROM dbo.COOPERATIVA_RESPONSABLES WITH (UPDLOCK,HOLDLOCK) WHERE ID_COP=@company) INSERT INTO dbo.COOPERATIVA_RESPONSABLES (ID_COP,ID_USU,DESIGNADO_POR) VALUES (@company,@target,@actor)');
        }
        const { password, permisos, ...safe } = data;
        return safe;
    });
}
async function state(user, id, value) {
    if (!['0','1'].includes(value)) throw fail(400, 'Estado inválido.');
    const result = await transaction(async (db) => {
        const current = await actor(db, user);
        const before = await find(db, id);
        if (!before || before.ID_ROL_PER === 'R001') throw fail(404, 'Usuario no encontrado.');
        authorize(current, before, before);
        if (before.PRINCIPAL && value !== '1') throw fail(409, 'Designa primero otro responsable principal activo.');
        await req(db).input('target', sql.VarChar(10), id).input('state', sql.Char(1), value).query('UPDATE dbo.USUARIOS SET EST_USU=@state WHERE ID_USU=@target');
        return { ...before, EST_USU: value };
    });
    if (value === '0') store.revokeUser(id);
    return result;
}
async function designate(user, id) {
    if (user.rolId !== 'R001') throw fail(403, 'Solo R001 puede designar al responsable principal.');
    return transaction(async (db) => {
        await actor(db, user);
        const target = await find(db, id);
        if (!target || target.ID_ROL_PER !== 'R002' || target.EST_USU !== '1' || !target.ID_COP_PER) throw fail(400, 'Selecciona un R002 activo asociado a la cooperativa.');
        await req(db).input('company', sql.VarChar(5), target.ID_COP_PER).input('target', sql.VarChar(10), id).input('actor', sql.VarChar(10), user.id).query('IF EXISTS (SELECT 1 FROM dbo.COOPERATIVA_RESPONSABLES WITH (UPDLOCK,HOLDLOCK) WHERE ID_COP=@company) UPDATE dbo.COOPERATIVA_RESPONSABLES SET ID_USU=@target,DESIGNADO_POR=@actor,DESIGNADO_UTC=SYSUTCDATETIME() WHERE ID_COP=@company ELSE INSERT INTO dbo.COOPERATIVA_RESPONSABLES (ID_COP,ID_USU,DESIGNADO_POR) VALUES (@company,@target,@actor)');
        return target;
    });
}
async function list(user) {
    const db = await conectarBD(); await access.ready(db);
    if (user.rolId !== 'R001' && !access.can(user, 'trabajadores')) throw fail(403, 'No tienes acceso a Personal y accesos.');
    const rows = (await req(db).input('company', sql.VarChar(5), user.rolId === 'R001' ? null : user.cooperativaId).query(`SELECT ${fields},CASE WHEN R.ID_USU IS NULL THEN 0 ELSE 1 END AS PRINCIPAL FROM dbo.USUARIOS U LEFT JOIN dbo.COOPERATIVA_RESPONSABLES R ON R.ID_USU=U.ID_USU WHERE U.ID_ROL_PER IN ('R002','R003','R004') AND (@company IS NULL OR U.ID_COP_PER=@company) ORDER BY U.NOM_USU,U.APE_USU`)).recordset;
    const permisos = (await req(db).input('company', sql.VarChar(5), user.rolId === 'R001' ? null : user.cooperativaId).query('SELECT P.ID_USU,P.PERMISO FROM dbo.USUARIO_PERMISOS P JOIN dbo.USUARIOS U ON U.ID_USU=P.ID_USU WHERE (@company IS NULL OR U.ID_COP_PER=@company)')).recordset;
    return rows.map((row) => ({ ...row, permisos: row.PRINCIPAL ? Object.keys(access.catalog) : permisos.filter((p) => p.ID_USU === row.ID_USU).map((p) => p.PERMISO) }));
}
module.exports = { validate, authorize, save, state, designate, list, transaction };
