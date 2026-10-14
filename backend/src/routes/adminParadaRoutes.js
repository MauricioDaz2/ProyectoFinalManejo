const express = require('express');
const router = express.Router();
const { listarFlota } = require('../controllers/adminParadaController');


router.get('/flota', listarFlota);

module.exports = router;
