const express = require('express');
const router = express.Router();
const { listarHojasRuta, listarFrecuencias, listarResoluciones } = require('../controllers/adminRutasController');


router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);
router.get('/resoluciones', listarResoluciones);

module.exports = router;
