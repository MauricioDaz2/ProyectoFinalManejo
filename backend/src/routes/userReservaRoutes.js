const express = require('express');
const { obtenerAsientos, reservarAsiento } = require('../controllers/userReservaController');

const router = express.Router();

router.get('/:idHoja/asientos', obtenerAsientos);
router.post('/', reservarAsiento);
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { obtenerAsientos, reservarAsiento } = require('../controllers/userReservaController');

const router = express.Router();
const tiposPermitidos = new Set(['image/jpeg', 'image/png', 'application/pdf']);
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

router.get('/:idHoja/asientos', obtenerAsientos);
router.post('/', (req, res, next) => upload.single('comprobante')(req, res, (error) => {
    if (error) {
        return res.status(400).json({ success: false, message: 'El comprobante debe ser JPG, PNG o PDF de máximo 5 MB.' });
    }
    return next();
}), reservarAsiento);

module.exports = router;
