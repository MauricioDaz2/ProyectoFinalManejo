const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const sharp = require('sharp');
const { defaults, normalize } = require('../backend/src/services/profileContent');
const { validateImage } = require('../backend/src/services/profileImages');

test('validación de contenido: campos legales, colores, servicios e imágenes', () => {
  const content = defaults({ NOM_COP: 'Empresa de prueba' });
  assert.equal(normalize(content).nombre, 'Empresa de prueba');
  for (const patch of [{ ID_COP: 'CP002' }, { RUC_COP: '123' }, { principal: 'url(javascript:alert(1))' }, { servicios: Array(9).fill('Prueba') }, { logo: 'https://external.test/photo.jpg' }, { nombre: '' }]) {
    assert.throws(() => normalize({ ...content, ...patch }), (err) => err.status === 400);
  }
});

test('imágenes: formato real, archivo completo, tamaño y dimensiones', async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#abcdef' } }).png().toBuffer();
  const safe = await validateImage(png, 'logo');
  assert.equal((await sharp(safe.data).metadata()).format, 'png');
  assert.deepEqual(safe.data, png);
  assert.equal(safe.width, 100);
  assert.deepEqual((await validateImage(png, 'portada')).data, png);
  await assert.rejects(validateImage(png.subarray(0, 45), 'logo'), (err) => err.status === 400);
  await assert.rejects(validateImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo'), (err) => err.status === 400);
  await assert.rejects(validateImage(Buffer.alloc(8 * 1024 * 1024 + 1), 'logo'), (err) => err.status === 400);
  const wide = await sharp({ create: { width: 6001, height: 64, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.equal((await validateImage(wide, 'portada')).width, 6001);
  const tooWide = await sharp({ create: { width: 32769, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(validateImage(tooWide, 'logo'), (err) => err.status === 400);
  const tooManyPixels = await sharp({ create: { width: 6000, height: 4001, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(validateImage(tooManyPixels, 'galeria'), (err) => err.status === 400);
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#abcdef' } }).png().toBuffer();
  for (const type of ['logo', 'portada', 'galeria']) assert.equal((await validateImage(tiny, type)).width, 1);
  const oriented = await sharp({ create: { width: 80, height: 30, channels: 3, background: '#fff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.deepEqual((await validateImage(oriented, 'galeria')).data, oriented);
});

test('HTTP y repositorio: borradores privados, publicación atómica y separación de empresas', async (t) => {
  const state = { installed: false, profiles: {}, images: {}, active: { CP001: true, CP002: true } };
  let failCommit = false, commits = 0, legacyConstraints = false;
  const statements = [];
  const companies = Object.fromEntries(['CP001', 'CP002'].map((id) => [id, { ID_COP: id, NOM_COP: `Empresa ${id}`, TEL_COP: '0123456789', DIR_COP: 'Dirección de prueba', LOG_URL_COP: null }]));
  const users = { U001: { company: 'CP001', role: 'R002' }, U002: { company: 'CP002', role: 'R002' }, U003: { company: 'CP001', role: 'R001' } };
  class Request {
    constructor(connection) { this.connection = connection; this.params = {}; }
    input(key, type, value) { this.params[key] = value; return this; }
    async query(sql) {
      const p = this.params, data = this.connection instanceof Transaction ? this.connection.data : state;
      statements.push({ sql, params: { ...p } });
      const rows = (recordset = []) => ({ recordset });
      if (sql.includes('AS PERSONAL_INSTALADO')) return rows([{ PERSONAL_INSTALADO: 0 }]);
      if (sql.includes('AS REGISTRO_INSTALADO')) return rows([{ REGISTRO_INSTALADO: 0 }]);
      if (sql.includes('AS INSTALADO')) return rows([{ INSTALADO: state.installed ? 1 : 0 }]);
      if (sql.includes('WHERE U.ID_USU = @id')) {
        const u = users[p.id];
        return rows(u ? [{ ID_USU: p.id, NOM_USU: 'Representante', APE_USU: 'Prueba', ID_ROL_PER: u.role, ID_COP_PER: u.company, EST_USU: '1', EST_COP: state.active[u.company] ? '1' : '0', NOM_COP: companies[u.company].NOM_COP }] : []);
      }
      if (sql.includes('FROM dbo.COOPERATIVAS WHERE ID_COP')) {
        const id = p.cop || p.id;
        return rows(data.active[id] ? [companies[id]] : []);
      }
      if (sql.includes('FROM COOPERATIVAS') && !sql.includes('WHERE ID_COP')) return rows(Object.values(companies).filter((c) => data.active[c.ID_COP]));
      if (sql.includes('SELECT TOP (6) B.NUM_BUS')) return rows();
      if (sql.includes('SELECT P.PUBLICADO_JSON')) return rows(data.active[p.cop] && data.profiles[p.cop] ? [{ PUBLICADO_JSON: data.profiles[p.cop].PUBLICADO_JSON }] : []);
      if (sql.includes('SELECT BORRADOR_JSON') || sql.includes('SELECT REVISION FROM')) return rows(data.profiles[p.cop] ? [data.profiles[p.cop]] : []);
      if (sql.includes('SELECT COUNT(*) AS TOTAL')) {
        const images = Object.values(data.images).filter((i) => i.ID_COP === p.cop);
        return rows([{ TOTAL: images.length, BYTES: images.reduce((sum, img) => sum + img.BYTES, 0) }]);
      }
      if (sql.includes('SELECT ID_IMG, TIPO')) return rows(Object.values(data.images).filter((i) => i.ID_COP === p.cop));
      if (sql.includes('SELECT ARCHIVO')) return rows(data.images[p.id]?.ID_COP === p.cop ? [data.images[p.id]] : []);
      assert.ok(this.connection instanceof Transaction, 'Las escrituras deben usar una transacción');
      if (sql.includes('INSERT INTO dbo.COOPERATIVA_IMAGENES')) {
        if (legacyConstraints) throw Object.assign(new Error('CHECK constraint CK_IMAGEN_MIME'), { number: 547 });
        data.images[p.id] = { ID_IMG: p.id, ID_COP: p.cop, TIPO: p.tipo, ARCHIVO: p.archivo, MIME: p.mime, BYTES: p.bytes, ANCHO: p.ancho, ALTO: p.alto };
        return rows();
      }
      if (sql.includes('DELETE FROM dbo.COOPERATIVA_IMAGENES')) {
        assert.match(sql, /WHERE ID_COP = @cop AND ID_IMG = @id/);
        if (data.images[p.id]?.ID_COP !== p.cop) return rows();
        const removed = data.images[p.id]; delete data.images[p.id]; return rows([removed]);
      }
      if (sql.includes('UPDATE dbo.COOPERATIVA_PERFILES') || sql.includes('INSERT INTO dbo.COOPERATIVA_PERFILES')) {
        if (sql.includes('UPDATE')) assert.match(sql, /WHERE ID_COP = @cop/);
        const previous = data.profiles[p.cop];
        const row = { BORRADOR_JSON: p.json, PUBLICADO_JSON: p.publicar ? p.json : previous?.PUBLICADO_JSON || null, REVISION: (previous?.REVISION || 0) + 1, PUBLICADO_UTC: p.publicar ? new Date().toISOString() : previous?.PUBLICADO_UTC || null };
        data.profiles[p.cop] = row;
        return rows([row]);
      }
      throw new Error(`Consulta no prevista: ${sql}`);
    }
  }
  class Transaction {
    async begin(level) { assert.equal(level, require('mssql').ISOLATION_LEVEL.SERIALIZABLE); this.data = structuredClone(state); }
    async commit() { if (failCommit) throw new Error('Fallo simulado al confirmar'); state.profiles = this.data.profiles; state.images = this.data.images; commits++; }
    async rollback() { this.data = null; }
  }
  const pool = { request: () => new Request(pool) };
  const dbPath = require.resolve('../backend/src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: { ...require('mssql'), Request, Transaction }, conectarBD: async () => pool } };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'transport-profile-test-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.join(path.resolve(os.tmpdir()), 'transport-profile-test-')));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const repo = require('../backend/src/repositories/cooperativaProfileRepository');
  const controllers = require('../backend/src/controllers/cooperativaProfileController');
  Object.assign(controllers, controllers.createController(repo, directory));
  const app = require('../backend/src/server');
  const { store } = require('../backend/src/security/sessionStore');
  const tokens = Object.fromEntries(Object.keys(users).map((id) => [id, store.create(id)]));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { Object.values(tokens).forEach((token) => store.revoke(token)); server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, { user, method = 'GET', body } = {}) => fetch(`${base}/api${route}`, {
    method, headers: { 'X-Transport-Client': '1', ...(user ? { Cookie: `transporte_sid=${tokens[user]}` } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) })
  });
  let imageId;
  const originals = {};
  const imageIds = {};
  const content = defaults(companies.CP001);
  content.nombre = 'Nombre público de prueba'; content.principal = '#157044'; content.servicios = ['Servicio registrado de prueba'];
  await t.test('sin migración no sube, guarda, previsualiza ni publica', async () => {
    for (const [route, method] of [['', 'GET'], ['/vista-previa', 'GET'], ['/borrador', 'PUT'], ['/publicar', 'POST'], ['/imagenes/logo', 'POST']]) {
      const result = await request(`/coop/perfil${route}`, { user: 'U001', method });
      assert.equal(result.status, 503); assert.equal((await result.json()).code, 'MIGRATION_REQUIRED');
    }
    assert.equal(commits, 0); assert.deepEqual(await fs.readdir(directory), []);
    assert.equal((await request('/public/cooperativas/CP001')).status, 200);
  });
  state.installed = true;
  await t.test('solo R002 de una cooperativa activa tiene acceso privado', async () => {
    assert.equal((await request('/coop/perfil')).status, 401);
    assert.equal((await request('/coop/perfil/vista-previa')).status, 401);
    assert.equal((await request('/coop/perfil', { user: 'U003' })).status, 403);
    assert.equal((await request('/coop/perfil?cooperativa=CP002', { user: 'U001' })).status, 400);
    state.active.CP001 = false;
    assert.equal((await request('/coop/perfil', { user: 'U001' })).status, 403);
    state.active.CP001 = true;
  });
  await t.test('las restricciones SQL anteriores producen un aviso y no dejan archivos huérfanos', async () => {
    legacyConstraints = true;
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    const form = new FormData(); form.append('imagen', new Blob([png], { type: 'image/png' }), 'small.png');
    const response = await request('/coop/perfil/imagenes/logo', { user: 'U001', method: 'POST', body: form });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'IMAGE_STORAGE_MIGRATION_REQUIRED');
    assert.deepEqual(await fs.readdir(directory), []);
    assert.deepEqual(state.images, {});
    legacyConstraints = false;
  });
  await t.test('sube originales pequeños, horizontales y verticales con nombre seguro y acceso privado', async () => {
    const fixtures = [['logo', 1, 1, 'png'], ['portada', 120, 80, 'jpeg'], ['galeria', 40, 150, 'webp']];
    for (const [type, width, height, format] of fixtures) {
      const pixels = await sharp({ create: { width, height, channels: 3, background: '#fff' } }).toFormat(format).toBuffer();
      const form = new FormData(); form.append('imagen', new Blob([pixels], { type: `image/${format}` }), '../../archivo.php');
      const response = await request(`/coop/perfil/imagenes/${type}`, { user: 'U001', method: 'POST', body: form });
      const data = await response.json(); assert.equal(response.status, 201, JSON.stringify(data));
      const id = data.imagen.ID_IMG; imageIds[type] = id; originals[id] = pixels;
      assert.equal(data.imagen.ARCHIVO, undefined);
      assert.equal(data.imagen.ANCHO, width); assert.equal(data.imagen.ALTO, height);
      const extension = format === 'jpeg' ? 'jpg' : format;
      assert.deepEqual(await fs.readFile(path.join(directory, `${id}.${extension}`)), pixels);
      const served = await request(`/coop/perfil/imagenes/${id}`, { user: 'U001' });
      assert.equal(served.headers.get('content-type'), `image/${format}`);
      assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), pixels);
      assert.equal((await request(`/public/cooperativas/CP001/imagenes/${id}`)).status, 404);
    }
    imageId = imageIds.logo;
    assert.equal((await request(`/coop/perfil/imagenes/${imageId}`, { user: 'U001' })).status, 200);
    assert.equal((await request(`/coop/perfil/imagenes/${imageId}`, { user: 'U002' })).status, 404);
    assert.equal((await request(`/public/cooperativas/CP001/imagenes/${imageId}`)).status, 404);
    assert.equal((await fetch(`${base}/uploads/${imageId}.webp`)).status, 404);
    assert.equal((await fetch(`${base}/private_media/cooperativas/${imageId}.webp`)).status, 404);
  });
  await t.test('borrador y vista previa no alteran la información pública', async () => {
    content.logo = imageId;
    content.portada = imageIds.portada;
    content.galeria = [imageIds.galeria];
    const save = await request('/coop/perfil/borrador', { user: 'U001', method: 'PUT', body: { contenido: content, revision: 0 } });
    assert.equal(save.status, 200); assert.equal((await save.json()).revision, 1);
    const preview = await request('/coop/perfil/vista-previa', { user: 'U001' });
    assert.equal(preview.headers.get('cache-control'), 'no-store');
    const data = await preview.json(); assert.equal(data.cooperativa.NOM_COP, content.nombre); assert.match(data.cooperativa.LOG_URL_COP, /\/coop\/perfil\/imagenes\//);
    assert.ok(data.contenido.portada.endsWith(imageIds.portada));
    assert.ok(data.fotos[0].IMG_URL_BUS.endsWith(imageIds.galeria));
    const publicResponse = await request('/public/cooperativas/CP001');
    assert.equal((await publicResponse.json()).cooperativa.NOM_COP, companies.CP001.NOM_COP);
    const other = await request('/coop/perfil', { user: 'U002' }); assert.equal((await other.json()).revision, 0);
  });
  await t.test('rechaza campos administrativos, imágenes ajenas y revisiones obsoletas', async () => {
    assert.equal((await request('/coop/perfil/borrador', { user: 'U001', method: 'PUT', body: { contenido: content, revision: 1, ID_COP: 'CP002' } })).status, 400);
    const own = { ...content, nombre: 'Otra cooperativa' };
    assert.equal((await request('/coop/perfil/borrador', { user: 'U002', method: 'PUT', body: { contenido: own, revision: 0 } })).status, 400);
    assert.equal((await request('/coop/perfil/borrador', { user: 'U001', method: 'PUT', body: { contenido: content, revision: 0 } })).status, 409);
    assert.equal(state.profiles.CP002, undefined);
  });
  await t.test('solo publica tras confirmar la transacción y protege las imágenes publicadas', async () => {
    failCommit = true;
    const failed = await request('/coop/perfil/publicar', { user: 'U001', method: 'POST', body: { contenido: content, revision: 1 } });
    assert.equal(failed.status, 503); assert.equal((await failed.json()).success, false); assert.equal(state.profiles.CP001.PUBLICADO_JSON, null);
    failCommit = false;
    const response = await request('/coop/perfil/publicar', { user: 'U001', method: 'POST', body: { contenido: content, revision: 1 } });
    assert.equal(response.status, 200); assert.equal((await response.json()).revision, 2);
    const published = await request('/public/cooperativas/CP001');
    const data = await published.json(); assert.equal(data.contenido.principal, '#157044'); assert.equal(data.cooperativa.NOM_COP, content.nombre); assert.equal(data.BORRADOR_JSON, undefined);
    assert.equal((await request(`/public/cooperativas/CP001/imagenes/${imageId}`)).status, 200);
    for (const id of Object.values(imageIds)) {
      const publishedImage = await request(`/public/cooperativas/CP001/imagenes/${id}`);
      assert.equal(publishedImage.status, 200);
      assert.deepEqual(Buffer.from(await publishedImage.arrayBuffer()), originals[id]);
    }
    assert.equal((await request(`/public/cooperativas/CP002/imagenes/${imageId}`)).status, 404);
    assert.equal((await request(`/coop/perfil/imagenes/${imageId}`, { user: 'U001', method: 'DELETE' })).status, 409);
    const cards = await request('/public/cooperativas'); assert.equal((await cards.json()).cooperativas[0].NOM_COP, content.nombre);
    state.active.CP001 = false;
    assert.equal((await request(`/public/cooperativas/CP001/imagenes/${imageId}`)).status, 404);
    assert.equal((await request('/public/cooperativas/CP001')).status, 404);
    state.active.CP001 = true;
  });
  await t.test('seguir editando no cambia la publicación y otra cooperativa publica independientemente', async () => {
    const changed = { ...content, nombre: 'Borrador posterior' };
    assert.equal((await request('/coop/perfil/borrador', { user: 'U001', method: 'PUT', body: { contenido: changed, revision: 2 } })).status, 200);
    assert.equal((await (await request('/public/cooperativas/CP001')).json()).cooperativa.NOM_COP, content.nombre);
    const other = { ...defaults(companies.CP002), principal: '#781822' };
    assert.equal((await request('/coop/perfil/publicar', { user: 'U002', method: 'POST', body: { contenido: other, revision: 0 } })).status, 200);
    assert.equal((await (await request('/public/cooperativas/CP002')).json()).contenido.principal, other.principal);
    assert.equal((await (await request('/public/cooperativas/CP001')).json()).contenido.principal, content.principal);
    assert.ok(statements.filter((entry) => /INSERT|UPDATE|DELETE/.test(entry.sql)).every((entry) => companies[entry.params.cop]));
  });
});
