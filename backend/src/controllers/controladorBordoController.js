const { sql, conectarBD } = require('../config/db');

const generarId = (prefijo, ultimoId) => {
    const numero = ultimoId ? parseInt(String(ultimoId).replace(/\D/g, ''), 10) || 0 : 0;
    return prefijo + String(numero + 1).padStart(5 - prefijo.length, '0');
};

// 1. Listar hojas de ruta asignadas a un controlador específico
const listarHojasPorControlador = async (req, res) => {
    const { idControlador } = req.params;
    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idCon', sql.VarChar, req.auth.id)
            .input('company', sql.VarChar(5), req.auth.cooperativaId)
            .query(`
                SELECT H.ID_HOJ,
                       CONVERT(varchar(10), H.FEC_PRO_HOJ, 23) AS FEC_PRO_HOJ,
                       H.EST_VIA_HOJ,
                       F.CIU_ORI_FRE,
                       F.CIU_DES_FRE,
                       B.ID_BUS,
                       B.NUM_BUS,
                       B.PLA_BUS
                FROM HOJAS_RUTAS H
                INNER JOIN FRECUENCIAS F ON H.ID_FRE_PER = F.ID_FRE
                INNER JOIN BUSES B       ON H.ID_BUS_PER = B.ID_BUS
                WHERE H.ID_USU_CON = @idCon AND B.ID_COP_PER=@company AND F.ID_COP_PER=@company AND H.EST_VIA_HOJ IN ('PROGRAMADO','PROGRAMADA','EN CURSO')
            `);

        res.status(200).json({ success: true, hojas: resultado.recordset });
    } catch (error) {
        console.error('Error al listar hojas del controlador:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// 2. Listar asientos disponibles de una hoja de ruta para venta a bordo
const listarAsientosDisponibles = async (req, res) => {
    const { idHoj } = req.params;
    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idHoj', sql.VarChar, idHoj)
            .query(`
                SELECT A.ID_ASI, A.PIS_ASI, T.NOM_TIP, T.PRE_TIP
                FROM ASIENTOS_BUS A
                INNER JOIN HOJAS_RUTAS H ON A.ID_BUS_PER = H.ID_BUS_PER
                INNER JOIN TIPOS_ASIENTOS T ON A.ID_TIP_PER = T.ID_TIP
                WHERE H.ID_HOJ = @idHoj 
                  AND A.ID_ASI NOT IN (
                      SELECT ID_ASI_PER FROM BOLETOS 
                      WHERE ID_HOJ_PER = @idHoj AND EST_BOL IN ('Reservado', 'OK', 'Usado')
                  )
            `);

        res.status(200).json({ success: true, asientos: resultado.recordset });
    } catch (error) {
        console.error('Error al listar asientos disponibles:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// 3. Venta de boleto a bordo por el controlador (Efectivo)

// 3. Venta de boleto a bordo por el controlador (Efectivo)
const venderBoletoABordo = async (req,res) => res.status(503).json({success:false,message:'Venta bloqueada: falta una tarifa por tramo y disponibilidad compartida con reservas.'});
const escanerValidarBoleto = async (req,res) => {
    if(!req.body.idHoj)return res.status(400).json({success:false,message:'Selecciona el viaje antes de validar.'});
    try { const result=await require('../services/tripOperations').event(req.auth,req.body.idHoj,{tipo:'ABORDAJE',evento:req.body.evento,codigo:req.body.codigo||req.body.idBoleto});res.json({success:true,...result}); }
    catch(e){res.status(e.status||503).json({success:false,message:e.status?e.message:'No se pudo confirmar el abordaje.'});}
};

module.exports = {
    listarHojasPorControlador,
    listarAsientosDisponibles,
    venderBoletoABordo,
    escanerValidarBoleto
};