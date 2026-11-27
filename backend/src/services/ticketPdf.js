'use strict';

const qrCode = require('./qrCode');

/**
 * Servicio generador de Boletos en PDF 1.4 vectorial con código QR ISO/IEC 18004.
 * No requiere fuentes externas ni librerías de terceros: utiliza las fuentes
 * estándar Type1 de PDF (Helvetica, Helvetica-Bold, Courier) con codificación
 * WinAnsiEncoding para soportar acentos y caracteres del español.
 */

function aWinAnsi(texto) {
    const limpio = String(texto ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[→➔➜]/g, '->')
        .replace(/[·•]/g, '-')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/—/g, '-')
        .trim();

    let out = '';
    for (let i = 0; i < limpio.length; i += 1) {
        const code = limpio.charCodeAt(i);
        if (code >= 32 && code <= 126) {
            if (code === 40 || code === 41 || code === 92) out += '\\' + limpio[i];
            else out += limpio[i];
        } else if (code >= 160 && code <= 255) {
            out += '\\' + code.toString(8).padStart(3, '0');
        } else {
            out += '?';
        }
    }
    return out;
}

function truncar(texto, max = 38) {
    const str = String(texto ?? '').trim();
    if (!str) return '-';
    return str.length > max ? `${str.slice(0, max - 1)}...` : str;
}

function formatearFecha(valor) {
    if (!valor) return '-';
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        const iso = valor.toISOString().slice(0, 10);
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }
    const str = String(valor).slice(0, 10);
    const partes = str.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return str;
}

function formatearDinero(valor) {
    const num = Number(valor) || 0;
    return `$${num.toFixed(2)} USD`;
}

function colorEstado(estado) {
    const est = String(estado || '').toUpperCase();
    if (['PAGADO', 'EMITIDO', 'USADO', 'CONFIRMADO'].includes(est)) {
        return { bg: '0.89 0.96 0.93', fg: '0.06 0.48 0.33' };
    }
    if (['RESERVADO', 'PENDIENTE'].includes(est)) {
        return { bg: '0.99 0.95 0.85', fg: '0.60 0.40 0.00' };
    }
    return { bg: '0.99 0.91 0.90', fg: '0.71 0.14 0.09' };
}

function normalizarDatosBoleto(entrada = {}) {
    const hoja = entrada.HOJA || {};
    const bus = hoja.BUS || entrada.BUS || {};
    const frec = hoja.FRECUENCIA || entrada.FRECUENCIA || {};
    const coop = hoja.COOPERATIVA || entrada.COOPERATIVA || {};
    const asientoObj = entrada.ASIENTO || {};

    const idBoleto = String(entrada.ID_BOL || entrada.idBoleto || '').trim().toUpperCase();
    const codigoQr = String(entrada.COD_QR_BOL || entrada.codigoQr || idBoleto || 'SIN-QR').trim();
    const origen = String(entrada.ORI_TRA_BOL || frec.CIU_ORI_FRE || entrada.CIU_ORI_FRE || '-').trim();
    const destino = String(entrada.DES_TRA_BOL || frec.CIU_DES_FRE || entrada.CIU_DES_FRE || '-').trim();
    const cooperativa = String(coop.NOM_COP || entrada.NOM_COP || 'Transporte Interprovincial UTA').trim();
    const rucCoop = String(coop.RUC_COP || entrada.RUC_COP || '').trim();
    const estado = String(entrada.EST_BOL || entrada.estado || 'EMITIDO').trim().toUpperCase();
    const metodoPago = String(entrada.MET_PAG_BOL || entrada.metodoPago || 'EFECTIVO').trim().toUpperCase();
    const precio = Number(entrada.PRE_FIN_BOL ?? entrada.precio ?? 0);
    const descuento = String(entrada.TIP_DES_BOL || asientoObj.TIPO || entrada.NOM_TIP || 'NORMAL').trim();

    const idHoja = String(entrada.ID_HOJ_PER || hoja.ID_HOJ || entrada.ID_HOJ || '-').trim();
    const fechaViaje = formatearFecha(hoja.FEC_PRO_HOJ || entrada.FEC_PRO_HOJ || entrada.FEC_COM_BOL);
    const fechaCompra = formatearFecha(entrada.FEC_COM_BOL || hoja.FEC_PRO_HOJ);
    const horaSalida = String(
        frec.HORA_SAL_FRE || entrada.HORA_SAL_FRE || ''
    ).trim().slice(0, 5) || '08:00';

    const numBus = String(bus.NUM_BUS || entrada.NUM_BUS || '-').trim();
    const placaBus = String(bus.PLA_BUS || entrada.PLA_BUS || '-').trim();
    const pisosBus = Number(bus.NUM_PIS || entrada.NUM_PIS || 1);

    const pisoAsiento = Number(asientoObj.PISO || entrada.PIS_ASI || 1);
    const idAsiento = String(entrada.ID_ASI_PER || asientoObj.ID_ASI || '-').trim();
    const etiquetaAsiento = String(
        asientoObj.ETIQUETA || entrada.ETIQUETA_ASIENTO || idAsiento || '-'
    ).trim();
    const tipoAsiento = String(asientoObj.TIPO || entrada.NOM_TIP || descuento || 'NORMAL').trim();
    const ubicacionAsiento = String(asientoObj.UBICACION || entrada.UBI_ASI || '').trim();

    const pasajero = String(
        entrada.PASAJERO
        || (entrada.NOM_USU ? `${entrada.NOM_USU} ${entrada.APE_USU || ''}`.trim() : '')
        || 'Pasajero en ventanilla'
    ).trim();
    const cedula = String(
        entrada.CEDULA_PASAJERO || entrada.CED_PAS_BOL || entrada.COR_USU || entrada.ID_USU_FIN || '-'
    ).trim();

    return {
        idBoleto: idBoleto || 'B0000',
        codigoQr,
        origen,
        destino,
        cooperativa,
        rucCoop,
        estado,
        metodoPago,
        precio,
        descuento,
        idHoja,
        fechaViaje,
        fechaCompra,
        horaSalida,
        numBus,
        placaBus,
        pisosBus,
        pisoAsiento,
        idAsiento,
        etiquetaAsiento,
        tipoAsiento,
        ubicacionAsiento,
        pasajero,
        cedula
    };
}

function ensamblarDocumentoPdf(comandosStream, meta = {}) {
    const streamBuffer = Buffer.from(comandosStream.join('\n'), 'latin1');
    const objetos = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj',
        '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
        '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj',
        null,
        `8 0 obj\n<< /Title (${aWinAnsi(meta.titulo || 'Boleto de Viaje')}) /Author (${aWinAnsi(meta.autor || 'Sistema de Transporte Interprovincial UTA')}) /Creator (Transporte UTA PDF Service) >>\nendobj`
    ];

    const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
    const offsets = [0];
    let cursor = partes[0].length;

    for (let i = 0; i < objetos.length; i += 1) {
        offsets.push(cursor);
        let bloque;
        if (i === 6) {
            const head = Buffer.from(`7 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n`, 'latin1');
            const tail = Buffer.from('\nendstream\nendobj\n', 'latin1');
            bloque = Buffer.concat([head, streamBuffer, tail]);
        } else {
            bloque = Buffer.from(`${objetos[i]}\n`, 'latin1');
        }
        partes.push(bloque);
        cursor += bloque.length;
    }

    const xrefOffset = cursor;
    const xrefLineas = [
        'xref',
        `0 ${objetos.length + 1}`,
        '0000000000 65535 f '
    ];
    for (let i = 1; i < offsets.length; i += 1) {
        xrefLineas.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `);
    }
    xrefLineas.push(
        'trailer',
        `<< /Size ${objetos.length + 1} /Root 1 0 R /Info 8 0 R >>`,
        'startxref',
        String(xrefOffset),
        '%%EOF\n'
    );

    partes.push(Buffer.from(xrefLineas.join('\n'), 'latin1'));
    return Buffer.concat(partes);
}

function generarBoletoPdf(datosCrudos) {
    const d = normalizarDatosBoleto(datosCrudos);
    const qr = qrCode.encode(d.codigoQr);
    const cmds = [];

    const text = (font, size, x, y, str, rgb = '0.09 0.13 0.20') => {
        cmds.push('BT');
        cmds.push(`${rgb} rg`);
        cmds.push(`/${font} ${size} Tf`);
        cmds.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
        cmds.push(`(${aWinAnsi(str)}) Tj`);
        cmds.push('ET');
    };

    const rect = (x, y, w, h, fillRgb, strokeRgb = null, lineWidth = 1) => {
        cmds.push('q');
        if (lineWidth) cmds.push(`${lineWidth} w`);
        if (fillRgb && strokeRgb) {
            cmds.push(`${fillRgb} rg`);
            cmds.push(`${strokeRgb} RG`);
            cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`);
        } else if (fillRgb) {
            cmds.push(`${fillRgb} rg`);
            cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
        } else if (strokeRgb) {
            cmds.push(`${strokeRgb} RG`);
            cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
        }
        cmds.push('Q');
    };

    const line = (x1, y1, x2, y2, strokeRgb = '0.86 0.89 0.93', width = 1, dashed = false) => {
        cmds.push('q');
        cmds.push(`${width} w`);
        cmds.push(`${strokeRgb} RG`);
        if (dashed) cmds.push('[5 4] 0 d');
        cmds.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
        cmds.push('Q');
    };

    // Fondo exterior suave y tarjeta principal del boleto
    rect(42, 88, 511, 690, '1 1 1', '0.82 0.86 0.91', 1.2);

    // Banda superior corporativa
    rect(42, 698, 511, 80, '0.05 0.36 0.29');
    text('F2', 17, 64, 748, truncar(d.cooperativa.toUpperCase(), 36), '1 1 1');
    text('F1', 10, 64, 730, 'BOLETO ELECTRONICO DE VIAJE INTERPROVINCIAL - COMPROBANTE OFICIAL', '0.84 0.95 0.91');
    text('F2', 12, 430, 748, `BOLETO N° ${d.idBoleto}`, '1 1 1');

    // Pastilla de estado
    const estColor = colorEstado(d.estado);
    rect(430, 716, 102, 22, estColor.bg);
    text('F2', 10, 444, 723, `ESTADO: ${truncar(d.estado, 12)}`, estColor.fg);

    // Bloque Hero: Origen -> Destino + Precio
    rect(60, 608, 475, 74, '0.96 0.98 0.97', '0.85 0.91 0.89', 1);
    text('F1', 9, 76, 664, 'ORIGEN', '0.39 0.45 0.53');
    text('F2', 16, 76, 644, truncar(d.origen, 20), '0.06 0.11 0.18');
    text('F2', 15, 232, 645, '-->', '0.05 0.36 0.29');
    text('F1', 9, 268, 664, 'DESTINO', '0.39 0.45 0.53');
    text('F2', 16, 268, 644, truncar(d.destino, 20), '0.06 0.11 0.18');

    text('F1', 9, 76, 622, `Fecha de salida: ${d.fechaViaje}   |   Hora programada: ${d.horaSalida} (Ecuador)   |   Hoja: ${d.idHoja}`, '0.32 0.38 0.47');

    // Tarifa destacada a la derecha del Hero
    rect(418, 620, 104, 50, '1 1 1', '0.82 0.88 0.86', 1);
    text('F1', 8.5, 428, 654, 'VALOR TOTAL', '0.39 0.45 0.53');
    text('F2', 14, 428, 634, formatearDinero(d.precio), '0.05 0.36 0.29');

    // Cuadrícula de datos (2 columnas x 4 filas)
    const celdas = [
        ['PASAJERO', truncar(d.pasajero, 30), 'DOCUMENTO / CEDULA', truncar(d.cedula, 22)],
        [
            'ASIENTO Y PISO',
            `Asiento ${d.etiquetaAsiento} (Piso ${d.pisoAsiento})${d.ubicacionAsiento ? ' - ' + d.ubicacionAsiento : ''}`,
            'UNIDAD / BUS',
            `Bus N° ${d.numBus} - Placa ${d.placaBus}`
        ],
        ['CATEGORIA DE ASIENTO', truncar(d.tipoAsiento, 26), 'METODO DE PAGO', `${d.metodoPago} (${truncar(d.descuento, 16)})`],
        ['FECHA DE COMPRA', d.fechaCompra, 'HOJA DE RUTA / CODIGO', `Hoja ${d.idHoja} - Boleto ${d.idBoleto}`]
    ];

    let filaY = 542;
    for (const [lbl1, val1, lbl2, val2] of celdas) {
        rect(60, filaY, 230, 50, '0.99 0.99 1.00', '0.89 0.91 0.95', 0.8);
        text('F1', 8.5, 72, filaY + 33, lbl1, '0.42 0.47 0.55');
        text('F2', 11, 72, filaY + 15, val1, '0.09 0.13 0.20');

        rect(305, filaY, 230, 50, '0.99 0.99 1.00', '0.89 0.91 0.95', 0.8);
        text('F1', 8.5, 317, filaY + 33, lbl2, '0.42 0.47 0.55');
        text('F2', 11, 317, filaY + 15, val2, '0.09 0.13 0.20');

        filaY -= 60;
    }

    // Línea punteada de talón de abordaje
    line(42, 304, 553, 304, '0.72 0.77 0.84', 1.2, true);
    text('F1', 8.5, 225, 310, 'TALON DE CONTROL Y ABORDAJE (ESCANEAR QR)', '0.45 0.50 0.58');

    // Dibujar matriz QR vectorial en la esquina inferior izquierda
    const qrBoxSize = 154;
    const qrX = 64;
    const qrY = 122;
    rect(qrX, qrY, qrBoxSize, qrBoxSize, '1 1 1', '0.82 0.86 0.91', 1);

    const quiet = 3;
    const totalModules = qr.size + quiet * 2;
    const cellSize = qrBoxSize / totalModules;

    cmds.push('q');
    cmds.push('0.06 0.09 0.16 rg');
    for (let r = 0; r < qr.size; r += 1) {
        for (let c = 0; c < qr.size; c += 1) {
            if (qr.modules[r][c]) {
                const mx = qrX + (c + quiet) * cellSize;
                const my = qrY + qrBoxSize - (r + quiet + 1) * cellSize;
                cmds.push(`${mx.toFixed(3)} ${my.toFixed(3)} ${(cellSize + 0.08).toFixed(3)} ${(cellSize + 0.08).toFixed(3)} re f`);
            }
        }
    }
    cmds.push('Q');

    // Información junto al código QR
    const infoX = 236;
    text('F2', 12, infoX, 258, 'CODIGO QR DE VALIDACION', '0.05 0.36 0.29');
    text('F1', 9.5, infoX, 240, 'Presenta este boleto impreso o en tu telefono al controlador', '0.32 0.38 0.47');
    text('F1', 9.5, infoX, 226, 'o en ventanilla antes de abordar la unidad.', '0.32 0.38 0.47');

    rect(infoX, 174, 298, 40, '0.96 0.97 0.99', '0.86 0.89 0.93', 0.8);
    text('F1', 8, infoX + 10, 201, 'TOKEN / CODIGO DE VERIFICACION:', '0.42 0.47 0.55');
    text('F3', 8.5, infoX + 10, 185, truncar(d.codigoQr, 48), '0.12 0.16 0.23');

    text('F2', 10, infoX, 152, `Resumen: ${truncar(d.origen, 14)} -> ${truncar(d.destino, 14)} | Asiento ${d.etiquetaAsiento}`, '0.09 0.13 0.20');
    text('F1', 9, infoX, 136, `Cooperativa: ${truncar(d.cooperativa, 32)} | Estado: ${d.estado}`, '0.39 0.45 0.53');

    // Pie del boleto
    line(60, 108, 535, 108, '0.88 0.90 0.94', 0.8, false);
    text('F1', 8, 60, 96, 'Sistema de Transporte Interprovincial - Universidad Tecnica de Ambato', '0.48 0.53 0.60');
    text('F1', 8, 412, 96, `Documento generado: ${formatearFecha(new Date())}`, '0.48 0.53 0.60');

    return ensamblarDocumentoPdf(cmds, {
        titulo: `Boleto ${d.idBoleto} - ${d.origen} a ${d.destino}`,
        autor: d.cooperativa
    });
}

module.exports = {
    generarBoletoPdf,
    normalizarDatosBoleto
};
