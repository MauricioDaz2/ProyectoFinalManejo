const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const sql = require('mssql');

const password = process.env.CC01_SQL_TEST_PASSWORD;
test('RFC-000070: migraciones SQL Server, vigencia, cupos concurrentes y cancelación', {
    skip: !password && 'Define CC01_SQL_TEST_PASSWORD para ejecutar contra SQL Server local.'
}, async () => {
    const root = path.join(__dirname, '..');
    const database = `RFC70_TEST_${randomBytes(5).toString('hex')}`;
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
        const migrations = ['011_frecuencias_vigencia.sql', '012_frecuencias_catalogo_cupos.sql'];
        for (let retry = 0; retry < 2; retry++) {
            for (const migration of migrations) await run(`database/scripts/${migration}`);
        }
        assert.match(await run('test/frecuencias-vigencia.sql'), /vigencia correctas/);
        assert.match(await run('test/frecuencias-cupos.sql'), /catálogo, límites/);

        async function sell(id, hoja, asiento) {
            const tx = new sql.Transaction(sandbox);
            await tx.begin();
            try {
                await tx.request().execute('dbo.cc_BloquearOperacion');
                await tx.request().input('id', sql.VarChar(5), id).input('hoja', sql.VarChar(5), hoja)
                    .input('asiento', sql.VarChar(5), asiento).query(`
                        INSERT dbo.BOLETOS (ID_BOL,ORI_TRA_BOL,DES_TRA_BOL,PRE_FIN_BOL,MET_PAG_BOL,EST_BOL,COD_QR_BOL,FEC_COM_BOL,ID_HOJ_PER,ID_ASI_PER)
                        VALUES (@id,'NORTE','OESTE',5,'EFECTIVO','RESERVADO','PRUEBA',CONVERT(date,GETDATE()),@hoja,@asiento)
                    `);
                await tx.commit();
            } catch (error) {
                await tx.rollback().catch(() => {});
                throw error;
            }
        }
        const resultados = await Promise.allSettled([sell('VTC01', 'HTC04', 'ATC01'), sell('VTC02', 'HTC05', 'ATC02')]);
        assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(resultados.find(r => r.status === 'rejected').reason.number, 51209);
        const datos = (await sandbox.request().query(`
            SELECT ID_BOL FROM dbo.BOLETOS WHERE ID_HOJ_PER IN ('HTC04','HTC05')
        `)).recordset;
        assert.equal(datos.length, 1);
        await sandbox.request().input('id', sql.VarChar(5), datos[0].ID_BOL)
            .query("UPDATE dbo.BOLETOS SET EST_BOL='CANCELADO' WHERE ID_BOL=@id");
        await sell('VTC03', 'HTC04', 'ATC03');
        await sandbox.request().query("UPDATE dbo.RESOLUCIONES_ANT SET REVOCADA_RES=1 WHERE ID_RES='RTC01'");
        await assert.rejects(sell('VTC04', 'HTC04', 'ATC01'), { number: 51208 });
        await exerciseApi(sandbox);
    } finally {
        if (sandbox) await sandbox.close();
        if (created) await master.request().batch(`DROP DATABASE [${database}]`);
        await master.close();
    }
});

async function exerciseApi(connection) {
    await connection.request().batch(`
        UPDATE dbo.RESOLUCIONES_ANT SET REVOCADA_RES=0 WHERE ID_RES='RTC01';
        INSERT dbo.ROLES VALUES ('R002','Cooperativa'),('R003','Ventanilla'),('R005','Pasajero');
        INSERT dbo.USUARIOS (ID_USU,NOM_USU,APE_USU,COR_USU,CON_USU,TEL_USU,EST_USU,ID_ROL_PER,ID_COP_PER)
        VALUES ('UGEST','Gestor','Prueba','gestor@example.test','sin-login','0','1','R002','CTC01'),
               ('UVENT','Ventanilla','Prueba','oficina@example.test','sin-login','0','1','R003','CTC01'),
               ('UPASA','Pasajero','Prueba','pasajero@example.test','sin-login','0','1','R005',NULL);
    `);
    const { recordset: [time] } = await connection.request()
        .query('SELECT CONVERT(char(10),dbo.fn_CC_FechaEcuador(SYSUTCDATETIME()),23) AS hoy');
    const { hoy } = time;
    const config = require.resolve('../backend/src/config/db');
    require.cache[config] = { exports: { sql, conectarBD: async () => connection } };
    process.env.CC01_FRECUENCIAS = '1';
    const { store } = require('../backend/src/security/sessionStore');
    const app = require('../backend/src/server');
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const cookies = Object.fromEntries(['UGEST','UVENT','UPASA'].map(id => [id, `transporte_sid=${store.create(id)}`]));
    async function http(method, url, user, body) {
        const headers = { 'X-Transport-Client': '1', 'Content-Type': 'application/json' };
        if (user) headers.Cookie = cookies[user];
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, ...(await response.json()) };
    }
    try {
        assert.equal((await http('GET', '/coop/catalogo-territorial')).status, 401);
        const opciones = await http('GET', '/coop/catalogo-territorial?nivel=punto&padreId=010101','UGEST');
        assert.deepEqual(opciones.elementos.map(p => p.etiqueta), ['NORTE','SUR']);
        const catalogo = await http('GET', '/coop/catalogo-territorial','UGEST');
        assert.equal(catalogo.puntos.length, 4);
        const resolucion = { ID_RES:'RTC02', FEC_EMI_RES:hoy, CUP_FRE_MAX:2, FEC_INI_VIG_RES:hoy };
        const invalida = await http('POST', '/coop/resoluciones','UGEST',{...resolucion,FEC_INI_VIG_RES:'2026-02-30'});
        assert.equal(invalida.code,'VIGENCIA_ANT_INVALIDA');
        const creada = await http('POST','/coop/resoluciones','UGEST',resolucion);
        assert.equal(creada.status,201,JSON.stringify(creada));
        assert.equal(creada.resolucion.FEC_INI_VIG_RES.slice(0,10),hoy);
        const frecuencia = {ID_FRE:'FTC11', ID_RES_PER:'RTC02', ID_PUN_ORI:1, ID_PUN_DES:4, MAX_UNIDADES:2, FEC_HOR_INI_FRE:hoy};
        assert.equal((await http('POST','/coop/frecuencias','UGEST',{...frecuencia,ID_PUN_DES:3})).code,'TRAYECTO_NO_ADMITIDO');
        const nueva = await http('POST','/coop/frecuencias','UGEST',frecuencia);
        assert.equal(nueva.status,201,JSON.stringify(nueva));
        assert.equal(nueva.frecuencia.CIU_DES_FRE,'OESTE');
        assert.equal((await http('PUT','/coop/frecuencias/FTC11','UGEST',{...frecuencia,MAX_UNIDADES:3})).frecuencia.MAX_UNIDADES,3);
        const disp = await http('GET',`/coop/frecuencias/FTC11/disponibilidad?fecha=${hoy}`,'UGEST');
        assert.equal(disp.disponibilidad.UNIDADES_DISPONIBLES,3);
        assert.equal((await http('PATCH','/coop/frecuencias/FTC11/estado','UGEST',{EST_RES:'0'})).frecuencia.EST_RES,'0');
        assert.equal((await http('GET','/coop/frecuencias','UGEST')).frecuencias.find(f=>f.ID_FRE==='FTC11').EST_VIGENCIA,'INACTIVA');
        assert.equal((await http('PUT','/coop/resoluciones/RTC02','UGEST',{...resolucion,REVOCADA_RES:true})).resolucion.REVOCADA_RES,true);
        assert.ok((await http('GET','/public/salidas')).salidas.some(s=>s.ID_HOJ==='HTC04'));
        const mapa = await http('GET','/usuario/reservas/HTC04/asientos');
        assert.equal(mapa.viaje.cupoPasajerosDisponible,0);

        // Diferentes asientos y hojas: el límite por frecuencia, no un asiento concreto, decide.
        await connection.request().query("UPDATE dbo.BOLETOS SET EST_BOL='CANCELADO' WHERE ID_BOL='VTC03'");
        const results = await Promise.all([
            http('POST','/usuario/reservas','UPASA',{idHoja:'HTC04',idAsientos:'["ATC01"]',metodoPago:'EFECTIVO',cedulaTitular:'UPASA'}),
            http('POST','/oficinista/boletos/ventanilla','UVENT',{ID_HOJ_PER:'HTC05',ID_ASI_PER:'ATC02',PRE_FIN_BOL:5,MET_PAG_BOL:'EFECTIVO'})
        ]);
        assert.deepEqual(results.map(x=>x.status).sort(),[201,409],JSON.stringify(results));
        assert.equal(results.find(x=>x.status===409).code,'CUPO_PASAJEROS_AGOTADO');
        await connection.request().query("UPDATE dbo.RESOLUCIONES_ANT SET REVOCADA_RES=1 WHERE ID_RES='RTC01'");
        assert.equal((await http('GET','/public/salidas')).salidas.some(s=>s.ID_HOJ==='HTC04'),false);
    } finally {
        delete process.env.CC01_FRECUENCIAS;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}
