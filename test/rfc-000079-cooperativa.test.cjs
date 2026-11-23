const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('RFC-000079: gestión de buses incluye carga local de foto, diseñador de plantillas, categoría única y oculta IDs internos', () => {
  const busesHtml = fs.readFileSync('frontend/src/views/cooperativa/gestion_buses.html', 'utf8');
  const busesJs = fs.readFileSync('frontend/src/js/coop_buses.js', 'utf8');

  // 1. Ocultamiento de columna Código en tabla de buses y campo codigoBus oculto
  assert.doesNotMatch(busesHtml, /<th>Código<\/th>/i);
  assert.match(busesHtml, /id="codigoBus"[^>]*type="hidden"|type="hidden"[^>]*id="codigoBus"/i);

  // 2. Carga local de fotografía del bus
  assert.ok(busesHtml.includes('id="archivoImagenBus"'));
  assert.ok(busesHtml.includes('id="btnSeleccionarFotoBus"'));
  assert.ok(busesHtml.includes('id="previewImagenBus"'));
  assert.match(busesJs, /\/coop\/buses\/imagen/);

  // 3. Diseñador de estructura y plantillas de asientos (Marco Polo, ventana, pasillo, baño, escalera, discapacidad)
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

  // 4. Categoría única por bus (radio button en lugar de múltiples checkboxes)
  assert.match(busesJs, /type="radio"\s+name="categoriaUnicaBus"/);
});

test('RFC-000079: resoluciones y frecuencias incluyen hora de salida, tarifa base, buscador combobox y ocultan IDs internos', async () => {
  const frecHtml = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  const frecJs = fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8');

  // 1. Ocultamiento de columnas Código y campos de ID interno en Resoluciones y Frecuencias
  assert.doesNotMatch(frecHtml, /<th>Código<\/th>/i);
  assert.match(frecHtml, /type="hidden"[^>]*id="codigoResolucion"|id="codigoResolucion"[^>]*type="hidden"/i);
  assert.match(frecHtml, /type="hidden"[^>]*id="codigoFrecuencia"|id="codigoFrecuencia"[^>]*type="hidden"/i);

  // 2. Campos obligatorios de Hora de salida, Tarifa base y Combobox buscador
  for (const id of [
    'horaFrecuencia',
    'tarifaBaseFrecuencia',
    'buscarOrigenTerritorial',
    'sugerenciasOrigenTerritorial',
    'buscarDestinoTerritorial',
    'sugerenciasDestinoTerritorial',
    'listaCiudadesEcuador'
  ]) {
    assert.ok(frecHtml.includes(`id="${id}"`), `Falta ${id} en resoluciones_ant.html`);
  }

  // 3. Ejecución del buscador combobox y envío de HORA_SAL_FRE y TAR_BAS_FRE
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) {
      const field = {};
      elements.set(id, {
        value: id === 'horaFrecuencia' ? '09:30' : (id === 'tarifaBaseFrecuencia' ? '7.50' : ''),
        hidden: false,
        disabled: false,
        innerHTML: '',
        textContent: '',
        events: {},
        classList: { toggle() {}, add() {}, remove() {} },
        closest: () => field,
        addEventListener(name, fn) { this.events[name] = fn; },
        replaceChildren(...options) { this.options = options; },
        reset() {}
      });
    }
    return elements.get(id);
  };

  const points = [
    { ID_PRO: '18', NOM_PRO: 'Tungurahua', ID_CAN: '1801', NOM_CAN: 'Ambato', ID_PAR: '180101', NOM_PAR: 'Matriz', ID_PUN: 10, NOM_PUN: 'Terminal Ambato', ETIQUETA: 'AMBATO' },
    { ID_PRO: '17', NOM_PRO: 'Pichincha', ID_CAN: '1701', NOM_CAN: 'Quito', ID_PAR: '170101', NOM_PAR: 'Quitumbe', ID_PUN: 20, NOM_PUN: 'Terminal Quitumbe', ETIQUETA: 'QUITO' }
  ];
  const calls = [];
  const usuario = { cooperativaId: 'CP001', accesoConfigurado: false };

  vm.runInNewContext(frecJs, {
    document: { getElementById: get, querySelectorAll: () => [] },
    URL,
    window: { location: { href: 'http://localhost:3000/src/views/cooperativa/resoluciones_ant.html' }, history: { replaceState() {} } },
    Option: function (label, value) { this.label = label; this.value = value; },
    App: {
      sesion: () => usuario,
      hoyISO: () => '2026-12-01',
      fecha: (v) => v,
      fechaInput: (v) => v || '',
      dinero: (v) => `$${Number(v).toFixed(2)}`,
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
        if (route === '/coop/resoluciones') {
          return {
            controlFrecuencias: true,
            resoluciones: [{ ID_RES: 'R0001', NUM_DOC_RES: 'ANT-2026-001', FEC_EMI_RES: '2026-01-01', FEC_INI_VIG_RES: '2026-01-01', CUP_FRE_MAX: 10, TOTAL_FRECUENCIAS: 1, EST_VIGENCIA: 'VIGENTE' }]
          };
        }
        if (route === '/coop/catalogo-territorial') return { puntos: points };
        if (options.method === 'POST') {
          calls.push({ route, body: options.body });
          return { success: true, frecuencia: { ID_FRE: 'F0001' } };
        }
        return { controlFrecuencias: true, frecuencias: [] };
      }
    }
  });

  await new Promise(setImmediate);
  get('btnNuevaFrecuencia').events.click();
  await new Promise(setImmediate);

  // Probar buscador rápido combobox de origen
  get('buscarOrigenTerritorial').value = 'ambato';
  get('buscarOrigenTerritorial').events.input();
  assert.equal(get('sugerenciasOrigenTerritorial').hidden, false);
  assert.match(get('sugerenciasOrigenTerritorial').innerHTML, /Terminal Ambato/);

  // Seleccionar sugerencia de origen y destino
  get('sugerenciasOrigenTerritorial').events.click({
    target: { closest: () => ({ dataset: { puntoId: '10' } }) }
  });
  get('sugerenciasDestinoTerritorial').events.click({
    target: { closest: () => ({ dataset: { puntoId: '20' } }) }
  });

  assert.equal(get('origenPunto').value, '10');
  assert.equal(get('destinoPunto').value, '20');

  get('resolucionFrecuencia').value = 'R0001';
  get('horaFrecuencia').value = '14:45';
  get('tarifaBaseFrecuencia').value = '6.50';
  get('cupoUnidadesFrecuencia').value = '4';

  await get('formFrecuencia').events.submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.HORA_SAL_FRE, '14:45');
  assert.equal(calls[0].body.TAR_BAS_FRE, 6.5);
  assert.equal(calls[0].body.ID_PUN_ORI, 10);
  assert.equal(calls[0].body.ID_PUN_DES, 20);
});
