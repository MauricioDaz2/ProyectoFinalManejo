const { sql, conectarBD } = require('../config/db');
const cc = require('./frequencyControl');

const enabled = () => process.env.CC02_HOJAS_RUTA === '1';
const categoryCode = /^[A-Z][A-Z0-9_]{0,23}$/;
const status = "h.EST_VIA_HOJ IN ('PROGRAMADO','PROGRAMADA','EN CURSO')";

function requireEnabled() {
    if (!enabled()) throw cc.fail(404, 'LOTES_NO_HABILITADOS', 'La asignación en lote aún no está habilitada.');
}

async function compatible(db, frecuencia, bus) {
    if (!enabled()) return;
    requireEnabled();
    const result = await db.request().input('frecuencia', sql.VarChar(5), frecuencia).input('bus', sql.VarChar(5), bus)
        .query(`SELECT 1 AS permitido FROM dbo.FRECUENCIAS f
            JOIN dbo.BUS_CATEGORIAS c ON c.ID_CAT=f.ID_CAT_OP WHERE f.ID_FRE=@frecuencia AND c.ID_BUS=@bus`);
    if (!result.recordset.length) throw cc.fail(422, 'CATEGORIA_INCOMPATIBLE', 'Configura una categoría para la frecuencia y selecciona un bus compatible.');
}

async function list(company) {
    requireEnabled();
    const db = await conectarBD();
    const { recordsets } = await db.request().input('empresa', sql.VarChar(5), company).query(`
        SELECT ID_CAT,NOM_CAT FROM dbo.CATEGORIAS_OPERATIVAS ORDER BY NOM_CAT;
        SELECT ID_BUS,NUM_BUS,PLA_BUS FROM dbo.BUSES WHERE ID_COP_PER=@empresa ORDER BY NUM_BUS;
        SELECT bc.ID_BUS,bc.ID_CAT FROM dbo.BUS_CATEGORIAS bc JOIN dbo.BUSES b ON b.ID_BUS=bc.ID_BUS
            WHERE b.ID_COP_PER=@empresa ORDER BY bc.ID_CAT;
        SELECT f.ID_FRE,f.CIU_ORI_FRE,f.CIU_DES_FRE,f.ID_CAT_OP
            FROM dbo.FRECUENCIAS f
            WHERE f.ID_COP_PER=@empresa ORDER BY f.CIU_ORI_FRE,f.CIU_DES_FRE;
    `);
    const [categorias, buses, asignadas, frecuencias] = recordsets;
    return { categorias, frecuencias, buses: buses.map(bus => ({
        ...bus, categorias: asignadas.filter(row => row.ID_BUS === bus.ID_BUS).map(row => row.ID_CAT)
    })) };
}

async function setFrequency(company, id, category) {
    requireEnabled();
    if (typeof category !== 'string' || !categoryCode.test(category))
        throw cc.fail(422, 'CATEGORIA_INVALIDA', 'Selecciona una categoría operativa.');
    return cc.operation(await conectarBD(), async db => {
        const { recordset: [row] } = await db.request().input('id', sql.VarChar(5), id)
            .input('empresa', sql.VarChar(5), company).input('cat', sql.VarChar(24), category).query(`
            SELECT f.ID_FRE, c.ID_CAT FROM dbo.FRECUENCIAS f
            LEFT JOIN dbo.CATEGORIAS_OPERATIVAS c ON c.ID_CAT=@cat
            WHERE f.ID_FRE=@id AND f.ID_COP_PER=@empresa`);
        if (!row) throw cc.fail(404, 'FRECUENCIA_NO_ENCONTRADA', 'Frecuencia no encontrada.');
        if (!row.ID_CAT) throw cc.fail(422, 'CATEGORIA_INVALIDA', 'La categoría no existe.');
        const { recordset } = await db.request().input('id', sql.VarChar(5), id).input('cat', sql.VarChar(24), category).query(`
            SELECT TOP (1) h.ID_HOJ FROM dbo.HOJAS_RUTAS h
            WHERE h.ID_FRE_PER=@id AND ${status}
              AND NOT EXISTS (SELECT 1 FROM dbo.BUS_CATEGORIAS b
                WHERE b.ID_BUS=COALESCE(h.ID_BUS_REE,h.ID_BUS_PER) AND b.ID_CAT=@cat)`);
        if (recordset.length) throw cc.fail(409, 'CATEGORIA_CON_SALIDAS', 'Hay hojas activas cuyos buses no admiten esa categoría.');
        await db.request().input('id', sql.VarChar(5), id).input('cat', sql.VarChar(24), category)
            .query('UPDATE dbo.FRECUENCIAS SET ID_CAT_OP=@cat WHERE ID_FRE=@id');
        return { idFrecuencia: id, categoria: category };
    });
}

async function setBus(company, id, values) {
    requireEnabled();
    if (!Array.isArray(values) || values.length > 30 ||
        values.some(value => typeof value !== 'string' || !categoryCode.test(value)) || new Set(values).size !== values.length)
        throw cc.fail(422, 'CATEGORIAS_INVALIDAS', 'Selecciona categorías válidas y no repetidas.');
    return cc.operation(await conectarBD(), async db => {
        const { recordset } = await db.request().input('id', sql.VarChar(5), id)
            .input('empresa', sql.VarChar(5), company).query('SELECT ID_BUS FROM dbo.BUSES WHERE ID_BUS=@id AND ID_COP_PER=@empresa');
        if (!recordset.length) throw cc.fail(404, 'BUS_NO_ENCONTRADO', 'Bus no encontrado.');
        const json = JSON.stringify(values);
        const validation = await db.request().input('json', sql.NVarChar(sql.MAX), json).query(`
            SELECT COUNT(*) AS total FROM OPENJSON(@json) j JOIN dbo.CATEGORIAS_OPERATIVAS c ON c.ID_CAT=j.value`);
        if (validation.recordset[0].total !== values.length)
            throw cc.fail(422, 'CATEGORIAS_INVALIDAS', 'Alguna categoría no existe.');
        const sheets = await db.request().input('id', sql.VarChar(5), id).input('json', sql.NVarChar(sql.MAX), json).query(`
            SELECT TOP (1) h.ID_HOJ FROM dbo.HOJAS_RUTAS h JOIN dbo.FRECUENCIAS f ON f.ID_FRE=h.ID_FRE_PER
            WHERE COALESCE(h.ID_BUS_REE,h.ID_BUS_PER)=@id AND ${status}
              AND f.ID_CAT_OP IS NOT NULL AND NOT EXISTS (SELECT 1 FROM OPENJSON(@json) j WHERE j.value=f.ID_CAT_OP)`);
        if (sheets.recordset.length) throw cc.fail(409, 'CATEGORIA_CON_SALIDAS', 'El bus está asignado a hojas activas que aún necesitan esa categoría.');
        await db.request().input('id', sql.VarChar(5), id).input('json', sql.NVarChar(sql.MAX), json).query(`
            DELETE dbo.BUS_CATEGORIAS WHERE ID_BUS=@id;
            INSERT dbo.BUS_CATEGORIAS (ID_BUS,ID_CAT) SELECT @id,value FROM OPENJSON(@json);`);
        return { idBus: id, categorias: values };
    });
}

module.exports = { enabled, requireEnabled, compatible, list, setFrequency, setBus };
