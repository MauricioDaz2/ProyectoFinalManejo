const express = require('express');
const router = express.Router();
const { listarHojasRuta, listarFrecuencias, listarResoluciones, crearFrecuencia } = require('../controllers/adminRutasController');


router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);
router.get('/resoluciones', listarResoluciones);
router.post('/frecuencias', crearFrecuencia);

module.exports = router;
