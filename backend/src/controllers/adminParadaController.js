const { sql, conectarBD } = require('../config/db');
const cc = require('../services/frequencyControl');
const categories = require('../services/routeCategories');

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

    if (!/^[A-Z0-9_-]{1,5}$/i.test(idHoja || '') || !/^[A-Z0-9_-]{1,5}$/i.test(idBusRee || '')) {
        return res.status(400).json({ success: false, message: 'Debe indicar el bus de reemplazo.' });
    }

    try {
        const idBusOriginal = await cc.operation(await conectarBD(), async db => {
            const { recordset: [hoja] } = await db.request().input('idHoja', sql.VarChar(5), idHoja).query(`
                SELECT H.*,R.ID_COP_PER FROM dbo.HOJAS_RUTAS H JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER
                JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES=F.ID_RES_PER WHERE H.ID_HOJ=@idHoja`);
            if (!hoja) throw cc.fail(404, 'HOJA_NO_ENCONTRADA', 'Hoja de ruta no encontrada.');
            const actual = hoja.ID_BUS_REE || hoja.ID_BUS_PER;
            if (idBusRee.toUpperCase() === actual || idBusRee.toUpperCase() === hoja.ID_BUS_PER) {
                throw cc.fail(400, 'BUS_REEMPLAZO_INVALIDO', 'Selecciona un bus distinto del bus actual y del bus original.');
            }
            const { recordset: [ree] } = await db.request().input('idBusRee', sql.VarChar(5), idBusRee)
                .query('SELECT ID_BUS,EST_BUS,ID_COP_PER FROM dbo.BUSES WHERE ID_BUS=@idBusRee');
            if (!ree) throw cc.fail(404, 'BUS_NO_ENCONTRADO', 'El bus de reemplazo no existe.');
            if (ree.ID_COP_PER !== hoja.ID_COP_PER || !['ACTIVO','PARADA','1'].includes(ree.EST_BUS)) {
                throw cc.fail(409, 'BUS_REEMPLAZO_NO_DISPONIBLE', 'El reemplazo debe estar disponible y pertenecer a la cooperativa de la hoja.');
            }
            if (cc.enabled() && !['PROGRAMADO','PROGRAMADA'].includes(hoja.EST_VIA_HOJ)) {
                throw cc.fail(409, 'SALIDA_NO_PROGRAMADA', 'El reemplazo solo se asigna a una salida programada.');
            }
            if (cc.enabled()) {
                const { recordset } = await db.request().input('id', sql.VarChar(5), idHoja)
                    .query('SELECT ID_HOJ FROM dbo.fn_CC_HojaVigente(@id,NULL)');
                if (!recordset.length) throw cc.fail(409, 'FRECUENCIA_NO_VIGENTE', 'El permiso no cubre la salida.');
            }
            await categories.compatible(db, hoja.ID_FRE_PER, ree.ID_BUS);
            await db.request().input('hoja', sql.VarChar(5), idHoja).input('nuevo', sql.VarChar(5), ree.ID_BUS)
                .input('actual', sql.VarChar(5), actual).query(`
                    UPDATE dbo.HOJAS_RUTAS SET ID_BUS_REE=@nuevo WHERE ID_HOJ=@hoja;
                    UPDATE dbo.BUSES SET EST_BUS='OPERANDO' WHERE ID_BUS=@nuevo;
                    UPDATE dbo.BUSES SET EST_BUS='PARADA' WHERE ID_BUS=@actual;`);
            return hoja.ID_BUS_PER;
        });

        res.status(200).json({
            success: true,
            message: 'Bus de reemplazo asignado correctamente.',
            idBusOriginal,
            idBusRee
        });

    } catch (error) {
        const control = cc.respond(res, error);
        if (control) return control;
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
