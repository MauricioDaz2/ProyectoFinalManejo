'use strict';

/**
 * Generador QR ISO/IEC 18004 en modo Byte (Nivel de corrección L, Versiones 1 a 10).
 * Sin dependencias externas, produce matriz booleana exacta y representación SVG.
 */

// Tabla de versiones 1..10 para nivel ECC L:
// [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2, alignmentCenters]
const VERSIONES_L = [
    null,
    [26, 7, 1, 19, 0, 0, []],
    [44, 10, 1, 34, 0, 0, [6, 18]],
    [70, 15, 1, 55, 0, 0, [6, 22]],
    [100, 20, 1, 80, 0, 0, [6, 26]],
    [134, 26, 1, 108, 0, 0, [6, 30]],
    [172, 18, 2, 68, 0, 0, [6, 34]],
    [196, 20, 2, 78, 0, 0, [6, 22, 38]],
    [242, 24, 2, 97, 0, 0, [6, 24, 42]],
    [292, 30, 2, 116, 0, 0, [6, 26, 46]],
    [346, 18, 2, 68, 2, 69, [6, 28, 50]]
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i += 1) {
        const next = new Uint8Array(poly.length + 1);
        const factor = GF_EXP[i];
        for (let j = 0; j < poly.length; j += 1) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], factor);
        }
        poly = next;
    }
    return poly;
}

function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data, 0);
    for (let i = 0; i < data.length; i += 1) {
        const coef = msg[i];
        if (coef !== 0) {
            for (let j = 0; j < gen.length; j += 1) {
                msg[i + j] ^= gfMul(gen[j], coef);
            }
        }
    }
    return msg.slice(data.length);
}

function elegirVersion(byteLength) {
    for (let v = 1; v < VERSIONES_L.length; v += 1) {
        const info = VERSIONES_L[v];
        const totalData = info[2] * info[3] + info[4] * info[5];
        const countBits = v <= 9 ? 8 : 16;
        const maxBytes = Math.floor((totalData * 8 - 4 - countBits) / 8);
        if (byteLength <= maxBytes) return v;
    }
    throw new Error('El contenido del código QR supera la longitud máxima soportada.');
}

function construirCodewords(bytes, version) {
    const info = VERSIONES_L[version];
    const totalDataBytes = info[2] * info[3] + info[4] * info[5];
    const countBits = version <= 9 ? 8 : 16;
    const bits = [];

    const pushBits = (val, len) => {
        for (let i = len - 1; i >= 0; i -= 1) {
            bits.push((val >>> i) & 1);
        }
    };

    // Modo Byte = 0100
    pushBits(0b0100, 4);
    pushBits(bytes.length, countBits);
    for (const b of bytes) pushBits(b, 8);

    const maxBits = totalDataBytes * 8;
    const terminator = Math.min(4, maxBits - bits.length);
    pushBits(0, terminator);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = new Uint8Array(totalDataBytes);
    const bitByteLen = bits.length / 8;
    for (let i = 0; i < bitByteLen; i += 1) {
        let val = 0;
        for (let b = 0; b < 8; b += 1) val = (val << 1) | bits[i * 8 + b];
        dataBytes[i] = val;
    }

    const pads = [0xec, 0x11];
    for (let i = bitByteLen; i < totalDataBytes; i += 1) {
        dataBytes[i] = pads[(i - bitByteLen) % 2];
    }

    // Dividir en bloques y calcular ECC
    const ecLen = info[1];
    const blocks = [];
    const ecBlocks = [];
    let offset = 0;

    for (let i = 0; i < info[2]; i += 1) {
        const slice = dataBytes.slice(offset, offset + info[3]);
        offset += info[3];
        blocks.push(slice);
        ecBlocks.push(rsEncode(slice, ecLen));
    }
    for (let i = 0; i < info[4]; i += 1) {
        const slice = dataBytes.slice(offset, offset + info[5]);
        offset += info[5];
        blocks.push(slice);
        ecBlocks.push(rsEncode(slice, ecLen));
    }

    const finalCodewords = [];
    const maxDataBlockLen = Math.max(info[3], info[5]);
    for (let i = 0; i < maxDataBlockLen; i += 1) {
        for (const blk of blocks) {
            if (i < blk.length) finalCodewords.push(blk[i]);
        }
    }
    for (let i = 0; i < ecLen; i += 1) {
        for (const ec of ecBlocks) {
            finalCodewords.push(ec[i]);
        }
    }

    return finalCodewords;
}

function crearMatrizBase(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, dark) => {
        if (r < 0 || r >= size || c < 0 || c >= size) return;
        modules[r][c] = dark ? 1 : 0;
        isFunc[r][c] = 1;
    };

    const drawFinder = (row, col) => {
        for (let dr = -1; dr <= 7; dr += 1) {
            for (let dc = -1; dc <= 7; dc += 1) {
                const enBorde = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
                    && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
                setFunc(row + dr, col + dc, enBorde);
            }
        }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Patrones de sincronización (timing)
    for (let i = 8; i < size - 8; i += 1) {
        const bit = i % 2 === 0;
        setFunc(6, i, bit);
        setFunc(i, 6, bit);
    }

    // Patrones de alineación
    const centers = VERSIONES_L[version][6];
    for (const r of centers) {
        for (const c of centers) {
            if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
            for (let dr = -2; dr <= 2; dr += 1) {
                for (let dc = -2; dc <= 2; dc += 1) {
                    const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
                    setFunc(r + dr, c + dc, dark);
                }
            }
        }
    }

    // Reservar áreas de formato y módulo oscuro fijo
    for (let i = 0; i < 9; i += 1) {
        if (i !== 6) {
            if (!isFunc[8][i]) isFunc[8][i] = 1;
            if (!isFunc[i][8]) isFunc[i][8] = 1;
        }
    }
    for (let i = 0; i < 8; i += 1) {
        if (!isFunc[8][size - 1 - i]) isFunc[8][size - 1 - i] = 1;
        if (!isFunc[size - 1 - i][8]) isFunc[size - 1 - i][8] = 1;
    }
    setFunc(size - 8, 8, true);

    // Versión >= 7 requiere bloques de versión (6x3)
    if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i += 1) {
            rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        }
        const verBits = (version << 12) | rem;
        for (let i = 0; i < 18; i += 1) {
            const bit = ((verBits >>> i) & 1) !== 0;
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            setFunc(b, a, bit);
            setFunc(a, b, bit);
        }
    }

    return { size, modules, isFunc };
}

function colocarDatos(modules, isFunc, size, codewords) {
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;

    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert += 1) {
            const r = upward ? size - 1 - vert : vert;
            for (let j = 0; j < 2; j += 1) {
                const c = right - j;
                if (!isFunc[r][c]) {
                    let dark = false;
                    if (bitIdx < totalBits) {
                        dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
                        bitIdx += 1;
                    }
                    modules[r][c] = dark ? 1 : 0;
                }
            }
        }
        upward = !upward;
    }
}

function escribirFormato(modules, size, mask) {
    // ECC Nivel L = 01
    const data = (0b01 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) {
        rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1);

    for (let i = 0; i <= 5; i += 1) modules[8][i] = bit(i);
    modules[8][7] = bit(6);
    modules[8][8] = bit(7);
    modules[7][8] = bit(8);
    for (let i = 9; i < 15; i += 1) modules[14 - i][8] = bit(i);

    for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
    modules[size - 8][8] = 1;
}

const MASCARAS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function clonarMatriz(modules) {
    return modules.map((row) => new Uint8Array(row));
}

function evaluarPenalizacion(modules, size) {
    let score = 0;
    for (let r = 0; r < size; r += 1) {
        let run = 1;
        for (let c = 1; c < size; c += 1) {
            if (modules[r][c] === modules[r][c - 1]) {
                run += 1;
                if (run === 5) score += 3;
                else if (run > 5) score += 1;
            } else {
                run = 1;
            }
        }
    }
    for (let c = 0; c < size; c += 1) {
        let run = 1;
        for (let r = 1; r < size; r += 1) {
            if (modules[r][c] === modules[r - 1][c]) {
                run += 1;
                if (run === 5) score += 3;
                else if (run > 5) score += 1;
            } else {
                run = 1;
            }
        }
    }
    for (let r = 0; r < size - 1; r += 1) {
        for (let c = 0; c < size - 1; c += 1) {
            const v = modules[r][c];
            if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
                score += 3;
            }
        }
    }
    return score;
}

function encode(texto) {
    const contenido = String(texto || '').trim();
    if (!contenido) throw new Error('El contenido para generar el código QR es obligatorio.');
    const bytes = Buffer.from(contenido, 'utf8');
    const version = elegirVersion(bytes.length);
    const codewords = construirCodewords(bytes, version);
    const base = crearMatrizBase(version);
    colocarDatos(base.modules, base.isFunc, base.size, codewords);

    let mejorMatriz = null;
    let mejorScore = Infinity;
    let mejorMask = 0;

    for (let mask = 0; mask < 8; mask += 1) {
        const candidato = clonarMatriz(base.modules);
        const fn = MASCARAS[mask];
        for (let r = 0; r < base.size; r += 1) {
            for (let c = 0; c < base.size; c += 1) {
                if (!base.isFunc[r][c] && fn(r, c)) {
                    candidato[r][c] ^= 1;
                }
            }
        }
        escribirFormato(candidato, base.size, mask);
        const score = evaluarPenalizacion(candidato, base.size);
        if (score < mejorScore) {
            mejorScore = score;
            mejorMatriz = candidato;
            mejorMask = mask;
        }
    }

    return {
        text: contenido,
        version,
        mask: mejorMask,
        size: base.size,
        modules: mejorMatriz
    };
}

function toSvg(texto, opciones = {}) {
    const { margin = 2 } = opciones;
    const qr = encode(texto);
    const dim = qr.size + margin * 2;
    const paths = [];
    for (let r = 0; r < qr.size; r += 1) {
        for (let c = 0; c < qr.size; c += 1) {
            if (qr.modules[r][c]) {
                paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${paths.join('')}" fill="#0f172a"/></svg>`;
}

module.exports = {
    encode,
    toSvg
};
