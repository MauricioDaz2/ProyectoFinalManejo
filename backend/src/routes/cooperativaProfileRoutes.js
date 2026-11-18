const express = require('express');
const multer = require('multer');
const repository = require('../repositories/cooperativaProfileRepository');
const controller = require('../controllers/cooperativaProfileController');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single('imagen');
let uploading = 0;
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.auth?.rolId !== 'R002' || !req.auth.cooperativaId || !req.auth.cooperativaActiva) return res.status(403).json({ success: false, message: 'Necesitas una cooperativa activa asignada.' });
    if (Object.keys(req.query).some((key) => key !== 'v')) return res.status(400).json({ success: false, message: 'No se aceptan identificadores de cooperativa en esta operación.' });
    next();
});
router.use(async (req, res, next) => {
    try { await repository.ready(); next(); }
    catch (err) { res.status(503).json({ success: false, code: err.code, message: err.status ? err.message : 'No se pudo verificar la persistencia del perfil.' }); }
});
router.get('/', controller.read);
router.get('/vista-previa', controller.preview);
router.put('/borrador', controller.save(false));
router.post('/publicar', controller.save(true));
router.get('/imagenes/:imageId', controller.serve(false));
router.delete('/imagenes/:imageId', controller.remove);
router.post('/imagenes/:tipo', (req, res, next) => {
    if (uploading >= 3) return res.status(429).json({ success: false, message: 'Hay otras imágenes en proceso. Inténtalo en unos segundos.' });
    uploading++;
    let released = false;
    const release = () => { if (!released) { uploading--; released = true; } };
    res.once('finish', release); res.once('close', release);
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: 'Envía un solo archivo de hasta 8 MB, sin campos adicionales.' });
        next();
    });
}, controller.upload);
module.exports = router;
