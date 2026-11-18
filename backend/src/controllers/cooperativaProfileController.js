const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const repository = require('../repositories/cooperativaProfileRepository');
const { normalize, defaults, publicData, error, uuid } = require('../services/profileContent');
const { validateImage } = require('../services/profileImages');

function createController(repo = repository, directory = path.join(__dirname, '../../private_media/cooperativas')) {
    const filePath = (name) => {
        if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)) throw error(404, 'Imagen no disponible.');
        return path.join(directory, name);
    };
    const handle = (action) => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { await action(req, res); }
        catch (err) { if (!res.headersSent) res.status(err.status || 503).json({ success: false, code: err.code, message: err.status ? err.message : 'No se pudo completar la operación. No se ha confirmado ningún guardado.' }); }
    };
    return {
        read: handle(async (req, res) => {
            const result = await repo.read(req.auth.cooperativaId);
            res.json({ success: true, contenido: result.content || defaults(result.company), revision: result.revision, publicado: result.publishedAt, imagenes: result.images });
        }),
        preview: handle(async (req, res) => {
            const result = await repo.read(req.auth.cooperativaId);
            res.json({ success: true, ...publicData(result.company, result.content || defaults(result.company), true), preview: true });
        }),
        save: (publish) => handle(async (req, res) => {
            if (!req.body || Object.keys(req.body).some((key) => !['contenido', 'revision'].includes(key)) || !Number.isSafeInteger(req.body.revision) || req.body.revision < 0) throw error(400, 'Solicitud de guardado no válida.');
            const content = normalize(req.body.contenido);
            const result = await repo.save(req.auth.cooperativaId, content, req.body.revision, publish);
            res.json({ success: true, ...result, message: publish ? 'Cambios guardados y publicados.' : 'Borrador privado guardado. La página pública no cambió.' });
        }),
        upload: handle(async (req, res) => {
            if (!req.file || Object.keys(req.body || {}).length) throw error(400, 'Envía únicamente el archivo de imagen.');
            const original = await validateImage(req.file.buffer, req.params.tipo);
            const id = crypto.randomUUID();
            const image = { ID_IMG: id, TIPO: req.params.tipo, ARCHIVO: `${id}.${original.extension}`, MIME: original.mime, BYTES: original.data.length, ANCHO: original.width, ALTO: original.height };
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(filePath(image.ARCHIVO), original.data, { flag: 'wx' });
            try { await repo.addImage(req.auth.cooperativaId, image); }
            catch (err) { await fs.unlink(filePath(image.ARCHIVO)).catch(() => {}); throw err; }
            const { ARCHIVO, ...metadata } = image;
            res.status(201).json({ success: true, imagen: metadata, message: 'Imagen guardada en tu biblioteca privada. Aún no está publicada.' });
        }),
        serve: (isPublic) => handle(async (req, res) => {
            const admin = isPublic === 'admin';
            if(admin && req.auth?.rolId !== 'R001')throw error(403,'Acceso administrativo requerido.');
            if (!uuid.test(req.params.imageId)) throw error(404, 'Imagen no disponible.');
            const companyId = isPublic ? req.params.id : req.auth.cooperativaId;
            if (!/^[A-Z0-9_-]{1,5}$/i.test(companyId)) throw error(404, 'Imagen no disponible.');
            const row = await repo.image(companyId, req.params.imageId, admin ? false : isPublic, admin);
            const expectedMime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(row.ARCHIVO)];
            if (!expectedMime || row.MIME !== expectedMime) throw error(404, 'Imagen no disponible.');
            res.set({ 'Content-Type': expectedMime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
            await new Promise((resolve, reject) => res.sendFile(filePath(row.ARCHIVO), (err) => err ? reject(error(404, 'Imagen no disponible.')) : resolve()));
        }),
        remove: handle(async (req, res) => {
            if (!uuid.test(req.params.imageId)) throw error(404, 'Imagen no disponible.');
            const name = await repo.removeImage(req.auth.cooperativaId, req.params.imageId);
            await fs.unlink(filePath(name)).catch(() => {});
            res.json({ success: true, message: 'Imagen retirada de la biblioteca.' });
        })
    };
}
module.exports = { ...createController(), createController };
