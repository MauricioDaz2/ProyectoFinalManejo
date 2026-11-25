(() => {
  'use strict';
  const sidebar = document.querySelector('.admin-sidebar');
  if (!sidebar) return;
  const paths = {
    bus: '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 13h16M8 20v2m8-2v2M7 16h2m6 0h2M4 7h16"/>',
    home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
    building: '<path d="M4 22V3h12v19M16 10h5v12M1 22h22M8 7h4M8 11h4M8 15h4m-3 7v-3h2v3"/>',
    route: '<circle cx="5" cy="5" r="3"/><circle cx="19" cy="19" r="3"/><path d="M5 8v8a3 3 0 0 0 3 3h8M8 5h8a3 3 0 0 1 3 3v5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3m-10 3h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v7l4 2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m4 18 5-5 4 3 4-7 4 7"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2c5 0 3-11-6-11Z"/><circle cx="7" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>',
    document: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8m-8 4h6"/>'
  };
  const iconSvg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  const links = [
    ['dashboard_coop.html','home','Inicio'],
    ['dashboard_coop.html#mi-cooperativa','building','Mi cooperativa'],
    ['gestion_buses.html','bus','Buses','buses'],
    ['resoluciones_ant.html','route','Rutas y frecuencias','rutas'],
    ['dashboard_coop.html#salidas','calendar','Próximas salidas','salidas'],
    ['../oficinista/ventanilla_boletos.html','document','Ventanilla de boletos','ventanilla'],
    ['../oficinista/validacion_reservas.html','eye','Validación de reservas','ventanilla'],
    ['personal.html','person','Personal y accesos','trabajadores'],
    ['personalizar.html','palette','Personalización','personalizacion']
  ];
  sidebar.innerHTML = `<div class="coop-platform"><span aria-hidden="true">${iconSvg('bus')}</span><div>Transporte<br>Cooperativas<small>Gestión de transporte de pasajeros<br>del Ecuador</small></div></div><p class="coop-nav-label">PANEL DE MI COOPERATIVA</p><nav class="coop-nav" aria-label="Mi cooperativa">${links.map(([href,symbol,label,permission])=>`<a href="${href}"${permission ? ` data-coop-permission="${permission}" hidden` : ''}><span aria-hidden="true">${iconSvg(symbol)}</span>${label}</a>`).join('')}</nav><div class="coop-sidebar-footer"><a href="../public/index.html">Página principal del sistema ↗</a><p>Tu operación, en un solo lugar.</p><small>Universidad Técnica de Ambato</small></div>`;
  function active() {
    const current = location.pathname.split('/').pop();
    sidebar.querySelectorAll('nav a').forEach(link => {
      const url = new URL(link.href);
      const selected = url.pathname.split('/').pop() === current && (url.hash === location.hash || (current === 'personalizar.html' && !url.hash));
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
  }
  active(); window.addEventListener('hashchange', active);
  if (document.body.classList.contains('staff-page')) {
    sidebar.id = 'staffSidebar';
    const toggle = document.createElement('button');
    toggle.className = 'coop-menu-button'; toggle.type = 'button'; toggle.textContent = '☰';
    toggle.setAttribute('aria-label','Abrir menú'); toggle.setAttribute('aria-controls',sidebar.id); toggle.setAttribute('aria-expanded','false');
    const backdrop = document.createElement('button'); backdrop.className='coop-backdrop'; backdrop.hidden=true; backdrop.setAttribute('aria-label','Cerrar menú'); sidebar.after(backdrop);
    function close() { document.body.classList.remove('coop-menu-open'); backdrop.hidden=true; toggle.setAttribute('aria-expanded','false'); }
    toggle.addEventListener('click',()=> { const open=document.body.classList.toggle('coop-menu-open'); backdrop.hidden=!open; toggle.setAttribute('aria-expanded',String(open)); });
    backdrop.addEventListener('click',close); sidebar.addEventListener('click',e=>{if(e.target.closest('a'))close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    document.querySelector('.coop-topbar').prepend(toggle);
  }
})();
