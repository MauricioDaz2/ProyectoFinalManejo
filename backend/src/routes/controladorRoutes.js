const express = require('express');
const router = express.Router();
router.use(require('../middleware/workerScope').workerScope('controlador'));
const {
    listarHojasPorControlador,
    listarAsientosDisponibles,
    venderBoletoABordo,
    escanerValidarBoleto
} = require('../controllers/controladorBordoController');

router.get('/hojas/:idControlador', listarHojasPorControlador);
router.get('/asientos/:idHoj', listarAsientosDisponibles);
router.post('/vender', venderBoletoABordo);
router.post('/validar-qr', escanerValidarBoleto);

module.exports = router;
