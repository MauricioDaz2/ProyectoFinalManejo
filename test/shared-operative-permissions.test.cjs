const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const permissions = require('../backend/src/security/permissions');

test('RFC-000084: matriz de permisos habilita rutas y salidas en R003 y ventanilla en R002 autorizado sin abrir módulos ajenos', () => {
    const oficinista = { id: 'OFI01', rolId: 'R003', cooperativaId: 'CP001', cooperativaActiva: true };
    assert.equal(permissions.can(oficinista, 'rutas'), true);
    assert.equal(permissions.can(oficinista, 'salidas'), true);
    assert.equal(permissions.can(oficinista, 'ventanilla'), true);
    assert.equal(permissions.can(oficinista, 'buses'), false);
    assert.equal(permissions.can(oficinista, 'trabajadores'), false);
    assert.equal(permissions.can(oficinista, 'personalizacion'), false);

    const coopPrincipal = { id: 'MAIN1', rolId: 'R002', cooperativaId: 'CP001', cooperativaActiva: true, accesoConfigurado: true, principal: true, permisos: [] };
    assert.equal(permissions.can(coopPrincipal, 'ventanilla'), true);

    const coopOperativo = { id: 'GEST_OP', rolId: 'R002', cooperativaId: 'CP001', cooperativaActiva: true, accesoConfigurado: true, principal: false, permisos: ['rutas', 'salidas'] };
    assert.equal(permissions.can(coopOperativo, 'ventanilla'), true);

    const coopSoloDash = { id: 'GEST_DASH', rolId: 'R002', cooperativaId: 'CP001', cooperativaActiva: true, accesoConfigurado: true, principal: false, permisos: ['dashboard'] };
    assert.equal(permissions.can(coopSoloDash, 'ventanilla'), false);
});

test('RFC-000084: endpoints HTTP permiten operación cruzada R002/R003 con aislamiento estricto por cooperativa', async (t) => {
    const users = {
        MAIN1: { ID_USU: 'MAIN1', ID_ROL_PER: 'R002', EST_USU: '1', ID_COP_PER: 'CP001', EST_COP: '1', NOM_USU: 'Coop', APE_USU: 'Principal' },
        GDASH: { ID_USU: 'GDASH', ID_ROL_PER: 'R002', EST_USU: '1', ID_COP_PER: 'CP001', EST_COP: '1', NOM_USU: 'Gestor', APE_USU: 'Dash' },
        OFI01: { ID_USU: 'OFI01', ID_ROL_PER: 'R003', EST_USU: '1', ID_COP_PER: 'CP001', EST_COP: '1', NOM_USU: 'Ofi', APE_USU: 'Uno' },
        OFI02: { ID_USU: 'OFI02', ID_ROL_PER: 'R003', EST_USU: '1', ID_COP_PER: 'CP002', EST_COP: '1', NOM_USU: 'Ofi', APE_USU: 'Dos' }
    };

    const userPermissions = {
        GDASH: ['dashboard']
    };

    const frecuencias = {
        F0001: {
            ID_FRE: 'F0001',
            CIU_ORI_FRE: 'AMBATO',
            CIU_DES_FRE: 'QUITO',
            FEC_HOR_INI_FRE: '2026-11-01',
            FEC_HOR_FIN_FRE: null,
            EST_RES: '1',
            ID_COP_PER: 'CP001',
            NUM_RES_FRE: 'ANT-2026-001',
            HORA_SAL_FRE: '08:00',
            TAR_BAS_FRE: 5.0
        },
        F0002: {
            ID_FRE: 'F0002',
            CIU_ORI_FRE: 'CUENCA',
            CIU_DES_FRE: 'LOJA',
            FEC_HOR_INI_FRE: '2026-11-01',
            FEC_HOR_FIN_FRE: null,
            EST_RES: '1',
            ID_COP_PER: 'CP002',
            NUM_RES_FRE: 'ANT-2026-002',
            HORA_SAL_FRE: '09:00',
            TAR_BAS_FRE: 7.0
        }
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
            if (q.includes('AS PERSONAL_INSTALADO')) {
                return { recordset: [{ PERSONAL_INSTALADO: 1 }] };
            }
            if (q.includes('FROM dbo.COOPERATIVA_RESPONSABLES WHERE ID_COP=@company AND ID_USU=@user')) {
                return { recordset: this.p.user === 'MAIN1' && this.p.company === 'CP001' ? [{ ID_USU: 'MAIN1' }] : [] };
            }
            if (q.includes('SELECT PERMISO FROM dbo.USUARIO_PERMISOS WHERE ID_USU=@user')) {
                return { recordset: (userPermissions[this.p.user] || []).map((PERMISO) => ({ PERMISO })) };
            }
            if (q.includes('SELECT F.ID_COP_PER AS OWNER FROM dbo.FRECUENCIAS F WHERE F.ID_FRE = @id')) {
                const f = frecuencias[this.p.id];
                return { recordset: f ? [{ OWNER: f.ID_COP_PER }] : [] };
            }
            if (q.includes('FROM dbo.FRECUENCIAS F') && q.includes('WHERE F.ID_COP_PER = @cooperativa')) {
                return { recordset: Object.values(frecuencias).filter((f) => f.ID_COP_PER === this.p.cooperativa) };
            }
            if (q.includes('FROM dbo.HOJAS_RUTAS H') && q.includes('WHERE F.ID_COP_PER = @cooperativa')) {
                return { recordset: [] };
            }
            if (q.includes('VENDIDOS_HOY')) {
                return {
                    recordset: [{
                        BOLETOS_HOY: 4,
                        VENDIDOS_HOY: 4,
                        RESERVADOS_HOY: 1,
                        VALIDADOS_HOY: 2,
                        ANULADOS_HOY: 0,
                        INGRESOS_HOY: 24,
                        HOJAS_HOY: 3
                    }]
                };
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
        '../backend/src/middleware/workerScope',
        '../backend/src/controllers/coopBusController',
        '../backend/src/routes/coopBusRoutes',
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
    const req = async (path, user, method = 'GET', body) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                Cookie: `transporte_sid=${tokens[user]}`,
                'X-Transport-Client': '1',
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: res.status, body: await res.json() };
    };

    // 1. R002 principal accede a ventanilla/resumen de su propia cooperativa
    const coopVentanilla = await req('/oficinista/resumen', 'MAIN1');
    assert.equal(coopVentanilla.status, 200);

    // 2. R002 sin permiso operativo (solo dashboard) recibe 403 en ventanilla
    const dashVentanilla = await req('/oficinista/resumen', 'GDASH');
    assert.equal(dashVentanilla.status, 403);

    // 3. R002 no puede consultar ventanilla de otra cooperativa (403)
    const coopOtraCoop = await req('/oficinista/hojas?cooperativa=CP002', 'MAIN1');
    assert.equal(coopOtraCoop.status, 403);

    // 4. R003 (Oficinista) consulta frecuencias y hojas de ruta de su propia cooperativa
    const ofiFre = await req('/coop/frecuencias', 'OFI01');
    assert.equal(ofiFre.status, 200);
    assert.equal(ofiFre.body.frecuencias.length, 1);
    assert.equal(ofiFre.body.frecuencias[0].ID_COP_PER, 'CP001');

    const ofiHojas = await req('/coop/hojas-ruta', 'OFI01');
    assert.equal(ofiHojas.status, 200);

    // 5. R003 NO puede acceder a buses ni personal ni frecuencias de otra cooperativa
    const ofiBuses = await req('/coop/buses', 'OFI01');
    assert.equal(ofiBuses.status, 403);

    const ofiPersonal = await req('/coop/personal', 'OFI01');
    assert.equal(ofiPersonal.status, 403);

    const ofiOtraCoopParam = await req('/coop/frecuencias?cooperativa=CP002', 'OFI01');
    assert.equal(ofiOtraCoopParam.status, 403);

    const ofiEditOtraCoop = await req('/coop/frecuencias/F0002', 'OFI01', 'PUT', {
        CIU_ORI_FRE: 'CUENCA',
        CIU_DES_FRE: 'LOJA',
        FEC_HOR_INI_FRE: '2026-11-01',
        NUM_RES_FRE: 'ANT-2026-002'
    });
    assert.equal(ofiEditOtraCoop.status, 404);
});

test('RFC-000084: menús y sesiones de frontend incluyen navegación cruzada controlada entre Cooperativa y Oficinista', () => {
    const coopNav = fs.readFileSync('frontend/src/js/coop_navigation.js', 'utf8');
    const panelLayout = fs.readFileSync('frontend/src/js/panel_layout.js', 'utf8');
    const transportSession = fs.readFileSync('frontend/src/js/transport_session.js', 'utf8');

    assert.match(coopNav, /ventanilla_boletos\.html/);
    assert.match(coopNav, /validacion_reservas\.html/);
    assert.match(panelLayout, /Frecuencias y Hojas de Ruta/);
    assert.match(transportSession, /resoluciones_ant\\\.html/);
});
