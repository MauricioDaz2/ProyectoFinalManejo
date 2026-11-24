const express = require('express');
const router = express.Router();
const {
    listarHojasRuta,
    listarFrecuencias,
    listarResoluciones,
    crearFrecuencia,
    crearHojaRuta,
    asignarFrecuencia,
    listarUsuariosOperativos
} = require('../controllers/adminRutasController');

const soloCooperativa = (req, res) => res.status(403).json({
    success: false,
    code: 'HOJAS_RUTA_EXCLUSIVAS_COOPERATIVA',
    message: 'La gestión y programación de hojas de ruta y frecuencias es exclusiva de cada cooperativa.'
});

// Consultas de solo lectura para métricas globales del Dashboard Admin y Parada de Buses
router.get('/usuarios', listarUsuariosOperativos);
router.get('/hojas', listarHojasRuta);
router.get('/frecuencias', listarFrecuencias);

// Gestión retirada del panel de Administración (exclusiva de Cooperativas R002)
router.get('/resoluciones', listarResoluciones);
router.get('/hojas/disponibilidad', soloCooperativa);
router.post('/hojas/lotes', soloCooperativa);
router.post('/frecuencias', crearFrecuencia);
router.post('/hojas', crearHojaRuta);
router.put('/hojas/:id/frecuencia', asignarFrecuencia);

module.exports = router;
