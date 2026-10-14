const express = require('express');
const router = express.Router();
const { listarHojasRuta, listarFrecuencias } = require('../controllers/adminRutasController');


router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);

module.exports = router;
