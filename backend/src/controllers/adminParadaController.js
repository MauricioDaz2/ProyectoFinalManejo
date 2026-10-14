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

const asignarBusReemplazo = async (req, res) => {
    const { idHoja } = req.params;
    const { idBusRee } = req.body;

    if (!idBusRee) {
        return res.status(400).json({ success: false, message: 'Debe indicar el bus de reemplazo.' });
    }

    try {
        const pool = await conectarBD();

        const hoja = await pool.request()
            .input('idHoja', sql.VarChar, idHoja)
            .query('SELECT ID_HOJ, ID_BUS_PER FROM HOJAS_RUTAS WHERE ID_HOJ = @idHoja');

        if (hoja.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        const idBusOriginal = hoja.recordset[0].ID_BUS_PER;

        if (idBusRee === idBusOriginal) {
            return res.status(400).json({
                success: false,
                message: 'El bus de reemplazo no puede ser el mismo bus programado en la hoja.'
            });
        }

        const ree = await pool.request()
            .input('idBusRee', sql.VarChar, idBusRee)
            .query('SELECT ID_BUS, EST_BUS FROM BUSES WHERE ID_BUS = @idBusRee');

        if (ree.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'El bus de reemplazo no existe.' });
        }

        if (ree.recordset[0].EST_BUS === 'MANTENIMIENTO') {
            return res.status(409).json({
                success: false,
                message: 'El bus indicado no está disponible en Parada.'
            });
        }

        await pool.request()
            .input('idHoja', sql.VarChar, idHoja)
            .input('idBusRee', sql.VarChar, idBusRee)
            .input('idBusOriginal', sql.VarChar, idBusOriginal)
            .query(`
                UPDATE HOJAS_RUTAS SET ID_BUS_REE = @idBusRee WHERE ID_HOJ = @idHoja;
                UPDATE BUSES SET EST_BUS = 'OPERANDO' WHERE ID_BUS = @idBusRee;
                UPDATE BUSES SET EST_BUS = 'PARADA'   WHERE ID_BUS = @idBusOriginal;
            `);

        res.status(200).json({
            success: true,
            message: 'Bus de reemplazo asignado correctamente.',
            idBusOriginal,
            idBusRee
        });

    } catch (error) {
        console.error('Error al asignar bus de reemplazo:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const listarAsientosBus = async (req, res) => {
    const { idBus } = req.params;

    try {
        const pool = await conectarBD();

        const bus = await pool.request()
            .input('idBus', sql.VarChar, idBus)
            .query('SELECT ID_BUS, NUM_BUS, PLA_BUS, NUM_PIS FROM BUSES WHERE ID_BUS = @idBus');

        if (bus.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'El bus indicado no existe.' });
        }

        const resultado = await pool.request()
            .input('idBus', sql.VarChar, idBus)
            .query(`
                SELECT A.ID_ASI,
                       A.PIS_ASI,
                       A.ID_TIP_PER,
                       T.NOM_TIP,
                       T.PRE_TIP
                FROM ASIENTOS_BUS A
                INNER JOIN TIPOS_ASIENTOS T ON A.ID_TIP_PER = T.ID_TIP
                WHERE A.ID_BUS_PER = @idBus
                ORDER BY A.PIS_ASI
            `);

        res.status(200).json({
            success: true,
            bus: bus.recordset[0],
            total: resultado.recordset.length,
            asientos: resultado.recordset
        });

    } catch (error) {
        console.error('Error al listar asientos del bus:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarFlota, asignarBusReemplazo, listarAsientosBus };
