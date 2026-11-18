(() => {
    'use strict';
    const dialog = document.getElementById('loginDialog');
    const form = document.getElementById('loginForm');
    if (typeof dialog.showModal !== 'function') return;
    let opener = null;
    let startedOutside = false;
    function open() {
        if (!dialog.open) dialog.showModal();
        document.body.classList.add('login-modal-open');
        document.getElementById('correo').focus();
    }

    document.querySelectorAll('a[href="../auth/login.html"]').forEach((link) => {
        link.setAttribute('aria-haspopup', 'dialog');
        link.setAttribute('aria-controls', 'loginDialog');
        link.addEventListener('click', (event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            opener = link;
            open();
        });
    });
    const close = () => {
        form.dispatchEvent(new Event('login:cancel'));
        dialog.close();
    };
    document.getElementById('closeLogin').addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    const outside = (event) => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', (event) => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', (event) => {
        if (startedOutside && event.target === dialog && outside(event)) close();
        startedOutside = false;
    });
    dialog.addEventListener('close', () => {
        document.body.classList.remove('login-modal-open');
        opener?.focus();
    });
    const url = new URL(location.href);
    if (url.searchParams.get('login') === '1') {
        url.searchParams.delete('login');
        history.replaceState(null, '', url.href);
        window.TransportSession.current().then(user => {
            if (user) {
                const destination = new URL(window.TransportSession.panelFor(user.rolId), location.href);
                if (destination.pathname !== url.pathname) location.replace(destination.href);
            } else open();
        }).catch(() => {
            open();
            document.getElementById('mensajeError').textContent = 'No se pudo comprobar la sesión. Revisa la conexión e inténtalo nuevamente.';
        });
    }
})();
