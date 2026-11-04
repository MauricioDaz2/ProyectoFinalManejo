const express = require('express');
const router = express.Router();
const { listarHojasRuta, listarFrecuencias, listarResoluciones, crearFrecuencia, crearHojaRuta, asignarFrecuencia } = require('../controllers/adminRutasController');
const { listarUsuariosOperativos } = require('../controllers/adminRutasController'); // O el controlador donde la hayas colocado

// Endpoint consumido por cargarPersonalOperativoModal en el frontend
router.get('/usuarios', listarUsuariosOperativos);

router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);
router.get('/resoluciones', listarResoluciones);
router.post('/frecuencias', crearFrecuencia);
router.post('/hojas', crearHojaRuta);
router.put('/hojas/:id/frecuencia', asignarFrecuencia);


module.exports = router;
