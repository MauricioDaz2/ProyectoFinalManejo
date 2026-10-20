const express = require('express');
const router = express.Router();
const { listarFlota, asignarBusReemplazo, listarAsientosBus } = require('../controllers/adminParadaController');


router.get('/flota', listarFlota);
router.put('/asignar/:idHoja', asignarBusReemplazo);
router.get('/buses/:idBus/asientos', listarAsientosBus);

module.exports = router;
