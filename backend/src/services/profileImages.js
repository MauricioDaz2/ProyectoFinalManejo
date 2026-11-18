const sharp = require('sharp');
const { error } = require('./profileContent');
const formats = { jpeg: { extension: 'jpg', mime: 'image/jpeg' }, png: { extension: 'png', mime: 'image/png' }, webp: { extension: 'webp', mime: 'image/webp' } };
async function validateImage(buffer, type) {
    if (!['logo', 'portada', 'galeria'].includes(type)) throw error(400, 'Uso de imagen no válido.');
    if (!buffer?.length || buffer.length > 8 * 1024 * 1024) throw error(400, 'La imagen debe tener un tamaño máximo de 8 MB.');
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp) throw error(400, 'El contenido del archivo no corresponde a JPG, PNG o WebP.');
    try {
        const decoder = sharp(buffer, { failOn: 'warning', limitInputPixels: 24000000 });
        const metadata = await decoder.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw error(400, 'Solo se permiten JPG, PNG o WebP sin animación.');
        if (!metadata.width || !metadata.height || metadata.width > 32768 || metadata.height > 32768 || metadata.width * metadata.height > 24000000) throw error(400, 'La imagen supera el límite de seguridad: 24 megapíxeles o 32768 píxeles por lado.');
        await decoder.raw().toBuffer();
        return { data: buffer, width: metadata.width, height: metadata.height, ...formats[metadata.format] };
    } catch (err) { if (err.status) throw err; throw error(400, 'El archivo no es una imagen válida, está incompleto o supera los límites.'); }
}
module.exports = { validateImage };
