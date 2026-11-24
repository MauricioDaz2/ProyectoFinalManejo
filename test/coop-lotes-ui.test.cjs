const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick = () => new Promise(setImmediate);

function setup() {
  const nodes = new Map();
  const calls = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: true, open: false, children: [], events: {},
      append(n) { this.children.push(n); }, replaceChildren() { this.children = []; },
      addEventListener(k, fn) { this.events[k] = fn; }, querySelector() { return null; }
    });
    return nodes.get(id);
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    let data;
    if (url.endsWith('/auth/me')) data = { usuario: { rolId: 'R002', permisos: ['rutas'] } };
    else if (url.endsWith('/opciones')) data = {
      lotesDisponibles: true,
      buses: [{ ID_BUS: 'BUS01', NUM_BUS: '07', PLA_BUS: 'ABC123' }],
      frecuencias: [{ ID_FRE: 'F0001', CIU_ORI_FRE: 'Ambato', CIU_DES_FRE: 'Quito' }],
      personal: [
        { ID_USU: 'DRV01', ID_ROL_PER: 'R006', NOM_USU: 'Chofer', APE_USU: 'Prueba' },
        { ID_USU: 'CON01', ID_ROL_PER: 'R004', NOM_USU: 'Controlador', APE_USU: 'Prueba' }
      ]
    };
    else if (url.includes('/disponibilidad?')) data = {
      categoria: { id: 'URBANO', nombre: 'Urbano' },
      buses: [{ ID_BUS: 'BUS01', NUM_BUS: '07', PLA_BUS: 'ABC123' }],
      personal: [
        { ID_USU: 'DRV01', ID_ROL_PER: 'R006', NOM_USU: 'Chofer', APE_USU: 'Prueba' },
        { ID_USU: 'CON01', ID_ROL_PER: 'R004', NOM_USU: 'Controlador', APE_USU: 'Prueba' }
      ]
    };
    else data = { message: 'Lote confirmado.', hojas: [{ idHoja: 'L0001' }] };
    return { ok: true, json: async () => ({ success: true, ...data }) };
  };
  const App = {
    escapar: String,
    confirmar: async () => true,
    textoBoton() {}, restaurarBoton() {}, aviso() {}
  };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_asignacion.js', 'utf8'), {
    document: { getElementById: get, createElement: () => ({}) },
    window: { API_BASE_URL: 'http://localhost:3000/api' },
    fetch, App, Date, URLSearchParams
  });
  return { get, calls };
}

test('con CC-02 la programación cambia a lote y consulta disponibilidad en UTC', async () => {
  const ui = setup();
  await tick();
  assert.equal(ui.get('coopAssignment').hidden, false);
  ui.get('coopAssignment').open = true;
  await ui.get('coopAssignment').events.toggle();

  assert.equal(ui.get('singleAssignment').hidden, true);
  assert.equal(ui.get('batchForm').hidden, false);
  assert.equal(ui.get('batchFrequency').children[1].value, 'F0001');

  for (const [id, value] of Object.entries({
    batchFrequency: 'F0001', batchStart: '2026-12-01T08:00', batchEnd: '2026-12-01T11:00'
  })) ui.get(id).value = value;

  await ui.get('batchCheck').events.click();
  const call = ui.calls.find(c => c.url.includes('/coop/hojas-ruta/disponibilidad?'));
  assert.ok(call, 'Debe consultar la disponibilidad del lote');
  const params = new URL(call.url).searchParams;
  assert.equal(params.get('frecuenciaId'), 'F0001');
  assert.equal(params.get('inicio'), '2026-12-01T13:00:00.000Z');
  assert.equal(params.get('fin'), '2026-12-01T16:00:00.000Z');
  assert.equal(ui.get('batchCategory').textContent, 'Urbano');
  assert.match(ui.get('batchSummary').textContent, /1 buses y 2 tripulantes/);
  assert.doesNotMatch(ui.get('batchSummary').textContent, /Cupo del día/);
  assert.equal(ui.get('batchSubmit').disabled, false);
});

test('el lote reutiliza el UUID ante fallos y conserva el formulario anterior sin CC-02', () => {
  const script = fs.readFileSync('frontend/src/js/coop_asignacion.js', 'utf8');
  const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  assert.match(script, /reintentoLote\s*\|\|\s*nuevoLote\(\)/);
  assert.match(script, /\/coop\/hojas-ruta\/lotes/);
  assert.match(script, /lotesDisponibles/);
  assert.match(script, /singleAssignment/);
  for (const id of ['batchForm', 'batchFrequency', 'batchStart', 'batchEnd', 'batchRows', 'batchSubmit']) {
    assert.ok(html.includes(`id="${id}"`), `Falta ${id} en el HTML`);
  }
});

test('buses y frecuencias exponen la categoría operativa en la UI', () => {
  const busesHtml = fs.readFileSync('frontend/src/views/cooperativa/gestion_buses.html', 'utf8');
  const busesJs = fs.readFileSync('frontend/src/js/coop_buses.js', 'utf8');
  const frecHtml = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  const frecJs = fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8');

  for (const id of ['modalCategoriasBus', 'categoriasBusLista', 'btnGuardarCategoriasBus']) {
    assert.ok(busesHtml.includes(`id="${id}"`), `Falta ${id} en gestión de buses`);
  }
  assert.match(busesJs, /\/coop\/categorias-operativas/);
  assert.match(busesJs, /\/categorias`/);
  assert.match(busesJs, /LOTES_NO_HABILITADOS/);

  assert.ok(frecHtml.includes('id="categoriaFrecuencia"'));
  assert.match(frecJs, /\/coop\/categorias-operativas/);
  assert.match(frecJs, /\/categoria`/);
});
