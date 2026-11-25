const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const router = express.Router();
const { cooperativaScope } = require('../middleware/cooperativaScope');
const batches = require('../controllers/routeBatchController');
const categories = require('../services/routeCategories');

const uploadsDir = path.join(__dirname, '../../uploads');
const allowedBusMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const busPhotoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            fs.mkdirSync(uploadsDir, { recursive: true });
            cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
            cb(null, `bus-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!allowedBusMimes.has(file.mimetype)) return cb(new Error('Formato no permitido. Usa JPG, PNG o WebP.'));
        cb(null, true);
    }
}).single('imagen');

router.use(cooperativaScope);
router.use((req, res, next) => {
    const [,resource,action] = req.path.split('/');
    const permission = { buses: 'buses', asientos: 'buses', 'tipos-asiento': 'buses', resoluciones: 'resoluciones', frecuencias: 'rutas', 'catalogo-territorial': 'rutas', 'categorias-operativas': 'rutas', 'hojas-ruta': req.method === 'GET' && action !== 'disponibilidad' ? 'salidas' : 'rutas', resumen: 'reportes' }[resource];
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
    guardarPlantillaAsientos,
    subirImagenBus,
    cambiarTipoAsiento,
    listarTiposAsiento,
    listarResoluciones,
    crearResolucion,
    actualizarResolucion,
    eliminarResolucion,
    listarFrecuencias,
    catalogoTerritorial,
    disponibilidadFrecuencia,
    crearFrecuencia,
    actualizarFrecuencia,
    obtenerParadasFrecuencia,
    actualizarParadasFrecuencia,
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
router.put('/buses/:id/plantilla', guardarPlantillaAsientos);
router.post('/buses/imagen', (req, res, next) => busPhotoUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: 'La fotografía del bus debe ser JPG, PNG o WebP de máximo 5 MB.' });
    next();
}), subirImagenBus);
router.post('/buses', crearBus);
router.put('/buses/:id', actualizarBus);
router.put('/buses/:id/categorias', batches.setBus);
router.patch('/buses/:id/estado', cambiarEstadoBus);
router.delete('/buses/:id', desactivarBus);

router.patch('/asientos/:id/tipo', cambiarTipoAsiento);
router.get('/tipos-asiento', listarTiposAsiento);

router.get('/resoluciones', listarResoluciones);
router.post('/resoluciones', crearResolucion);
router.put('/resoluciones/:id', actualizarResolucion);
router.delete('/resoluciones/:id', eliminarResolucion);

router.get('/frecuencias', listarFrecuencias);
router.get('/frecuencias/:id/paradas', obtenerParadasFrecuencia);
router.put('/frecuencias/:id/paradas', actualizarParadasFrecuencia);
router.get('/frecuencias/:id/disponibilidad', disponibilidadFrecuencia);
router.get('/catalogo-territorial', catalogoTerritorial);
router.get('/categorias-operativas', batches.catalog);
router.post('/frecuencias', crearFrecuencia);
router.put('/frecuencias/:id', actualizarFrecuencia);
router.put('/frecuencias/:id/categoria', batches.setFrequency);
router.patch('/frecuencias/:id/estado', cambiarEstadoFrecuencia);
router.delete('/frecuencias/:id', eliminarFrecuencia);

router.get('/hojas-ruta', listarHojasRuta);
router.get('/hojas-ruta/disponibilidad', batches.availability);
router.post('/hojas-ruta/lotes', batches.create);
router.post('/hojas-ruta', crearHojaRuta);
router.use('/hojas-ruta/:id',async(req,res,next)=>{
    if(!['PUT','PATCH','DELETE'].includes(req.method))return next();
    if(categories.enabled()&&req.method==='PUT')return res.status(409).json({success:false,
        code:'REPROGRAMACION_REQUERIDA',message:'No se puede editar una asignación desde el formulario antiguo. Usa la programación operativa.'});
    try{await require('../services/tripOperations').protectOperationalSheet(req.params.id);next();}
    catch(e){res.status(e.status||503).json({success:false,message:e.status?e.message:'No se pudo verificar el estado de la salida.'});}
});
router.put('/hojas-ruta/:id', actualizarHojaRuta);
router.patch('/hojas-ruta/:id/estado', cambiarEstadoHojaRuta);
router.delete('/hojas-ruta/:id', eliminarHojaRuta);

module.exports = router;
