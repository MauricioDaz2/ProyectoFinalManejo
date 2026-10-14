const express = require('express');
const router = express.Router();
const { listarFlota, asignarBusReemplazo } = require('../controllers/adminParadaController');


router.get('/flota', listarFlota);
router.put('/asignar/:idHoja', asignarBusReemplazo);

module.exports = router;
