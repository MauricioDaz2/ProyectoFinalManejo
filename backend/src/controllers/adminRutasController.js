const { sql, conectarBD } = require('../config/db');


const generarId = (prefijo, ultimoId) => {
    const numero = ultimoId ? parseInt(String(ultimoId).replace(/\D/g, ''), 10) || 0 : 0;
    return prefijo + String(numero + 1).padStart(5 - prefijo.length, '0');
};


// ---backend/src/controllers/adminRutasController.js

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
                   C.NOM_COP,
                   UCH.NOM_USU AS NOM_CHOFER,
                   UCH.APE_USU AS APE_CHOFER,
                   UCO.NOM_USU AS NOM_CONT,
                   UCO.APE_USU AS APE_CONT
            FROM HOJAS_RUTAS H
            INNER JOIN BUSES BP        ON H.ID_BUS_PER = BP.ID_BUS
            LEFT  JOIN BUSES BR        ON H.ID_BUS_REE = BR.ID_BUS
            INNER JOIN FRECUENCIAS F   ON H.ID_FRE_PER = F.ID_FRE
            INNER JOIN COOPERATIVAS C  ON BP.ID_COP_PER = C.ID_COP
            LEFT  JOIN USUARIOS UCH    ON H.ID_USU_CHO = UCH.ID_USU
            LEFT  JOIN USUARIOS UCO    ON H.ID_USU_CON = UCO.ID_USU
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

const crearHojaRuta = async (req, res) => {
    const { fecPro, idBus, idFre, obs, idUsuCho, idUsuCon } = req.body;

    if (!fecPro || !idBus || !idFre || !idUsuCho || !idUsuCon) {
        return res.status(400).json({
            success: false,
            message: 'Fecha, bus, frecuencia, chofer y controlador son obligatorios.'
        });
    }

    if (isNaN(Date.parse(fecPro))) {
        return res.status(400).json({ success: false, message: 'Formato de fecha inválido.' });
    }

    if (obs && String(obs).length > 50) {
        return res.status(400).json({ success: false, message: 'La observación no puede superar los 50 caracteres.' });
    }

    try {
        const pool = await conectarBD();

        // Validar existencia de Bus, Frecuencia, Chofer (R006) y Controlador (R004)
        const validacion = await pool.request()
            .input('idBus', sql.VarChar, idBus)
            .input('idFre', sql.VarChar, idFre)
            .input('idCho', sql.VarChar, idUsuCho)
            .input('idCon', sql.VarChar, idUsuCon)
            .query(`
                SELECT (SELECT COUNT(*) FROM BUSES WHERE ID_BUS = @idBus) AS bus,
                       (SELECT COUNT(*) FROM FRECUENCIAS WHERE ID_FRE = @idFre) AS fre,
                       (SELECT COUNT(*) FROM USUARIOS WHERE ID_USU = @idCho AND ID_ROL_PER = 'R006') AS chofer,
                       (SELECT COUNT(*) FROM USUARIOS WHERE ID_USU = @idCon AND ID_ROL_PER = 'R004') AS controlador
            `);

        if (validacion.recordset[0].bus === 0) {
            return res.status(404).json({ success: false, message: 'El bus indicado no existe.' });
        }
        if (validacion.recordset[0].fre === 0) {
            return res.status(404).json({ success: false, message: 'La frecuencia indicada no existe.' });
        }
        if (validacion.recordset[0].chofer === 0) {
            return res.status(400).json({ success: false, message: 'El chofer seleccionado no es válido o no tiene el rol R006.' });
        }
        if (validacion.recordset[0].controlador === 0) {
            return res.status(400).json({ success: false, message: 'El controlador seleccionado no es válido o no tiene el rol R004.' });
        }

        const ultimo = await pool.request().query('SELECT MAX(ID_HOJ) AS ultimo FROM HOJAS_RUTAS');
        const nuevoId = generarId('HOJ', ultimo.recordset[0].ultimo);

        await pool.request()
            .input('id', sql.VarChar, nuevoId)
            .input('fec', sql.Date, fecPro)
            .input('obs', sql.VarChar, obs || null)
            .input('idBus', sql.VarChar, idBus)
            .input('idFre', sql.VarChar, idFre)
            .input('idCho', sql.VarChar, idUsuCho)
            .input('idCon', sql.VarChar, idUsuCon)
            .query(`
                INSERT INTO HOJAS_RUTAS
                    (ID_HOJ, FEC_PRO_HOJ, EST_VIA_HOJ, OBS_HOJ, ID_BUS_PER, ID_BUS_REE, ID_FRE_PER, ID_USU_CHO, ID_USU_CON)
                VALUES
                    (@id, @fec, 'PROGRAMADO', @obs, @idBus, NULL, @idFre, @idCho, @idCon)
            `);

        res.status(201).json({
            success: true,
            message: 'Hoja de ruta creada correctamente.',
            id: nuevoId
        });

    } catch (error) {
        console.error('Error al crear hoja de ruta:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarHojasRuta, listarFrecuencias, listarResoluciones, crearFrecuencia, crearHojaRuta, asignarFrecuencia };
