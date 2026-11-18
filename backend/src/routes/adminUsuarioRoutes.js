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

router.get('/', listarUsuarios);
router.post('/:id/responsable-principal', require('../controllers/accountController').designate);
router.get('/:id', consultarUsuario);
router.post('/', registrarUsuario);
router.put('/:id', editarUsuario);
router.patch('/:id/estado', cambiarEstadoUsuario);
router.delete('/:id', desactivarUsuario);

module.exports = router;
