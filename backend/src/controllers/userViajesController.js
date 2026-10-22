const { sql, conectarBD } = require('../config/db');

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const fechaISO = (valor) => {
    const normalizada = texto(valor);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalizada) ? normalizada : null;
};

const buscarViajes = async (req, res) => {
    const origen = texto(req.query.origen);
    const destino = texto(req.query.destino);
    const fecha = fechaISO(req.query.fecha);

    if (!origen || !destino || !fecha) {
        return res.status(400).json({
            success: false,
            message: 'Origen, destino y fecha son obligatorios. Use la fecha en formato YYYY-MM-DD.'
        });
    }

    if (origen.length > 15 || destino.length > 15) {
        return res.status(400).json({
            success: false,
            message: 'Origen y destino no pueden superar los 15 caracteres.'
        });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('origen', sql.VarChar(15), origen)
            .input('destino', sql.VarChar(15), destino)
            .input('fecha', sql.Date, fecha)
            .query(`
                SELECT H.ID_HOJ,
                       H.FEC_PRO_HOJ,
                       H.EST_VIA_HOJ,
                       F.ID_FRE,
                       F.CIU_ORI_FRE,
                       F.CIU_DES_FRE,
                       F.FEC_HOR_INI_FRE,
                       F.FEC_HOR_FIN_FRE,
                       B.ID_BUS,
                       B.NUM_BUS,
                       B.PLA_BUS,
                       B.NUM_PIS,
                       C.ID_COP,
                       C.NOM_COP,
                       (SELECT COUNT(*) FROM ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS
                FROM HOJAS_RUTAS H
                INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN COOPERATIVAS C ON C.ID_COP = B.ID_COP_PER
                WHERE F.CIU_ORI_FRE = @origen
                  AND F.CIU_DES_FRE = @destino
                  AND H.FEC_PRO_HOJ = @fecha
                  AND ISNULL(H.EST_VIA_HOJ, 'PROGRAMADO') NOT IN ('CANCELADA', 'CANCELADO')
                  AND ISNULL(B.EST_BUS, 'ACTIVO') <> 'INACTIVO'
                  AND ISNULL(F.EST_RES, '1') <> '0'
                ORDER BY F.FEC_HOR_INI_FRE, H.ID_HOJ
            `);

        return res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            viajes: resultado.recordset
        });
    } catch (error) {
        console.error('Error al buscar viajes del usuario:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar las frecuencias.' });
    }
};

module.exports = { buscarViajes };
