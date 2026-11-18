const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../frontend/src/js/coop_dashboard_data');

async function dashboard({ fail = [], overrides = {}, user = {} } = {}) {
  const nodes = new Map();
  const events = {};
  const images = [];
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', innerHTML: '', dataset: {}, events: {}, disabled: false, children: [],
      style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } },
      parentElement: { classList: { add() {}, remove() {} } },
      classList: { values: new Set(), add(key) { this.values.add(key); }, remove(key) { this.values.delete(key); }, toggle() {} },
      querySelectorAll: () => [], setAttribute() {}, replaceChildren(...children) { this.children = children; },
      addEventListener(event, callback) { this.events[event] = callback; }
    });
    return nodes.get(id);
  };
  const calls = [];
  const redirects = [];
  const session = { rolId: 'R002', nombre: 'Representante de prueba', cooperativaNombre: 'Cooperativa de prueba', cooperativaId: 'C001', cooperativaActiva: true, ...user };
  const rows = {
    '/auth/me': { usuario: session }, '/coop/buses': { buses: [] },
    '/coop/frecuencias': { frecuencias: [] }, '/coop/hojas-ruta': { hojas: [] },
    '/coop/resumen': { resumen: { TOTAL_RESOLUCIONES: 0, BOLETOS_HOY: 0, INGRESOS_HOY: 0, RESERVAS_PENDIENTES: 0 } },
    '/public/cooperativas/C001': { cooperativa: { ID_COP: 'C001' } },
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_dashboard.js', 'utf8'), {
    window: { CoopDashboardData: D, API_BASE_URL: 'http://localhost:3000/api', location: { replace: (url) => redirects.push(url) }, addEventListener(name, callback) { events[name] = callback; } },
    document: { getElementById: get, querySelectorAll: () => [], documentElement: get('html'), body: get('body'), addEventListener(name, callback) { events[name] = callback; } },
    App: {
      escapar: (value) => String(value ?? '').replaceAll('<', '&lt;'), guardarSesion() {}, fecha: (value) => String(value).slice(0, 10),
      async api(path) { calls.push(path); if (fail.includes(path)) throw new Error('Consulta fallida'); return rows[path]; }
    },
    Date, Intl, URL, URLSearchParams, Image: class { set src(value) { this.url = value; images.push(this); this.onload?.(); } }
  });
  await new Promise(setImmediate);
  return { get, calls, redirects, rows, events, images, fail };
}

test('panel R002 obtiene identidad del servidor y distingue ceros de errores', async () => {
  const panel = await dashboard({ fail: ['/coop/frecuencias'] });
  assert.equal(panel.calls[0], '/auth/me');
  assert.equal(panel.get('headerName').textContent, 'Cooperativa de prueba');
  assert.equal(panel.get('publicProfileLink').href, '../public/cooperativa.html?id=C001');
  assert.equal(panel.get('publicProfileLink').hidden, false);
  assert.equal(panel.get('totalBuses').textContent, '0');
  assert.equal(panel.get('totalSalidas').textContent, '0');
  assert.equal(panel.get('totalRutas').textContent, 'No disponible');
  assert.match(panel.get('fleetCards').innerHTML, /Todavía no hay buses/);
  assert.match(panel.get('tablaSalidas').innerHTML, /No hay próximas salidas/);
  assert.equal(panel.get('btnActualizar').disabled, false);
});

test('sin cooperativa activa o con otro rol no consulta los datos privados', async () => {
  const inactive = await dashboard({ user: { cooperativaActiva: false } });
  assert.deepEqual(inactive.calls, ['/auth/me']);
  assert.equal(inactive.get('totalBuses').textContent, 'No disponible');
  assert.equal(inactive.get('publicProfileLink').hidden, true);
  const other = await dashboard({ user: { rolId: 'R001' } });
  assert.deepEqual(other.calls, ['/auth/me']);
  assert.deepEqual(other.redirects, ['../auth/login.html']);
});

function publishedCompany(id, primary = '#601070', secondary = '#ffffff') {
  return {
    cooperativa: { ID_COP: id, NOM_COP: `Marca ${id}`, LOG_URL_COP: `/api/public/cooperativas/${id}/imagenes/logo` },
    contenido: { principal: primary, secundario: secondary, portada: `/api/public/cooperativas/${id}/imagenes/portada` }
  };
}

test('gestor con permiso solo de Dashboard consulta indicadores sin abrir módulos privados', async () => {
  const panel = await dashboard({ user: { accesoConfigurado: true, principal: false, permisos: ['dashboard'] }, overrides: { '/coop/indicadores': { indicadores: { BUSES: 3, ACTIVOS: 2, RUTAS: 4, FRECUENCIAS: 5, SALIDAS: 1 } } } });
  assert.equal(panel.get('totalBuses').textContent, '3');
  assert.equal(panel.get('totalRutas').textContent, '4');
  assert.equal(panel.get('totalFrecuencias').textContent, '5');
  assert.equal(panel.get('totalSalidas').textContent, '1');
  assert.deepEqual(panel.calls.filter((p) => p.startsWith('/coop/')), ['/coop/indicadores']);
});

test('R002 aplica la identidad publicada propia sin cambiar usuario, barra lateral ni operaciones', async () => {
  for (const [id, primary, secondary] of [['CP001', '#601070', '#ffffff'], ['CP002', '#103971', '#cf082a']]) {
    const panel = await dashboard({ user: { cooperativaId: id }, overrides: { [`/public/cooperativas/${id}`]: publishedCompany(id, primary, secondary) } });
    assert.equal(panel.get('headerName').textContent, `Marca ${id}`);
    assert.equal(panel.get('heroName').textContent, `Marca ${id}`);
    assert.equal(panel.get('previewName').textContent, `Marca ${id}`);
    assert.equal(panel.get('representative').textContent, 'Representante de prueba');
    assert.equal(panel.get('coopWorkspace').style['--coop-primary'], primary);
    assert.equal(panel.get('coopWorkspace').style['--coop-secondary'], secondary);
    assert.equal(panel.get('coopSidebar').style['--coop-primary'], undefined);
    assert.equal(panel.get('html').style['--coop-primary'], undefined);
    for (const target of ['headerLogo', 'heroLogo', 'previewLogo']) assert.equal(panel.get(target).children[0].url, `http://localhost:3000/api/public/cooperativas/${id}/imagenes/logo`);
    for (const target of ['heroCover', 'previewCover']) assert.equal(panel.get(target).children[0].url, `http://localhost:3000/api/public/cooperativas/${id}/imagenes/portada`);
    assert.equal(panel.get('totalBuses').textContent, '0');
    assert.ok(panel.calls.every((path) => !path.includes('/coop/perfil')));
  }
});

test('rechaza una identidad ajena y mantiene el diseño neutro sin publicación', async () => {
  for (const response of [{ cooperativa: { ID_COP: 'C001' } }, publishedCompany('OTHER')]) {
    const panel = await dashboard({ overrides: { '/public/cooperativas/C001': response } });
    assert.equal(panel.get('headerName').textContent, 'Cooperativa de prueba');
    assert.equal(panel.get('coopWorkspace').classList.values.has('has-published-identity'), false);
    assert.equal(panel.get('heroCover').children.length, 0);
    assert.equal(panel.get('coopWorkspace').style['--coop-primary'], undefined);
    assert.equal(panel.get('totalBuses').textContent, '0');
  }
});

test('actualizar y regresar del historial releen la publicación, sin conservar imágenes anteriores', async () => {
  const panel = await dashboard({ overrides: { '/public/cooperativas/C001': publishedCompany('C001') } });
  const oldImage = panel.get('heroCover').children[0];
  panel.rows['/public/cooperativas/C001'] = publishedCompany('C001', '#103971', '#cf082a');
  panel.rows['/public/cooperativas/C001'].contenido.portada = '/nueva-portada.png';
  await panel.get('btnActualizar').events.click();
  assert.equal(panel.get('coopWorkspace').style['--coop-primary'], '#103971');
  oldImage.onload();
  assert.equal(panel.get('heroCover').children[0].url, 'http://localhost:3000/nueva-portada.png');
  panel.fail.push('/public/cooperativas/C001');
  panel.events.pageshow({ persisted: true });
  await new Promise(setImmediate);
  assert.equal(panel.get('coopWorkspace').style['--coop-primary'], undefined);
  assert.equal(panel.get('heroCover').children.length, 0);
  assert.equal(panel.get('totalBuses').textContent, '0');
  assert.match(panel.get('panelStatus').textContent, /no est/);
});

test('fallos de programación y resumen no borran conteos válidos', async () => {
  const panel = await dashboard({ fail: ['/coop/hojas-ruta', '/coop/resumen'] });
  assert.equal(panel.get('totalBuses').textContent, '0');
  assert.equal(panel.get('totalSalidas').textContent, 'No disponible');
  assert.equal(panel.get('totalIngresos').textContent, 'No disponible');
  assert.match(panel.get('tablaSalidas').innerHTML, /No disponible/);
});

test('rutas activas son pares únicos; salidas se ordenan y limitan a cinco', () => {
  const routes = D.frequencies([
    { EST_RES: '1', CIU_ORI_FRE: 'Quito', CIU_DES_FRE: 'Ambato' },
    { EST_RES: '1', CIU_ORI_FRE: ' QUITO ', CIU_DES_FRE: 'AMBATO' },
    { EST_RES: '0', CIU_ORI_FRE: 'Quito', CIU_DES_FRE: 'Cuenca' }
  ]);
  assert.equal(routes.count, 2);
  assert.equal(routes.routes.length, 1);
  const trips = D.trips(Array.from({ length: 9 }, (_, index) => ({ ID_HOJ: `H00${index}`, FEC_PRO_HOJ: `2026-11-${20 - index}T00:00:00Z`, EST_VIA_HOJ: index === 4 ? 'CANCELADA' : 'PROGRAMADA' })), '2026-11-14');
  assert.equal(trips.today, 1);
  assert.equal(trips.upcoming.length, 5);
  assert.match(trips.upcoming[0].FEC_PRO_HOJ, /2026-11-14/);
  assert.throws(() => D.trips([{ ID_HOJ: 'H001' }], '2026-11-14'));
  assert.throws(() => D.number(null));
  assert.throws(() => D.number('12'));
});

test('la integración envía cookie y cabecera solo a la API, conservando FormData y Request', async () => {
  const calls = [];
  const window = { fetch: async (...args) => { calls.push(args); return { ok: true }; } };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/transport_session.js', 'utf8'), {
    window, URL, Request, Headers, AbortSignal,
    location: { hostname: '127.0.0.1', href: 'http://127.0.0.1:3000/src/views/auth/login.html' },
    document: { addEventListener() {} }
  });
  const body = new FormData();
  body.set('comprobante', 'prueba');
  await window.fetch('http://localhost:3000/api/usuario/reservas', { method: 'POST', body });
  assert.equal(calls[0][0], 'http://127.0.0.1:3000/api/usuario/reservas');
  assert.equal(calls[0][1].body, body);
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].headers.get('X-Transport-Client'), '1');
  assert.equal(calls[0][1].headers.get('Content-Type'), null);
  await window.fetch(new Request('http://localhost:3000/api/auth/login', { method: 'POST', body: 'test' }));
  assert.equal(calls[1][0].method, 'POST');
  assert.equal(await calls[1][0].text(), 'test');
  await window.fetch('https://external.example/image.jpg');
  assert.equal(calls[2][0], 'https://external.example/image.jpg');
  assert.equal(calls[2][1].credentials, undefined);
});
