const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function catalog(user = null, failSeats = false, cooperative = null, wrongCompany = false, savedSearch = '') {
    const elements = new Map();
    const storage = new Map();
    if (savedSearch) storage.set('publicTripSearch', savedSearch);
    const element = (selector) => {
        if (!elements.has(selector)) elements.set(selector, {
            value: '', textContent: '', innerHTML: '', listeners: {},
            addEventListener(event, callback) { this.listeners[event] = callback; },
            dispatchEvent(event) { return this.listeners[event.type]?.(event); },
            querySelector: (name) => element(`${selector} ${name}`),
            requestSubmit() { this.submission = this.listeners.submit({ preventDefault() {} }); }
        });
        return elements.get(selector);
    };
    const location = { search: '?origen=Origen&destino=Destino&fecha=2099-01-01&pasajeros=2', href: '' };
    if (cooperative !== null) location.search += `&cooperativa=${cooperative}`;
    if (savedSearch) location.search = '';
    const calls = [];
    const context = {
        document: { querySelector: element, querySelectorAll: () => [] }, window: { location, TransportSession: { current: async () => user } },
        localStorage: { getItem: () => user ? JSON.stringify(user) : null, removeItem() {} },
        sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
        URLSearchParams, Date, Event, console,
        FormData: class { get(key) { return element(`#${key}`).value; } },
        fetch: async (url) => {
            calls.push(url);
            let data;
            if (url.includes('/rutas')) data = { success: true, total: 1, rutas: [{ ORIGEN: 'Origen', DESTINO: 'Destino' }] };
            else if (url.includes('/asientos')) {
                if (failSeats) return { ok: false, json: async () => ({ success: false }) };
                data = { success: true, asientos: [{ ESTADO_ASIENTO: 'LIBRE' }, { ESTADO_ASIENTO: url.includes('/H1/') ? 'LIBRE' : 'OCUPADO' }] };
            } else data = { success: true, total: 2, viajes: ['H1', 'H2'].map((id) => ({ ID_COP: wrongCompany ? 'CP999' : cooperative, ID_HOJ: id, CIU_ORI_FRE: 'Origen', CIU_DES_FRE: 'Destino', NOM_COP: 'Cooperativa de prueba unitaria', TOTAL_ASIENTOS: 2 })) };
            return { ok: true, json: async () => data };
        }
    };
    vm.runInNewContext(fs.readFileSync('frontend/src/js/user_viajes.js', 'utf8'), context);
    return { element, storage, location, calls };
}

test('recupera filtros y excluye viajes sin suficientes asientos libres', async () => {
    const app = catalog();
    await new Promise(setImmediate);
    await app.element('#searchForm').submission;
    assert.equal(app.element('#origen').value, 'Origen');
    assert.equal(app.element('#cantidadPasajeros').value, '2');
    assert.match(app.element('#results').innerHTML, /idHoja=H1/);
    assert.doesNotMatch(app.element('#results').innerHTML, /idHoja=H2/);
    assert.match(app.element('#searchStatus').textContent, /1 frecuencia/);
});

test('visitante pasa al Login conservando la búsqueda', async () => {
    const app = catalog();
    await new Promise(setImmediate);
    let prevented = false;
    await app.element('#results').listeners.click({ target: { closest: () => ({href:'seleccion_asientos.html?idHoja=H1'}) }, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(app.location.href, '../public/index.html?login=1');
    assert.match(app.storage.get('publicTripSearch'), /pasajeros=2/);
});

test('R005 conserva el enlace al módulo existente', async () => {
    const app = catalog({ rolId: 'R005' });
    await new Promise(setImmediate);
    let prevented = false;
    await app.element('#results').listeners.click({ target: { closest: () => ({href:'seleccion_asientos.html?idHoja=H1'}) }, preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(app.location.href, 'seleccion_asientos.html?idHoja=H1');
});

test('un fallo de disponibilidad no se presenta como plazas disponibles', async () => {
    const app = catalog(null, true);
    await new Promise(setImmediate);
    await app.element('#searchForm').submission;
    assert.match(app.element('#searchStatus').textContent, /No se pudo comprobar/);
    assert.doesNotMatch(app.element('#results').innerHTML, /Elegir asiento/);
});

for (const id of ['CP001', 'CP002']) test(`conserva ${id} en rutas, viajes, asientos y paso por Login`, async () => {
    const app = catalog(null, false, id);
    await new Promise(setImmediate);
    assert.ok(app.calls.every((url) => url.includes(`cooperativa=${id}`)));
    assert.match(app.element('#results').innerHTML, new RegExp(`cooperativa=${id}`));
    await app.element('#results').listeners.click({ target: { closest: () => ({}) }, preventDefault() {} });
    const saved = app.storage.get('publicTripSearch');
    assert.match(saved, new RegExp(`cooperativa=${id}`));
    const loggedIn = catalog({ rolId: 'R005' }, false, id, false, saved);
    await new Promise(setImmediate);
    assert.ok(loggedIn.calls.every((url) => url.includes(`cooperativa=${id}`)));
    assert.match(loggedIn.element('#results').innerHTML, /Elegir asiento/);
});

test('rechaza resultados de otra empresa y no consulta sus asientos', async () => {
    const app = catalog(null, false, 'CP001', true);
    await new Promise(setImmediate);
    assert.match(app.element('#searchStatus').textContent, /no corresponde/);
    assert.ok(!app.calls.some((url) => url.includes('/asientos')));
    assert.doesNotMatch(app.element('#results').innerHTML, /Elegir asiento/);
});
