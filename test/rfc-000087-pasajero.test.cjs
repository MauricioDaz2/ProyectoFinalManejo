const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const tick = () => new Promise(setImmediate);

function cargarControlador(columnas, filas) {
  const dbPath = require.resolve('../backend/src/config/db');
  const ctrlPath = require.resolve('../backend/src/controllers/userViajesController');
  const previo = require.cache[dbPath];
  const consultas = [];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: require('mssql'),
    conectarBD: async () => ({ request() { return { input() { return this; }, async query(q) {
      consultas.push(q);
      if (q.includes('AS HORA_TARIFA')) return { recordset: [columnas] };
      return { recordset: filas };
    } }; } })
  } };
  delete require.cache[ctrlPath];
  const ctrl = require(ctrlPath);
  delete require.cache[ctrlPath];
  if (previo) require.cache[dbPath] = previo; else delete require.cache[dbPath];
  return { ctrl, consultas };
}

function respuesta() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

test('backend: la búsqueda incluye hora de salida, tarifa base, salida planificada y foto del bus', async () => {
  const fila = { ID_HOJ: 'H0001', HORA_SAL_FRE: '07:00', TAR_BAS_FRE: 3.5, SALIDA_PLAN_UTC: '2026-12-01T12:00:00Z', IMG_URL_BUS: '/uploads/bus.png' };
  const { ctrl, consultas } = cargarControlador({ HORA_TARIFA: 1, SALIDA_PLAN: 1 }, [fila]);
  const res = respuesta();
  await ctrl.buscarViajes({ query: { origen: 'AMBATO', destino: 'QUITO', fecha: '2099-12-01' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.viajes, [fila]);
  const sqlViajes = consultas.at(-1);
  for (const col of ['F.HORA_SAL_FRE', 'F.TAR_BAS_FRE', 'H.SALIDA_PLAN_UTC', 'B.IMG_URL_BUS', 'B.PLA_BUS', 'B.NUM_PIS', 'C.NOM_COP']) assert.ok(sqlViajes.includes(col), `falta ${col}`);
  assert.match(sqlViajes, /C\.EST_COP = '1'/);
});

test('backend: sin migraciones 010/015 devuelve columnas nulas sin romper la consulta', async () => {
  const { ctrl, consultas } = cargarControlador({ HORA_TARIFA: 0, SALIDA_PLAN: 0 }, []);
  const res = respuesta();
  await ctrl.buscarViajes({ query: { origen: 'AMBATO', destino: 'QUITO', fecha: '2099-12-01' } }, res);
  assert.equal(res.statusCode, 200);
  const sqlViajes = consultas.at(-1);
  assert.match(sqlViajes, /NULL AS HORA_SAL_FRE, NULL AS TAR_BAS_FRE/);
  assert.match(sqlViajes, /NULL AS SALIDA_PLAN_UTC/);
  assert.doesNotMatch(sqlViajes, /F\.HORA_SAL_FRE/);
});

function montarCatalogo(viajes, libres = 25) {
  const nodes = new Map();
  const nodo = (sel) => {
    if (!nodes.has(sel)) nodes.set(sel, {
      sel, value: '', min: '', innerHTML: '', textContent: '', className: '', disabled: false, hidden: true, attrs: {}, events: {},
      addEventListener(k, fn) { const prev = this.events[k]; this.events[k] = prev ? (e) => { prev(e); return fn(e); } : fn; }, dispatchEvent(e) { this.events[e.type]?.(e); },
      querySelector: () => ({ disabled: false }), setAttribute(k, v) { this.attrs[k] = v; },
      requestSubmit() { this.events.submit({ preventDefault() {} }); }
    });
    return nodes.get(sel);
  };
  const document = {
    querySelector: (sel) => nodo(sel),
    querySelectorAll: () => [],
    getElementById: (id) => nodo('#' + id)
  };
  const fetch = async (url) => {
    let data;
    if (url.includes('/viajes/rutas')) data = { total: 1, rutas: [{ ORIGEN: 'AMBATO', DESTINO: 'QUITO' }] };
    else if (url.includes('/usuario/viajes?')) data = { viajes };
    else data = { asientos: Array.from({ length: 30 }, (_, i) => ({ ESTADO_ASIENTO: i < libres ? 'LIBRE' : 'OCUPADO' })), viaje: {} };
    return { ok: true, json: async () => ({ success: true, ...data }) };
  };
  class FormData { constructor() {} get(k) { return { origen: 'AMBATO', destino: 'QUITO', fecha: '2099-12-01' }[k]; } }
  vm.runInNewContext(fs.readFileSync('frontend/src/js/user_viajes.js', 'utf8'), {
    window: { API_BASE_URL: 'http://localhost:3000/api', location: { search: '?origen=AMBATO&destino=QUITO&fecha=2099-12-01', origin: 'http://localhost:5500' } },
    document, fetch, FormData, URLSearchParams, URL, Event: function (t) { this.type = t; }, Date, Intl, Number, Math, Infinity,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, encodeURIComponent
  });
  return nodo;
}

test('UI catálogo: cada viaje muestra fecha, hora de salida, precio base y botón Ver más', async () => {
  const nodo = montarCatalogo([
    { ID_HOJ: 'H0001', FEC_PRO_HOJ: '2099-12-01', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', HORA_SAL_FRE: '07:00', TAR_BAS_FRE: 3.5, SALIDA_PLAN_UTC: '2099-12-01T12:00:00Z', IMG_URL_BUS: '/uploads/bus.png', NUM_BUS: '01', PLA_BUS: 'TBA-1234', NUM_PIS: 2, NOM_COP: 'Coop <Uno>', ID_COP: 'CP001', TOTAL_ASIENTOS: 40 },
    { ID_HOJ: 'H0002', FEC_PRO_HOJ: '2099-12-01', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', HORA_SAL_FRE: '13:30', TAR_BAS_FRE: null, SALIDA_PLAN_UTC: null, IMG_URL_BUS: null, NUM_BUS: '07', PLA_BUS: null, NUM_PIS: 1, NOM_COP: 'Coop Dos', ID_COP: 'CP002', TOTAL_ASIENTOS: 52 }
  ]);
  await tick(); await tick(); await tick(); await tick();
  const html = nodo('#results').innerHTML;
  assert.equal((html.match(/class="viaje-card"/g) || []).length, 2);
  assert.match(html, /Hora de salida<\/dt><dd class="viaje-hora">07:00</, 'SALIDA_PLAN_UTC se muestra en hora de Ecuador');
  assert.match(html, /viaje-hora">13:30</);
  assert.match(html, /Precio base<\/dt><dd class="viaje-precio">\$3\.50</);
  assert.match(html, /viaje-precio">Por confirmar</);
  assert.match(html, /Coop &lt;Uno&gt;/);
  assert.match(html, /data-ver-mas="detalleViaje0"[^>]*aria-expanded="false"[^>]*>Ver más</);
  assert.match(html, /<img src="http:\/\/localhost:3000\/uploads\/bus\.png" alt="Fotografía del bus 01/);
  assert.match(html, /Placa<\/dt><dd>TBA-1234/);
  assert.match(html, /Pisos<\/dt><dd>2/);
  assert.match(html, /Asientos disponibles<\/dt><dd>25 de 40/);
  assert.match(html, /Fotografía no disponible/);
  assert.match(html, /id="detalleViaje0" hidden/);
});

test('UI catálogo: Ver más despliega y oculta el detalle del bus', async () => {
  const nodo = montarCatalogo([{ ID_HOJ: 'H0001', FEC_PRO_HOJ: '2099-12-01', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', HORA_SAL_FRE: '07:00', TAR_BAS_FRE: 3.5, NUM_BUS: '01', NOM_COP: 'Coop', ID_COP: 'CP001', TOTAL_ASIENTOS: 40 }]);
  await tick(); await tick(); await tick(); await tick();
  const panel = nodo('#detalleViaje0');
  panel.hidden = true;
  const boton = { dataset: { verMas: 'detalleViaje0' }, textContent: 'Ver más', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const click = () => nodo('#results').events.click({ target: { closest: (sel) => (sel.includes('data-ver-mas') ? boton : null) } });
  click();
  assert.equal(panel.hidden, false);
  assert.equal(boton.attrs['aria-expanded'], 'true');
  assert.equal(boton.textContent, 'Ver menos');
  click();
  assert.equal(panel.hidden, true);
  assert.equal(boton.textContent, 'Ver más');
});

test('vistas del pasajero cargan el diseño moderno y mis boletos no usa estilos en línea', () => {
  for (const vista of ['catalogo_viajes', 'seleccion_asientos', 'mis_boletos']) {
    const html = fs.readFileSync(`frontend/src/views/usuario/${vista}.html`, 'utf8');
    assert.match(html, /assets\/passenger_modern\.css/, vista);
  }
  const boletos = fs.readFileSync('frontend/src/js/user_boletos.js', 'utf8');
  assert.doesNotMatch(boletos, /style="/);
  assert.doesNotMatch(boletos, /onclick=/);
  assert.match(boletos, /data-cancelar-boleto/);
  const css = fs.readFileSync('frontend/src/assets/passenger_modern.css', 'utf8');
  for (const clase of ['.viaje-detail-panel', '.viaje-hora', '.ticket-card', '@media (max-width: 720px)']) assert.ok(css.includes(clase), clase);
});
