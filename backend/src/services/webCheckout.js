const { cedula } = require('../../../frontend/src/js/ecuador_validation');

const fail = (status, message) => Object.assign(new Error(message), { status });
const categories = new Set(['ADULTO', 'NINO', 'ADULTO_MAYOR', 'DISCAPACIDAD']);

function passengers(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 10) throw fail(400, 'Registra los datos de cada pasajero.');
    const documents = new Set();
    const seats = new Set();
    return rows.map(row => {
        const nombre = typeof row?.nombre === 'string' ? row.nombre.trim() : '';
        const id = typeof row?.cedula === 'string' ? row.cedula.trim().toUpperCase() : '';
        if (!nombre || nombre.length > 100) throw fail(400, 'Indica el nombre de cada pasajero.');
        const valid = row.documento === 'cedula' ? cedula(id) : row.documento === 'extranjero' && /^[A-Z0-9]{5,10}$/.test(id);
        if (!valid || documents.has(id)) throw fail(400, 'Identificación inválida o repetida.');
        if (!categories.has(row.tipo)) throw fail(400, 'Categoría inválida.');
        if (typeof row.asiento !== 'string' || !/^[A-Z0-9_-]{1,5}$/.test(row.asiento) || seats.has(row.asiento)) {
            throw fail(400, 'Cada pasajero necesita un asiento diferente.');
        }
        documents.add(id);
        seats.add(row.asiento);
        return { asiento: row.asiento, nombre, cedula: id, tipo: row.tipo };
    });
}

function receiptType(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
    if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'jpg';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (bytes.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
    throw fail(400, 'Contenido de comprobante inválido.');
}

module.exports = { passengers, receiptType, fail };
