const { sql, conectarBD } = require('../config/db');

// Estados de flota manejados por el módulo:
//   OPERANDO      -> bus asignado/en operación
//   PARADA        -> bus en retén, disponible para suplir emergencias
//   MANTENIMIENTO -> bus fuera de servicio
const listarFlota = async (req, res) => {
    const { estado } = req.query;

    try {
        const pool = await conectarBD();
        const request = pool.request();

        let query = `
            SELECT B.ID_BUS,
                   B.NUM_BUS,
                   B.PLA_BUS,
                   B.ANIO_BUS,
                   B.NUM_PIS,
                   B.IMG_URL_BUS,
                   B.EST_BUS,
                   B.ID_COP_PER,
                   C.NOM_COP,
                   (SELECT COUNT(*) FROM ASIENTOS_BUS) AS TOTAL_ASIENTOS
            FROM BUSES B
            INNER JOIN COOPERATIVAS C ON B.ID_COP_PER = C.ID_COP
        `;

        if (estado) {
            request.input('estado', sql.VarChar, estado);
            query += ' WHERE B.EST_BUS = @estado';
        }

        query += ' ORDER BY B.NUM_BUS';

        const resultado = await request.query(query);

        res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            buses: resultado.recordset
        });

    } catch (error) {
        console.error('Error al listar la flota:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarFlota };
