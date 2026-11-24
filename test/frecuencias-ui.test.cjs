const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('catálogo nacional de Ecuador cubre las 24 provincias y valores compatibles con varchar(15)', () => {
    const ubicaciones = JSON.parse(fs.readFileSync('frontend/src/data/ecuador_ubicaciones.json', 'utf8'));
    assert.equal(ubicaciones.length, 24);
    const valores = ubicaciones.flatMap((p) => p.ciudades.map((c) => c.valor));
    assert.ok(valores.length >= 220);
    assert.equal(new Set(valores).size, valores.length);
    for (const valor of valores) {
        assert.ok(valor.length >= 2 && valor.length <= 15, `Valor fuera de rango: ${valor}`);
    }
});

test('RFC-000078: formulario simplificado de frecuencias usa provincia/ciudad sin buscador redundante, calendario y pestaña de hojas', async () => {
    const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
    for (const removed of ['modalResolucion', 'panelResoluciones', 'cupoResolucion', 'cupoUnidadesFrecuencia', 'cupoPasajerosFrecuencia', 'codigoFrecuencia', 'buscarOrigen', 'buscarDestino']) {
        assert.equal(html.includes(`id="${removed}"`), false, `No debe existir ${removed} tras RFC-000078`);
    }
    assert.ok(html.includes('date_picker.js'), 'Debe cargar el selector visual de calendario');
    assert.ok(html.includes('data-calendar-picker'), 'Los campos de fecha deben usar data-calendar-picker');

    const ubicaciones = JSON.parse(fs.readFileSync('frontend/src/data/ecuador_ubicaciones.json', 'utf8'));
    const elements = new Map();
    const get = (id) => {
        if (id !== 'cardHojasProgramadas') {
            assert.ok(html.includes(`id="${id}"`), `Falta ${id} en el HTML`);
        }
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
    const notices = [];
    const usuario = { cooperativaId: 'CP001', accesoConfigurado: true, principal: true, permisos: ['rutas', 'salidas'] };

    vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8'), {
        document: { getElementById: get, querySelectorAll: () => [] },
        window: { ECUADOR_UBICACIONES: ubicaciones, dispatchEvent() {}, addEventListener() {} },
        Event: function (name) { this.type = name; },
        Option: function (label, value) { this.label = label; this.value = value; },
        Intl, Date,
        App: {
            sesion: () => usuario,
            hoyISO: () => '2026-11-23',
            fecha: (v) => v,
            fechaInput: (v) => v || '',
            escapar: String,
            numero: String,
            aviso: (m) => notices.push(m),
            abrirModal() {},
            cerrarModal() {},
            textoBoton() {},
            restaurarBoton() {},
            debounce: (fn) => fn,
            async api(route, options = {}) {
                assert.equal(route.startsWith('/coop/resoluciones'), false, 'No debe consultar /coop/resoluciones');
                if (route === '/auth/me') return { usuario };
                if (route === '/coop/categorias-operativas') return { categorias: [{ ID_CAT: 'INTERPROVINCIAL', NOM_CAT: 'Interprovincial' }] };
                if (route === '/coop/hojas-ruta') {
                    return {
                        hojas: [{
                            ID_HOJ: 'H0001', ID_FRE_PER: 'FD072', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'RIOBAMBA',
                            FEC_PRO_HOJ: '2026-11-24', EST_VIA_HOJ: 'PROGRAMADA', NUM_BUS: '71', PLA_BUS: 'DMO071',
                            NOM_CHOFER: 'Chofer', APE_CHOFER: 'Demo', NOM_CONTROLADOR: 'Controlador', APE_CONTROLADOR: 'Demo',
                            BOLETOS_VENDIDOS: 2, TOTAL_ASIENTOS: 40
                        }]
                    };
                }
                if (options.method === 'POST' || options.method === 'PUT') calls.push({ route, method: options.method, body: options.body });
                if (route === '/coop/frecuencias' && options.method === 'POST') return { frecuencia: { ID_FRE: 'F0002' } };
                return { frecuencias: [] };
            }
        }
    });

    await new Promise(setImmediate);

    // Pestaña de hojas programadas muestra las hojas cargadas
    assert.equal(get('badgeTotalHojas').textContent, '1');
    assert.match(get('tablaHojas').innerHTML, /H0001/);
    assert.match(get('tablaHojas').innerHTML, /Chofer Demo/);
    get('tabHojas').events.click();
    assert.equal(get('panelHojas').hidden, false);
    assert.equal(get('panelFrecuencias').hidden, true);
    get('tabFrecuencias').events.click();
    assert.equal(get('panelFrecuencias').hidden, false);

    await get('btnNuevaFrecuencia').events.click();
    await new Promise(setImmediate);

    // Selección directa por provincia y ciudad (también intercantonal Ambato -> Baños)
    get('origenProvincia').value = 'Tungurahua';
    get('origenProvincia').events.change();
    get('origenCiudad').value = 'AMBATO';
    get('origenCiudad').events.change();

    // Elegir destino directamente sin elegir provincia primero auto-selecciona su provincia
    get('destinoCiudad').value = 'BANOS';
    get('destinoCiudad').events.change();
    assert.equal(get('destinoProvincia').value, 'Tungurahua');
    assert.match(get('estadoRutaFrecuencia').textContent, /Tungurahua/);

    // Botón intercambiar invierte origen y destino
    get('btnIntercambiarRuta').events.click();
    assert.equal(get('origenCiudad').value, 'BANOS');
    assert.equal(get('destinoCiudad').value, 'AMBATO');
    get('btnIntercambiarRuta').events.click();
    assert.equal(get('origenCiudad').value, 'AMBATO');
    assert.equal(get('destinoCiudad').value, 'BANOS');

    get('categoriaFrecuencia').value = 'INTERPROVINCIAL';
    const submit = () => get('formFrecuencia').events.submit({ preventDefault() {} });

    // Exige número de resolución ANT
    await submit();
    assert.match(notices.at(-1), /resolución ANT/i);
    assert.equal(calls.length, 0);

    get('numeroResolucionFrecuencia').value = 'ANT-TUN-2026-014';
    await submit();

    assert.equal(calls[0].route, '/coop/frecuencias');
    assert.equal(calls[0].body.CIU_ORI_FRE, 'AMBATO');
    assert.equal(calls[0].body.CIU_DES_FRE, 'BANOS');
    assert.equal(calls[0].body.NUM_RES_FRE, 'ANT-TUN-2026-014');
    assert.equal(calls[0].body.ID_RES_PER, undefined);
    assert.equal(calls[0].body.MAX_UNIDADES, undefined);
    assert.equal(calls[0].body.MAX_PASAJEROS, undefined);
    assert.equal(calls[1].route, '/coop/frecuencias/F0002/categoria');
    assert.equal(calls[1].body.categoria, 'INTERPROVINCIAL');
});
