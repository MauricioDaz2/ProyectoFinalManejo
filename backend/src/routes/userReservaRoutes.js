const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const {
    obtenerAsientos,
    reservarAsiento,
    subirComprobanteTransferencia,
    expirarReservaUsuario,
    obtenerMisBoletos,
    cancelarReservaUsuario,
    descargarBoletoPdf
} = require('../controllers/userReservaController');

const router = express.Router();
const fs = require('node:fs/promises');
const {sql,conectarBD}=require('../config/db');
const {receiptType}=require('../services/webCheckout');
const receiptDir=path.join(__dirname,'../../private_media/comprobantes');

// Configuración de Multer para el comprobante de pago
const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, fieldSize: 24 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!tiposPermitidos.has(file.mimetype)) {
            return callback(new Error('Tipo de comprobante no permitido.'));
        }
        return callback(null, true);
    }
});

const uploadComprobante = (req, res, next) => upload.single('comprobante')(req, res, async (error) => {
    if (error) {
        return res.status(400).json({ success: false, message: 'El comprobante debe ser JPG, PNG, WebP o PDF de máximo 5 MB.' });
    }
    if(req.file){
        try{
            const extension=receiptType(req.file.buffer);
            const expected={jpg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf'}[extension];
            if(expected!==req.file.mimetype)return res.status(400).json({success:false,message:'El contenido no coincide con el formato declarado.'});
            req.file.filename=crypto.randomUUID()+'.'+extension;
            req.file.path=path.join(receiptDir,req.file.filename);
            await fs.mkdir(receiptDir,{recursive:true});
            await fs.writeFile(req.file.path,req.file.buffer,{flag:'wx'});
        }catch(err){return res.status(err.status||500).json({success:false,message:err.status?err.message:'No se pudo guardar el comprobante.'});}
    }
    return next();
});

// Historial, descarga PDF, cancelación y expiración automática de reservas
router.get('/mis-boletos/:cedula', obtenerMisBoletos);
router.get('/:idBoleto/pdf', descargarBoletoPdf);
router.put('/:idBoleto/cancelar', cancelarReservaUsuario);
router.put('/:idBoleto/expirar', expirarReservaUsuario);
router.post('/expirar', expirarReservaUsuario);

// Subida de comprobante dentro del temporizador de 5 minutos
router.post('/comprobante', uploadComprobante, subirComprobanteTransferencia);
router.post('/:idBoleto/comprobante', uploadComprobante, subirComprobanteTransferencia);

// Rutas de asientos y creación de reservas
router.get('/:idHoja/asientos', obtenerAsientos);
router.get('/:idHoja/bloqueos', async(req,res,next)=>{
    try{
        const pool=await conectarBD();
        const result=await pool.request().input('sheet',sql.VarChar(5),req.params.idHoja).input('owner',sql.VarChar(10),req.auth.id)
            .query("SELECT ID_ASI_PER AS asiento, ID_BOL AS boleto, FEC_EXP_RES_UTC AS vence, PRE_FIN_BOL AS precio, SYSUTCDATETIME() AS ahora FROM BOLETOS WHERE ID_HOJ_PER=@sheet AND ID_USU_FIN=@owner AND EST_BOL='RESERVADO' AND COM_PAG_URL IS NULL AND FEC_EXP_RES_UTC>SYSUTCDATETIME() ORDER BY ID_BOL");
        res.set('Cache-Control','no-store').json({success:true,bloqueos:result.recordset});
    }catch(error){
        if(error.number===207) return res.status(503).json({success:false,message:'El bloqueo de asientos requiere instalar la migración 016.'});
        next(error);
    }
});
router.post('/bloqueos', reservarAsiento);
router.post('/',uploadComprobante,subirComprobanteTransferencia);

module.exports = router;
