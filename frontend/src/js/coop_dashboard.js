(() => {
  'use strict';
  const D = window.CoopDashboardData;
  const $ = (id) => document.getElementById(id);
  const escape = App.escapar;
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
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  const value = (id, count) => {
    $(id).textContent = count === null ? 'No disponible' : String(count);
    $(id).classList.toggle('unavailable', count === null);
  };
  function imageUrl(source) {
    if (!source) return null;
    try {
      const url = new URL(source, `${new URL(window.API_BASE_URL).origin}/`);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function logo(id, source) {
    const target = $(id);
    target.innerHTML = icon('bus');
    target.dataset.source = '';
    const url = imageUrl(source);
    if (!url) return;
    const img = new Image();
    img.alt = '';
    img.onload = () => { if (target.dataset.source === url) target.replaceChildren(img); };
    target.dataset.source = url;
    img.src = url;
  }
  function identity(user) {
    resetBrand();
    App.guardarSesion(user);
    $('representative').textContent = user.nombre;
    window.PersonalProfile?.setSession(user);
    for (const id of ['headerName', 'heroName', 'previewName']) $(id).textContent = user.cooperativaNombre || 'Mi cooperativa';
    for (const id of ['headerLogo', 'heroLogo', 'previewLogo']) logo(id, user.cooperativaLogo);
    const link = $('publicProfileLink');
    link.hidden = !user.cooperativaActiva || !user.cooperativaId;
    link.href = `../public/cooperativa.html?${new URLSearchParams({ id: user.cooperativaId })}`;
  }
  function cover(id, source) {
    const target = $(id);
    const url = imageUrl(source);
    target.dataset.source = url || '';
    target.replaceChildren();
    target.parentElement.classList.remove('has-cover');
    if (!url) return;
    const img = new Image();
    img.alt = '';
    img.onload = () => {
      if (target.dataset.source !== url) return;
      target.replaceChildren(img);
      target.parentElement.classList.add('has-cover');
    };
    img.src = url;
  }
  function resetBrand() {
    const workspace = $('coopWorkspace');
    workspace.classList.remove('has-published-identity');
    for (const name of ['primary', 'secondary', 'on-primary', 'on-secondary', 'primary-ink', 'secondary-ink']) workspace.style.removeProperty(`--coop-${name}`);
    cover('heroCover', null);
    cover('previewCover', null);
  }
  function palette(name, color) {
    if (!/^#[\da-f]{6}$/i.test(color || '')) return;
    const luminance = color.slice(1).match(/../g).map((hex) => {
      const channel = parseInt(hex, 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const whiteContrast = 1.05 / (luminance + .05);
    const style = $('coopWorkspace').style;
    style.setProperty(`--coop-${name}`, color);
    style.setProperty(`--coop-on-${name}`, whiteContrast >= 4.5 ? '#ffffff' : '#000000');
    style.setProperty(`--coop-${name}-ink`, whiteContrast >= 4.5 ? color : '#101d36');
  }
  async function publishedIdentity(user) {
    const data = await App.api(`/public/cooperativas/${encodeURIComponent(user.cooperativaId)}`);
    if (data.cooperativa?.ID_COP !== user.cooperativaId) throw new Error('Identidad de cooperativa no válida.');
    if (!data.contenido) return;
    const company = data.cooperativa;
    for (const id of ['headerName', 'heroName', 'previewName']) $(id).textContent = company.NOM_COP;
    for (const id of ['headerLogo', 'heroLogo', 'previewLogo']) logo(id, company.LOG_URL_COP);
    palette('primary', data.contenido.principal);
    palette('secondary', data.contenido.secundario);
    $('coopWorkspace').classList.add('has-published-identity');
    cover('heroCover', data.contenido.portada);
    cover('previewCover', data.contenido.portada);
  }
  async function list(path, key) {
    const data = await App.api(path);
    if (!Array.isArray(data[key])) throw new Error('Respuesta no válida');
    return data[key];
  }
  function renderFleet(rows) {
    value('totalBuses', rows.length);
    $('activeBuses').textContent = `${rows.filter((row) => D.normalized(row.EST_BUS) === 'ACTIVO').length} unidades activas`;
    if (!rows.length) { $('fleetCards').innerHTML = `<div class="coop-empty">${icon('bus')}<strong>Tu flota comienza aquí</strong><p>Todavía no hay buses registrados.</p><a class="coop-link" href="gestion_buses.html">Gestionar buses →</a></div>`; return; }
    $('fleetCards').innerHTML = rows.slice(0, 3).map((bus) => {
      const image = imageUrl(bus.IMG_URL_BUS);
      const seats = typeof bus.TOTAL_ASIENTOS === 'number' ? `${bus.TOTAL_ASIENTOS} asientos` : 'Asientos no disponibles';
      return `<article class="coop-bus-card"><div class="coop-bus-image">${icon('bus')}${image ? `<img src="${escape(image)}" alt="Bus ${escape(bus.NUM_BUS)}" loading="lazy">` : ''}</div><div><strong>${escape(bus.NUM_BUS)}</strong><span class="coop-badge">${escape(bus.EST_BUS || 'Sin estado')}</span><p>${escape(bus.PLA_BUS)} · ${escape(seats)}</p></div></article>`;
    }).join('');
    $('fleetCards').querySelectorAll('img').forEach((img) => { img.addEventListener('error', () => img.remove(), { once: true }); });
  }
  function renderFrequencies(rows) {
    const data = D.frequencies(rows);
    value('totalRutas', data.routes.length); value('totalFrecuencias', data.count);
    $('previewRoutes').innerHTML = data.routes.length ? `<strong>Rutas activas</strong>${data.routes.slice(0, 3).map((route) => `<span>${escape(route.origin)} → ${escape(route.destination)}</span>`).join('')}${data.routes.length > 3 ? `<span>+${data.routes.length - 3} rutas</span>` : ''}` : '<span>Aún no hay rutas con frecuencias activas.</span>';
  }
  function renderTrips(rows) {
    const data = D.trips(rows, D.today());
    value('totalSalidas', data.today);
    $('tablaSalidas').innerHTML = data.upcoming.length ? data.upcoming.map((row) => `<tr><td>${escape(row.CIU_ORI_FRE)} → ${escape(row.CIU_DES_FRE)}</td><td>${App.fecha(row.FEC_PRO_HOJ)}</td><td>${escape(row.NUM_BUS || 'No disponible')}</td><td><span class="coop-badge">${escape(row.EST_VIA_HOJ)}</span></td></tr>`).join('') : '<tr><td colspan="4"><div class="coop-empty compact"><strong>No hay próximas salidas</strong><p>Las hojas de ruta de tu cooperativa aparecerán aquí cuando estén programadas.</p></div></td></tr>';
  }
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    $('btnActualizar').disabled = true;
    $('panelStatus').textContent = 'Verificando sesión y consultando registros…';
    $('panelStatus').classList.remove('error');
    try {
      const session = await App.api('/auth/me');
      if (session.usuario?.rolId !== 'R002') { window.location.replace('../auth/login.html'); return; }
      identity(session.usuario);
      window.CoopAccess?.apply(session.usuario);
      document.documentElement.classList.add('admin-authorized');
      if (!session.usuario.cooperativaId || !session.usuario.cooperativaActiva) throw new Error('Tu cuenta no tiene una cooperativa activa asignada. Solicita al administrador que revise la asignación.');
      const allowed = (permission) => session.usuario.accesoConfigurado !== true || session.usuario.principal || session.usuario.permisos?.includes(permission);
      const results = await Promise.allSettled([
        allowed('buses') ? list('/coop/buses', 'buses').then(renderFleet) : Promise.resolve(),
        allowed('rutas') ? list('/coop/frecuencias', 'frecuencias').then(renderFrequencies) : Promise.resolve(),
        allowed('salidas') ? list('/coop/hojas-ruta', 'hojas').then(renderTrips) : Promise.resolve(),
        allowed('reportes') ? App.api('/coop/resumen').then((data) => {
          for (const [id, key] of [['totalResoluciones', 'TOTAL_RESOLUCIONES'], ['totalBoletos', 'BOLETOS_HOY'], ['totalIngresos', 'INGRESOS_HOY'], ['totalReservas', 'RESERVAS_PENDIENTES']]) {
            const count = D.number(data.resumen?.[key]);
            value(id, id === 'totalIngresos' ? new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(count) : count);
          }
        }) : Promise.resolve(),
        publishedIdentity(session.usuario),
        session.usuario.accesoConfigurado === true && allowed('dashboard') ? App.api('/coop/indicadores') : Promise.resolve(null)
      ]);
      if (!allowed('rutas')) $('previewRoutes').textContent = 'Consulta las rutas publicadas en la página de tu cooperativa.';
      if (results[0].status === 'rejected') { value('totalBuses', null); $('activeBuses').textContent = 'No disponible'; $('fleetCards').innerHTML = '<p class="coop-empty">No disponible. No se pudo consultar la flota.</p>'; }
      if (results[1].status === 'rejected') { value('totalRutas', null); value('totalFrecuencias', null); $('previewRoutes').textContent = 'Rutas no disponibles.'; }
      if (results[2].status === 'rejected') { value('totalSalidas', null); $('tablaSalidas').innerHTML = '<tr><td colspan="4">No disponible. No se pudo consultar la programación.</td></tr>'; }
      if (results[3].status === 'rejected') for (const id of ['totalResoluciones', 'totalBoletos', 'totalIngresos', 'totalReservas']) value(id, null);
      if (results[5].status === 'fulfilled' && results[5].value) {
        const data = results[5].value.indicadores;
        for (const [id,key] of [['totalBuses','BUSES'],['totalRutas','RUTAS'],['totalFrecuencias','FRECUENCIAS'],['totalSalidas','SALIDAS']]) value(id,D.number(data[key]));
        $('activeBuses').textContent = `${D.number(data.ACTIVOS)} unidades activas`;
      }
      if (results[5].status === 'rejected') {
        for (const id of ['totalBuses','totalRutas','totalFrecuencias','totalSalidas']) value(id,null);
        $('activeBuses').textContent = 'No disponible';
      }
      const failed = results.filter((result) => result.status === 'rejected').length;
      $('panelStatus').textContent = failed ? 'Algunas consultas no están disponibles. Puedes volver a actualizar.' : `Datos de tu cooperativa actualizados · ${new Date().toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' })}`;
      $('panelStatus').classList.toggle('error', failed > 0);
    } catch (error) {
      if (error.status === 401) { window.location.replace('../auth/login.html'); return; }
      document.documentElement.classList.add('admin-authorized');
      $('panelStatus').textContent = error.message;
      $('panelStatus').classList.add('error');
      for (const id of ['totalBuses', 'totalRutas', 'totalFrecuencias', 'totalSalidas', 'totalResoluciones', 'totalBoletos', 'totalIngresos', 'totalReservas']) value(id, null);
      $('activeBuses').textContent = 'No disponible';
      $('fleetCards').innerHTML = '<p class="coop-empty">No disponible.</p>';
      $('tablaSalidas').innerHTML = '<tr><td colspan="4">No disponible.</td></tr>';
      $('previewRoutes').textContent = 'No disponible.';
    } finally { loading = false; $('btnActualizar').disabled = false; }
  }
  function closeMenu() {
    document.body.classList.remove('coop-menu-open'); $('coopBackdrop').hidden = true;
    $('coopMenu').setAttribute('aria-expanded', 'false'); $('coopMenu').setAttribute('aria-label', 'Abrir menú');
  }
  $('coopMenu').addEventListener('click', () => {
    const open = document.body.classList.toggle('coop-menu-open');
    $('coopBackdrop').hidden = !open;
    $('coopMenu').setAttribute('aria-expanded', String(open));
    $('coopMenu').setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  $('coopBackdrop').addEventListener('click', closeMenu);
  $('coopSidebar').addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  $('btnActualizar').addEventListener('click', load);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  window.addEventListener('pageshow', (event) => { if (event.persisted) load(); });
  load();
})();
