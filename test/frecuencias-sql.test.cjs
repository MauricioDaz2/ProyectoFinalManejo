const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const sql = require('mssql');

const password = process.env.CC01_SQL_TEST_PASSWORD;

test('RFC-000078: migración 014, reversión, frecuencias sin cupos, CC-02 independiente y reservas sin límite artificial', {
    skip: !password && 'Define CC01_SQL_TEST_PASSWORD para ejecutar contra SQL Server local.'
}, async () => {
    const root = path.join(__dirname, '..');
    const database = `RFC78_TEST_${randomBytes(5).toString('hex')}`;
    const config = { server: '127.0.0.1', user: 'sa', password, database: 'master', options: { trustServerCertificate: true } };
    const master = await new sql.ConnectionPool(config).connect();
    let sandbox;
    let created = false;

    async function run(file, encoding = 'utf8') {
        let script = fs.readFileSync(path.join(root, file), encoding).replace(/^\uFEFF/, '');
        const use = /^\s*USE\s+\[?BD_COOPERATIVAS_BUSES\]?[ \t]*;?[ \t]*$/mi.exec(script);
        if (use) script = script.slice(use.index + use[0].length);
        let result;
        for (const batch of script.split(/^\s*GO\s*$/mi)) {
            if (batch.trim()) result = await sandbox.request().batch(batch);
        }
        return result?.recordset?.[0]?.Resultado;
    }

    try {
        await master.request().batch(`CREATE DATABASE [${database}]`);
        created = true;
        sandbox = await new sql.ConnectionPool({ ...config, database }).connect();
        await run('database/scripts/script_bd.sql', 'utf16le');
        await run('database/scripts/009_rol_chofer.sql');
        await run('database/scripts/010_operacion_viajes.sql');
        await run('database/scripts/migracion_pasajeros_facturacion.sql');
        await run('database/scripts/011_frecuencias_vigencia.sql');
        await run('database/scripts/012_frecuencias_catalogo_cupos.sql');
        await run('database/scripts/013_hojas_ruta_lotes.sql');

        // Sembrar datos previos (con resolución legada CUP_FRE_MAX=1)
        const { recordset: [{ hoy, manana }] } = await sandbox.request().query(`
            SELECT CONVERT(char(10), dbo.fn_CC_FechaEcuador(SYSUTCDATETIME()), 23) AS hoy,
                   CONVERT(char(10), DATEADD(day, 1, dbo.fn_CC_FechaEcuador(SYSUTCDATETIME())), 23) AS manana`);
        await sandbox.request().batch(`
            IF NOT EXISTS (SELECT 1 FROM dbo.ROLES WHERE ID_ROL='R002') INSERT dbo.ROLES VALUES ('R002','Cooperativa');
            IF NOT EXISTS (SELECT 1 FROM dbo.ROLES WHERE ID_ROL='R003') INSERT dbo.ROLES VALUES ('R003','Ventanilla');
            IF NOT EXISTS (SELECT 1 FROM dbo.ROLES WHERE ID_ROL='R004') INSERT dbo.ROLES VALUES ('R004','Controlador');
            IF NOT EXISTS (SELECT 1 FROM dbo.ROLES WHERE ID_ROL='R005') INSERT dbo.ROLES VALUES ('R005','Pasajero');
            INSERT dbo.COOPERATIVAS VALUES
                ('CTC01','Coop Uno','1890001234001','Ambato','0999999999','/','1'),
                ('CTC02','Coop Dos','1890005678001','Quito','0999999998','/','1');
            INSERT dbo.USUARIOS (ID_USU,NOM_USU,APE_USU,COR_USU,CON_USU,TEL_USU,EST_USU,ID_ROL_PER,ID_COP_PER) VALUES
                ('UGEST1','Gestor','Uno','gestor1@example.test','sin-login','099','1','R002','CTC01'),
                ('UGEST2','Gestor','Dos','gestor2@example.test','sin-login','099','1','R002','CTC02'),
                ('UCH01','Chofer','Uno','ch1@example.test','sin-login','099','1','R006','CTC01'),
                ('UCH02','Chofer','Dos','ch2@example.test','sin-login','099','1','R006','CTC01'),
                ('UCN01','Control','Uno','cn1@example.test','sin-login','099','1','R004','CTC01'),
                ('UCN02','Control','Dos','cn2@example.test','sin-login','099','1','R004','CTC01'),
                ('UVENT','Ventanilla','Uno','vent@example.test','sin-login','099','1','R003','CTC01'),
                ('UPASA','Pasajero','Uno','pasa@example.test','sin-login','099','1','R005',NULL);
            INSERT dbo.TIPOS_ASIENTOS VALUES ('TTC01','NORMAL',8);
            INSERT dbo.BUSES (ID_BUS,NUM_BUS,PLA_BUS,ANIO_BUS,NUM_PIS,EST_BUS,ID_COP_PER) VALUES
                ('BTC01','10','TBA-0010',2023,1,'ACTIVO','CTC01'),
                ('BTC02','20','TBA-0020',2024,1,'ACTIVO','CTC01'),
                ('BTC03','30','TBA-0030',2024,1,'ACTIVO','CTC01');
            INSERT dbo.ASIENTOS_BUS (ID_ASI,PIS_ASI,ID_BUS_PER,ID_TIP_PER) VALUES
                ('ATC01',1,'BTC01','TTC01'),('ATC02',1,'BTC01','TTC01'),
                ('ATC03',1,'BTC02','TTC01'),('ATC04',1,'BTC03','TTC01');
            INSERT dbo.RESOLUCIONES_ANT (ID_RES,FEC_EMI_RES,CUP_FRE_MAX,ID_COP_PER,FEC_INI_VIG_RES)
                VALUES ('RTC01','${hoy}',1,'CTC01','${hoy}');
            INSERT dbo.FRECUENCIAS (ID_FRE,CIU_ORI_FRE,CIU_DES_FRE,FEC_HOR_INI_FRE,EST_RES,ID_RES_PER)
                VALUES ('FTC01','AMBATO','QUITO','${hoy}','1','RTC01');
        `);

        // Aplicar 014 dos veces (idempotencia) y verificar reversión antes de insertar filas sin ID_RES_PER
        await run('database/scripts/014_simplificar_frecuencias_sin_resoluciones.sql');
        await run('database/scripts/014_simplificar_frecuencias_sin_resoluciones.sql');
        const migrada = (await sandbox.request().query("SELECT ID_COP_PER, NUM_RES_FRE, ID_RES_PER FROM dbo.FRECUENCIAS WHERE ID_FRE='FTC01'")).recordset[0];
        assert.deepEqual(migrada, { ID_COP_PER: 'CTC01', NUM_RES_FRE: 'RTC01', ID_RES_PER: 'RTC01' });

        await run('database/scripts/014_reversion_frecuencias_resoluciones.sql');
        await run('database/scripts/014_simplificar_frecuencias_sin_resoluciones.sql');

        await exerciseApi(sandbox, hoy, manana);
    } finally {
        if (sandbox) await sandbox.close();
        if (created) await master.request().batch(`IF DB_ID('${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END`);
        await master.close();
    }
});

async function exerciseApi(connection, hoy, manana) {
    const config = require.resolve('../backend/src/config/db');
    const prevDb = require.cache[config];
    require.cache[config] = { exports: { sql, conectarBD: async () => connection } };
    delete process.env.CC01_FRECUENCIAS;
    process.env.CC02_HOJAS_RUTA = '1';
    const { store } = require('../backend/src/security/sessionStore');
    const app = require('../backend/src/server');
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const cookies = Object.fromEntries(['UGEST1', 'UGEST2', 'UVENT', 'UPASA'].map((id) => [id, `transporte_sid=${store.create(id)}`]));
    async function http(method, url, user, body) {
        const headers = { 'X-Transport-Client': '1', 'Content-Type': 'application/json' };
        if (user) headers.Cookie = cookies[user];
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, ...(await response.json()) };
    }

    try {
        // 1. Módulo independiente de Resoluciones ANT retirado (410 Gone)
        const resGet = await http('GET', '/coop/resoluciones', 'UGEST1');
        assert.equal(resGet.status, 410);
        assert.equal(resGet.code, 'MODULO_RESOLUCIONES_ELIMINADO');

        // 2. Crear múltiples frecuencias sin RESOLUCIONES_ANT ni cupos (incluyendo intercantonal Ambato -> Baños)
        const f1 = await http('POST', '/coop/frecuencias', 'UGEST1', {
            CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'BANOS', FEC_HOR_INI_FRE: hoy, NUM_RES_FRE: 'ANT-2026-001'
        });
        assert.equal(f1.status, 201, JSON.stringify(f1));
        assert.equal(f1.frecuencia.NUM_RES_FRE, 'ANT-2026-001');
        assert.equal(f1.frecuencia.ID_COP_PER, 'CTC01');
        assert.equal(f1.frecuencia.ID_RES_PER, null);

        const f2 = await http('POST', '/coop/frecuencias', 'UGEST1', {
            CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'RIOBAMBA', FEC_HOR_INI_FRE: hoy, NUM_RES_FRE: 'ANT-2026-002'
        });
        assert.equal(f2.status, 201, JSON.stringify(f2));

        // Rechaza frecuencia sin número de resolución
        const sinRes = await http('POST', '/coop/frecuencias', 'UGEST1', {
            CIU_ORI_FRE: 'QUITO', CIU_DES_FRE: 'LOJA', FEC_HOR_INI_FRE: hoy, NUM_RES_FRE: ''
        });
        assert.equal(sinRes.status, 400);

        // 3. Aislamiento multi-cooperativa directo por ID_COP_PER
        const listaCoop2 = await http('GET', '/coop/frecuencias', 'UGEST2');
        assert.equal(listaCoop2.frecuencias.length, 0);
        assert.equal((await http('PUT', `/coop/frecuencias/${f1.frecuencia.ID_FRE}`, 'UGEST2', {
            CIU_ORI_FRE: 'QUITO', CIU_DES_FRE: 'CUENCA', FEC_HOR_INI_FRE: hoy, NUM_RES_FRE: 'HACK'
        })).status, 404);

        // 4. CC-02 funciona sin CC01_FRECUENCIAS=1 y sin cupos diarios de unidades
        assert.equal((await http('PUT', '/coop/buses/BTC01/categorias', 'UGEST1', { categorias: ['INTERPROVINCIAL'] })).status, 200);
        assert.equal((await http('PUT', '/coop/buses/BTC02/categorias', 'UGEST1', { categorias: ['INTERPROVINCIAL'] })).status, 200);
        assert.equal((await http('PUT', '/coop/buses/BTC03/categorias', 'UGEST1', { categorias: ['URBANO'] })).status, 200);
        assert.equal((await http('PUT', `/coop/frecuencias/${f1.frecuencia.ID_FRE}/categoria`, 'UGEST1', { categoria: 'INTERPROVINCIAL' })).status, 200);

        const disp = await http('GET', `/coop/hojas-ruta/disponibilidad?frecuenciaId=${f1.frecuencia.ID_FRE}&inicio=${manana}T13:00:00.000Z&fin=${manana}T16:00:00.000Z`, 'UGEST1');
        assert.equal(disp.status, 200, JSON.stringify(disp));
        assert.deepEqual(disp.buses.map((b) => b.ID_BUS), ['BTC01', 'BTC02']);
        assert.equal(disp.cupos, undefined);

        const loteId = randomUUID();
        const lotePayload = {
            idLote: loteId,
            frecuenciaId: f1.frecuencia.ID_FRE,
            inicio: `${manana}T13:00:00.000Z`,
            fin: `${manana}T16:00:00.000Z`,
            filas: [
                { busId: 'BTC01', choferId: 'UCH01', controladorId: 'UCN01', observacion: 'Turno 1' },
                { busId: 'BTC02', choferId: 'UCH02', controladorId: 'UCN02', observacion: 'Turno 2' }
            ]
        };
        const creado = await http('POST', '/coop/hojas-ruta/lotes', 'UGEST1', lotePayload);
        assert.equal(creado.status, 201, JSON.stringify(creado));
        assert.equal(creado.hojas.length, 2);

        // Idempotencia de lote
        const repetido = await http('POST', '/coop/hojas-ruta/lotes', 'UGEST1', lotePayload);
        assert.equal(repetido.status, 200);
        assert.equal(repetido.repetido, true);

        // Sigue bloqueando cruces de horario (HORARIO_EN_CONFLICTO) y bus incompatible (BUS_O_TRIPULACION_INVALIDOS)
        const cruce = await http('POST', '/coop/hojas-ruta/lotes', 'UGEST1', {
            idLote: randomUUID(), frecuenciaId: f1.frecuencia.ID_FRE,
            inicio: `${manana}T14:00:00.000Z`, fin: `${manana}T17:00:00.000Z`,
            filas: [{ busId: 'BTC01', choferId: 'UCH01', controladorId: 'UCN01' }]
        });
        assert.equal(cruce.status, 409);
        assert.equal(cruce.code, 'HORARIO_EN_CONFLICTO');

        const incompatible = await http('POST', '/coop/hojas-ruta/lotes', 'UGEST1', {
            idLote: randomUUID(), frecuenciaId: f1.frecuencia.ID_FRE,
            inicio: `${manana}T17:00:00.000Z`, fin: `${manana}T19:00:00.000Z`,
            filas: [{ busId: 'BTC03', choferId: 'UCH01', controladorId: 'UCN01' }]
        });
        assert.equal(incompatible.status, 422);
        assert.equal(incompatible.code, 'BUS_O_TRIPULACION_INVALIDOS');

        // 5. Publicación y ventas sin cupo artificial de pasajeros (pero sí evitando doble venta del mismo asiento)
        const salidas = await http('GET', '/public/salidas');
        const idHoja = creado.hojas[0].idHoja;
        assert.ok(salidas.salidas.some((s) => s.ID_HOJ === idHoja));

        const mapa = await http('GET', `/usuario/reservas/${idHoja}/asientos`);
        assert.equal(mapa.viaje.cupoPasajerosDisponible, null);

        // Dos compras en asientos distintos deben pasar ambas (sin CUPO_PASAJEROS_AGOTADO)
        const v1 = await http('POST', '/usuario/reservas', 'UPASA', {
            idHoja, idAsientos: '["ATC01"]', metodoPago: 'TRANSFERENCIA', cedulaTitular: 'UPASA'
        });
        const v2 = await http('POST', '/oficinista/boletos/ventanilla', 'UVENT', {
            ID_HOJ_PER: idHoja, ID_ASI_PER: 'ATC02', PRE_FIN_BOL: 8, MET_PAG_BOL: 'EFECTIVO'
        });
        assert.equal(v1.status, 201, JSON.stringify(v1));
        assert.equal(v2.status, 201, JSON.stringify(v2));

        // Suspender frecuencia la oculta del catálogo público
        assert.equal((await http('PATCH', `/coop/frecuencias/${f1.frecuencia.ID_FRE}/estado`, 'UGEST1', { EST_RES: '0' })).status, 200);
        const salidasDespues = await http('GET', '/public/salidas');
        assert.equal(salidasDespues.salidas.some((s) => s.ID_HOJ === idHoja), false);
    } finally {
        delete process.env.CC02_HOJAS_RUTA;
        if (prevDb) require.cache[config] = prevDb;
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
}
