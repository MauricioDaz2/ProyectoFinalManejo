const express = require('express');
const {
    listarCooperativas,
    obtenerCooperativa,
    crearCooperativa,
    actualizarCooperativa,
    cambiarEstadoCooperativa,
    eliminarCooperativa,
    personal,
    obtenerDestacadas,
    actualizarDestacadas
} = require('../controllers/adminCooperativaController');

const router = express.Router();

const { requireSession, requireRole }=require('../middleware/session');
router.use(requireSession,requireRole('R001'));

router.get('/', listarCooperativas);
router.get('/:id', obtenerCooperativa);
router.get('/:id/imagenes/:imageId',require('../controllers/cooperativaProfileController').serve('admin'));
router.post('/', crearCooperativa);
router.put('/:id', actualizarCooperativa);
router.patch('/:id/estado', cambiarEstadoCooperativa);
router.get('/:id/destacadas', obtenerDestacadas);
router.put('/:id/destacadas', actualizarDestacadas);
router.delete('/:id', eliminarCooperativa);

router.post('/:id/personal',personal('create'));
router.put('/:id/personal/:usuario',personal('edit'));
router.patch('/:id/personal/:usuario/estado',personal('state'));
router.post('/:id/personal/:usuario/principal',personal('principal'));
module.exports = router;
