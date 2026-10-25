const express = require('express');
const router = express.Router();

/**
 * Rutas del módulo Oficinista
 * - Hojas de ruta disponibles para ventanilla y mapa de asientos
 * - Registro y búsqueda de pasajeros
 * - Venta de boletos, búsqueda y validación por QR/cédula
 * - Cambio de estado de boletos y resumen del día
 */

const {
    listarHojasParaVentanilla,
    obtenerMapaAsientosHoja,
    registrarPasajero,
    buscarPasajeros,
    crearBoletoVentanilla,
    buscarBoletos,
    obtenerBoleto,
    cambiarEstadoBoleto,
    validarBoleto,
    resumenOficinista
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

router.get('/resumen', resumenOficinista);

router.get('/hojas', listarHojasParaVentanilla);
router.get('/hojas/:idHoja/asientos', obtenerMapaAsientosHoja);

router.get('/pasajeros', buscarPasajeros);
router.post('/pasajeros', registrarPasajero);

router.post('/boletos/ventanilla', crearBoletoVentanilla);
router.get('/boletos/buscar', buscarBoletos);
router.post('/boletos/validar', validarBoleto);
router.get('/boletos/:id', obtenerBoleto);
router.patch('/boletos/:id/estado', cambiarEstadoBoleto);

module.exports = router;
