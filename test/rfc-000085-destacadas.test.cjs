const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Base simulada en memoria: CP001 y CP002 con frecuencias propias.
function crearBase({ instalado = true } = {}) {
  const db = {
    cooperativas: { CP001: { limite: 0, activa: true, nombre: 'Coop Uno' }, CP002: { limite: 5, activa: true, nombre: 'Coop Dos' } },
    frecuencias: {
      F0001: { cop: 'CP001', dest: false }, F0002: { cop: 'CP001', dest: false },
      F0003: { cop: 'CP001', dest: false }, F0004: { cop: 'CP002', dest: false }
    },
    escrituras: 0
  };
  const usadas = (cop) => Object.values(db.frecuencias).filter((f) => f.cop === cop && f.dest).length;
  const ejecutar = async (query, p) => {
    if (query.includes('DESTACADAS_INSTALADAS')) return { recordset: [{ DESTACADAS_INSTALADAS: instalado ? 1 : 0 }] };
    if (query.includes('AS HORA_TARIFA')) return { recordset: [{ HORA_TARIFA: 1 }] };
    if (query.startsWith('UPDATE dbo.COOPERATIVAS')) { db.escrituras++; db.cooperativas[p.cooperativa].limite = p.limite; return { recordset: [] }; }
    if (query.startsWith('UPDATE dbo.FRECUENCIAS')) {
      const f = db.frecuencias[p.frecuencia];
      assert.equal(f.cop, p.cooperativa, 'el UPDATE filtra por ID_COP_PER');
      db.escrituras++; f.dest = p.destacada; return { recordset: [] };
    }
    if (query.includes('F.ES_DESTACADA AS actual')) {
      const c = db.cooperativas[p.cooperativa]; const f = db.frecuencias[p.frecuencia];
      if (!c || !f || f.cop !== p.cooperativa) return { recordset: [] };
      return { recordset: [{ limite: c.limite, usadas: usadas(p.cooperativa), actual: f.dest }] };
    }
    if (query.includes('SELECT C.ID_COP')) {
      return { recordset: db.cooperativas[p.cooperativa] ? [{ ID_COP: p.cooperativa, usadas: usadas(p.cooperativa) }] : [] };
    }
    if (query.includes('C.LIM_DES_COP AS limite')) {
      const c = db.cooperativas[p.cooperativa];
      return { recordset: c ? [{ limite: c.limite, usadas: usadas(p.cooperativa) }] : [] };
    }
    if (query.includes('WHERE F.ES_DESTACADA = 1')) {
      return { recordset: Object.entries(db.frecuencias).filter(([, f]) => f.dest && db.cooperativas[f.cop].activa)
        .map(([id, f]) => ({ ID_FRE: id, CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', HORA_SAL_FRE: '07:00', TAR_BAS_FRE: 3.5, ID_COP: f.cop, NOM_COP: db.cooperativas[f.cop].nombre })) };
    }
    throw new Error('Consulta no simulada: ' + query.slice(0, 80));
  };
  class Request {
    constructor() { this.p = {}; }
    input(n, t, v) { this.p[n] = v; return this; }
    query(q) { return ejecutar(q.trim(), this.p); }
  }
  class Transaction { async begin() {} async commit() {} async rollback() {} }
  const tipo = () => 'tipo';
  const sql = { VarChar: tipo, Int: 'int', Bit: 'bit', ISOLATION_LEVEL: { SERIALIZABLE: 1 }, Request, Transaction };
  const pool = { request: () => new Request() };
  return { db, pool, sql };
}

function cargarServicio(sql) {
  const dbPath = require.resolve('../backend/src/config/db');
  const servicePath = require.resolve('../backend/src/services/featuredFrequencies');
  const previo = require.cache[dbPath];
  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql, conectarBD: async () => null } };
  const servicio = require(servicePath);
  delete require.cache[servicePath];
  if (previo) require.cache[dbPath] = previo; else delete require.cache[dbPath];
  return servicio;
}

test('reglas puras: límite válido, lectura de marca y cupo', () => {
  const { sql } = crearBase();
  const S = cargarServicio(sql);
  assert.equal(S.validarLimite('5'), 5);
  assert.equal(S.validarLimite(0), 0);
  for (const malo of ['-1', '2.5', 'abc', '51', '']) assert.equal(S.validarLimite(malo), null);
  assert.equal(S.leerDestacada(true), true);
  assert.equal(S.leerDestacada('0'), false);
  assert.equal(S.leerDestacada('quizas'), null);
  assert.equal(S.evaluarCupo({ limite: 2, usadas: 2, yaDestacada: false, destacar: true }).permitido, false);
  assert.equal(S.evaluarCupo({ limite: 2, usadas: 2, yaDestacada: true, destacar: true }).permitido, true);
  assert.equal(S.evaluarCupo({ limite: 2, usadas: 2, yaDestacada: true, destacar: false }).permitido, true);
  assert.match(S.evaluarCupo({ limite: 0, usadas: 0, yaDestacada: false, destacar: true }).message, /no tiene frecuencias destacadas contratadas/);
});

test('verificación: Admin habilita 2 para CP001, la 3.ª se bloquea y al desmarcar se elige otra', async () => {
  const { db, pool, sql } = crearBase();
  const S = cargarServicio(sql);
  assert.deepEqual(await S.setLimit(pool, 'cp001', '2'), { limite: 2, usadas: 0 });
  assert.equal((await S.toggle(pool, 'CP001', 'F0001', true)).usadas, 1);
  assert.equal((await S.toggle(pool, 'CP001', 'F0002', true)).usadas, 2);
  await assert.rejects(S.toggle(pool, 'CP001', 'F0003', true), (e) => e.status === 409 && e.limite === 2 && e.usadas === 2 && /2 de 2/.test(e.message));
  assert.equal(db.frecuencias.F0003.dest, false);
  assert.equal((await S.toggle(pool, 'CP001', 'F0001', false)).usadas, 1);
  assert.equal((await S.toggle(pool, 'CP001', 'F0003', true)).usadas, 2);
  const portada = await S.publicList(pool);
  assert.deepEqual(portada.map((f) => f.ID_FRE).sort(), ['F0002', 'F0003']);
});

test('aislamiento: una cooperativa no puede marcar frecuencias de otra', async () => {
  const { db, pool, sql } = crearBase();
  const S = cargarServicio(sql);
  await assert.rejects(S.toggle(pool, 'CP001', 'F0004', true), (e) => e.status === 404);
  assert.equal(db.frecuencias.F0004.dest, false);
  assert.equal(db.escrituras, 0);
});

test('el límite no puede bajar por debajo de las destacadas en uso y valida rangos', async () => {
  const { pool, sql } = crearBase();
  const S = cargarServicio(sql);
  await S.toggle(pool, 'CP002', 'F0004', true);
  await assert.rejects(S.setLimit(pool, 'CP002', 0), (e) => e.status === 409 && e.usadas === 1);
  await assert.rejects(S.setLimit(pool, 'CP002', 99), (e) => e.status === 400);
  await assert.rejects(S.setLimit(pool, 'XX9', 1), (e) => e.status === 404);
  assert.deepEqual(await S.summary(pool, 'CP002'), { disponible: true, limite: 5, usadas: 1 });
});

test('sin migración 019 el módulo responde de forma segura', async () => {
  const { pool, sql } = crearBase({ instalado: false });
  const S = cargarServicio(sql);
  assert.deepEqual(await S.summary(pool, 'CP001'), { disponible: false, limite: 0, usadas: 0 });
  assert.deepEqual(await S.publicList(pool), []);
  await assert.rejects(S.toggle(pool, 'CP001', 'F0001', true), (e) => e.status === 409 && e.code === 'DESTACADAS_NO_INSTALADAS');
});

test('migración 019 es aditiva, transaccional e idempotente y tiene reversión', () => {
  const sqlText = fs.readFileSync('database/scripts/019_frecuencias_destacadas.sql', 'utf8');
  assert.match(sqlText, /SET XACT_ABORT ON/);
  assert.match(sqlText, /BEGIN TRANSACTION[\s\S]*COMMIT TRANSACTION[\s\S]*ROLLBACK TRANSACTION/);
  assert.match(sqlText, /IF COL_LENGTH\('dbo\.COOPERATIVAS', 'LIM_DES_COP'\) IS NULL[\s\S]*LIM_DES_COP int NOT NULL[\s\S]*DEFAULT 0/);
  assert.match(sqlText, /IF COL_LENGTH\('dbo\.FRECUENCIAS', 'ES_DESTACADA'\) IS NULL[\s\S]*ES_DESTACADA bit NOT NULL[\s\S]*DEFAULT 0/);
  assert.match(sqlText, /CREATE OR ALTER TRIGGER dbo\.TR_RFC085_CupoDestacadas/);
  assert.doesNotMatch(sqlText, /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i, 'no destruye datos');
  const reversion = fs.readFileSync('database/scripts/019_reversion_frecuencias_destacadas.sql', 'utf8');
  assert.match(reversion, /DROP TRIGGER dbo\.TR_RFC085_CupoDestacadas/);
  assert.match(reversion, /IF COL_LENGTH\('dbo\.FRECUENCIAS', 'ES_DESTACADA'\) IS NOT NULL/);
});

test('rutas: endpoints de admin, cooperativa y portada registrados', () => {
  const admin = fs.readFileSync('backend/src/routes/adminCooperativaRoutes.js', 'utf8');
  assert.match(admin, /router\.put\('\/:id\/destacadas', actualizarDestacadas\)/);
  const coop = fs.readFileSync('backend/src/routes/coopBusRoutes.js', 'utf8');
  assert.match(coop, /router\.put\('\/frecuencias\/:id\/destacada', destacarFrecuencia\)/);
  const publico = fs.readFileSync('backend/src/routes/publicRoutes.js', 'utf8');
  assert.match(publico, /router\.get\('\/destacadas', destacadas\)/);
});

test('UI portada: Rutas destacadas muestra solo destacadas con insignia', async () => {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', min: '', innerHTML: '', textContent: '', disabled: false, children: [], events: {},
      replaceChildren(...c) { this.children = c; }, append(...c) { this.children.push(...c); }, addEventListener(k, fn) { this.events[k] = fn; }, reportValidity: () => true });
    return nodes.get(id);
  };
  const respuestas = {
    '/usuario/viajes/rutas': { rutas: [{ ORIGEN: 'AMBATO', DESTINO: 'QUITO' }, { ORIGEN: 'CUENCA', DESTINO: 'LOJA' }] },
    '/public/destacadas': { destacadas: [{ ID_FRE: 'F0001', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', HORA_SAL_FRE: '07:00', TAR_BAS_FRE: 3.5, NOM_COP: 'Coop <Uno>' }] },
    '/public/salidas': { salidas: [] },
    '/public/cooperativas': { cooperativas: [] }
  };
  const fetch = async (url) => {
    const ruta = Object.keys(respuestas).find((r) => url.endsWith(r));
    return { ok: true, json: async () => ({ success: true, ...(respuestas[ruta] || {}) }) };
  };
  const document = { getElementById: get, createElement: () => ({ append() {}, addEventListener() {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
  class Option { constructor(t, v) { this.text = t; this.value = v; } }
  vm.runInNewContext(fs.readFileSync('frontend/src/js/public_home.js', 'utf8'), {
    window: { API_BASE_URL: 'http://api', addEventListener() {}, location: {} }, document, fetch, Option, Intl, Date, URLSearchParams, AbortSignal, Set, location: {}, setTimeout, clearTimeout
  });
  await new Promise(setImmediate); await new Promise(setImmediate);
  const html = get('routes').innerHTML;
  assert.match(html, /★ Destacado · Patrocinado/);
  assert.match(html, /AMBATO → QUITO/);
  assert.match(html, /Coop &lt;Uno&gt;/);
  assert.match(html, /\$3\.50/);
  assert.doesNotMatch(html, /CUENCA/, 'no muestra rutas genéricas no destacadas');
});

test('UI cooperativa: estrella marca/desmarca y muestra error al superar el cupo', async () => {
  const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  assert.match(html, /id="cupoDestacadas"/);
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, events: {}, options: [], attrs: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute(k, v) { this.attrs[k] = v; },
      closest: () => ({ hidden: false }), addEventListener(n, fn) { this.events[n] = fn; }, replaceChildren(...o) { this.options = o; }, reset() {}
    });
    return elements.get(id);
  };
  const usuario = { cooperativaId: 'CP001', accesoConfigurado: true, principal: true, permisos: ['rutas', 'salidas'] };
  const frecuencias = [
    { ID_FRE: 'F0001', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', EST_RES: '1', ES_DESTACADA: true },
    { ID_FRE: 'F0002', CIU_ORI_FRE: 'QUITO', CIU_DES_FRE: 'AMBATO', EST_RES: '1', ES_DESTACADA: false }
  ];
  const puts = [];
  vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8'), {
    document: { getElementById: get, querySelectorAll: () => [] },
    window: { ECUADOR_UBICACIONES: [], dispatchEvent() {}, addEventListener() {} },
    Event: function (n) { this.type = n; }, Option: function (l, v) { this.label = l; this.value = v; }, Intl, Date,
    encodeURIComponent,
    App: {
      sesion: () => usuario, hoyISO: () => '2026-11-24', fecha: (v) => v, fechaInput: (v) => v || '', escapar: String, numero: String,
      aviso() {}, abrirModal() {}, cerrarModal() {}, textoBoton() {}, restaurarBoton() {}, debounce: (fn) => fn,
      async api(route, options = {}) {
        if (route === '/auth/me') return { usuario };
        if (route === '/coop/frecuencias') return { frecuencias, destacadas: { disponible: true, limite: 1, usadas: 1 } };
        if (route.endsWith('/destacada')) {
          puts.push({ route, body: options.body });
          if (route.includes('F0002')) { const e = new Error('Ya usas 1 de 1 frecuencias destacadas contratadas.'); e.status = 409; e.datos = { limite: 1, usadas: 1 }; throw e; }
          return { destacada: false, limite: 1, usadas: 0, message: 'Frecuencia quitada de destacadas.' };
        }
        return { frecuencias: [], hojas: [], categorias: [] };
      }
    }
  });
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(get('cupoDestacadas').hidden, false);
  assert.match(get('cupoDestacadas').textContent, /1 de 1 contratadas/);
  assert.match(get('tablaFrecuencias').innerHTML, /data-accion-frecuencia="destacar" data-id="F0001" aria-pressed="true"/);
  const click = (id) => get('tablaFrecuencias').events.click({ target: { closest: (sel) => sel.includes('data-accion-frecuencia') ? { dataset: { accionFrecuencia: 'destacar', id } } : null } });

  click('F0002');
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(puts[0]), JSON.stringify({ route: '/coop/frecuencias/F0002/destacada', body: { destacada: true } }));
  assert.match(get('avisoGlobal').innerHTML, /1 de 1 frecuencias destacadas contratadas/);

  click('F0001');
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(puts[1].body), '{"destacada":false}');
  assert.match(get('cupoDestacadas').textContent, /0 de 1 contratadas/);
  assert.match(get('tablaFrecuencias').innerHTML, /data-id="F0001" aria-pressed="false"/);
});
