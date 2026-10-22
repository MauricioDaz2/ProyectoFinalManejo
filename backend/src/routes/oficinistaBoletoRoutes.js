const express = require('express');
const router = express.Router();

const {
    listarHojasParaVentanilla,
    obtenerMapaAsientosHoja,
    crearBoletoVentanilla
} = require('../controllers/oficinistaBoletoController');

router.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (!local && process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Acceso deshabilitado hasta configurar la autenticación de oficinista.'
        });
    }
    next();
});

router.get('/hojas', listarHojasParaVentanilla);
router.get('/hojas/:idHoja/asientos', obtenerMapaAsientosHoja);
router.post('/boletos/ventanilla', crearBoletoVentanilla);

module.exports = router;
