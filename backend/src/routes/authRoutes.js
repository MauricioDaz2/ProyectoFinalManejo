const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { requireSession, logout } = require('../middleware/session');

router.post('/login', login);
router.get('/me', requireSession, (req, res) => res.json({ success: true, usuario: req.auth }));
router.post('/logout', logout);

module.exports = router;
