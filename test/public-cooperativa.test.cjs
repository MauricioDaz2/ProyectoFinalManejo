const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');

test('perfiles públicos y consultas limitadas por cooperativa, sin sesión ni escrituras', async (t) => {
  let fail = false;
  const companies = ['CP001', 'CP002'];
  const dbPath = require.resolve('../backend/src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: require('mssql'), conectarBD: async () => {
      if (fail) throw new Error('Fallo simulado');
      return { request() {
        const params = {};
        return { input(key, type, value) { params[key] = value; return this; }, async query(sql) {
          assert.match(sql.trim(), /^SELECT/);
          if (sql.includes('AS INSTALADO')) return { recordset: [{ INSTALADO: 0 }] };
          if (sql.includes('LOG_URL_COP, DIR_COP')) {
            assert.match(sql, /WHERE ID_COP = @id AND EST_COP = '1'/);
            assert.doesNotMatch(sql, /RUC_COP|USUARIOS|SELECT \*/);
            return { recordset: companies.includes(params.id) ? [{ ID_COP: params.id, NOM_COP: `Prueba ${params.id}`, TEL_COP: params.id === 'CP001' ? '111' : '222' }] : [] };
          }
          if (sql.includes('IMG_URL_BUS') && !sql.includes('ASIENTOS_BUS')) {
            assert.match(sql, /C.ID_COP = @id AND C.EST_COP = '1'/);
            return { recordset: [{ NUM_BUS: params.id, IMG_URL_BUS: `/${params.id}.jpg` }] };
          }
          assert.ok(companies.includes(params.cooperativa));
          assert.match(sql, /C.ID_COP = @cooperativa/);
          assert.match(sql, /B.ID_COP_PER = C.ID_COP/);
          assert.match(sql, /C.EST_COP = '1'/);
          if (sql.includes('AS ESTADO_ASIENTO')) return { recordset: params.idHoja === (params.cooperativa === 'CP001' ? 'H001' : 'H002') ? [{ ID_HOJ: params.idHoja, ID_ASI: 'A001', TAR_BAS_FRE: 10, ID_TIP_PER: 'TIP01' }] : [] };
          if (sql.includes('AS ORIGEN')) return { recordset: [{ ORIGEN: params.cooperativa, DESTINO: 'Destino' }] };
          return { recordset: [{ ID_COP: params.cooperativa, ID_HOJ: params.cooperativa === 'CP001' ? 'H001' : 'H002' }] };
        } };
      } };
    }
  } };
  const server = require('../backend/src/server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const id of companies) {
    const response = await fetch(`${base}/public/cooperativas/${id}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.cooperativa.ID_COP, id);
    assert.equal(data.fotos[0].IMG_URL_BUS, `/${id}.jpg`);
    for (const route of [`/usuario/viajes/rutas?cooperativa=${id}`, `/usuario/viajes?origen=Quito&destino=Ambato&fecha=2099-01-01&cooperativa=${id}`, `/public/salidas?cooperativa=${id}`]) {
      const result = await fetch(base + route);
      assert.equal(result.status, 200);
      const body = await result.json();
      for (const row of body.viajes || body.salidas || []) assert.equal(row.ID_COP, id);
      if (body.rutas) assert.equal(body.rutas[0].ORIGEN, id);
    }
  }
  assert.equal((await fetch(`${base}/usuario/reservas/H001/asientos?cooperativa=CP001`)).status, 200);
  assert.equal((await fetch(`${base}/usuario/reservas/H001/asientos?cooperativa=CP002`)).status, 404);
  assert.equal((await fetch(`${base}/public/cooperativas/CP003`)).status, 404);
  assert.equal((await fetch(`${base}/public/cooperativas/TOOLONG`)).status, 400);
  for (const route of ['/public/salidas', '/usuario/viajes/rutas', '/usuario/viajes', '/usuario/reservas/H001/asientos']) assert.equal((await fetch(`${base}${route}?cooperativa=`)).status, 400);
  assert.equal((await fetch(`${base}/public/cooperativas/CP001`, { method: 'POST', headers: { 'X-Transport-Client': '1' } })).status, 404);
  fail = true;
  assert.equal((await fetch(`${base}/public/cooperativas/CP001`)).status, 503);
});

function nodes() {
  const all = new Map();
  const create = (tag = 'div') => ({
    tagName: tag, textContent: '', innerHTML: '', value: '', children: [], events: {}, hidden: false,
    classList: { add() {}, remove() {}, toggle() { return true; } },
    addEventListener(name, callback) { this.events[name] = callback; }, setAttribute() {},
    replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); },
    querySelectorAll() { return []; }, reportValidity() { return true; }
  });
  const get = (id) => { if (!all.has(id)) all.set(id, create()); return all.get(id); };
  return { create, get, document: { getElementById: get, querySelector: get, documentElement: { style: { setProperty: (name, value) => { get('styles')[name] = value; } } }, querySelectorAll: () => [get('company-name')], createElement: create, addEventListener() {} } };
}

async function profile(id, { missing = false, failed = false, wrong = false, preview = false, published = false } = {}) {
  const dom = nodes();
  const calls = [];
  const location = { search: preview ? '?preview=1&id=CP002' : `?id=${id}` };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/public_cooperativa.js', 'utf8'), {
    ...dom, document: dom.document, location, window: {}, URL, URLSearchParams, Date, Intl, AbortSignal,
    Image: class { set src(value) { this.url = value; if (this.loading !== 'lazy') this.onload?.(); } }, Option: class { constructor(label, value) { this.value = value; } },
    fetch: async (url) => {
      calls.push(url);
      const data = url.includes('/public/cooperativas/') || url.includes('/vista-previa') ? { cooperativa: { ID_COP: id, NOM_COP: `Prueba ${id}`, LOG_URL_COP: published ? `/api/${preview ? 'coop/perfil' : `public/cooperativas/${id}`}/imagenes/logo` : null, TEL_COP: '123456', DIR_COP: 'Dirección de prueba' }, fotos: [], ...(published ? { contenido: { principal: '#157044', secundario: '#fed100', descripcion: 'Descripción publicada', mision: 'Misión publicada', correo: 'publico@example.test', servicios: ['Servicio <de prueba>'], portada: '/api/public/cooperativas/CP001/imagenes/fixture' } } : {}) }
        : url.includes('/rutas?') ? { rutas: [{ ORIGEN: 'Quito', DESTINO: 'Ambato' }] }
        : { salidas: wrong ? [{ ID_COP: 'OTHER' }] : [] };
      return { ok: !missing && !failed, status: missing ? 404 : failed ? 503 : 200, json: async () => ({ success: !missing && !failed, message: 'No disponible', ...data }) };
    }
  });
  await new Promise(setImmediate);
  return { ...dom, calls, location };
}

for (const id of ['CP001', 'CP002']) test(`página ${id}: identidad, rutas y buscador propios`, async () => {
  const page = await profile(id);
  assert.equal(page.get('profilePage').hidden, false);
  assert.equal(page.get('company-name').textContent, `Prueba ${id}`);
  assert.match(page.get('allRoutes').href, new RegExp(`cooperativa=${id}`));
  assert.match(page.get('routes').innerHTML, new RegExp(`cooperativa=${id}`));
  assert.match(page.get('gallery').innerHTML, /Fotografías aún no disponibles/);
  assert.match(page.get('departures').innerHTML, /No hay próximas salidas/);
  assert.ok(page.calls.slice(1).every((url) => url.includes(`cooperativa=${id}`)));
  page.get('origen').value = 'Quito'; page.get('destino').value = 'Ambato';
  page.get('cooperativeSearch').events.submit({ preventDefault() {} });
  assert.match(page.location.href, new RegExp(`cooperativa=${id}`));
});

test('no publica perfiles inexistentes ni presenta un fallo como ausencia de viajes', async () => {
  const missing = await profile('CP003', { missing: true });
  assert.equal(missing.get('profilePage').hidden, true);
  assert.equal(missing.get('retryPage').hidden, true);
  assert.equal(missing.calls.length, 1);
  const failed = await profile('CP001', { failed: true });
  assert.equal(failed.get('retryPage').hidden, false);
  assert.equal(failed.get('profilePage').hidden, true);
  const wrong = await profile('CP001', { wrong: true });
  assert.match(wrong.get('departures').innerHTML, /Salidas no disponibles/);
  const invalid = await profile('');
  assert.equal(invalid.calls.length, 0);
});

test('la plantilla refleja colores, portada, contacto y textos publicados', async () => {
  const page = await profile('CP001', { published: true });
  assert.equal(page.get('styles')['--brand-primary'], '#157044');
  assert.equal(page.get('styles')['--brand-accent'], '#fed100');
  assert.equal(page.get('companyDescription').textContent, 'Descripción publicada');
  assert.equal(page.get('companyMission').textContent, 'Misión publicada');
  assert.equal(page.get('contactEmailRow').hidden, false);
  assert.equal(page.get('publishedCover').hidden, false);
  assert.equal(page.get('headerLogo').children[0]?.url, 'http://localhost:3000/api/public/cooperativas/CP001/imagenes/logo');
  assert.match(page.get('servicesContent').innerHTML, /Servicio &lt;de prueba&gt;/);
});

test('la vista previa consulta la sesión y omite el ID ajeno de la URL', async () => {
  const page = await profile('CP001', { preview: true, published: true });
  assert.equal(page.calls[0], 'http://localhost:3000/api/coop/perfil/vista-previa');
  assert.equal(page.get('headerLogo').children[0]?.url, 'http://localhost:3000/api/coop/perfil/imagenes/logo');
  assert.equal(page.get('company-name').textContent, 'Prueba CP001');
  assert.ok(page.calls.slice(1).every((url) => url.includes('cooperativa=CP001')));
  assert.match(page.get('.system-bar span').textContent, /privada/);
});

test('tarjetas de portada enlazan a los dos perfiles correspondientes', async () => {
  const dom = nodes();
  vm.runInNewContext(fs.readFileSync('frontend/src/js/public_home.js', 'utf8'), {
    document: dom.document, window: {}, URL, URLSearchParams, Date, Intl, AbortSignal,
    Option: class {}, Image: class {},
    fetch: async (url) => ({ ok: true, json: async () => ({ success: true, rutas: [], salidas: [], cooperativas: url.includes('cooperativas') ? ['CP001', 'CP002'].map((id) => ({ ID_COP: id, NOM_COP: id })) : [] }) })
  });
  await new Promise(setImmediate);
  assert.deepEqual(dom.get('coops').children.map((node) => node.href), ['cooperativa.html?id=CP001', 'cooperativa.html?id=CP002']);
});

test('las páginas contienen los elementos usados por sus scripts y enlaces locales válidos', () => {
  for (const [htmlPath, script] of [['frontend/src/views/public/cooperativa.html', 'public_cooperativa'], ['frontend/src/views/cooperativa/dashboard_coop.html', 'coop_dashboard']]) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const [, id] of fs.readFileSync(`frontend/src/js/${script}.js`, 'utf8').matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(id), id);
    for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (reference.startsWith('#')) assert.ok(ids.has(reference.slice(1)), reference);
      else if (!/^https?:/.test(reference)) assert.ok(fs.existsSync(path.resolve(path.dirname(htmlPath), reference.split('#')[0])), reference);
    }
  }
});
