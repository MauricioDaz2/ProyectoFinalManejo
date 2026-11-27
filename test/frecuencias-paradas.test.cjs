const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const tripRules = require('../backend/src/services/tripRules');

test('RFC-000088: migración 016 define HORA_LLE_FRE, ES_DIRECTA y tabla FRECUENCIA_PARADAS idempotente', () => {
    const sqlScript = fs.readFileSync('database/scripts/016_frecuencias_hora_llegada_paradas.sql', 'utf8');
    assert.match(sqlScript, /COL_LENGTH\('dbo\.FRECUENCIAS',\s*'HORA_LLE_FRE'\)/);
    assert.match(sqlScript, /ALTER TABLE dbo\.FRECUENCIAS ADD HORA_LLE_FRE varchar\(5\) NULL/);
    assert.match(sqlScript, /COL_LENGTH\('dbo\.FRECUENCIAS',\s*'ES_DIRECTA'\)/);
    assert.match(sqlScript, /OBJECT_ID\('dbo\.FRECUENCIA_PARADAS',\s*'U'\)/);
});

test('RFC-000088: creación, consulta y actualización de frecuencias con hora de llegada y paradas intermedias compatibles con portal operativo', async (t) => {
    const users = {
        COOP1: {
            ID_USU: 'COOP1',
            ID_ROL_PER: 'R002',
            EST_USU: '1',
            ID_COP_PER: 'CP001',
            EST_COP: '1',
            NOM_USU: 'Gestor',
            APE_USU: 'Coop',
            COR_USU: 'coop1@demo.ec'
        }
    };

    const frecuenciasMap = new Map();
    const paradasMap = new Map();

    class Request {
        constructor() { this.p = {}; }
        input(k, _type, v) { this.p[k] = v; return this; }
        async query(sqlText) {
            const q = sqlText.trim();
            if (q.includes('WHERE U.ID_USU = @id')) {
                const u = users[this.p.id];
                return { recordset: u ? [u] : [] };
            }
            if (q.includes('OBJECT_ID') && q.includes('COOPERATIVA_ACCESOS')) {
                return { recordset: [{ ACCESOS: 0 }] };
            }
            if (q.includes('FRE_LLEGADA_PARADAS')) {
                return {
                    recordset: [{
                        BUS_PLANTILLA: 1,
                        ASI_ESPACIAL: 1,
                        FRE_HORA_TARIFA: 1,
                        FRE_LLEGADA_PARADAS: 1,
                        TABLA_FRE_PARADAS: 1
                    }]
                };
            }
            if (q.includes("WHERE ID_FRE LIKE 'F%'")) {
                return { recordset: [{ siguiente: frecuenciasMap.size + 1 }] };
            }
            if (q.includes('INSERT dbo.FRECUENCIAS')) {
                const row = {
                    ID_FRE: this.p.id,
                    CIU_ORI_FRE: this.p.origen,
                    CIU_DES_FRE: this.p.destino,
                    FEC_HOR_INI_FRE: this.p.inicio,
                    FEC_HOR_FIN_FRE: this.p.fin,
                    EST_RES: this.p.estado,
                    ID_COP_PER: this.p.empresa,
                    NUM_RES_FRE: this.p.numRes,
                    HORA_SAL_FRE: this.p.hora,
                    HORA_LLE_FRE: this.p.horaLlegada,
                    TAR_BAS_FRE: this.p.tarifa,
                    ES_DIRECTA: Boolean(this.p.esDirecta),
                    EST_VIGENCIA: 'VIGENTE',
                    TOTAL_HOJAS: 0
                };
                frecuenciasMap.set(row.ID_FRE, row);
                return { recordset: [row] };
            }
            if (q.includes('UPDATE dbo.FRECUENCIAS') && q.includes('SET ES_DIRECTA = @esDirecta')) {
                const f = frecuenciasMap.get(this.p.id);
                if (f) f.ES_DIRECTA = Boolean(this.p.esDirecta);
                return { recordset: f ? [f] : [] };
            }
            if (q.includes('UPDATE dbo.FRECUENCIAS')) {
                const f = frecuenciasMap.get(this.p.id);
                if (!f) return { recordset: [] };
                Object.assign(f, {
                    CIU_ORI_FRE: this.p.origen,
                    CIU_DES_FRE: this.p.destino,
                    FEC_HOR_INI_FRE: this.p.inicio,
                    FEC_HOR_FIN_FRE: this.p.fin,
                    EST_RES: this.p.estado,
                    NUM_RES_FRE: this.p.numRes,
                    HORA_SAL_FRE: this.p.hora,
                    HORA_LLE_FRE: this.p.horaLlegada,
                    TAR_BAS_FRE: this.p.tarifa,
                    ES_DIRECTA: Boolean(this.p.esDirecta)
                });
                return { recordset: [f] };
            }
            if (q.includes('DELETE FROM dbo.FRECUENCIA_PARADAS WHERE ID_FRE = @id')) {
                paradasMap.set(this.p.id, []);
                return { recordset: [] };
            }
            if (q.includes('INSERT INTO dbo.FRECUENCIA_PARADAS')) {
                const actual = paradasMap.get(this.p.idFre) || [];
                actual.push({
                    ID_FRE: this.p.idFre,
                    ORDEN: this.p.orden,
                    NOMBRE: this.p.nombre,
                    COMERCIAL: Boolean(this.p.comercial)
                });
                paradasMap.set(this.p.idFre, actual);
                return { recordset: [] };
            }
            if (q.includes('FROM dbo.FRECUENCIA_PARADAS FP')) {
                const todas = [];
                for (const [idFre, lista] of paradasMap.entries()) {
                    const f = frecuenciasMap.get(idFre);
                    if (f && f.ID_COP_PER === this.p.cooperativa) {
                        todas.push(...lista);
                    }
                }
                return { recordset: todas };
            }
            if (q.includes('FROM dbo.FRECUENCIA_PARADAS') && q.includes('WHERE ID_FRE = @idFre')) {
                return { recordset: paradasMap.get(this.p.idFre) || [] };
            }
            if (q.includes('FROM dbo.FRECUENCIAS F') && q.includes('WHERE F.ID_COP_PER = @cooperativa')) {
                return { recordset: [...frecuenciasMap.values()].filter((f) => f.ID_COP_PER === this.p.cooperativa) };
            }
            if (q.includes('SELECT F.ID_COP_PER AS OWNER FROM dbo.FRECUENCIAS F WHERE F.ID_FRE = @id')) {
                const f = frecuenciasMap.get(this.p.id);
                return { recordset: f ? [{ OWNER: f.ID_COP_PER }] : [] };
            }
            if (q.includes('FROM dbo.FRECUENCIAS') && q.includes('WHERE ID_FRE=@id')) {
                const f = frecuenciasMap.get(this.p.id);
                return { recordset: f && f.ID_COP_PER === this.p.empresa ? [f] : [] };
            }
            if (q.includes('FROM dbo.FRECUENCIAS') && q.includes('WHERE ID_FRE = @id')) {
                const f = frecuenciasMap.get(this.p.id);
                return { recordset: f && (!this.p.empresa || f.ID_COP_PER === this.p.empresa) ? [f] : [] };
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
        '../backend/src/middleware/cooperativaScope',
        '../backend/src/controllers/coopBusController',
        '../backend/src/routes/coopBusRoutes',
        '../backend/src/server'
    ];
    for (const mod of cachedModules) {
        delete require.cache[require.resolve(mod)];
    }

    const app = require('../backend/src/server');
    const { store } = require('../backend/src/security/sessionStore');
    const token = store.create('COOP1');
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
    const api = async (path, method = 'GET', body) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                Cookie: `transporte_sid=${token}`,
                'X-Transport-Client': '1',
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: res.status, body: await res.json() };
    };

    // 1. Crear frecuencia con 2 paradas intermedias y hora estimada de llegada
    const created = await api('/coop/frecuencias', 'POST', {
        CIU_ORI_FRE: 'AMBATO',
        CIU_DES_FRE: 'QUITO',
        FEC_HOR_INI_FRE: '2026-11-01',
        FEC_HOR_FIN_FRE: '2027-11-01',
        EST_RES: '1',
        NUM_RES_FRE: 'ANT-2026-8801',
        HORA_SAL_FRE: '07:15',
        HORA_LLE_FRE: '09:45',
        TAR_BAS_FRE: 6.5,
        ES_DIRECTA: false,
        PARADAS: [
            { NOMBRE: 'SALCEDO', COMERCIAL: true },
            { NOMBRE: 'LATACUNGA', COMERCIAL: true }
        ]
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.frecuencia.HORA_SAL_FRE, '07:15');
    assert.equal(created.body.frecuencia.HORA_LLE_FRE, '09:45');
    assert.equal(created.body.frecuencia.ES_DIRECTA, false);
    assert.equal(created.body.frecuencia.PARADAS.length, 2);
    assert.deepEqual(
        created.body.frecuencia.PARADAS.map((p) => ({ ORDEN: p.ORDEN, NOMBRE: p.NOMBRE })),
        [
            { ORDEN: 1, NOMBRE: 'SALCEDO' },
            { ORDEN: 2, NOMBRE: 'LATACUNGA' }
        ]
    );

    // 2. Verificar compatibilidad directa con tripRules.itinerary del portal del chofer
    const filasPersistidas = paradasMap.get(created.body.frecuencia.ID_FRE);
    assert.equal(filasPersistidas.length, 4);
    const recorridoChofer = tripRules.itinerary(
        { CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', RECORRIDO_JSON: null },
        filasPersistidas
    );
    assert.deepEqual(
        recorridoChofer.map((r) => r.NOMBRE),
        ['AMBATO', 'SALCEDO', 'LATACUNGA', 'QUITO']
    );

    // 3. Rechazar modalidad Con paradas sin paradas intermedias o con paradas duplicadas
    const invalidEmpty = await api('/coop/frecuencias', 'POST', {
        CIU_ORI_FRE: 'AMBATO',
        CIU_DES_FRE: 'RIOBAMBA',
        FEC_HOR_INI_FRE: '2026-11-01',
        NUM_RES_FRE: 'ANT-2026-8802',
        HORA_SAL_FRE: '08:00',
        HORA_LLE_FRE: '09:30',
        TAR_BAS_FRE: 4.0,
        ES_DIRECTA: false,
        PARADAS: []
    });
    assert.equal(invalidEmpty.status, 400);

    const invalidDup = await api('/coop/frecuencias', 'POST', {
        CIU_ORI_FRE: 'AMBATO',
        CIU_DES_FRE: 'QUITO',
        FEC_HOR_INI_FRE: '2026-11-01',
        NUM_RES_FRE: 'ANT-2026-8803',
        HORA_SAL_FRE: '08:00',
        HORA_LLE_FRE: '10:30',
        TAR_BAS_FRE: 6.0,
        ES_DIRECTA: false,
        PARADAS: [{ NOMBRE: 'LATACUNGA' }, { NOMBRE: 'LATACUNGA' }]
    });
    assert.equal(invalidDup.status, 400);

    // 4. Actualizar paradas por endpoint dedicado PUT /coop/frecuencias/:id/paradas
    const idFre = created.body.frecuencia.ID_FRE;
    const updatedStops = await api(`/coop/frecuencias/${idFre}/paradas`, 'PUT', {
        ES_DIRECTA: false,
        PARADAS: [
            { NOMBRE: 'SALCEDO', COMERCIAL: true },
            { NOMBRE: 'LATACUNGA', COMERCIAL: true },
            { NOMBRE: 'MACHACHI', COMERCIAL: false }
        ]
    });
    assert.equal(updatedStops.status, 200);
    assert.equal(updatedStops.body.paradas.length, 3);
    assert.equal(updatedStops.body.paradas[2].NOMBRE, 'MACHACHI');
    assert.equal(updatedStops.body.paradas[2].COMERCIAL, false);
});

test('RFC-000088: vista y controlador frontend de frecuencias incluyen hora de llegada y constructor de paradas', () => {
    const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
    const js = fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8');

    assert.ok(html.includes('id="horaLlegadaFrecuencia"'));
    assert.ok(html.includes('id="tipoTrayectoFrecuencia"'));
    assert.ok(html.includes('id="seccionParadasFrecuencia"'));
    assert.ok(html.includes('id="paradaIntermediaCiudad"'));
    assert.ok(html.includes('id="btnAgregarParadaFrecuencia"'));
    assert.ok(html.includes('id="listaParadasFrecuencia"'));

    assert.match(js, /HORA_LLE_FRE/);
    assert.match(js, /ES_DIRECTA/);
    assert.match(js, /PARADAS/);
});
