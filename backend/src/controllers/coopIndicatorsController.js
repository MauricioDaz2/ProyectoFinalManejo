const { sql, conectarBD } = require('../config/db');
const { handle } = require('./accountController');
module.exports = handle(async (req, res) => {
    const pool = await conectarBD();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await pool.request().input('company', sql.VarChar(5), req.auth.cooperativaId).input('today', sql.Date, today).query(`
        SELECT
        (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER=@company) AS BUSES,
        (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER=@company AND UPPER(LTRIM(RTRIM(EST_BUS)))='ACTIVO') AS ACTIVOS,
        (SELECT COUNT(*) FROM dbo.FRECUENCIAS F JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER WHERE R.ID_COP_PER=@company AND F.EST_RES='1') AS FRECUENCIAS,
        (SELECT COUNT(*) FROM (SELECT UPPER(LTRIM(RTRIM(F.CIU_ORI_FRE))) AS ORIGEN,UPPER(LTRIM(RTRIM(F.CIU_DES_FRE))) AS DESTINO FROM dbo.FRECUENCIAS F JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER WHERE R.ID_COP_PER=@company AND F.EST_RES='1' GROUP BY UPPER(LTRIM(RTRIM(F.CIU_ORI_FRE))),UPPER(LTRIM(RTRIM(F.CIU_DES_FRE)))) D) AS RUTAS,
        (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER JOIN dbo.BUSES B ON B.ID_BUS=H.ID_BUS_PER WHERE R.ID_COP_PER=@company AND B.ID_COP_PER=@company AND H.FEC_PRO_HOJ=@today AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADA','PROGRAMADO','EN CURSO')) AS SALIDAS
    `);
    res.json({ success: true, indicadores: result.recordset[0] });
});
