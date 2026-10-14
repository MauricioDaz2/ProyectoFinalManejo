const express = require('express');
const router = express.Router();
const { listarHojasRuta, listarFrecuencias, listarResoluciones, crearFrecuencia, crearHojaRuta } = require('../controllers/adminRutasController');


router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);
router.get('/resoluciones', listarResoluciones);
router.post('/frecuencias', crearFrecuencia);
router.post('/hojas', crearHojaRuta);

module.exports = router;
