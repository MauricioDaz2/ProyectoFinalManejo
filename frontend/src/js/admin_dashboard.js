(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;
  if (!document.documentElement.classList.contains('admin-authorized')) return;
  const D = window.DashboardData;
  const api = window.API_BASE_URL || 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  const set = (id, value) => {
    $(id).textContent = value === null ? 'No disponible' : String(value);
    $(id).classList.toggle('unavailable', value === null);
  };
  const empty = (id, text) => { $(id).innerHTML = `<p class="dash-empty">${escape(text)}</p>`; };
  const formatDate = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', year: 'numeric' });
  async function get(path, key) {
    const response = await fetch(`${api}${path}`, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Consulta no disponible');
    const data = await response.json();
    if (data.success !== true || (key && !Array.isArray(data[key]))) throw new Error('Respuesta no válida');
    return key ? data[key] : data;
  }
  function renderTrips(data) {
    $('tripsTable').hidden = !data.upcoming.length;
    $('tripsEmpty').hidden = !!data.upcoming.length;
    $('tripsBody').innerHTML = data.upcoming.map((row) => `<tr><td><strong>${escape(row.NOM_COP || 'No disponible')}</strong></td><td>${escape(row.CIU_ORI_FRE || 'No disponible')} → ${escape(row.CIU_DES_FRE || 'No disponible')}</td><td>${escape(formatDate(D.day(row)))}</td><td>${escape(row.NUM_BUS_REE || row.NUM_BUS_PER || 'No disponible')}</td><td><span class="dash-badge">${escape(D.normalize(row.EST_VIA_HOJ))}</span></td></tr>`).join('');
    if (!data.upcoming.length) $('tripsEmpty').innerHTML = `${icon('calendar')}<div><strong>No hay próximas salidas programadas</strong><p>La programación aparecerá aquí cuando se registren nuevos viajes.</p></div>`;
    $('tripsNote').textContent = 'Se muestran fechas de viaje; la consulta no proporciona horas de salida verificables.';
  }
  async function occupancy(rows) {
    $('occupancyCard').hidden = true;
    $('occupancyContent').innerHTML = '';
    if (!rows.length) return;
    const maps = [];
    for (let i = 0; i < rows.length; i += 4) {
      maps.push(...await Promise.all(rows.slice(i, i + 4).map((row) => get(`/usuario/reservas/${encodeURIComponent(row.ID_HOJ)}/asientos`, 'asientos'))));
    }
    const counts = D.seats(maps);
    if (!counts.total) return;
    const occupied = counts.occupied / counts.total * 100;
    const reserved = counts.reserved / counts.total * 100;
    $('occupancyContent').innerHTML = `<div class="dash-occupancy"><div class="dash-ring" role="img" aria-label="${Math.round(occupied)} por ciento de asientos ocupados" style="--occupied:${occupied}%;--reserved-end:${occupied + reserved}%"><div><strong>${Math.round(occupied)}%</strong><span>Ocupados</span></div></div><dl class="dash-legend"><div><dt><i class="dot occupied"></i>Ocupados</dt><dd>${counts.occupied}</dd></div><div><dt><i class="dot reserved"></i>Reservados</dt><dd>${counts.reserved}</dd></div><div><dt><i class="dot free"></i>Libres</dt><dd>${counts.free}</dd></div></dl></div><p class="dash-note">${counts.total} plazas en ${rows.length} viaje(s). Cada plaza se cuenta por viaje.</p>`;
    $('occupancyCard').hidden = false;
  }
  async function sales(today) {
    const days = D.days(today);
    const values = await Promise.all(days.map(async (day) => D.sales(await get(`/oficinista/resumen?fecha=${day}`), day)));
    if (!values.some((value) => value > 0)) { empty('salesContent', 'No hay boletos vendidos en los últimos 7 días.'); return; }
    const max = Math.max(4, ...values);
    const coordinates = values.map((value, i) => `${38 + i * 68},${170 - value / max * 140}`);
    const labels = days.map((day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', weekday: 'short', day: 'numeric' }));
    $('salesContent').innerHTML = `<svg class="dash-sales-chart" viewBox="0 0 488 210" role="img" aria-labelledby="salesChartTitle"><title id="salesChartTitle">Boletos vendidos por día, detalle en la tabla adjunta</title><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ed1537" stop-opacity=".28"/><stop offset="100%" stop-color="#ed1537" stop-opacity=".02"/></linearGradient></defs>${[0, 1, 2, 3, 4].map((step) => `<line x1="38" y1="${170 - step * 35}" x2="446" y2="${170 - step * 35}" stroke="#e9edf5"/><text x="29" y="${174 - step * 35}" text-anchor="end">${Math.round(max * step / 4)}</text>`).join('')}<path d="M38,170 L${coordinates.join(' L')} L446,170 Z" fill="url(#salesFill)"/><polyline points="${coordinates.join(' ')}" fill="none" stroke="#df1030" stroke-width="2.5"/>${coordinates.map((point, i) => `<circle cx="${point.split(',')[0]}" cy="${point.split(',')[1]}" r="4" fill="#df1030"/><text x="${38 + i * 68}" y="195" text-anchor="middle">${escape(labels[i])}</text>`).join('')}</svg><details class="dash-chart-details"><summary>Ver valores por día</summary><table><caption>Ventas: boletos emitidos, pagados o usados</caption><tbody>${days.map((day, i) => `<tr><th scope="row">${escape(formatDate(day))}</th><td>${values[i]}</td></tr>`).join('')}</tbody></table></details>`;
  }
  let loading = false;
  async function update() {
    if (loading) return;
    loading = true;
    $('btnActualizarDashboard').disabled = true;
    $('estadoDashboard').textContent = 'Actualizando información…';
    $('estadoDashboard').classList.remove('is-error');
    $('occupancyCard').hidden = true;
    $('occupancyContent').innerHTML = '';
    const today = D.date();
    set('queryDate', formatDate(today));
    const records = {};
    const tasks = [
      async () => {
        const rows = await get('/admin/cooperativas', 'cooperativas');
        records.cooperatives = rows;
        set('metricCooperativas', rows.length);
        set('metricCooperativasActivas', rows.filter((row) => D.normalize(row.EST_COP) === '1').length);
      },
      async () => { const rows = await get('/admin/parada/flota', 'buses'); records.buses = rows; set('metricBuses', rows.length); },
      async () => {
        const rows = await get('/admin/usuarios', 'usuarios');
        records.staff = rows;
        const office = rows.filter((row) => D.normalize(row.ID_ROL_PER) === 'R003').length;
        const controllers = rows.filter((row) => D.normalize(row.ID_ROL_PER) === 'R004').length;
        set('metricOficinistas', office); set('metricControladores', controllers); set('metricPersonal', office + controllers);
      },
      async () => { const rows = await get('/admin/rutas/frecuencias', 'frecuencias'); set('metricRutas', D.routes(rows)); records.routes = rows; },
      async () => {
        const data = D.trips(await get('/admin/rutas/hojas', 'hojas'), today);
        renderTrips(data);
        try { await occupancy(data.occupancy); } catch { throw new Error('occupancy'); }
      },
      async () => { await sales(today); }
    ];
    const results = await Promise.allSettled(tasks.map((task) => task()));
    const notices = ['cooperatives', 'buses', 'routes', 'staff'].map((kind) => D.operational(kind, records[kind]));
    if (results[4].status === 'rejected') notices.push({ title: results[4].reason.message === 'occupancy' ? 'Ocupación de asientos' : 'Programación de viajes', icon: 'calendar', href: null, tone: 'neutral', message: 'No disponible. No se pudo verificar la información.' });
    $('operationalStatus').innerHTML = notices.map((notice) => `<li class="dash-alert ${notice.tone}"><span class="dash-alert-icon">${icon(notice.icon)}</span><div><h3>${escape(notice.title)}</h3><p>${escape(notice.message)}</p></div>${notice.href ? `<a href="${notice.href}" aria-label="Consultar ${escape(notice.title)}">→</a>` : ''}</li>`).join('');
    const metrics = [['metricCooperativas', 'metricCooperativasActivas'], ['metricBuses'], ['metricPersonal', 'metricOficinistas', 'metricControladores'], ['metricRutas']];
    metrics.forEach((ids, index) => { if (results[index].status === 'rejected') ids.forEach((id) => set(id, null)); });
    if (results[4].status === 'rejected' && results[4].reason.message !== 'occupancy') {
      $('tripsTable').hidden = true;
      $('tripsBody').innerHTML = '';
      $('tripsEmpty').hidden = false;
      $('tripsEmpty').innerHTML = `${icon('calendar')}<div><strong>No disponible</strong><p>No se pudo consultar la programación.</p></div>`;
      $('tripsNote').textContent = 'No se pudo consultar la programación. Vuelve a intentar con «Actualizar datos».';
    }
    if (results[5].status === 'rejected') empty('salesContent', 'No disponible. No se pudieron verificar las ventas de los 7 días.');
    const failed = results.filter((result) => result.status === 'rejected').length;
    $('estadoDashboard').textContent = failed === results.length ? 'No disponible. No se pudieron consultar los datos. Verifica la conexión y vuelve a intentar.' : failed ? 'Algunas consultas no están disponibles. Los demás datos se actualizaron.' : `Información actualizada a las ${new Date().toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' })}.`;
    $('estadoDashboard').classList.toggle('is-error', failed > 0);
    $('btnActualizarDashboard').disabled = false;
    loading = false;
  }
  $('btnActualizarDashboard').addEventListener('click', update);
  update();
})();
