const { sql, conectarBD } = require('../config/db');
const { error, validateImages, references } = require('../services/profileContent');

async function installed(pool) {
    const result = await pool.request().query("SELECT CASE WHEN OBJECT_ID('dbo.COOPERATIVA_PERFILES', 'U') IS NOT NULL AND OBJECT_ID('dbo.COOPERATIVA_IMAGENES', 'U') IS NOT NULL THEN 1 ELSE 0 END AS INSTALADO");
    return result.recordset[0]?.INSTALADO === 1;
}
async function ready() {
    const pool = await conectarBD();
    if (!await installed(pool)) throw error(503, 'La personalización está pendiente de instalar la migración SQL. No se han guardado cambios.', 'MIGRATION_REQUIRED');
    return pool;
}
function companyRequest(connection, id) { return new sql.Request(connection).input('cop', sql.VarChar(5), id); }
async function company(connection, id) {
    const result = await companyRequest(connection, id).query("SELECT ID_COP, NOM_COP, LOG_URL_COP, DIR_COP, TEL_COP FROM dbo.COOPERATIVAS WHERE ID_COP = @cop AND EST_COP = '1'");
    if (!result.recordset[0]) throw error(404, 'Cooperativa no disponible.');
    if (await require('../services/companyRegistration').installed(connection)) {
        const contact = await companyRequest(connection, id).query('SELECT NOM_COM_COP, COR_INS_COP FROM dbo.COOPERATIVAS WHERE ID_COP=@cop');
        Object.assign(result.recordset[0], contact.recordset[0]);
    }
    return result.recordset[0];
}
async function read(id) {
    const pool = await ready();
    const info = await company(pool, id);
    const result = await companyRequest(pool, id).query('SELECT BORRADOR_JSON, REVISION, PUBLICADO_UTC FROM dbo.COOPERATIVA_PERFILES WHERE ID_COP = @cop');
    const images = await companyRequest(pool, id).query('SELECT ID_IMG, TIPO, ANCHO, ALTO, BYTES FROM dbo.COOPERATIVA_IMAGENES WHERE ID_COP = @cop ORDER BY CREADO_UTC DESC');
    const row = result.recordset[0];
    return { company: info, content: row ? JSON.parse(row.BORRADOR_JSON) : null, revision: row?.REVISION || 0, publishedAt: row?.PUBLICADO_UTC || null, images: images.recordset };
}
async function published(pool, id, includeInactive = false) {
    if (!await installed(pool)) return null;
    const result = await companyRequest(pool, id).query(`SELECT P.PUBLICADO_JSON FROM dbo.COOPERATIVA_PERFILES P JOIN dbo.COOPERATIVAS C ON C.ID_COP = P.ID_COP WHERE P.ID_COP = @cop${includeInactive ? '' : " AND C.EST_COP = '1'"}`);
    return result.recordset[0]?.PUBLICADO_JSON ? JSON.parse(result.recordset[0].PUBLICADO_JSON) : null;
}
async function transaction(work) {
    const tx = new sql.Transaction(await ready());
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (err) { await tx.rollback().catch(() => {}); throw err; }
}
async function save(id, content, revision, publish) {
    return transaction(async (tx) => {
        await company(tx, id);
        const current = await companyRequest(tx, id).query('SELECT REVISION FROM dbo.COOPERATIVA_PERFILES WITH (UPDLOCK, HOLDLOCK) WHERE ID_COP = @cop');
        if ((current.recordset[0]?.REVISION || 0) !== revision) throw error(409, 'El perfil cambió en otra pestaña. Recarga antes de guardar para no sobrescribirlo.');
        const images = await companyRequest(tx, id).query('SELECT ID_IMG, TIPO FROM dbo.COOPERATIVA_IMAGENES WHERE ID_COP = @cop');
        validateImages(content, images.recordset);
        const request = companyRequest(tx, id).input('json', sql.NVarChar(sql.MAX), JSON.stringify(content)).input('publicar', sql.Bit, publish);
        const result = await request.query(current.recordset.length ? `
            UPDATE dbo.COOPERATIVA_PERFILES SET BORRADOR_JSON = @json, REVISION = REVISION + 1,
                ACTUALIZADO_UTC = SYSUTCDATETIME(),
                PUBLICADO_JSON = CASE WHEN @publicar = 1 THEN @json ELSE PUBLICADO_JSON END,
                PUBLICADO_UTC = CASE WHEN @publicar = 1 THEN SYSUTCDATETIME() ELSE PUBLICADO_UTC END
            OUTPUT INSERTED.REVISION, INSERTED.PUBLICADO_UTC WHERE ID_COP = @cop
        ` : `
            INSERT INTO dbo.COOPERATIVA_PERFILES (ID_COP, BORRADOR_JSON, PUBLICADO_JSON, PUBLICADO_UTC)
            OUTPUT INSERTED.REVISION, INSERTED.PUBLICADO_UTC
            VALUES (@cop, @json, CASE WHEN @publicar = 1 THEN @json ELSE NULL END, CASE WHEN @publicar = 1 THEN SYSUTCDATETIME() ELSE NULL END)
        `);
        return { revision: result.recordset[0].REVISION, publishedAt: result.recordset[0].PUBLICADO_UTC };
    });
}
async function addImage(id, image) {
    try { return await transaction(async (tx) => {
        await company(tx, id);
        const limits = await companyRequest(tx, id).query('SELECT COUNT(*) AS TOTAL, ISNULL(SUM(BYTES), 0) AS BYTES FROM dbo.COOPERATIVA_IMAGENES WITH (UPDLOCK, HOLDLOCK) WHERE ID_COP = @cop');
        if (limits.recordset[0].TOTAL >= 40 || limits.recordset[0].BYTES + image.BYTES > 120 * 1024 * 1024) throw error(409, 'Se alcanzó el límite de imágenes. Elimina archivos que ya no uses en la biblioteca.');
        await companyRequest(tx, id).input('id', sql.UniqueIdentifier, image.ID_IMG).input('tipo', sql.VarChar(10), image.TIPO)
            .input('archivo', sql.VarChar(50), image.ARCHIVO).input('bytes', sql.Int, image.BYTES).input('ancho', sql.Int, image.ANCHO).input('alto', sql.Int, image.ALTO)
            .input('mime', sql.VarChar(20), image.MIME)
            .query('INSERT INTO dbo.COOPERATIVA_IMAGENES (ID_IMG, ID_COP, TIPO, ARCHIVO, MIME, BYTES, ANCHO, ALTO) VALUES (@id, @cop, @tipo, @archivo, @mime, @bytes, @ancho, @alto)');
    }); } catch (err) {
        if (err.number === 547 && /CK_IMAGEN_(MIME|DIMENSIONES)/.test(err.message)) throw error(503, 'La base de datos conserva las restricciones anteriores de imágenes. Falta instalar 004_cooperativa_imagenes_flexibles.sql. El archivo no se ha guardado.', 'IMAGE_STORAGE_MIGRATION_REQUIRED');
        throw err;
    }
}
async function image(id, imageId, isPublic, includeInactive = false) {
    const pool = await ready();
    if(!includeInactive)await company(pool, id);
    if (isPublic) {
        const content = await published(pool, id);
        if (!references(content).includes(imageId.toLowerCase())) throw error(404, 'Imagen no disponible.');
    }
    const result = await companyRequest(pool, id).input('id', sql.UniqueIdentifier, imageId).query('SELECT ARCHIVO, MIME FROM dbo.COOPERATIVA_IMAGENES WHERE ID_COP = @cop AND ID_IMG = @id');
    if (!result.recordset.length) throw error(404, 'Imagen no disponible.');
    return result.recordset[0];
}
async function removeImage(id, imageId) {
    return transaction(async (tx) => {
        await company(tx, id);
        const profile = await companyRequest(tx, id).query('SELECT BORRADOR_JSON, PUBLICADO_JSON FROM dbo.COOPERATIVA_PERFILES WITH (UPDLOCK, HOLDLOCK) WHERE ID_COP = @cop');
        const row = profile.recordset[0];
        if ([row?.BORRADOR_JSON, row?.PUBLICADO_JSON].filter(Boolean).some((json) => references(JSON.parse(json)).includes(imageId.toLowerCase()))) throw error(409, 'La imagen está en el borrador o en la publicación. Retírala del contenido y guarda antes de eliminarla.');
        const removed = await companyRequest(tx, id).input('id', sql.UniqueIdentifier, imageId).query('DELETE FROM dbo.COOPERATIVA_IMAGENES OUTPUT DELETED.ARCHIVO WHERE ID_COP = @cop AND ID_IMG = @id');
        if (!removed.recordset.length) throw error(404, 'Imagen no disponible.');
        return removed.recordset[0].ARCHIVO;
    });
}
module.exports = { ready, read, published, save, addImage, image, removeImage, installed };
