const cc = require('../services/frequencyControl');
const categories = require('../services/routeCategories');
const batches = require('../services/routeBatches');

const handle = (action, status = () => 200) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const result = await action(req);
        return res.status(status(result)).json({ success: true, ...result });
    } catch (error) {
        return cc.respond(res, error) || res.status(error.status || 503).json({
            success: false,
            message: error.status ? error.message : 'No se pudo confirmar la programación. Verifica la configuración e inténtalo nuevamente.'
        });
    }
};

module.exports = {
    catalog: handle(req => categories.list(req.auth.cooperativaId)),
    setFrequency: handle(req => categories.setFrequency(req.auth.cooperativaId, req.params.id, req.body?.categoria)),
    setBus: handle(req => categories.setBus(req.auth.cooperativaId, req.params.id, req.body?.categorias)),
    availability: handle(req => batches.availability(req.auth, req.query)),
    create: handle(req => batches.create(req.auth, req.body), result => result.repetido ? 200 : 201)
};
