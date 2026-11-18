const { sql, conectarBD } = require('../config/db');

const generarId = (prefijo, ultimoId) => {
    const numero = ultimoId ? parseInt(String(ultimoId).replace(/\D/g, ''), 10) || 0 : 0;
    return prefijo + String(numero + 1).padStart(5 - prefijo.length, '0');
};

// --- Listar Hojas de Ruta ---
const listarHojasRuta = async (req, res) => {
    try {
        const pool = await conectarBD();

        const operacion=await require('../services/tripOperations').installed(pool);
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
                   ${operacion?'UCH.NOM_USU':'NULL'} AS NOM_CHOFER,
                   ${operacion?'UCH.APE_USU':'NULL'} AS APE_CHOFER,
                   UCO.NOM_USU AS NOM_CONT,
                   UCO.APE_USU AS APE_CONT
            FROM HOJAS_RUTAS H
            INNER JOIN BUSES BP        ON H.ID_BUS_PER = BP.ID_BUS
            LEFT  JOIN BUSES BR        ON H.ID_BUS_REE = BR.ID_BUS
            INNER JOIN FRECUENCIAS F   ON H.ID_FRE_PER = F.ID_FRE
            INNER JOIN COOPERATIVAS C  ON BP.ID_COP_PER = C.ID_COP
            ${operacion?'LEFT JOIN USUARIOS UCH ON H.ID_USU_CHO=UCH.ID_USU':''}
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

// --- Crear Hoja de Ruta ---
const crearHojaRuta = async (req,res) => {
    try {const result=await require('../services/tripOperations').assign(req.auth,req.body);res.status(201).json({success:true,...result});}
    catch(e){res.status(e.status||503).json({success:false,message:e.status?e.message:'No se pudo programar el viaje.'});}
};

const listarFrecuencias = async (req, res) => {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query('SELECT * FROM FRECUENCIAS');
        res.status(200).json({ success: true, frecuencias: resultado.recordset });
    } catch (error) {
        console.error('Error al listar frecuencias:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// --- Listar Resoluciones ---
const listarResoluciones = async (req, res) => {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query('SELECT * FROM RESOLUCIONES');
        res.status(200).json({ success: true, resoluciones: resultado.recordset });
    } catch (error) {
        console.error('Error al listar resoluciones:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// --- Crear Frecuencia ---
const crearFrecuencia = async (req, res) => {
    try {
        res.status(201).json({ success: true, message: 'Frecuencia creada correctamente.' });
    } catch (error) {
        console.error('Error al crear frecuencia:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// --- Asignar Frecuencia ---
const asignarFrecuencia = async (req, res) => {
    try {
        res.status(200).json({ success: true, message: 'Frecuencia asignada correctamente.' });
    } catch (error) {
        console.error('Error al asignar frecuencia:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// --- Listar Choferes (Rol R006) ---
const listarChoferes = async (req, res) => {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query(`
            SELECT ID_USU, NOM_USU, APE_USU 
            FROM USUARIOS 
            WHERE ID_ROL_PER = 'R006' AND ISNULL(EST_USU, '1') <> '0'
            ORDER BY NOM_USU, APE_USU
        `);
        return res.status(200).json({ success: true, choferes: resultado.recordset });
    } catch (error) {
        console.error('Error al listar choferes:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// --- Listar Controladores (Rol R004) ---
const listarControladores = async (req, res) => {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query(`
            SELECT ID_USU, NOM_USU, APE_USU 
            FROM USUARIOS 
            WHERE ID_ROL_PER = 'R004' AND ISNULL(EST_USU, '1') <> '0'
            ORDER BY NOM_USU, APE_USU
        `);
        return res.status(200).json({ success: true, controladores: resultado.recordset });
    } catch (error) {
        console.error('Error al listar controladores:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};
// --- Listar Usuarios Operativos (Choferes y Controladores) ---
const listarUsuariosOperativos = async (req, res) => {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query(`
            SELECT ID_USU, NOM_USU, APE_USU, ID_ROL_PER 
            FROM USUARIOS 
            WHERE ID_ROL_PER IN ('R004', 'R006') AND ISNULL(EST_USU, '1') <> '0'
            ORDER BY NOM_USU, APE_USU
        `);
        return res.status(200).json({ success: true, usuarios: resultado.recordset });
    } catch (error) {
        console.error('Error al listar usuarios operativos:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { 
    listarHojasRuta, 
    listarFrecuencias, 
    listarResoluciones, 
    crearFrecuencia, 
    crearHojaRuta, 
    asignarFrecuencia,
    listarChoferes,
    listarControladores,
    listarUsuariosOperativos
};