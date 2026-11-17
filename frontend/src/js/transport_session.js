(() => {
    'use strict';
    const nativeFetch = window.fetch.bind(window);
    const localHosts = ['localhost', '127.0.0.1', '[::1]'];
    const configured = new URL(window.API_BASE_URL || 'http://localhost:3000/api');
    const api = new URL(configured);
    if (localHosts.includes(location.hostname) && localHosts.includes(api.hostname)) api.hostname = location.hostname;
    window.API_BASE_URL = api.href.replace(/\/$/, '');

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
        return nativeFetch(request, { ...options, credentials: 'include', headers });
    }
    window.fetch = sessionFetch;
    async function logout() {
        const response = await sessionFetch(`${window.API_BASE_URL}/auth/logout`, { method: 'POST', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('No se pudo cerrar la sesión. Inténtalo nuevamente.');
        localStorage.removeItem('usuario');
        localStorage.removeItem('token');
        sessionStorage.removeItem('publicTripSearch');
        window.dispatchEvent(new Event('transport:logout'));
        location.replace('../public/index.html');
    }
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('#btnCerrarSesion, #logoutButton, #btnSalir, button[onclick="cerrarSesion()"]');
        if (!button) return;
        if (button.id === 'logoutButton' && !localStorage.getItem('usuario')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (button.disabled) return;
        button.disabled = true;
        try { await logout(); } catch (error) {
            let message = document.getElementById('sessionError');
            if (!message) { message = document.createElement('p'); message.id = 'sessionError'; message.setAttribute('role', 'alert'); button.after(message); }
            message.textContent = error.message;
            button.disabled = false;
        }
    }, true);
    window.TransportSession = { fetch: sessionFetch, logout };
})();
