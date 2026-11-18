const router = require('express').Router();
const c = require('../controllers/userProfileController');
const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single('foto');
let active = 0;
router.use(require('../middleware/session').requireSession);
router.get('/', c.read);
router.put('/', c.save);
router.get('/foto', c.photo);
router.post('/foto', (req, res, next) => {
    if (active >= 3) return res.status(429).json({ success: false, message: 'Hay otras fotografías en proceso. Inténtalo nuevamente.' });
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release);
    upload(req, res, (e) => e ? res.status(400).json({ success: false, message: 'Selecciona una sola imagen de hasta 8 MB.' }) : next());
}, c.upload);
router.put('/password', c.password);
module.exports = router;
