const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../frontend/src/js/admin_dashboard_data.js');

async function dashboard({ fail = [], authorized = true, overrides = {}, sold = 0 } = {}) {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', innerHTML: '', disabled: false, events: {},
      classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
      prepend() {}, append() {}, addEventListener(event, callback) { this.events[event] = callback; }
    });
    return nodes.get(id);
  };
  const calls = [];
  const rows = {
    '/admin/cooperativas': { cooperativas: [{ EST_COP: '1' }, { EST_COP: '0' }] },
    '/admin/usuarios': { usuarios: [{ ID_ROL_PER: 'R003' }, { ID_ROL_PER: 'R004' }, { ID_ROL_PER: 'R001' }] },
    '/admin/parada/flota': { buses: [] },
    '/admin/rutas/frecuencias': { frecuencias: [] },
    '/admin/rutas/hojas': { hojas: [] },
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/admin_shell.js', 'utf8')+'\n'+fs.readFileSync('frontend/src/js/admin_dashboard.js', 'utf8'), {
    location:{pathname:'/frontend/src/views/admin/dashboard.html'},
    window: { DashboardData: D }, Date, Intl, AbortSignal,
    document: { documentElement: { classList: { contains: () => authorized } }, getElementById: get, querySelector: get, querySelectorAll: () => [], createElement: () => get('created') },
    fetch: async (url) => {
      const route = url.replace('http://localhost:3000/api', '');
      calls.push(route);
      if (fail.includes(route.split('?')[0]) || fail.includes('*')) throw new Error('Consulta fallida');
      const data = route.startsWith('/oficinista/resumen') ? { fecha: new URL(url).searchParams.get('fecha'), resumen: { VENDIDOS_HOY: sold } } : rows[route];
      assert.ok(data, `Ruta inesperada: ${route}`);
      return { ok: true, json: async () => ({ success: true, ...data }) };
    }
  });
  await new Promise(setImmediate);
  return { get, calls };
}

test('Dashboard conserva conteos previos, ceros reales y estados vacíos sin gráficas ficticias', async () => {
  const app = await dashboard();
  for (const [id, value] of Object.entries({ metricCooperativas: '2', metricCooperativasActivas: '1', metricOficinistas: '1', metricControladores: '1', metricPersonal: '2', metricBuses: '0', metricRutas: '0' })) assert.equal(app.get(id).textContent, value);
  assert.match(app.get('salesContent').innerHTML, /No hay boletos vendidos/);
  assert.doesNotMatch(app.get('salesContent').innerHTML, /<svg/);
  assert.match(app.get('tripsEmpty').innerHTML, /No hay próximas salidas/);
  assert.equal(app.get('tripsTable').hidden, true);
  assert.equal(app.get('occupancyCard').hidden, true);
  assert.match(app.get('operationalStatus').innerHTML, /1 activas · 1 inactivas/);
  assert.match(app.get('operationalStatus').innerHTML, /No hay buses registrados/);
  assert.match(app.get('operationalStatus').innerHTML, /No hay rutas registradas/);
});

test('error de hojas no borra contadores válidos ni presenta ocupación estimada', async () => {
  const app = await dashboard({ fail: ['/admin/rutas/hojas'] });
  assert.equal(app.get('metricCooperativas').textContent, '2');
  assert.equal(app.get('occupancyCard').hidden, true);
  assert.equal(app.get('occupancyContent').innerHTML, '');
  assert.match(app.get('tripsEmpty').innerHTML, /No disponible/);
  assert.equal(app.get('btnActualizarDashboard').disabled, false);
});

test('fallo total presenta No disponible, nunca cero inventado', async () => {
  const app = await dashboard({ fail: ['*'] });
  for (const id of ['metricCooperativas', 'metricBuses', 'metricPersonal', 'metricRutas']) assert.equal(app.get(id).textContent, 'No disponible');
  assert.match(app.get('salesContent').innerHTML, /No disponible/);
  assert.match(app.get('estadoDashboard').textContent, /No se pudieron consultar/);
  assert.doesNotMatch(app.get('operationalStatus').innerHTML, /No hay/);
  assert.match(app.get('operationalStatus').innerHTML, /No disponible/);
});

test('sin autorización del layout no se consultan APIs administrativas', async () => {
  assert.equal((await dashboard({ authorized: false })).calls.length, 0);
});

test('menú conserva las cinco opciones y el HTML respeta el orden solicitado', async () => {
  const app = await dashboard();
  for (const link of ['cooperativas.html', 'parada_buses.html', 'hojas_ruta.html', 'usuarios.html#oficinistas', 'usuarios.html#controladores']) assert.ok(app.get('adminSidebar').innerHTML.includes(`href="${link}"`));
  const html = fs.readFileSync('frontend/src/views/admin/dashboard.html', 'utf8');
  assert.doesNotMatch(html, /Accesos rápidos|shortcuts-card/);
  const positions = ['operationTitle', 'tripsTitle', 'salesTitle', 'occupancyTitle'].map((id) => html.indexOf(`aria-labelledby="${id}"`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /id="occupancyCard"[^>]*hidden/);
});

test('muestra salidas y gráficos solo con datos completos; un fallo posterior retira la ocupación', async () => {
  const fail = [];
  const app = await dashboard({ fail, sold: 3, overrides: {
    '/admin/rutas/hojas': { hojas: [{ ID_HOJ: 'H1', FEC_PRO_HOJ: D.date(), EST_VIA_HOJ: 'PROGRAMADA', NOM_COP: 'Prueba unitaria', CIU_ORI_FRE: 'Origen', CIU_DES_FRE: 'Destino', NUM_BUS_PER: 'B1' }] },
    '/usuario/reservas/H1/asientos': { asientos: [{ ID_ASI: 'A1', ESTADO_ASIENTO: 'OCUPADO' }, { ID_ASI: 'A2', ESTADO_ASIENTO: 'LIBRE' }] }
  } });
  assert.equal(app.get('tripsTable').hidden, false);
  assert.equal(app.get('tripsEmpty').hidden, true);
  assert.match(app.get('tripsBody').innerHTML, /PROGRAMADA/);
  assert.doesNotMatch(app.get('tripsBody').innerHTML, /00:00/);
  assert.match(app.get('salesContent').innerHTML, /<svg/);
  assert.equal(app.get('occupancyCard').hidden, false);
  assert.match(app.get('occupancyContent').innerHTML, /50%/);
  fail.push('/usuario/reservas/H1/asientos');
  await app.get('btnActualizarDashboard').events.click();
  assert.equal(app.get('occupancyCard').hidden, true);
  assert.equal(app.get('occupancyContent').innerHTML, '');
  assert.equal(app.get('tripsTable').hidden, false);
  assert.match(app.get('operationalStatus').innerHTML, /Ocupación de asientos/);
});
