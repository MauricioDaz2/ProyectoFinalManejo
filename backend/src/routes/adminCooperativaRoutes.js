const express = require('express');
const {
    listarCooperativas,
    obtenerCooperativa,
    crearCooperativa,
    actualizarCooperativa,
    cambiarEstadoCooperativa,
    desactivarCooperativa
} = require('../controllers/adminCooperativaController');

const router = express.Router();

router.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (!local || process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Acceso deshabilitado hasta configurar la autenticación administrativa.'
        });
    }
    next();
});

router.get('/', listarCooperativas);
router.get('/:id', obtenerCooperativa);
router.post('/', crearCooperativa);
router.put('/:id', actualizarCooperativa);
router.patch('/:id/estado', cambiarEstadoCooperativa);
router.delete('/:id', desactivarCooperativa);

module.exports = router;
