const express = require('express');
const { buscarViajes } = require('../controllers/userViajesController');

const router = express.Router();

router.get('/', buscarViajes);

module.exports = router;
