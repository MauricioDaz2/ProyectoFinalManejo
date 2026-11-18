(() => {
    'use strict';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const staticServer = local && location.port !== '3000';
    const origin = location.protocol === 'file:' || staticServer ? 'http://localhost:3000' : location.origin;
    const status = document.getElementById('startStatus');
    const help = document.getElementById('startHelp');
    const retry = document.getElementById('startRetry');
    document.getElementById('startLink').href = origin + '/';
    let busy = false;
    async function connect() {
        if (busy) return;
        busy = true;
        retry.disabled = true;
        status.textContent = 'Comprobando el servidor del proyecto…';
        try {
            const response = await fetch(origin + '/api/health', { credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(4000) });
            if (!response.ok) throw new Error('El servidor no respondió correctamente.');
            const data = await response.json();
            if (data.application !== 'ProyectoFinalManejo' || data.frontend !== '/src/views/public/index.html') throw new Error('La dirección no corresponde al servidor del proyecto.');
            location.replace(origin + data.frontend);
        } catch (error) {
            status.textContent = 'No se pudo conectar con Express. Inicia el proyecto con npm run dev. Si ya estaba abierto antes de esta actualización, reinicia su terminal.';
            help.hidden = false;
            console.warn('Comprobación del servidor:', error.message);
        } finally { busy = false; retry.disabled = false; }
    }
    retry.addEventListener('click', connect);
    connect();
})();
