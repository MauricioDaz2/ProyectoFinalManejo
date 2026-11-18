const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { defaults } = require('../backend/src/services/profileContent');

async function editor({ missing = false, failSave = false } = {}) {
  const elements = new Map(), events = {}, calls = [];
  const create = () => ({
    value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, children: [], dataset: {}, events: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, reportValidity: () => true,
    addEventListener(name, handler) { this.events[name] = handler; },
    replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); }
  });
  const get = (id) => { if (!elements.has(id)) elements.set(id, create()); return elements.get(id); };
  const upload = ['logo', 'portada', 'galeria'].map((type) => { const input = get(`upload-${type}`); input.dataset.upload = type; input.files = []; return input; });
  const send = ['logo', 'portada', 'galeria'].map((type) => { const button = get(`send-${type}`); button.dataset.send = type; return button; });
  const redirects = [];
  vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_personalizar.js', 'utf8'), {
    document: {
      getElementById: get, createElement: create, createTextNode: (text) => text, documentElement: get('html'), body: get('body'), addEventListener() {},
      querySelector: (selector) => upload.find((node) => selector.includes(node.dataset.upload)), querySelectorAll: (selector) => selector === '[data-upload]' ? upload : selector === '[data-send]' ? send : []
    },
    window: { API_BASE_URL: 'http://localhost:3000/api', location: { replace: (url) => redirects.push(url) }, addEventListener: (name, callback) => { events[name] = callback; }, confirm: () => true },
    App: { api: async () => ({ usuario: { rolId: 'R002', cooperativaActiva: true, cooperativaId: 'CP001', cooperativaNombre: 'Prueba', nombre: 'Representante de prueba' } }) },
    URL, URLSearchParams, FormData, AbortSignal, Image: class {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (missing) return { ok: false, status: 503, json: async () => ({ success: false, code: 'MIGRATION_REQUIRED', message: 'Pendiente de instalar la migración.' }) };
      if (options.method !== 'GET') return { ok: !failSave, status: failSave ? 503 : 200, json: async () => ({ success: !failSave, revision: 2, message: failSave ? 'No se pudo guardar.' : 'Contenido guardado.' }) };
      return { ok: true, status: 200, json: async () => ({ success: true, contenido: defaults({ NOM_COP: 'Prueba' }), revision: 1, publicado: null, imagenes: [] }) };
    }
  });
  await new Promise(setImmediate);
  return { get, calls, events, redirects };
}

test('editor sin migración explica el bloqueo y no habilita persistencia ni publicación', async () => {
  const page = await editor({ missing: true });
  assert.equal(page.get('persistenceNotice').hidden, false);
  for (const id of ['saveDraft', 'publishProfile', 'previewProfile', 'send-logo']) assert.equal(page.get(id).disabled, true);
  assert.equal(page.get('editorFields').disabled, false);
  assert.equal(page.get('publishedPage').href, '../public/cooperativa.html?id=CP001');
  assert.equal(page.calls.length, 1);
});

test('vista previa guarda solo el borrador y abre la plantilla pública en modo privado', async () => {
  const page = await editor();
  page.get('nombre').value = 'Nombre del borrador';
  page.get('previewProfile').events.click();
  await new Promise(setImmediate);
  assert.equal(page.calls[1].url, 'http://localhost:3000/api/coop/perfil/borrador');
  assert.equal(page.calls[1].options.method, 'PUT');
  assert.equal(JSON.parse(page.calls[1].options.body).contenido.nombre, 'Nombre del borrador');
  assert.equal(page.get('previewFrame').src, '../public/cooperativa.html?preview=1&v=2');
  assert.equal(page.get('previewSection').hidden, false);
  assert.ok(!page.calls.some((call) => call.url.endsWith('/publicar')));
});

test('guardar y publicar usa el contenido del formulario y la revisión recibida', async () => {
  const page = await editor();
  page.get('principal').value = '#228800'; page.get('servicios').value = 'Servicio uno\nServicio dos';
  page.get('publishProfile').events.click(); await new Promise(setImmediate);
  const request = page.calls[1];
  assert.equal(request.url, 'http://localhost:3000/api/coop/perfil/publicar');
  assert.equal(request.options.method, 'POST');
  const data = JSON.parse(request.options.body);
  assert.equal(data.revision, 1); assert.equal(data.contenido.principal, '#228800'); assert.deepEqual(data.contenido.servicios, ['Servicio uno', 'Servicio dos']);
  assert.equal(data.ID_COP, undefined);
  assert.match(page.get('saveState').textContent, /Publicado/);
});

test('un guardado fallido conserva cambios pendientes y no abre una vista previa falsa', async () => {
  const page = await editor({ failSave: true });
  page.get('profileForm').events.input();
  page.get('previewProfile').events.click(); await new Promise(setImmediate);
  assert.match(page.get('editorStatus').textContent, /No se pudo guardar/);
  assert.equal(page.get('previewFrame').src, undefined);
  assert.match(page.get('saveState').textContent, /sin guardar/);
});

test('no publica silenciosamente si hay una imagen local sin subir', async () => {
  const page = await editor();
  const input = page.get('upload-logo');
  input.files = [new Blob(['fixture'], { type: 'image/png' })];
  input.events.change(); page.get('publishProfile').events.click(); await new Promise(setImmediate);
  assert.equal(page.calls.length, 1);
  assert.match(page.get('editorStatus').textContent, /imágenes seleccionadas sin subir/);
  input.files = []; input.events.change();
});

test('editor, Dashboard y página pública tienen enlaces y elementos válidos', () => {
  for (const [file, script] of [['cooperativa/personalizar.html', 'coop_personalizar'], ['cooperativa/dashboard_coop.html', 'coop_dashboard'], ['public/cooperativa.html', 'public_cooperativa']]) {
    const filePath = `frontend/src/views/${file}`, html = fs.readFileSync(filePath, 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const [, id] of fs.readFileSync(`frontend/src/js/${script}.js`, 'utf8').matchAll(/\$\('([^']+)'\)/g)) if (!id.endsWith('-')) assert.ok(ids.has(id), id);
    for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (target.startsWith('#')) assert.ok(ids.has(target.slice(1)), target);
      else if (!/^https?:/.test(target)) assert.ok(fs.existsSync(path.resolve(path.dirname(filePath), target.split('#')[0])), target);
    }
  }
});

for (const [role, file] of [['R001', 'admin/dashboard.html'], ['R002', 'cooperativa/personalizar.html'], ['R003', 'oficinista/ventanilla_boletos.html'], ['R004', 'controlador/panel.html'], ['R005', 'usuario/catalogo_viajes.html'], ['R006', 'chofer/bienvenida.html']]) {
  for (const prefix of ['http://localhost:3000/src/views/', 'http://127.0.0.1:3000/src/views/']) test(`${role}: cierre de sesión a portada desde ${new URL(prefix).port}`, async () => {
    const browser = logoutBrowser(prefix + file);
    await browser.window.TransportSession.ready;
    await browser.window.TransportSession.logout();
    assert.equal(browser.redirects[0], new URL('../public/index.html', prefix + file).href);
    assert.equal(browser.storage.has('usuario'), false); assert.equal(browser.storage.has('token'), false); assert.equal(browser.session.has('publicTripSearch'), false);
    assert.equal(browser.storage.get('preferencia'), 'conservar');
    assert.equal(browser.requests.find(r=>r.url.endsWith('/auth/logout')).options.method, 'POST'); assert.equal(browser.requests.find(r=>r.url.endsWith('/auth/logout')).options.credentials, 'include');
    assert.equal(browser.requests.find(r=>r.url.endsWith('/auth/logout')).options.headers.get('X-Transport-Client'), '1');
    assert.match(fs.readFileSync(`frontend/src/views/${file}`, 'utf8'), /transport_session.js/);
  });
}

function logoutBrowser(href, fail = false) {
  const storage = new Map([['usuario', '{}'], ['token', 'antiguo'], ['preferencia', 'conservar']]), session = new Map([['publicTripSearch', 'busqueda']]);
  const requests = [], redirects = [];
  const window = { addEventListener(){}, dispatchEvent() {}, fetch: async (url, options) => { requests.push({ url, options }); return { ok: !fail || url.endsWith('/auth/me'), json:async()=>({usuario:{id:'test',rolId:href.includes('/admin/')?'R001':href.includes('/cooperativa/')?'R002':href.includes('/oficinista/')?'R003':href.includes('/controlador/')?'R004':'R006'}}) }; } };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/transport_session.js', 'utf8'), {
    window, URL, URLSearchParams, Headers, Request, AbortSignal, Event, document: { documentElement:{},addEventListener() {} },
    location: { href, hostname: new URL(href).hostname, replace: (target) => redirects.push(new URL(target, href).href) },
    localStorage: { getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) }, sessionStorage: { removeItem: (key) => session.delete(key) }
  });
  return { window, storage, session, requests, redirects };
}

test('si el servidor no confirma el cierre, conserva los datos y permite reintentar', async () => {
  const browser = logoutBrowser('http://localhost:3000/src/views/admin/dashboard.html', true);
  await assert.rejects(browser.window.TransportSession.logout(), /No se pudo cerrar/);
  assert.equal(browser.redirects.length, 0); assert.equal(browser.storage.has('usuario'), true);
});
