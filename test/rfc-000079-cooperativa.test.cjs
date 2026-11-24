const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('RFC-000079: gestiÃ³n de buses incluye carga local de foto, diseÃ±ador de plantillas, categorÃ­a Ãºnica y oculta IDs internos', () => {
  const busesHtml = fs.readFileSync('frontend/src/views/cooperativa/gestion_buses.html', 'utf8');
  const busesJs = fs.readFileSync('frontend/src/js/coop_buses.js', 'utf8');

  // 1. Ocultamiento de columna CÃ³digo en tabla de buses y campo codigoBus oculto
  assert.doesNotMatch(busesHtml, /<th>CÃ³digo<\/th>/i);
  assert.match(busesHtml, /id="codigoBus"[^>]*type="hidden"|type="hidden"[^>]*id="codigoBus"/i);

  // 2. Carga local de fotografÃ­a del bus
  assert.ok(busesHtml.includes('id="archivoImagenBus"'));
  assert.ok(busesHtml.includes('id="btnSeleccionarFotoBus"'));
  assert.ok(busesHtml.includes('id="previewImagenBus"'));
  assert.match(busesJs, /\/coop\/buses\/imagen/);

  // 3. DiseÃ±ador de estructura y plantillas de asientos (Marco Polo, ventana, pasillo, baÃ±o, escalera, discapacidad)
  for (const id of [
    'plantillaModeloBus',
    'selectModeloPlantilla',
    'btnAplicarModeloPlantilla',
    'herramientasPlantilla',
    'btnGuardarPlantillaAsientos'
  ]) {
    assert.ok(busesHtml.includes(`id="${id}"`), `Falta ${id} en gestion_buses.html`);
  }
  for (const tool of ['NORMAL', 'VIP', 'DISCAPACIDAD', 'PASILLO', 'BANO', 'ESCALERA', 'VACIO']) {
    assert.ok(busesHtml.includes(`data-tool="${tool}"`), `Falta herramienta ${tool}`);
  }
  assert.match(busesJs, /MARCO_POLO_1P/);
  assert.match(busesJs, /EJECUTIVO_2X1/);
  assert.match(busesJs, /MARCO_POLO_2P/);
  assert.match(busesJs, /\/plantilla`/);

  // 4. CategorÃ­a Ãºnica por bus (radio button en lugar de mÃºltiples checkboxes)
  assert.match(busesJs, /type="radio"\s+name="categoriaUnicaBus"/);
});


test('RFC-000079: frecuencias incluyen hora de salida y tarifa base, y ocultan IDs internos', async () => {
  const frecHtml = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  const frecJs = fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8');

  // 1. Los cÃ³digos internos (F0001, H0001) no se muestran como columna
  assert.doesNotMatch(frecHtml, /<th>CÃ³digo<\/th>/i);

  // 2. Campos de hora de salida y tarifa base en el formulario
  for (const id of ['horaFrecuencia', 'tarifaBaseFrecuencia']) {
    assert.ok(frecHtml.includes(`id="${id}"`), `Falta ${id} en resoluciones_ant.html`);
  }
  assert.match(frecHtml, /<th>Salida y tarifa<\/th>/);

  // 3. El envÃ­o incluye HORA_SAL_FRE y TAR_BAS_FRE
  const ubicaciones = JSON.parse(fs.readFileSync('frontend/src/data/ecuador_ubicaciones.json', 'utf8'));
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) {
      const field = { hidden: false };
      elements.set(id, {
        value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, required: false,
        events: {}, options: [], attrs: {},
        classList: { toggle() {}, add() {}, remove() {} },
        setAttribute(k, v) { this.attrs[k] = v; },
        closest: () => field,
        addEventListener(name, fn) { this.events[name] = fn; },
        replaceChildren(...options) { this.options = options; },
        reset() {}
      });
    }
    return elements.get(id);
  };

  const calls = [];
  const usuario = { cooperativaId: 'CP001', accesoConfigurado: true, principal: true, permisos: ['rutas', 'salidas'] };

  vm.runInNewContext(frecJs, {
    document: { getElementById: get, querySelectorAll: () => [] },
    window: { ECUADOR_UBICACIONES: ubicaciones, dispatchEvent() {}, addEventListener() {} },
    Event: function (name) { this.type = name; },
    Option: function (label, value) { this.label = label; this.value = value; },
    Intl, Date,
    App: {
      sesion: () => usuario,
      hoyISO: () => '2026-12-01',
      fecha: (v) => v,
      fechaInput: (v) => v || '',
      escapar: String,
      numero: String,
      aviso() {},
      abrirModal() {},
      cerrarModal() {},
      textoBoton() {},
      restaurarBoton() {},
      debounce: (fn) => fn,
      async api(route, options = {}) {
        if (route === '/auth/me') return { usuario };
        if (route === '/coop/categorias-operativas') return { categorias: [{ ID_CAT: 'INTERPROVINCIAL', NOM_CAT: 'Interprovincial' }] };
        if (options.method === 'POST' || options.method === 'PUT') {
          calls.push({ route, method: options.method, body: options.body });
          return { frecuencia: { ID_FRE: 'F0001' } };
        }
        if (route === '/coop/hojas-ruta') return { hojas: [] };
        return {
          frecuencias: [{
            ID_FRE: 'F0009', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO', NUM_RES_FRE: 'ANT-1',
            FEC_HOR_INI_FRE: '2026-12-01', EST_RES: '1', HORA_SAL_FRE: '06:30', TAR_BAS_FRE: 3.5
          }]
        };
      }
    }
  });

  await new Promise(setImmediate);

  // La tabla muestra hora y tarifa, pero no el cÃ³digo interno
  assert.match(get('tablaFrecuencias').innerHTML, /06:30/);
  assert.match(get('tablaFrecuencias').innerHTML, /3\.50 base/);
  assert.doesNotMatch(get('tablaFrecuencias').innerHTML, /class="mono strong"/);

  await get('btnNuevaFrecuencia').events.click();
  await new Promise(setImmediate);
  get('origenProvincia').value = 'Tungurahua';
  get('origenProvincia').events.change();
  get('origenCiudad').value = 'AMBATO';
  get('origenCiudad').events.change();
  get('destinoCiudad').value = 'BANOS';
  get('destinoCiudad').events.change();
  get('categoriaFrecuencia').value = 'INTERPROVINCIAL';
  get('numeroResolucionFrecuencia').value = 'ANT-TUN-2026-014';
  get('horaFrecuencia').value = '14:45';
  get('tarifaBaseFrecuencia').value = '6.50';

  await get('formFrecuencia').events.submit({ preventDefault() {} });
  assert.equal(calls[0].route, '/coop/frecuencias');
  assert.equal(calls[0].body.HORA_SAL_FRE, '14:45');
  assert.equal(calls[0].body.TAR_BAS_FRE, 6.5);
  assert.equal(calls[0].body.NUM_RES_FRE, 'ANT-TUN-2026-014');
});
