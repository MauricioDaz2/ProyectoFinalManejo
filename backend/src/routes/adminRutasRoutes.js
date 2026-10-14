const express = require('express');
const router = express.Router();
const { listarHojasRuta } = require('../controllers/adminRutasController');


router.get('/hojas', listarHojasRuta);

module.exports = router;
