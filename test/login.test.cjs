const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch) {
    const nodes = new Map();
    const node = (id) => {
        if (!nodes.has(id)) nodes.set(id, {
            value: '', textContent: '', events: {},
            addEventListener(name, handler) { this.events[name] = handler; },
            setAttribute() {}, reportValidity() { return true; },
            querySelector() { return node('button'); }
        });
        return nodes.get(id);
    };
    node('correo').value = ' user@example.test ';
    node('password').value = 'test-password';
    const storage = new Map();
    const window = { location: { href: '' }, TransportSession: { panelFor: role => roles[role] } };
    vm.runInNewContext(fs.readFileSync('frontend/src/views/auth/login.js', 'utf8'), {
        document: { getElementById: node }, window, fetch, AbortController, setTimeout, clearTimeout,
        localStorage: { setItem: (key, value) => storage.set(key, value) }
    });
    return { node, window, storage, submit: () => node('loginForm').events.submit({ preventDefault() {} }) };
}

const roles = {
    R001: '../admin/dashboard.html', R002: '../cooperativa/dashboard_coop.html',
    R003: '../oficinista/ventanilla_boletos.html', R004: '../controlador/panel.html',
    R005: '../public/index.html', R006: '../chofer/bienvenida.html'
};
for (const [rolId, destino] of Object.entries(roles)) {
    test(`Login compartido conserva destino ${rolId} y contrato de la API`, async () => {
        const app = setup(async (url, options) => {
            assert.equal(url, 'http://localhost:3000/api/auth/login');
            assert.equal(options.method, 'POST');
            assert.deepEqual(JSON.parse(options.body), { correo: 'user@example.test', password: 'test-password' });
            return { ok: true, json: async () => ({ success: true, usuario: { rolId } }) };
        });
        await app.submit();
        assert.equal(app.window.location.href, destino);
        assert.equal(JSON.parse(app.storage.get('usuario')).rolId, rolId);
        assert.equal(app.node('button').disabled, false);
    });
}

test('credenciales incorrectas se muestran sin guardar sesión', async () => {
    const app = setup(async () => ({ ok: false, json: async () => ({ success: false, message: 'Contraseña incorrecta.' }) }));
    await app.submit();
    assert.equal(app.node('mensajeError').textContent, 'Contraseña incorrecta.');
    assert.equal(app.storage.size, 0);
    assert.equal(app.window.location.href, '');
});

test('fallo de red permite reintentar', async () => {
    const app = setup(async () => { throw new Error('Network'); });
    await app.submit();
    assert.match(app.node('mensajeError').textContent, /No se pudo conectar/);
    assert.equal(app.node('button').disabled, false);
});

test('cerrar durante la consulta impide una redirección tardía y evita doble envío', async () => {
    let resolve;
    let calls = 0;
    const app = setup(() => { calls++; return new Promise((done) => { resolve = done; }); });
    const pending = app.submit();
    await app.submit();
    assert.equal(calls, 1);
    app.node('loginForm').events['login:cancel']();
    resolve({ ok: true, json: async () => ({ success: true, usuario: { rolId: 'R005' } }) });
    await pending;
    assert.equal(app.storage.size, 0);
    assert.equal(app.window.location.href, '');
    assert.equal(app.node('password').value, '');
    assert.equal(app.node('button').disabled, false);
});

test('un rol desconocido no guarda sesión', async () => {
    const app = setup(async () => ({ ok: true, json: async () => ({ success: true, usuario: { rolId: 'UNKNOWN' } }) }));
    await app.submit();
    assert.equal(app.storage.size, 0);
    assert.match(app.node('mensajeError').textContent, /Rol de usuario no reconocido/);
});
