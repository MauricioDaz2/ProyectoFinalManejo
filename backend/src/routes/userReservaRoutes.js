const express = require('express');
const { obtenerAsientos, reservarAsiento } = require('../controllers/userReservaController');

const router = express.Router();

router.get('/:idHoja/asientos', obtenerAsientos);
router.post('/', reservarAsiento);

module.exports = router;
