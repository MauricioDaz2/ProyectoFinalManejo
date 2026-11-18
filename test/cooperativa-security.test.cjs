const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createSessionStore } = require('../backend/src/security/sessionStore');

test('las sesiones caducan, se revocan y no aceptan tokens arbitrarios', () => {
  let clock = 100;
  const sessions = createSessionStore({ lifetime: 10, now: () => clock, capacity: 2 });
  const token = sessions.create('U001');
  assert.equal(sessions.read(token).userId, 'U001');
  assert.equal(sessions.read('U001'), null);
  sessions.revoke(token);
  assert.equal(sessions.read(token), null);
  const expiring = sessions.create('U002');
  clock = 110;
  assert.equal(sessions.read(expiring), null);
});

test('HTTP: autenticación, roles y aislamiento de cooperativas sin escribir en SQL Server', async (t) => {
  const users = Object.fromEntries(['R001', 'R002', 'R003', 'R004', 'R005'].map((role, index) => [role, {
    ID_USU: `U00${index + 1}`, NOM_USU: 'Cuenta', APE_USU: 'de prueba', COR_USU: `${role}@example.test`,
    CON_USU: 'solo-pruebas', EST_USU: '1', ID_ROL: role, ID_ROL_PER: role, NOM_ROL: role,
    ID_COP_PER: 'C001', EST_COP: '1', NOM_COP: 'Cooperativa de prueba', LOG_URL_COP: null
  }]));
  const queries = [];
  let databaseFails = false;
  const dbPath = require.resolve('../backend/src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    sql: require('mssql'),
    conectarBD: async () => {
      if (databaseFails) throw new Error('Fallo simulado');
      return { request() {
        const parameters = {};
        return {
          input(name, type, value) { parameters[name] = value; return this; },
          async query(query) {
          if (query.includes('AS PERSONAL_INSTALADO')) return { recordset: [{ PERSONAL_INSTALADO: 0 }] };
            queries.push({ query, parameters });
            assert.match(query.trim(), /^SELECT\b/i, 'Ninguna prueba debe mutar registros');
            if (query.includes('WHERE U.COR_USU = @correo')) return { recordset: Object.values(users).filter((u) => u.COR_USU === parameters.correo) };
            if (query.includes('WHERE U.ID_USU = @id')) return { recordset: Object.values(users).filter((u) => u.ID_USU === parameters.id) };
            if (query.includes(' AS OWNER')) return { recordset: [{ OWNER: parameters.id === 'OWN01' ? 'C001' : 'C002' }] };
            if (query.includes('SELECT B.*, C.NOM_COP')) return { recordset: [{ ID_BUS: parameters.id, ID_COP_PER: 'C001' }] };
            assert.equal(parameters.cooperativa, 'C001', 'El listado usa la cooperativa verificada');
            return { recordset: [] };
          }
        };
      } };
    }
  } };
  const app = require('../backend/src/server');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { cookie, body, method = 'GET', headers = {} } = {}) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Transport-Client': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  async function login(role) {
    const response = await request('/auth/login', { method: 'POST', body: { correo: `${role}@example.test`, password: 'solo-pruebas' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).usuario.rolId, role);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
    return response.headers.get('set-cookie').split(';')[0];
  }
  let cookie;
  await t.test('requiere cookie válida y rechaza solicitudes de otros orígenes', async () => {
    assert.equal((await request('/coop/buses')).status, 401);
    assert.equal((await request('/auth/me', { cookie: 'transporte_sid=forged' })).status, 401);
    assert.equal((await request('/auth/login', { method: 'POST', body: {}, headers: { 'X-Transport-Client': '' } })).status, 403);
    assert.equal((await request('/auth/login', { method: 'POST', body: {}, headers: { Origin: 'https://foreign.example' } })).status, 403);
    assert.equal((await request('/auth/login', { method: 'POST' })).status, 400);
    assert.equal((await request('/auth/login', { method: 'POST', body: { correo: users.R002.COR_USU, password: 'incorrecta' } })).status, 401);
  });
  await t.test('los cinco roles conservan Login y solo R002 accede a su módulo', async () => {
    for (const role of Object.keys(users)) {
      const current = await login(role);
      assert.equal((await request('/auth/me', { cookie: current })).status, 200);
      assert.equal((await request('/coop/buses', { cookie: current })).status, role === 'R002' ? 200 : 403);
      if (role === 'R002') cookie = current;
      else {
        const closed = await request('/auth/logout', { cookie: current, method: 'POST' });
        assert.equal(closed.status, 200);
        assert.match(closed.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
        assert.equal((await request('/auth/me', { cookie: current })).status, 401);
      }
    }
  });
  await t.test('listas vacías son válidas; cambiar cooperativa por parámetro, cabecera o cuerpo se rechaza', async () => {
    const response = await request('/coop/buses', { cookie });
    assert.deepEqual((await response.json()).buses, []);
    const ownBus = await request('/coop/buses/OWN01', { cookie });
    assert.equal(ownBus.status, 200);
    assert.equal((await ownBus.json()).bus.ID_BUS, 'OWN01');
    assert.equal((await request('/coop/buses?cooperativa=C002', { cookie })).status, 403);
    assert.equal((await request('/coop/buses', { cookie, headers: { 'x-cooperativa': 'C002' } })).status, 403);
    assert.equal((await request('/coop/buses', { cookie, method: 'POST', body: { ID_COP_PER: 'C002' } })).status, 403);
  });
  await t.test('bloquea lectura y escritura de recursos y referencias ajenas', async () => {
    for (const path of ['/buses/OTHER', '/buses/OTHER/asientos', '/resoluciones/OTHER', '/frecuencias/OTHER', '/hojas-ruta/OTHER', '/asientos/OTHER/tipo']) {
      assert.equal((await request(`/coop${path}`, { cookie, method: path.includes('asientos/OTHER') ? 'PATCH' : 'GET' })).status, 404, path);
    }
    for (const [path, field] of [['/frecuencias', 'ID_RES_PER'], ['/hojas-ruta', 'ID_BUS_PER'], ['/hojas-ruta', 'ID_FRE_PER'], ['/hojas-ruta', 'ID_USU_CON']]) {
      assert.equal((await request(`/coop${path}`, { cookie, method: 'POST', body: { [field]: 'OTHER' } })).status, 404, field);
    }
    for (const path of ['/buses/OTHER', '/resoluciones/OTHER', '/frecuencias/OTHER', '/hojas-ruta/OTHER']) {
      for (const method of ['PUT', 'DELETE']) assert.equal((await request(`/coop${path}`, { cookie, method, body: {} })).status, 404);
    }
    assert.equal((await request('/coop/buses/OTHER/estado', { cookie, method: 'PATCH', body: { EST_BUS: 'INACTIVO' } })).status, 404);
    for (const path of ['/admin/cooperativas', '/oficinista/resumen', '/controlador/panel']) assert.equal((await request(path, { cookie })).status, 403);
    assert.equal((await request('/usuario/reservas', { cookie, method: 'POST', body: {} })).status, 403);
  });
  await t.test('revocar rol o desactivar cooperativa se aplica a la siguiente solicitud', async () => {
    users.R002.ID_ROL_PER = 'R001';
    assert.equal((await request('/coop/buses', { cookie })).status, 403);
    users.R002.ID_ROL_PER = 'R002';
    users.R002.EST_COP = '0';
    assert.equal((await request('/coop/buses', { cookie })).status, 403);
    users.R002.EST_COP = '1';
    databaseFails = true;
    assert.equal((await request('/coop/buses', { cookie })).status, 503);
    databaseFails = false;
  });
  await t.test('cerrar sesión invalida el token en el servidor', async () => {
    assert.equal((await request('/auth/logout', { cookie, method: 'POST' })).status, 200);
    assert.equal((await request('/auth/me', { cookie })).status, 401);
    assert.equal((await request('/coop/buses', { cookie })).status, 401);
    assert.ok(queries.length > 0);
  });
});
