(() => {
    'use strict';
    const nativeFetch = window.fetch.bind(window);
    const localHosts = ['localhost', '127.0.0.1', '[::1]'];
    const configured = new URL(window.API_BASE_URL || 'http://localhost:3000/api');
    if (location.protocol === 'file:' || (localHosts.includes(location.hostname) && new URL(location.href).port !== configured.port)) {
        const waiting = new Promise(() => {});
        window.TransportSession = { ready: waiting, current: () => waiting, logout: () => waiting, panelFor: () => null, get user() { return null; } };
        window.fetch = () => waiting;
        document.documentElement.hidden = true;
        const entry = new URL(location.href);
        entry.pathname = entry.pathname.slice(0, entry.pathname.indexOf('/views/')) + '/index.html';
        entry.search = '';
        entry.hash = '';
        location.replace(entry.href);
        return;
    }
    const api = new URL(configured);
    if (localHosts.includes(location.hostname) && localHosts.includes(api.hostname)) api.hostname = location.hostname;
    window.API_BASE_URL = api.href.replace(/\/$/, '');
    const panels = { R001:'../admin/dashboard.html', R002:'../cooperativa/dashboard_coop.html', R003:'../oficinista/ventanilla_boletos.html', R004:'../controlador/panel.html', R005:'../public/index.html', R006:'../chofer/bienvenida.html' };
    const path = new URL(location.href).pathname;
    const family = path.match(/\/views\/(admin|cooperativa|oficinista|controlador|chofer)\//)?.[1];
    const sharedCoopRoute = family === 'cooperativa' && /\/resoluciones_ant\.html$/.test(path);
    const privateRoles = family
        ? (family === 'oficinista'
            ? ['R003', 'R002']
            : (sharedCoopRoute ? ['R002', 'R003'] : [{admin:'R001',cooperativa:'R002',oficinista:'R003',controlador:'R004',chofer:'R006'}[family]]))
        : /\/usuario\/(mis_boletos|seleccion_asientos)\.html$/.test(path) ? ['R005','R004','R006'] : null;
    let checking = null;
    let ended = false;
    let verifiedId = null;
    let verifiedUser = null;
    function clearCache() {
        try { localStorage.removeItem('usuario'); localStorage.removeItem('token'); sessionStorage.removeItem('publicTripSearch'); } catch {}
    }
    function requireLogin() {
        ended = true;
        verifiedUser = null;
        clearCache();
        if (privateRoles) document.documentElement.hidden = true;
        location.replace('../public/index.html?login=1');
    }

    async function sessionFetch(input, options = {}) {
        const source = input instanceof Request ? input.url : input;
        const url = new URL(source, location.href);
        const isApi = [configured.origin, api.origin].includes(url.origin) && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
        if (!isApi) return nativeFetch(input, options);
        url.protocol = api.protocol;
        url.host = api.host;
        const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-Transport-Client', '1');
        const request = input instanceof Request ? new Request(url, input) : url.href;
        const response = await nativeFetch(request, { ...options, credentials: 'include', headers });
        if (response.status === 401 && privateRoles) requireLogin();
        return response;
    }
    window.fetch = sessionFetch;
    async function logout() {
        const response = await sessionFetch(`${window.API_BASE_URL}/auth/logout`, { method: 'POST', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('No se pudo cerrar la sesión. Inténtalo nuevamente.');
        ended = true;
        verifiedUser = null;
        clearCache();
        if (privateRoles) document.documentElement.hidden = true;
        window.dispatchEvent(new Event('transport:logout'));
        location.replace('../public/index.html');
    }
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('#btnCerrarSesion, #logoutButton, #btnSalir, button[onclick="cerrarSesion()"]');
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (button.dataset?.session === 'guest') { location.href = '../public/index.html?login=1'; return; }
        if (button.disabled) return;
        button.disabled = true;
        try { await logout(); } catch (error) {
            let message = document.getElementById('sessionError');
            if (!message) { message = document.createElement('p'); message.id = 'sessionError'; message.setAttribute('role', 'alert'); button.after(message); }
            message.textContent = error.message;
            button.disabled = false;
        }
    }, true);
    async function current() {
        const response = await sessionFetch(`${window.API_BASE_URL}/auth/me`, { cache:'no-store', signal:AbortSignal.timeout(8000) });
        if (response.status === 401 || response.status === 403) return null;
        const data = await response.json();
        if (!response.ok || !panels[data.usuario?.rolId]) throw new Error('No se pudo comprobar la sesión.');
        return data.usuario;
    }
    function verifyPrivate() {
        if (checking) return checking;
        document.documentElement.hidden = true;
        checking = (async () => {
            try {
                const user = await current();
                if (ended) return null;
                if (!user) { requireLogin(); return null; }
                if (!privateRoles.includes(user.rolId)) { location.replace(panels[user.rolId]); return null; }
                if (family === 'oficinista' && user.rolId === 'R002' && user.accesoConfigurado === true && !user.principal && !user.permisos?.some(p => ['ventanilla', 'salidas', 'rutas'].includes(p))) {
                    location.replace(panels[user.rolId]);
                    return null;
                }
                if (verifiedId && verifiedId !== user.id) { location.reload(); return null; }
                verifiedId = user.id;
                verifiedUser = user;
                try { localStorage.setItem('usuario', JSON.stringify(user)); } catch {}
                document.documentElement.hidden = false;
                return user;
            } catch { location.replace('../public/index.html?login=1'); return null; }
            finally { checking = null; }
        })();
        return checking;
    }
    window.TransportSession = { fetch: sessionFetch, logout, current, get user() { return verifiedUser; }, panelFor: role => panels[role] || null, ready: privateRoles ? verifyPrivate() : Promise.resolve(null) };
    if (privateRoles) {
        window.addEventListener('pageshow', event => { if (event.persisted) verifyPrivate().then(user => { if (user) location.reload(); }); });
        window.addEventListener('pagehide', () => { document.documentElement.hidden = true; });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) verifyPrivate(); });
    }
})();
