(() => {
  'use strict';

  let usuario;
  try {
    usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  } catch (error) {
    console.warn('Sesión local ilegible', error);
    usuario = null;
  }

  if (!usuario || usuario.rolId !== 'R001') {
    window.location.replace('../auth/login.html');
    return;
  }

  document.documentElement.classList.add('admin-authorized');

  const pagina = document.body.dataset.page || 'dashboard';
  const sidebar = document.getElementById('adminSidebar');
  const topbar = document.getElementById('adminTopbar');
  const backdrop = document.getElementById('menuBackdrop');

  if (sidebar) {
    sidebar.innerHTML = `
      <div class="admin-brand">
        <span class="brand-symbol" aria-hidden="true">T</span>
        <div>
          <div class="brand-name">Transporte Admin</div>
          <div class="brand-subtitle">Gestión interprovincial</div>
        </div>
      </div>
      <p class="nav-heading">Principal</p>
      <nav class="admin-nav" aria-label="Navegación del administrador">
        <a class="nav-link" href="dashboard.html" data-nav="dashboard"><span class="nav-mark" aria-hidden="true">▦</span>Dashboard General</a>
        <a class="nav-link" href="cooperativas.html" data-nav="cooperativas"><span class="nav-mark" aria-hidden="true">▤</span>Gestión de Cooperativas</a>
      </nav>
      <p class="nav-heading">Personal operativo</p>
      <nav class="admin-nav" aria-label="Gestión de personal">
        <a class="nav-link sub-link" href="usuarios.html#oficinistas" data-nav="oficinistas">Oficinistas</a>
        <a class="nav-link sub-link" href="usuarios.html#controladores" data-nav="controladores">Controladores</a>
      </nav>
      <p class="nav-heading">Operaciones</p>
      <nav class="admin-nav" aria-label="Operaciones del transporte">
        <a class="nav-link" href="hojas_ruta.html" data-nav="hojas"><span class="nav-mark" aria-hidden="true">⇄</span>Hojas de Ruta</a>
      </nav>
      <div class="sidebar-footer">Proyecto de Manejo y Configuración de Software</div>
    `;
  }

  if (topbar) {
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="btn-menu" type="button" id="btnMenu" aria-label="Abrir menú" aria-expanded="false" aria-controls="adminSidebar">☰</button>
        <h2 class="topbar-title">Panel de Administración</h2>
      </div>
      <div class="topbar-right">
        <div class="topbar-user"><strong id="nombreUsuario"></strong><span>Administrador</span></div>
        <button class="btn-logout" type="button" id="btnCerrarSesion">Cerrar sesión</button>
      </div>
    `;

    document.getElementById('nombreUsuario').textContent = usuario.nombre || 'Administrador';
    document.getElementById('btnCerrarSesion').addEventListener('click', () => {
      localStorage.removeItem('usuario');
      window.location.replace('../auth/login.html');
    });
  }

  const menuButton = document.getElementById('btnMenu');
  const cerrarMenu = () => {
    document.body.classList.remove('menu-open');
    if (backdrop) backdrop.hidden = true;
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    if (menuButton) menuButton.setAttribute('aria-label', 'Abrir menú');
  };

  menuButton?.addEventListener('click', () => {
    const abierto = document.body.classList.toggle('menu-open');
    if (backdrop) backdrop.hidden = !abierto;
    menuButton.setAttribute('aria-expanded', String(abierto));
    menuButton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });
  backdrop?.addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cerrarMenu();
  });

  function actualizarNavegacion() {
    let activo = pagina;
    if (pagina === 'usuarios') {
      activo = location.hash === '#controladores' ? 'controladores' : 'oficinistas';
      for (const [id, clave] of [['tabOficinistas', 'oficinistas'], ['tabControladores', 'controladores']]) {
        const tab = document.getElementById(id);
        if (tab) {
          tab.classList.toggle('active', activo === clave);
          if (activo === clave) tab.setAttribute('aria-current', 'page');
          else tab.removeAttribute('aria-current');
        }
      }
    }
    sidebar?.querySelectorAll('[data-nav]').forEach((link) => {
      const seleccionado = link.dataset.nav === activo;
      link.classList.toggle('active', seleccionado);
      if (seleccionado) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  window.addEventListener('hashchange', actualizarNavegacion);
  actualizarNavegacion();
})();
