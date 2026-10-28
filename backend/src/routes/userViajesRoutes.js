const express = require('express');
const { listarRutas, buscarViajes } = require('../controllers/userViajesController');

const router = express.Router();

router.get('/rutas', listarRutas);
router.get('/', buscarViajes);

module.exports = router;
