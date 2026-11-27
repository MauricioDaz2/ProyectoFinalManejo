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
    cancelarReservaUsuario
} = require('../controllers/userReservaController');

const router = express.Router();

// Configuración de Multer para el comprobante de pago
const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const upload = multer({
    storage: multer.diskStorage({
        destination: path.join(__dirname, '../../uploads'),
        filename: (req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!tiposPermitidos.has(file.mimetype)) {
            return callback(new Error('Tipo de comprobante no permitido.'));
        }
        return callback(null, true);
    }
});

const uploadComprobante = (req, res, next) => upload.single('comprobante')(req, res, (error) => {
    if (error) {
        return res.status(400).json({ success: false, message: 'El comprobante debe ser JPG, PNG, WebP o PDF de máximo 5 MB.' });
    }
    return next();
});

// Historial, cancelación y expiración automática de reservas
router.get('/mis-boletos/:cedula', obtenerMisBoletos);
router.put('/:idBoleto/cancelar', cancelarReservaUsuario);
router.put('/:idBoleto/expirar', expirarReservaUsuario);
router.post('/expirar', expirarReservaUsuario);

// Subida de comprobante dentro del temporizador de 5 minutos
router.post('/comprobante', uploadComprobante, subirComprobanteTransferencia);
router.post('/:idBoleto/comprobante', uploadComprobante, subirComprobanteTransferencia);

// Rutas de asientos y creación de reservas
router.get('/:idHoja/asientos', obtenerAsientos);
router.post('/', uploadComprobante, reservarAsiento);

module.exports = router;
