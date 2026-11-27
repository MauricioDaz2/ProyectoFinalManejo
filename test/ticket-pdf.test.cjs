const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const qrCode = require('../backend/src/services/qrCode');
const { generarBoletoPdf } = require('../backend/src/services/ticketPdf');

test('RFC-000082: generador QR ISO/IEC 18004 produce matriz cuadrada con patrones finder y SVG válido', () => {
    const token = 'QR-20261124-9F8E7D6C5B4A3210FEDCBA9876543210';
    const qr = qrCode.encode(token);
    assert.ok(qr.version >= 1 && qr.version <= 10);
    assert.equal(qr.size, qr.version * 4 + 17);
    assert.equal(qr.modules.length, qr.size);
    assert.equal(qr.modules[0].length, qr.size);

    // Esquinas finder (7x7) deben tener borde superior oscuro
    for (let i = 0; i < 7; i += 1) {
        assert.equal(qr.modules[0][i], 1);
        assert.equal(qr.modules[0][qr.size - 7 + i], 1);
        assert.equal(qr.modules[qr.size - 7][i], 1);
    }

    const svg = qrCode.toSvg(token);
    assert.match(svg, /^<svg[^>]+viewBox="/);
    assert.match(svg, /<path d="M/);
});

test('RFC-000082: generador PDF 1.4 construye boleto formal con cabecera %PDF-1.4, datos de viaje y matriz QR vectorial', () => {
    const pdf = generarBoletoPdf({
        ID_BOL: 'B0123',
        ORI_TRA_BOL: 'AMBATO',
        DES_TRA_BOL: 'QUITO',
        NOM_COP: 'Cooperativa Ambato',
        EST_BOL: 'PAGADO',
        MET_PAG_BOL: 'TRANSFERENCIA',
        PRE_FIN_BOL: 7.5,
        TIP_DES_BOL: 'VIP',
        ID_HOJ_PER: 'H0042',
        FEC_PRO_HOJ: '2026-12-01',
        FEC_COM_BOL: '2026-11-24',
        HORA_SAL_FRE: '07:30',
        NUM_BUS: '14',
        PLA_BUS: 'TAA-1420',
        PIS_ASI: 1,
        ID_ASI_PER: 'A12',
        ETIQUETA_ASIENTO: '112',
        UBI_ASI: 'VENTANA',
        NOM_USU: 'Carlos',
        APE_USU: 'Pérez',
        COR_USU: '1801234567',
        COD_QR_BOL: 'QR-20261124-BOLETO-B0123'
    });

    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.length > 1500, 'El PDF debe contener flujo vectorial completo');
    const raw = pdf.toString('latin1');
    assert.ok(raw.startsWith('%PDF-1.4'));
    assert.ok(raw.trimEnd().endsWith('%%EOF'));
    assert.match(raw, /BOLETO N\\260 B0123/);
    assert.match(raw, /COOPERATIVA AMBATO/);
    assert.match(raw, /AMBATO/);
    assert.match(raw, /QUITO/);
    assert.match(raw, /\$7\.50 USD/);
    assert.match(raw, /TAA-1420/);
    assert.match(raw, /VENTANA/);
    assert.match(raw, /QR-20261124-BOLETO-B0123/);
    assert.match(raw, /re f/); // Módulos vectoriales del código QR
});

test('RFC-000082: endpoints HTTP de descarga PDF validan titularidad del pasajero y aislamiento por cooperativa en ventanilla', async (t) => {
    const users = {
        PAS01: { ID_USU: 'PAS01', ID_ROL_PER: 'R005', EST_USU: '1', ID_COP_PER: null, EST_COP: null, NOM_USU: 'Ana', APE_USU: 'Gómez', COR_USU: '1800000001' },
        PAS02: { ID_USU: 'PAS02', ID_ROL_PER: 'R005', EST_USU: '1', ID_COP_PER: null, EST_COP: null, NOM_USU: 'Luis', APE_USU: 'Vega', COR_USU: '1800000002' },
        OFI01: { ID_USU: 'OFI01', ID_ROL_PER: 'R003', EST_USU: '1', ID_COP_PER: 'CP001', EST_COP: '1', NOM_USU: 'Ofi', APE_USU: 'Uno', COR_USU: 'ofi1@coop.ec' },
        OFI02: { ID_USU: 'OFI02', ID_ROL_PER: 'R003', EST_USU: '1', ID_COP_PER: 'CP002', EST_COP: '1', NOM_USU: 'Ofi', APE_USU: 'Dos', COR_USU: 'ofi2@coop.ec' }
    };

    const ticketRow = {
        ID_BOL: 'B0777',
        ID_USU_FIN: 'PAS01',
        ID_USU_OFI: 'OFI01',
        ID_USU_CON: null,
        ORI_TRA_BOL: 'AMBATO',
        DES_TRA_BOL: 'RIOBAMBA',
        TIP_DES_BOL: 'NORMAL',
        PRE_FIN_BOL: 6.5,
        MET_PAG_BOL: 'EFECTIVO',
        COM_PAG_URL: null,
        EST_BOL: 'EMITIDO',
        COD_QR_BOL: 'QR-20261124-B0777',
        FEC_COM_BOL: '2026-11-24',
        FEC_USO_BOL: null,
        ID_HOJ_PER: 'H0001',
        ID_ASI_PER: 'A01',
        FEC_PRO_HOJ: '2026-11-25',
        EST_VIA_HOJ: 'PROGRAMADA',
        OBS_HOJ: null,
        ID_BUS: 'B0001',
        NUM_BUS: '71',
        PLA_BUS: 'DMO-071',
        NUM_PIS: 1,
        ID_FRE: 'FD072',
        CIU_ORI_FRE: 'AMBATO',
        CIU_DES_FRE: 'RIOBAMBA',
        FEC_HOR_INI_FRE: '2026-11-01',
        ID_COP_PER: 'CP001',
        NOM_COP: 'Cooperativa Demo 1',
        PIS_ASI: 1,
        NUMERO_ASIENTO: 1,
        NOM_TIP: 'NORMAL',
        NOM_USU: 'Ana',
        APE_USU: 'Gómez',
        COR_USU: '1800000001',
        TEL_USU: '0999999999',
        HORA_SAL_FRE: '08:30',
        UBI_ASI: 'VENTANA',
        CED_PAS_BOL: '1800000001'
    };

    class Request {
        constructor() { this.p = {}; }
        input(k, _type, v) { this.p[k] = v; return this; }
        async query(sqlText) {
            const q = sqlText.trim();
            if (q.includes('WHERE U.ID_USU = @id')) {
                const u = users[this.p.id];
                return { recordset: u ? [u] : [] };
            }
            if (q.includes('T.ID_BOL=@ticket')) {
                const ok = this.p.ticket === ticketRow.ID_BOL && this.p.company === ticketRow.ID_COP_PER;
                return { recordset: ok ? [{ ID_HOJ: ticketRow.ID_HOJ_PER, ID_USU_CON: null }] : [] };
            }
            if (q.includes('H.ID_HOJ=@sheet')) {
                const ok = this.p.sheet === ticketRow.ID_HOJ_PER && this.p.company === ticketRow.ID_COP_PER;
                return { recordset: ok ? [{ ID_USU_CON: null, ID_BUS_PER: ticketRow.ID_BUS, BUS_OPERATIVO: ticketRow.ID_BUS }] : [] };
            }
            if (q.includes('TIENE_HORA')) {
                return { recordset: [{ TIENE_HORA: 1, TIENE_UBI: 1, TIENE_CED: 1 }] };
            }
            if (q.includes('WHERE B.ID_BOL = @idBoleto') || q.includes('WHERE B.ID_BOL = @id') || q.includes('WHERE BOL.ID_BOL = @id')) {
                const buscado = this.p.idBoleto || this.p.id;
                const coincideId = buscado === ticketRow.ID_BOL;
                const coincideCoop = !this.p.cooperativa || this.p.cooperativa === ticketRow.ID_COP_PER;
                return { recordset: coincideId && coincideCoop ? [ticketRow] : [] };
            }
            return { recordset: [] };
        }
    }

    const pool = { request: () => new Request() };
    const dbPath = require.resolve('../backend/src/config/db');
    const prevCache = require.cache[dbPath];
    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: { sql: { ...require('mssql'), Request }, conectarBD: async () => pool }
    };

    const cachedModules = [
        '../backend/src/security/permissions',
        '../backend/src/middleware/session',
        '../backend/src/middleware/workerScope',
        '../backend/src/controllers/userReservaController',
        '../backend/src/routes/userReservaRoutes',
        '../backend/src/controllers/oficinistaBoletoController',
        '../backend/src/routes/oficinistaBoletoRoutes',
        '../backend/src/server'
    ];
    for (const mod of cachedModules) {
        delete require.cache[require.resolve(mod)];
    }

    const app = require('../backend/src/server');
    const { store } = require('../backend/src/security/sessionStore');
    const tokens = Object.fromEntries(Object.keys(users).map((id) => [id, store.create(id)]));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    t.after(async () => {
        await new Promise((r) => { server.closeAllConnections(); server.close(r); });
        if (prevCache) require.cache[dbPath] = prevCache;
        for (const mod of cachedModules) {
            delete require.cache[require.resolve(mod)];
        }
    });

    const base = `http://127.0.0.1:${server.address().port}/api`;
    const getPdf = (path, user) => fetch(`${base}${path}`, {
        headers: {
            ...(user ? { Cookie: `transporte_sid=${tokens[user]}` } : {}),
            'X-Transport-Client': '1'
        }
    });

    // 1. Pasajero titular descarga su propio boleto en PDF
    const ownRes = await getPdf('/usuario/reservas/B0777/pdf', 'PAS01');
    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.headers.get('content-type'), 'application/pdf');
    assert.match(ownRes.headers.get('content-disposition'), /boleto-B0777\.pdf/);
    const ownBytes = Buffer.from(await ownRes.arrayBuffer());
    assert.ok(ownBytes.toString('latin1').startsWith('%PDF-1.4'));

    // 2. Otro pasajero NO puede descargar un boleto ajeno (403)
    const otherRes = await getPdf('/usuario/reservas/B0777/pdf', 'PAS02');
    assert.equal(otherRes.status, 403);

    // 3. Boleto inexistente responde 404
    const missingRes = await getPdf('/usuario/reservas/B9999/pdf', 'PAS01');
    assert.equal(missingRes.status, 404);

    // 4. Oficinista de la misma cooperativa descarga el PDF en ventanilla
    const ofiOwn = await getPdf('/oficinista/boletos/B0777/pdf', 'OFI01');
    assert.equal(ofiOwn.status, 200);
    assert.equal(ofiOwn.headers.get('content-type'), 'application/pdf');

    // 5. Oficinista de otra cooperativa NO puede descargar el boleto (404 por aislamiento)
    const ofiOther = await getPdf('/oficinista/boletos/B0777/pdf', 'OFI02');
    assert.equal(ofiOther.status, 404);
});

test('RFC-000082: vistas de Mis Boletos, Ventanilla y Validación incluyen controles de descarga PDF', () => {
    const userBoletosJs = fs.readFileSync('frontend/src/js/user_boletos.js', 'utf8');
    const ventanillaHtml = fs.readFileSync('frontend/src/views/oficinista/ventanilla_boletos.html', 'utf8');
    const ventanillaJs = fs.readFileSync('frontend/src/js/oficinista_ventanilla.js', 'utf8');
    const validacionJs = fs.readFileSync('frontend/src/js/oficinista_validacion.js', 'utf8');

    assert.match(userBoletosJs, /data-descargar-pdf/);
    assert.match(userBoletosJs, /\/usuario\/reservas\/\$\{encodeURIComponent\(codigo\)\}\/pdf/);
    assert.doesNotMatch(userBoletosJs, /localStorage/);

    assert.ok(ventanillaHtml.includes('id="btnDescargarPdfBoleto"'));
    assert.match(ventanillaJs, /\/oficinista\/boletos\/\$\{encodeURIComponent\(codigo\)\}\/pdf/);
    assert.match(validacionJs, /data-descargar-pdf/);
});
