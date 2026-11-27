const express = require('express');
const { cooperativas, salidas, perfilCooperativa, destacadas } = require('../controllers/publicController');
const router = express.Router();
router.get('/cooperativas', cooperativas);
router.get('/cooperativas/:id', perfilCooperativa);
router.get('/cooperativas/:id/imagenes/:imageId', require('../controllers/cooperativaProfileController').serve(true));
router.get('/salidas', salidas);
router.get('/destacadas', destacadas);
module.exports = router;
