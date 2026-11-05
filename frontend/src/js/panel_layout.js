(() => {
  'use strict';

  const app = document.body.dataset.app || 'cooperativa';
  const pagina = document.body.dataset.page || 'dashboard';
  const usuario = window.App ? App.requiereSesion(app === 'oficinista' ? ['R003'] : ['R002']) : null;
  if (!usuario) return;

  document.documentElement.classList.add('panel-authorized');

  const configuracion = {
    cooperativa: {
      marca: 'Cooperativa',
      subtitulo: 'Gestión de flota y operaciones',
      rol: 'Usuario de Cooperativa',
      titulos: {
        dashboard: 'Panel de la Cooperativa',
        buses: 'Gestión de Flota de Buses',
        resoluciones: 'Resoluciones ANT y Frecuencias'
      },
      navegacion: [
        { pagina: 'dashboard', href: 'dashboard_coop.html', icono: '▦', texto: 'Dashboard' },
        { pagina: 'buses', href: 'gestion_buses.html', icono: '▤', texto: 'Flota de Buses' },
        { pagina: 'resoluciones', href: 'resoluciones_ant.html', icono: '▧', texto: 'Resoluciones y Frecuencias' }
      ]
    },
    oficinista: {
      marca: 'Oficinista',
      subtitulo: 'Ventanilla y control de abordaje',
      rol: 'Oficinista de Ventanilla',
      titulos: {
        ventanilla: 'Ventanilla de Boletos',
        validacion: 'Validación de Reservas'
      },
      navegacion: [
        { pagina: 'ventanilla', href: 'ventanilla_boletos.html', icono: '▣', texto: 'Venta de Boletos' },
        { pagina: 'validacion', href: 'validacion_reservas.html', icono: '◉', texto: 'Validación de Reservas' }
      ]
    }
  };

  const config = configuracion[app] || configuracion.cooperativa;
  const sidebar = document.getElementById('adminSidebar');
  const topbar = document.getElementById('adminTopbar');
  const backdrop = document.getElementById('menuBackdrop');

  if (sidebar) {
    sidebar.innerHTML = `
      <div class="admin-brand">
        <span class="brand-symbol" aria-hidden="true">T</span>
        <div>
          <div class="brand-name">Transporte UTA</div>
          <div class="brand-subtitle">${App.escapar(config.marca)} · ${App.escapar(config.subtitulo)}</div>
        </div>
      </div>
      <p class="nav-heading">Menú principal</p>
      <nav class="admin-nav" aria-label="Navegación del panel">
        ${config.navegacion.map((item) => `
          <a class="nav-link" href="${item.href}" data-nav="${item.pagina}">
            <span class="nav-mark" aria-hidden="true">${item.icono}</span>${App.escapar(item.texto)}
          </a>`).join('')}
      </nav>
      <div class="sidebar-context">
        <span class="sidebar-context-label">Cooperativa</span>
        <strong>${App.escapar(usuario.cooperativaId || 'Sin asignar')}</strong>
      </div>
      <div class="sidebar-footer">Proyecto de Manejo y Configuración de Software</div>
    `;
  }

  if (topbar) {
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="btn-menu" type="button" id="btnMenu" aria-label="Abrir menú" aria-expanded="false" aria-controls="adminSidebar">☰</button>
        <div class="topbar-copy">
          <h2 class="topbar-title">${App.escapar(config.titulos[pagina] || config.marca)}</h2>
          <span class="topbar-date" id="topbarFecha"></span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-user"><strong id="nombreUsuario"></strong><span>${App.escapar(config.rol)}</span></div>
        <button class="btn-logout" type="button" id="btnCerrarSesion">Cerrar sesión</button>
      </div>
    `;

    const nombre = document.getElementById('nombreUsuario');
    if (nombre) nombre.textContent = usuario.nombre || config.rol;

    const fecha = document.getElementById('topbarFecha');
    if (fecha) fecha.textContent = App.fechaLarga(App.hoyISO());

    const cerrar = document.getElementById('btnCerrarSesion');
    if (cerrar) cerrar.addEventListener('click', () => App.cerrarSesion());
  }

  const menuButton = document.getElementById('btnMenu');
  const cerrarMenu = () => {
    document.body.classList.remove('menu-open');
    if (backdrop) backdrop.hidden = true;
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Abrir menú');
    }
  };

  if (menuButton) {
    menuButton.addEventListener('click', () => {
      const abierto = document.body.classList.toggle('menu-open');
      if (backdrop) backdrop.hidden = !abierto;
      menuButton.setAttribute('aria-expanded', String(abierto));
      menuButton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    });
  }
  if (backdrop) backdrop.addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') cerrarMenu();
  });

  sidebar?.querySelectorAll('[data-nav]').forEach((link) => {
    const activo = link.dataset.nav === pagina;
    link.classList.toggle('active', activo);
    if (activo) link.setAttribute('aria-current', 'page');
  });

  App.prepararModales();
  window.AppLayout = { config, pagina, usuario };
})();
