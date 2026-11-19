const { conectarBD, sql } = require('../config/db');
const profiles = require('../repositories/cooperativaProfileRepository');
const { publicData } = require('../services/profileContent');
const cc = require('../services/frequencyControl');

async function cooperativas(req, res) {
    try {
        const pool = await conectarBD();
        const result = await pool.request().query(`
            SELECT ID_COP, NOM_COP, LOG_URL_COP FROM COOPERATIVAS
            WHERE EST_COP = '1' ORDER BY NOM_COP
        `);
        const listed = [];
        for (const company of result.recordset) {
            const content = await profiles.published(pool, company.ID_COP);
            const info = content ? publicData(company, content).cooperativa : company;
            listed.push({ ID_COP: info.ID_COP, NOM_COP: info.NOM_COP, LOG_URL_COP: info.LOG_URL_COP });
        }
        res.set('Cache-Control', 'no-store').json({ success: true, cooperativas: listed });
    } catch (error) {
        res.status(500).json({ success: false, message: 'No se pudieron consultar las cooperativas.' });
    }
}

async function salidas(req, res) {
    const cooperativa = typeof req.query.cooperativa === 'string' ? req.query.cooperativa.trim().toUpperCase() : '';
    if (req.query.cooperativa !== undefined && !/^[A-Z0-9_-]{1,5}$/.test(cooperativa)) return res.status(400).json({ success: false, message: 'Cooperativa no válida.' });
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    try {
        const pool = await conectarBD();
        const result = await pool.request().input('hoy', sql.Date, fecha).input('cooperativa', sql.VarChar(5), cooperativa || null).query(`
            SELECT TOP (6) H.ID_HOJ, H.FEC_PRO_HOJ, F.CIU_ORI_FRE,
                F.CIU_DES_FRE, C.ID_COP, C.NOM_COP, B.NUM_BUS, H.EST_VIA_HOJ
            FROM HOJAS_RUTAS H
            INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
            INNER JOIN BUSES B ON B.ID_BUS = ${cc.effectiveBus()}
            INNER JOIN RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
            INNER JOIN COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
            WHERE H.FEC_PRO_HOJ >= @hoy AND C.EST_COP = '1'
                AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                AND B.ID_COP_PER = C.ID_COP
                AND ISNULL(F.EST_RES, '1') <> '0'
                ${cc.enabled() ? `AND ${cc.allowedSheet}` : ''}
                AND UPPER(LTRIM(RTRIM(B.EST_BUS))) NOT IN ('INACTIVO', 'MANTENIMIENTO', 'TALLER')
                AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADA', 'PROGRAMADO')
            ORDER BY H.FEC_PRO_HOJ, H.ID_HOJ
        `);
        res.json({ success: true, salidas: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: 'No se pudieron consultar las próximas salidas.' });
    }
}

async function perfilCooperativa(req, res) {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,5}$/.test(id)) return res.status(400).json({ success: false, message: 'El identificador de la cooperativa no es válido.' });
    try {
        const pool = await conectarBD();
        const result = await pool.request().input('id', sql.VarChar(5), id).query(`
            SELECT ID_COP, NOM_COP, LOG_URL_COP, DIR_COP, TEL_COP
            FROM dbo.COOPERATIVAS WHERE ID_COP = @id AND EST_COP = '1'
        `);
        if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Esta cooperativa no existe o su página no está disponible.' });
        const content = await profiles.published(pool, id);
        if (content) return res.set('Cache-Control', 'no-store').json({ success: true, ...publicData(result.recordset[0], content) });
        const photos = await pool.request().input('id', sql.VarChar(5), id).query(`
            SELECT TOP (6) B.NUM_BUS, B.IMG_URL_BUS
            FROM dbo.BUSES B JOIN dbo.COOPERATIVAS C ON C.ID_COP = B.ID_COP_PER
            WHERE C.ID_COP = @id AND C.EST_COP = '1' AND UPPER(LTRIM(RTRIM(B.EST_BUS))) = 'ACTIVO'
                AND NULLIF(LTRIM(RTRIM(B.IMG_URL_BUS)), '') IS NOT NULL
            ORDER BY B.NUM_BUS, B.ID_BUS
        `);
        res.json({ success: true, cooperativa: result.recordset[0], fotos: photos.recordset });
    } catch {
        res.status(503).json({ success: false, message: 'No se pudo consultar la cooperativa. Inténtalo nuevamente.' });
    }
}

module.exports = { cooperativas, salidas, perfilCooperativa };
