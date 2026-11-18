const express = require('express');
const router = express.Router();
const { cooperativaScope } = require('../middleware/cooperativaScope');
router.use(cooperativaScope);
router.use((req, res, next) => {
    const resource = req.path.split('/')[1];
    const permission = { buses: 'buses', asientos: 'buses', 'tipos-asiento': 'buses', resoluciones: 'resoluciones', frecuencias: 'rutas', 'hojas-ruta': req.method === 'GET' ? 'salidas' : 'rutas', resumen: 'reportes' }[resource];
    if (!permission) return next();
    require('../security/permissions').requirePermission(permission)(req, res, next);
});

/**
 * Rutas del módulo Cooperativa
 * Flota de buses, distribución de asientos, resoluciones ANT,
 * frecuencias, hojas de ruta y panel de control
 */

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
router.use('/hojas-ruta/:id',async(req,res,next)=>{
    if(!['PUT','PATCH','DELETE'].includes(req.method))return next();
    try{await require('../services/tripOperations').protectOperationalSheet(req.params.id);next();}
    catch(e){res.status(e.status||503).json({success:false,message:e.status?e.message:'No se pudo verificar el estado de la salida.'});}
});
router.put('/hojas-ruta/:id', actualizarHojaRuta);
router.patch('/hojas-ruta/:id/estado', cambiarEstadoHojaRuta);
router.delete('/hojas-ruta/:id', eliminarHojaRuta);

module.exports = router;
