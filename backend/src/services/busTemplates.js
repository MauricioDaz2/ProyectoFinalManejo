const { sql, conectarBD } = require('../config/db');
const { fail } = require('./tripRules');
const fields = { ID_CHO_1:'R006', ID_CHO_2:'R006', ID_CON_DEF:'R004' };
const company = (db, id) => new sql.Request(db).input('company', sql.VarChar(5), id);
const staff = async (db, id) => (await company(db, id).query(`
    SELECT ID_USU,NOM_USU,APE_USU,ID_ROL_PER FROM dbo.USUARIOS
    WHERE ID_COP_PER=@company AND EST_USU='1' AND ID_ROL_PER IN ('R004','R006')
    ORDER BY NOM_USU,APE_USU`)).recordset;

async function updateCrew(db, id, owner, body) {
    const provided = Object.keys(fields).filter(field => Object.hasOwn(body, field));
    if (!provided.length) return;
    const available = await staff(db, owner);
    const req = company(db, owner).input('bus', sql.VarChar(5), id);
    for (const field of provided) {
        const value = body[field];
        if (value !== null && value !== '' && !available.some(u => u.ID_USU === value && u.ID_ROL_PER === fields[field])) {
            throw fail(400, 'Selecciona tripulación activa de tu cooperativa y del rol correspondiente.');
        }
        req.input(field, sql.VarChar(10), value || null);
    }
    await req.query(`
        UPDATE dbo.BUSES SET ${provided.map(field => `${field}=@${field}`).join(',')}
        WHERE ID_BUS=@bus AND ID_COP_PER=@company;
        IF EXISTS (SELECT 1 FROM dbo.BUSES WHERE ID_BUS=@bus AND ID_CHO_1=ID_CHO_2)
            THROW 51701, 'Los dos choferes deben ser distintos.', 1;`);
}

function validateTemplate(body) {
    const name = typeof body.NOM_PLA === 'string' ? body.NOM_PLA.trim() : '';
    const layout = body.PLANTILLA;
    const floors = layout?.pisos;
    if (!name || name.length > 80 || !Array.isArray(floors) || floors.length < 1 || floors.length > 2) {
        throw fail(400, 'Indica el nombre y un diseño de uno o dos pisos.');
    }
    for (const [i, floor] of floors.entries()) {
        if (!floor || Number(floor.piso) !== i + 1 || !Array.isArray(floor.celdas) || floor.celdas.length > 500) {
            throw fail(400, 'La estructura de los pisos no es válida.');
        }
        const validSeat = c => ['ASIENTO','NORMAL','VIP','DISCAPACIDAD'].includes(String(c?.tipoCelda || c?.rol).toUpperCase());
        const seats = floor.celdas.filter(validSeat).length;
        if (seats < 4 || seats > 60 || floor.celdas.some(c => !c || typeof c !== 'object')) {
            throw fail(400, 'Cada piso debe tener entre 4 y 60 asientos.');
        }
    }
    return { name, floors: floors.length, layout: JSON.stringify(layout) };
}

async function list(user) {
    const db = await conectarBD();
    const r = await company(db,user.cooperativaId).query('SELECT ID_PLA,NOM_PLA,NUM_PIS,PLANTILLA_JSON FROM dbo.PLANTILLAS_BUS WHERE ID_COP_PER=@company ORDER BY NOM_PLA');
    return { plantillas:r.recordset.map(p => ({...p, PLANTILLA:JSON.parse(p.PLANTILLA_JSON)})), personal:await staff(db,user.cooperativaId) };
}

function templateId(value) {
    if (!/^\d{1,10}$/.test(value) || Number(value) > 2147483647 || Number(value) < 1) throw fail(400,'Plantilla inválida.');
    return Number(value);
}

async function save(user, body, id) {
    const { name, floors, layout } = validateTemplate(body);
    const db = await conectarBD();
    const req = company(db,user.cooperativaId).input('name',sql.NVarChar(80),name)
        .input('floors',sql.Int,floors).input('layout',sql.NVarChar(sql.MAX),layout);
    const result = id
        ? await req.input('id',sql.Int,templateId(id)).query('UPDATE dbo.PLANTILLAS_BUS SET NOM_PLA=@name,NUM_PIS=@floors,PLANTILLA_JSON=@layout OUTPUT inserted.ID_PLA WHERE ID_PLA=@id AND ID_COP_PER=@company')
        : await req.query('INSERT dbo.PLANTILLAS_BUS(ID_COP_PER,NOM_PLA,NUM_PIS,PLANTILLA_JSON) OUTPUT inserted.ID_PLA VALUES(@company,@name,@floors,@layout)');
    if (!result.recordset.length) throw fail(404,'Plantilla no disponible.');
    return result.recordset[0];
}

async function remove(user,id) {
    const db = await conectarBD();
    const result = await company(db,user.cooperativaId).input('id',sql.Int,templateId(id))
        .query('DELETE dbo.PLANTILLAS_BUS WHERE ID_PLA=@id AND ID_COP_PER=@company');
    if (!result.rowsAffected[0]) throw fail(404,'Plantilla no disponible.');
    return {};
}

const handle = action => async (req,res) => {
    try { res.json({success:true,...await action(req)}); }
    catch (error) {
        const duplicate = [2601,2627].includes(error.number);
        res.status(error.status || (duplicate ? 409 : 503)).json({success:false,message:error.status
            ? error.message : duplicate ? 'Ya existe una plantilla con ese nombre.' : 'No se pudo acceder a las plantillas del bus.'});
    }
};
module.exports = { updateCrew, handle, list, save, remove };
