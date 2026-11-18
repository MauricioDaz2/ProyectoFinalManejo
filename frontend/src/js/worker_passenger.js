(() => {
    'use strict';
    let busy = false;
    function render(user) {
        const back = document.getElementById('workerReturnLink');
        back.hidden = !['R004', 'R006'].includes(user?.rolId);
        if (!back.hidden) back.href = window.TransportSession.panelFor(user.rolId);
        document.querySelectorAll('a[href="mis_boletos.html"]').forEach(link => {
            link.hidden = !['R005', 'R004', 'R006'].includes(user?.rolId);
        });
        const label = document.getElementById('catalogSessionLabel');
        if (label) label.textContent = user ? user.nombre || user.id : 'Visitante';
        const logout = document.getElementById('logoutButton');
        logout.dataset.session = user ? 'authenticated' : 'guest';
        logout.textContent = user ? 'Cerrar sesión' : 'Iniciar sesión';
        logout.disabled = false;
        if (user) window.PersonalProfile?.setSession(user);
        else document.querySelectorAll('[data-personal-user]').forEach(node => { node.hidden = true; });
    }
    async function refresh() {
        if (busy) return;
        busy = true;
        try { render(await window.TransportSession.current()); }
        catch {
            render(null);
            const label = document.getElementById('catalogSessionLabel');
            if (label) label.textContent = 'Sesión sin verificar';
        } finally { busy = false; }
    }
    window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
    window.addEventListener('transport:logout', () => render(null));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    refresh();
})();
