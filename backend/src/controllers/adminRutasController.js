const { sql, conectarBD } = require('../config/db');


const listarHojasRuta = async (req, res) => {
    try {
        const pool = await conectarBD();

        const resultado = await pool.request().query(`
            SELECT H.ID_HOJ,
                   CONVERT(varchar(10), H.FEC_PRO_HOJ, 23) AS FEC_PRO_HOJ,
                   H.EST_VIA_HOJ,
                   H.OBS_HOJ,
                   H.ID_BUS_PER,
                   H.ID_BUS_REE,
                   H.ID_FRE_PER,
                   BP.NUM_BUS   AS NUM_BUS_PER,
                   BP.PLA_BUS   AS PLA_BUS_PER,
                   BR.NUM_BUS   AS NUM_BUS_REE,
                   BR.PLA_BUS   AS PLA_BUS_REE,
                   F.CIU_ORI_FRE,
                   F.CIU_DES_FRE,
                   F.FEC_HOR_INI_FRE,
                   C.NOM_COP
            FROM HOJAS_RUTAS H
            INNER JOIN BUSES BP        ON H.ID_BUS_PER = BP.ID_BUS
            LEFT  JOIN BUSES BR        ON H.ID_BUS_REE = BR.ID_BUS
            INNER JOIN FRECUENCIAS F   ON H.ID_FRE_PER = F.ID_FRE
            INNER JOIN COOPERATIVAS C  ON BP.ID_COP_PER = C.ID_COP
            ORDER BY H.FEC_PRO_HOJ DESC, H.ID_HOJ DESC
        `);

        res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            hojas: resultado.recordset
        });

    } catch (error) {
        console.error('Error al listar hojas de ruta:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const listarFrecuencias = async (req, res) => {
    try {
        const pool = await conectarBD();

        const resultado = await pool.request().query(`
            SELECT F.ID_FRE,
                   F.CIU_ORI_FRE,
                   F.CIU_DES_FRE,
                   CONVERT(varchar(10), F.FEC_HOR_INI_FRE, 23) AS FEC_HOR_INI_FRE,
                   CONVERT(varchar(10), F.FEC_HOR_FIN_FRE, 23) AS FEC_HOR_FIN_FRE,
                   F.EST_RES,
                   F.ID_RES_PER,
                   R.CUP_FRE_MAX,
                   C.NOM_COP
            FROM FRECUENCIAS F
            LEFT JOIN RESOLUCIONES_ANT R ON F.ID_RES_PER = R.ID_RES
            LEFT JOIN COOPERATIVAS C     ON R.ID_COP_PER = C.ID_COP
            ORDER BY F.CIU_ORI_FRE, F.CIU_DES_FRE
        `);

        res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            frecuencias: resultado.recordset
        });

    } catch (error) {
        console.error('Error al listar frecuencias:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const listarResoluciones = async (req, res) => {
    try {
        const pool = await conectarBD();

        const resultado = await pool.request().query(`
            SELECT R.ID_RES,
                   CONVERT(varchar(10), R.FEC_EMI_RES, 23) AS FEC_EMI_RES,
                   R.CUP_FRE_MAX,
                   R.DOC_URL_RES,
                   R.ID_COP_PER,
                   C.NOM_COP
            FROM RESOLUCIONES_ANT R
            LEFT JOIN COOPERATIVAS C ON R.ID_COP_PER = C.ID_COP
            ORDER BY R.FEC_EMI_RES DESC
        `);

        res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            resoluciones: resultado.recordset
        });

    } catch (error) {
        console.error('Error al listar resoluciones:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarHojasRuta, listarFrecuencias, listarResoluciones };
