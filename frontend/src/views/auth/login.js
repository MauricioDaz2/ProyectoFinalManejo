(() => {
    'use strict';
    const form = document.getElementById('loginForm');
    const correo = document.getElementById('correo');
    const password = document.getElementById('password');
    const mensaje = document.getElementById('mensajeError');
    const button = form.querySelector('button[type="submit"]');
    const destinos = {
        R001: '../admin/dashboard.html',
        R002: '../cooperativa/dashboard_coop.html',
        R003: '../oficinista/ventanilla_boletos.html',
        R004: '../controlador/panel.html',
        R005: '../usuario/catalogo_viajes.html'
    };
    let request = null;
    function estado(cargando) {
        button.disabled = cargando;
        button.textContent = cargando ? 'Ingresando…' : 'Ingresar';
        form.setAttribute('aria-busy', String(cargando));
    }
    form.addEventListener('invalid', (event) => {
        mensaje.textContent = event.target === correo ? 'Ingresa un correo electrónico válido.' : 'Ingresa tu contraseña.';
    }, true);
    form.addEventListener('input', () => { mensaje.textContent = ''; });
    form.addEventListener('login:cancel', () => {
        request?.abort();
        request = null;
        password.value = '';
        mensaje.textContent = '';
        estado(false);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (request || !form.reportValidity()) return;
        mensaje.textContent = '';
        const current = new AbortController();
        request = current;
        estado(true);
        const timeout = setTimeout(() => current.abort(), 15000);
        try {
            const api = window.API_BASE_URL || 'http://localhost:3000/api';
            const response = await fetch(`${api}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ correo: correo.value.trim(), password: password.value }),
                signal: current.signal
            });
            const data = await response.json();
            if (request !== current || current.signal.aborted) return;
            if (!response.ok || !data.success) {
                mensaje.textContent = data.message || 'No se pudo iniciar sesión. Revisa tus credenciales.';
                return;
            }
            const destino = destinos[data.usuario?.rolId];
            if (!destino) {
                mensaje.textContent = 'Rol de usuario no reconocido.';
                return;
            }
            try {
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
            } catch {
                mensaje.textContent = 'No se pudo guardar la sesión. Permite el almacenamiento del navegador e inténtalo nuevamente.';
                return;
            }
            window.location.href = destino;
        } catch {
            if (request === current) mensaje.textContent = current.signal.aborted
                ? 'El servidor tardó demasiado. Inténtalo nuevamente.'
                : 'No se pudo conectar con el servidor. Inténtalo nuevamente.';
        } finally {
            clearTimeout(timeout);
            if (request === current) { request = null; estado(false); }
        }
    });
})();
