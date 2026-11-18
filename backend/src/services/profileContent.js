const error = (status, message, code) => Object.assign(new Error(message), { status, code });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function defaults(company = {}) {
    return { nombre: company.NOM_COP || '', descripcion: '', mision: '', telefono: company.TEL_COP || '', direccion: company.DIR_COP || '', correo: '', principal: '#103971', secundario: '#ffb900', logo: null, portada: null, galeria: [], servicios: [] };
}
function normalize(input) {
    const result = {};
    const fields = { nombre: 80, descripcion: 2000, mision: 1000, telefono: 40, direccion: 240, correo: 120 };
    const allowed = [...Object.keys(fields), 'principal', 'secundario', 'logo', 'portada', 'galeria', 'servicios'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) throw error(400, 'El contenido contiene campos no permitidos.');
    for (const [key, max] of Object.entries(fields)) {
        if (typeof input[key] !== 'string' || input[key].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input[key])) throw error(400, `El campo ${key} no es válido (máximo ${max} caracteres).`);
        result[key] = input[key].trim();
    }
    if (!result.nombre) throw error(400, 'Indica un nombre comercial.');
    if (result.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.correo)) throw error(400, 'El correo público no es válido.');
    for (const key of ['principal', 'secundario']) {
        if (!/^#[a-f0-9]{6}$/i.test(input[key])) throw error(400, 'Selecciona colores hexadecimales válidos.');
        result[key] = input[key].toLowerCase();
    }
    for (const key of ['logo', 'portada']) {
        if (input[key] !== null && (typeof input[key] !== 'string' || !uuid.test(input[key]))) throw error(400, 'Imagen no válida.');
        result[key] = input[key]?.toLowerCase() || null;
    }
    if (!Array.isArray(input.galeria) || input.galeria.length > 6 || input.galeria.some((id) => typeof id !== 'string' || !uuid.test(id)) || new Set(input.galeria.map((id) => id.toLowerCase())).size !== input.galeria.length) throw error(400, 'Selecciona hasta seis fotografías diferentes.');
    result.galeria = input.galeria.map((id) => id.toLowerCase());
    if (!Array.isArray(input.servicios) || input.servicios.length > 8 || input.servicios.some((s) => typeof s !== 'string' || !s.trim() || s.length > 100)) throw error(400, 'Indica hasta ocho servicios, de máximo 100 caracteres cada uno.');
    result.servicios = [...new Set(input.servicios.map((s) => s.trim()))];
    return result;
}
function references(content) { return [content?.logo, content?.portada, ...(content?.galeria || [])].filter(Boolean); }
function validateImages(content, rows) {
    const expected = [[content.logo, 'logo'], [content.portada, 'portada'], ...content.galeria.map((id) => [id, 'galeria'])];
    for (const [id, type] of expected) if (id && !rows.some((row) => String(row.ID_IMG).toLowerCase() === id && row.TIPO === type)) throw error(400, 'Una imagen no pertenece a tu cooperativa o no corresponde a su uso.');
}
function publicData(company, content, preview = false) {
    const url = (id) => id ? (preview ? `/api/coop/perfil/imagenes/${id}` : `/api/public/cooperativas/${encodeURIComponent(company.ID_COP)}/imagenes/${id}`) : null;
    return {
        cooperativa: { ...company, NOM_COP: content.nombre, LOG_URL_COP: url(content.logo) || company.LOG_URL_COP, TEL_COP: content.telefono, DIR_COP: content.direccion },
        contenido: { descripcion: content.descripcion, mision: content.mision, correo: content.correo, principal: content.principal, secundario: content.secundario, portada: url(content.portada), servicios: content.servicios },
        fotos: content.galeria.map((id, index) => ({ IMG_URL_BUS: url(id), descripcion: `Fotografía ${index + 1} de ${content.nombre}` }))
    };
}
module.exports = { defaults, normalize, references, validateImages, publicData, error, uuid };
