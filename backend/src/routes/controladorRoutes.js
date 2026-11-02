const express = require('express');
const router = express.Router();
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