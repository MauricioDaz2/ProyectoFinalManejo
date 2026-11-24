(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;
  if (!document.documentElement.classList.contains('admin-authorized')) return;
  const $=id=>document.getElementById(id);
  const icons = {
    home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
    bus: '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 13h16M8 20v2m8-2v2M7 16h2m6 0h2M4 7h16"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5v2"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    building: '<path d="M4 22V3h12v19M16 10h5v12M1 22h22M8 7h4M8 11h4M8 15h4m-3 7v-3h2v3"/>',
    route: '<circle cx="5" cy="5" r="3"/><circle cx="19" cy="19" r="3"/><path d="M5 8v8a3 3 0 0 0 3 3h8M8 5h8a3 3 0 0 1 3 3v5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3m-10 3h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v7l4 2"/>',
    seat: '<path d="m5 3 2 12h12v6M4 7l2 12h10M8 19v3"/>',
    bolt: '<path d="m14 2-9 12h7l-2 8 10-13h-7z"/>',
    ticket: '<path d="m3 9 13-6 5 12-13 6-2-4a3 3 0 0 0-2-5zM13 6l4 10"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.route}</svg>`;
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  const nav = [
    ['Inicio', [['dashboard.html', 'home', 'Dashboard']]],
    ['Gestión', [['cooperativas.html', 'building', 'Cooperativas'], ['parada_buses.html', 'bus', 'Parada de Buses']]],
    ['Personal operativo', [['usuarios.html#oficinistas', 'person', 'Oficinistas'], ['usuarios.html#controladores', 'people', 'Controladores']]]
  ];
  $('adminSidebar').innerHTML = `<div class="admin-brand"><span class="dash-brand-icon">${icon('bus')}</span><div><div class="brand-name">Transporte Admin</div><div class="brand-subtitle">Gestión interprovincial</div></div></div>${nav.map(([title, links]) => `<p class="nav-heading">${title}</p><nav class="admin-nav" aria-label="${title}">${links.map(([href, symbol, label]) => `<a class="nav-link${href === location.pathname.split('/').pop() ? ' active' : ''}" href="${href}"${href === location.pathname.split('/').pop() ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>`).join('')}<div class="dash-sidebar-card">${icon('route')}<strong>Sistema de Transporte<br>Interprovincial</strong><p>Gestión, control y operación<br>en un solo lugar.</p><small>Universidad Técnica de Ambato</small></div>`;
  const avatar = document.createElement('span');
  avatar.className = 'dash-avatar';
  avatar.innerHTML = icon('person');
  avatar.setAttribute('aria-hidden', 'true');
  document.querySelector('.topbar-right').prepend(avatar);
  const dateLabel = document.createElement('span');
  dateLabel.className = 'dash-header-date';
  dateLabel.textContent = new Date().toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelector('.topbar-left').append(dateLabel);

})();
