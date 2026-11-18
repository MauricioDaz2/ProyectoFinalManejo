const router = require('express').Router();
const c = require('../controllers/accountController');
router.use(require('../security/permissions').requirePermission('trabajadores'));
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', c.create);
router.put('/:id', c.edit);
router.patch('/:id/estado', c.state);
module.exports = router;
