const { sql, conectarBD } = require('../config/db');


const generarId = (prefijo, ultimoId) => {
    const numero = ultimoId ? parseInt(String(ultimoId).replace(/\D/g, ''), 10) || 0 : 0;
    return prefijo + String(numero + 1).padStart(5 - prefijo.length, '0');
};


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

const crearFrecuencia = async (req, res) => {
    const { ciuOri, ciuDes, fecHorIni, fecHorFin, idRes } = req.body;

    if (!ciuOri || !ciuDes || !fecHorIni || !idRes) {
        return res.status(400).json({
            success: false,
            message: 'Origen, destino, fecha de inicio y resolución son obligatorios.'
        });
    }

    if (String(ciuOri).trim().length > 15 || String(ciuDes).trim().length > 15) {
        return res.status(400).json({
            success: false,
            message: 'Origen y destino no pueden superar los 15 caracteres.'
        });
    }

    if (isNaN(Date.parse(fecHorIni)) || (fecHorFin && isNaN(Date.parse(fecHorFin)))) {
        return res.status(400).json({ success: false, message: 'Formato de fecha inválido.' });
    }

    try {
        const pool = await conectarBD();

        const resolucion = await pool.request()
            .input('idRes', sql.VarChar, idRes)
            .query('SELECT ID_RES FROM RESOLUCIONES_ANT WHERE ID_RES = @idRes');

        if (resolucion.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'La resolución indicada no existe.' });
        }

        const ultimo = await pool.request().query('SELECT MAX(ID_FRE) AS ultimo FROM FRECUENCIAS');
        const nuevoId = generarId('FRE', ultimo.recordset[0].ultimo);

        await pool.request()
            .input('id', sql.VarChar, nuevoId)
            .input('ori', sql.VarChar, ciuOri)
            .input('des', sql.VarChar, ciuDes)
            .input('ini', sql.Date, fecHorIni)
            .input('fin', sql.Date, fecHorFin || null)
            .input('idRes', sql.VarChar, idRes)
            .query(`
                INSERT INTO FRECUENCIAS
                    (ID_FRE, CIU_ORI_FRE, CIU_DES_FRE, FEC_HOR_INI_FRE, FEC_HOR_FIN_FRE, EST_RES, ID_RES_PER)
                VALUES
                    (@id, @ori, @des, @ini, @fin, '1', @idRes)
            `);

        res.status(201).json({
            success: true,
            message: 'Frecuencia creada correctamente.',
            id: nuevoId
        });

    } catch (error) {
        console.error('Error al crear frecuencia:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const crearHojaRuta = async (req, res) => {
    const { fecPro, idBus, idFre, obs, usuarioId } = req.body;

    if (!fecPro || !idBus || !idFre) {
        return res.status(400).json({
            success: false,
            message: 'Fecha de programación, bus y frecuencia son obligatorios.'
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

        const existe = await pool.request()
            .input('idBus', sql.VarChar, idBus)
            .input('idFre', sql.VarChar, idFre)
            .query(`
                SELECT (SELECT COUNT(*) FROM BUSES       WHERE ID_BUS = @idBus) AS bus,
                       (SELECT COUNT(*) FROM FRECUENCIAS WHERE ID_FRE = @idFre) AS fre
            `);

        if (existe.recordset[0].bus === 0) {
            return res.status(404).json({ success: false, message: 'El bus indicado no existe.' });
        }
        if (existe.recordset[0].fre === 0) {
            return res.status(404).json({ success: false, message: 'La frecuencia indicada no existe.' });
        }

        const ultimo = await pool.request().query('SELECT MAX(ID_HOJ) AS ultimo FROM HOJAS_RUTAS');
        const nuevoId = generarId('HOJ', ultimo.recordset[0].ultimo);

        await pool.request()
            .input('id', sql.VarChar, nuevoId)
            .input('fec', sql.Date, fecPro)
            .input('obs', sql.VarChar, obs || null)
            .input('idBus', sql.VarChar, idBus)
            .input('idFre', sql.VarChar, idFre)
            .input('idUsu', sql.VarChar, usuarioId || null)
            .query(`
                INSERT INTO HOJAS_RUTAS
                    (ID_HOJ, FEC_PRO_HOJ, EST_VIA_HOJ, OBS_HOJ, ID_BUS_PER, ID_BUS_REE, ID_FRE_PER, ID_USU_CON)
                VALUES
                    (@id, @fec, 'PROGRAMADO', @obs, @idBus, NULL, @idFre, @idUsu)
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

const asignarFrecuencia = async (req, res) => {
    const { id } = req.params;
    const { idFre } = req.body;

    if (!idFre) {
        return res.status(400).json({ success: false, message: 'Debe indicar la frecuencia a vincular.' });
    }

    try {
        const pool = await conectarBD();

        const hoja = await pool.request()
            .input('id', sql.VarChar, id)
            .query('SELECT ID_HOJ FROM HOJAS_RUTAS WHERE ID_HOJ = @id');

        if (hoja.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        const frecuencia = await pool.request()
            .input('idFre', sql.VarChar, idFre)
            .query('SELECT ID_FRE FROM FRECUENCIAS WHERE ID_FRE = @idFre');

        if (frecuencia.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'La frecuencia indicada no existe.' });
        }

        await pool.request()
            .input('id', sql.VarChar, id)
            .input('idFre', sql.VarChar, idFre)
            .query('UPDATE HOJAS_RUTAS SET ID_FRE_PER = @idFre WHERE ID_HOJ = @id');

        res.status(200).json({
            success: true,
            message: 'Frecuencia vinculada a la hoja de ruta correctamente.'
        });

    } catch (error) {
        console.error('Error al asignar frecuencia:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarHojasRuta, listarFrecuencias, listarResoluciones, crearFrecuencia, crearHojaRuta, asignarFrecuencia };
