const express = require('express');
const {
    listarUsuarios,
    consultarUsuario,
    registrarUsuario,
    editarUsuario,
    cambiarEstadoUsuario,
    desactivarUsuario
} = require('../controllers/adminUsuarioController');

const router = express.Router();

router.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (!local || process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Acceso deshabilitado hasta configurar la autenticación administrativa.'
        });
    }

    if (req.headers.origin) {
        let origen;
        try {
            origen = new URL(req.headers.origin);
        } catch {
            return res.status(403).json({ success: false, message: 'Origen no permitido.' });
        }
        if (origen.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origen.hostname)) {
            return res.status(403).json({ success: false, message: 'Origen no permitido.' });
        }
    }
    next();
});

router.get('/', listarUsuarios);
router.get('/:id', consultarUsuario);
router.post('/', registrarUsuario);
router.put('/:id', editarUsuario);
router.patch('/:id/estado', cambiarEstadoUsuario);
router.delete('/:id', desactivarUsuario);

module.exports = router;
