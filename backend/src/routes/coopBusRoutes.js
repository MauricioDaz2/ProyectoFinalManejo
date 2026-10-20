const express = require('express');
const router = express.Router();

const {
    listarBuses,
    obtenerBus,
    crearBus,
    actualizarBus,
    cambiarEstadoBus,
    desactivarBus,
    listarAsientos,
    cambiarTipoAsiento,
    listarTiposAsiento,
    listarResoluciones,
    crearResolucion,
    actualizarResolucion,
    eliminarResolucion,
    listarFrecuencias,
    crearFrecuencia,
    actualizarFrecuencia,
    cambiarEstadoFrecuencia,
    eliminarFrecuencia,
    listarHojasRuta,
    crearHojaRuta,
    actualizarHojaRuta,
    cambiarEstadoHojaRuta,
    eliminarHojaRuta,
    resumenCooperativa
} = require('../controllers/coopBusController');

router.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (!local && process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Acceso deshabilitado hasta configurar la autenticación de la cooperativa.'
        });
    }
    next();
});

router.get('/resumen', resumenCooperativa);

router.get('/buses', listarBuses);
router.get('/buses/:id', obtenerBus);
router.get('/buses/:id/asientos', listarAsientos);
router.post('/buses', crearBus);
router.put('/buses/:id', actualizarBus);
router.patch('/buses/:id/estado', cambiarEstadoBus);
router.delete('/buses/:id', desactivarBus);

router.patch('/asientos/:id/tipo', cambiarTipoAsiento);
router.get('/tipos-asiento', listarTiposAsiento);

router.get('/resoluciones', listarResoluciones);
router.post('/resoluciones', crearResolucion);
router.put('/resoluciones/:id', actualizarResolucion);
router.delete('/resoluciones/:id', eliminarResolucion);

router.get('/frecuencias', listarFrecuencias);
router.post('/frecuencias', crearFrecuencia);
router.put('/frecuencias/:id', actualizarFrecuencia);
router.patch('/frecuencias/:id/estado', cambiarEstadoFrecuencia);
router.delete('/frecuencias/:id', eliminarFrecuencia);

router.get('/hojas-ruta', listarHojasRuta);
router.post('/hojas-ruta', crearHojaRuta);
router.put('/hojas-ruta/:id', actualizarHojaRuta);
router.patch('/hojas-ruta/:id/estado', cambiarEstadoHojaRuta);
router.delete('/hojas-ruta/:id', eliminarHojaRuta);

module.exports = router;
