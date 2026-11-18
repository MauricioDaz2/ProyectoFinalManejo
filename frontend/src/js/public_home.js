(() => {
  'use strict';
  const api = window.API_BASE_URL || 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let routes = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  $('fecha').min = today;
  $('fecha').value = today;
  async function get(path) {
    const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Consulta no disponible');
    return data;
  }
  function empty(id, message, retry) {
    $(id).replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = message;
    if (retry) {
      const button = document.createElement('button');
      button.textContent = 'Reintentar';
      button.addEventListener('click', retry);
      p.append(button);
    }
    $(id).append(p);
  }
  function catalog(origin, destination, date = $('fecha').value, passengers = $('pasajeros').value) {
    return `../usuario/catalogo_viajes.html?${new URLSearchParams({ origen: origin, destino: destination, fecha: date, pasajeros: passengers })}`;
  }
  function destinations() {
    const values = [...new Set(routes.filter((r) => r.ORIGEN === $('origen').value).map((r) => r.DESTINO))];
    $('destino').replaceChildren(new Option('Selecciona la ciudad', ''), ...values.map((v) => new Option(v, v)));
    $('destino').disabled = !values.length;
  }
  function routeImage(route) {
    const cities = `${route.DESTINO} ${route.ORIGEN}`.toLocaleLowerCase('es');
    if (cities.includes('quito')) return 1;
    if (cities.includes('cuenca')) return 2;
    if (cities.includes('guayaquil')) return 3;
    return 4;
  }
  async function loadRoutes() {
    try {
      const data = await get('/usuario/viajes/rutas');
      routes = data.rutas;
      $('origen').replaceChildren(new Option('Selecciona la ciudad', ''), ...[...new Set(routes.map((r) => r.ORIGEN))].map((v) => new Option(v, v)));
      $('origen').disabled = !routes.length;
      $('searchButton').disabled = !routes.length;
      destinations();
      $('searchStatus').textContent = routes.length ? 'Selecciona tu ruta y consulta viajes para la fecha elegida.' : 'Todavía no hay rutas registradas.';
      if (!routes.length) return empty('routes', 'Las rutas aparecerán aquí cuando estén registradas en el sistema.');
      $('routes').innerHTML = routes.slice(0, 4).map((r) => `<a class="route-card" href="${escape(catalog(r.ORIGEN, r.DESTINO))}"><div class="route-photo"><img src="../../assets/images/route-${routeImage(r)}.png" alt="Paisaje ecuatoriano ilustrativo" loading="lazy"><h3>${escape(r.ORIGEN)} → ${escape(r.DESTINO)}</h3></div><div class="route-meta"><span>Consultar viajes</span><span aria-hidden="true">→</span></div></a>`).join('');
    } catch {
      $('origen').replaceChildren(new Option('Consulta no disponible', ''));
      $('origen').disabled = true;
      $('searchButton').disabled = true;
      $('searchStatus').textContent = 'No se pudo conectar con el servidor. Reintenta la consulta de rutas.';
      empty('routes', 'No pudimos cargar las rutas.', loadRoutes);
    }
  }
  async function loadDepartures() {
    try {
      const data = await get('/public/salidas');
      if (!data.salidas.length) return empty('departures', 'No hay próximas salidas programadas para mostrar. Puedes consultar otra fecha en el buscador.');
      $('departures').innerHTML = data.salidas.map((s) => {
        const date = String(s.FEC_PRO_HOJ).slice(0, 10);
        const formatted = new Date(`${date}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
        return `<article class="departure"><div><strong>${escape(s.CIU_ORI_FRE)} → ${escape(s.CIU_DES_FRE)}</strong><small>${escape(s.NOM_COP)}</small></div><div><strong>${escape(formatted)}</strong><small>Fecha de viaje</small></div><div><strong>Bus ${escape(s.NUM_BUS)}</strong><small>Consulta los asientos en el catálogo</small></div><a class="button outline" href="${escape(catalog(s.CIU_ORI_FRE, s.CIU_DES_FRE, date))}">Ver viaje →</a></article>`;
      }).join('');
    } catch { empty('departures', 'No pudimos consultar las próximas salidas.', loadDepartures); }
  }
  async function loadCoops() {
    try {
      const data = await get('/public/cooperativas');
      if (!data.cooperativas.length) return empty('coops', 'Todavía no hay cooperativas activas para mostrar.');
      $('coops').replaceChildren();
      data.cooperativas.forEach((c) => {
        const card = document.createElement('a');
        card.className = 'coop';
        card.href = `cooperativa.html?${new URLSearchParams({ id: c.ID_COP })}`;
        const initial = document.createElement('span');
        initial.className = 'initial';
        initial.setAttribute('aria-hidden', 'true');
        initial.textContent = String(c.NOM_COP || 'C').slice(0, 1);
        const name = document.createElement('span');
        name.textContent = c.NOM_COP;
        card.append(initial, name);
        if (c.LOG_URL_COP) {
          try {
            const url = new URL(c.LOG_URL_COP, `${new URL(api).origin}/`);
            if (['https:', 'http:'].includes(url.protocol)) {
              const img = new Image();
              img.alt = '';
              img.loading = 'lazy';
              img.onload = () => initial.replaceWith(img);
              img.src = url.href;
            }
          } catch {}
        }
        $('coops').append(card);
      });
    } catch { empty('coops', 'No pudimos cargar las cooperativas.', loadCoops); }
  }
  $('origen').addEventListener('change', destinations);
  $('swap').addEventListener('click', () => {
    const origin = $('origen').value;
    const destination = $('destino').value;
    if (!routes.some((r) => r.ORIGEN === destination && r.DESTINO === origin)) {
      $('searchStatus').textContent = 'La ruta inversa no está registrada. Selecciona otra combinación.';
      return;
    }
    $('origen').value = destination;
    destinations();
    $('destino').value = origin;
    $('searchStatus').textContent = 'Origen y destino intercambiados.';
  });
  $('publicSearch').addEventListener('submit', (event) => {
    event.preventDefault();
    if ($('publicSearch').reportValidity()) location.href = catalog($('origen').value, $('destino').value);
  });
  $('menuToggle').addEventListener('click', () => {
    const open = $('navigation').classList.toggle('open');
    $('menuToggle').setAttribute('aria-expanded', String(open));
    $('menuToggle').setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  $('navigation').addEventListener('click', (event) => {
    if (event.target.closest('a')) { $('navigation').classList.remove('open'); $('menuToggle').setAttribute('aria-expanded', 'false'); }
  });
  loadRoutes();
  loadDepartures();
  loadCoops();
})();
