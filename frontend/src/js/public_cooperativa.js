(() => {
  'use strict';
  const api = window.API_BASE_URL || 'http://localhost:3000/api';
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  let id = (new URLSearchParams(location.search).get('id') || '').trim().toUpperCase();
  const $ = (name) => document.getElementById(name);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let routes = [];
  let loading = false;
  $('fecha').min = today;
  $('fecha').value = today;
  function imageUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, `${new URL(api).origin}/`);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function addImage(target, source, alt) {
    const url = imageUrl(source);
    if (!url) return;
    const img = new Image();
    img.alt = alt;
    img.loading = 'eager';
    img.onload = () => target.replaceChildren(img);
    img.src = url;
  }
  async function get(path) {
    const response = await fetch(`${api}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'Consulta no disponible.'), { status: response.status });
    return data;
  }
  function catalog(origin, destination, date = $('fecha').value) {
    const query = new URLSearchParams({ cooperativa: id });
    if (origin && destination) {
      query.set('origen', origin); query.set('destino', destination);
      query.set('fecha', date); query.set('pasajeros', $('pasajeros').value);
    }
    return `../usuario/catalogo_viajes.html?${query}`;
  }
  function empty(target, title, detail) {
    $(target).innerHTML = `<div class="empty-state"><strong>${escape(title)}</strong><p>${escape(detail)}</p></div>`;
  }
  function destinations() {
    const cities = [...new Set(routes.filter((r) => r.ORIGEN === $('origen').value).map((r) => r.DESTINO))];
    $('destino').replaceChildren(new Option('Selecciona destino', ''), ...cities.map((city) => new Option(city, city)));
    $('destino').disabled = !cities.length;
  }
  async function loadRoutes() {
    try {
      const data = await get(`/usuario/viajes/rutas?${new URLSearchParams({ cooperativa: id })}`);
      if (!Array.isArray(data.rutas)) throw new Error('Rutas no disponibles.');
      routes = data.rutas;
      $('origen').replaceChildren(new Option('Selecciona origen', ''), ...[...new Set(routes.map((r) => r.ORIGEN))].map((city) => new Option(city, city)));
      $('origen').disabled = !routes.length;
      $('searchButton').disabled = !routes.length;
      destinations();
      $('searchStatus').textContent = routes.length ? 'El buscador consulta únicamente viajes de esta cooperativa.' : 'Esta cooperativa aún no tiene rutas con viajes disponibles.';
      if (!routes.length) return empty('routes', 'Aún no hay rutas disponibles', 'Las rutas aparecerán cuando la cooperativa tenga viajes registrados.');
      $('routes').innerHTML = routes.slice(0, 4).map((route) => `<a class="route-card" href="${escape(catalog(route.ORIGEN, route.DESTINO))}"><div class="route-art" aria-hidden="true">⌖</div><div><h3>${escape(route.DESTINO)}</h3><p>Desde ${escape(route.ORIGEN)}</p><span class="route-arrow" aria-hidden="true">→</span></div></a>`).join('');
    } catch {
      routes = [];
      $('origen').replaceChildren(new Option('No disponible', ''));
      $('destino').replaceChildren(new Option('No disponible', ''));
      $('origen').disabled = $('destino').disabled = $('searchButton').disabled = true;
      $('searchStatus').textContent = 'No disponible. Actualiza las consultas para volver a intentarlo.';
      empty('routes', 'Rutas no disponibles', 'No se pudo completar la consulta.');
    }
  }
  async function loadDepartures() {
    try {
      const data = await get(`/public/salidas?${new URLSearchParams({ cooperativa: id })}`);
      if (!Array.isArray(data.salidas) || data.salidas.some((row) => row.ID_COP !== id)) throw new Error('Programación no disponible.');
      if (!data.salidas.length) return empty('departures', 'No hay próximas salidas programadas', 'Puedes volver a consultar más adelante o contactar con la cooperativa.');
      $('departures').innerHTML = data.salidas.map((row) => {
        const date = String(row.FEC_PRO_HOJ).slice(0, 10);
        const formatted = new Date(`${date}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
        return `<article class="departure"><div><strong>${escape(row.CIU_ORI_FRE)} → ${escape(row.CIU_DES_FRE)}</strong><small>${escape(row.EST_VIA_HOJ)}</small></div><div><strong>${escape(formatted)}</strong><small>Fecha de viaje</small></div><div><strong>${row.NUM_BUS ? `Bus ${escape(row.NUM_BUS)}` : 'Bus no disponible'}</strong><small>Asientos en el catálogo</small></div><a class="button" href="${escape(catalog(row.CIU_ORI_FRE, row.CIU_DES_FRE, date))}">Consultar →</a></article>`;
      }).join('');
    } catch { empty('departures', 'Salidas no disponibles', 'No se pudo consultar la programación. Puedes reintentar con Actualizar.'); }
  }
  function renderProfile(data) {
    const company = data.cooperativa;
    if (company?.ID_COP !== id) throw new Error('No se pudo verificar la cooperativa solicitada.');
    document.title = `${company.NOM_COP} | Transporte Interprovincial`;
    document.querySelectorAll('[data-company-name]').forEach((node) => { node.textContent = company.NOM_COP; });
    const content = data.contenido;
    if (content) {
      const contrast = (hex) => {
        const rgb = hex.slice(1).match(/../g).map((c) => { const s = parseInt(c, 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#000000' : '#ffffff';
      };
      for (const [key, css] of [['principal', 'primary'], ['secundario', 'accent']]) {
        if (/^#[a-f0-9]{6}$/i.test(content[key])) {
          document.documentElement.style.setProperty(`--brand-${css}`, content[key]);
          document.documentElement.style.setProperty(`--brand-on-${css}`, contrast(content[key]));
          if (key === 'secundario') document.documentElement.style.setProperty('--hero-highlight', contrast(content[key]) === '#000000' ? content[key] : '#ffffff');
        }
      }
      $('companyDescription').textContent = content.descripcion || 'Encuentra aquí la información de contacto y los viajes disponibles de nuestra cooperativa.';
      $('descriptionEmpty').hidden = Boolean(content.descripcion);
      if (content.mision) { $('missionTitle').textContent = 'Nuestra misión'; $('companyMission').textContent = content.mision; }
      if (content.servicios?.length) {
        $('servicesContent').className = 'published-services';
        $('servicesContent').innerHTML = content.servicios.map((service) => `<article><span aria-hidden="true">◇</span><h3>${escape(service)}</h3></article>`).join('');
      }
      if (content.correo) {
        $('contactEmailRow').hidden = false;
        const email = document.createElement('a'); email.textContent = content.correo; email.href = `mailto:${content.correo}`;
        $('contactEmail').replaceChildren(email);
      }
      if (imageUrl(content.portada)) {
        const cover = new Image(); cover.alt = ''; cover.onload = () => { $('publishedCover').replaceChildren(cover); $('publishedCover').hidden = false; $('coverLabel').hidden = true; }; cover.src = imageUrl(content.portada);
      }
    }
    addImage($('headerLogo'), company.LOG_URL_COP, '');
    const phone = String(company.TEL_COP || '').trim();
    $('contactPhone').textContent = phone || 'No disponible';
    if (phone && /^\+?[\d\s().-]+$/.test(phone)) {
      const link = document.createElement('a');
      link.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
      link.textContent = phone;
      $('contactPhone').replaceChildren(link);
    }
    $('contactAddress').textContent = company.DIR_COP || 'No disponible';
    $('footerContact').textContent = [phone, company.DIR_COP, content?.correo].filter(Boolean).join('\n') || 'Información de contacto no disponible.';
    $('allRoutes').href = catalog();
    const photos = (data.fotos || []).filter((photo) => imageUrl(photo.IMG_URL_BUS));
    if (photos.length) {
      addImage($('companyImage'), photos[0].IMG_URL_BUS, photos[0].descripcion || `Bus ${photos[0].NUM_BUS} de ${company.NOM_COP}`);
      $('gallery').innerHTML = photos.map((photo) => `<figure><div class="photo"><span>Fotografía no disponible</span><img src="${escape(imageUrl(photo.IMG_URL_BUS))}" alt="${escape(photo.descripcion || `Bus ${photo.NUM_BUS}`)}" loading="lazy"></div><figcaption>${escape(photo.descripcion || `Bus ${photo.NUM_BUS}`)}</figcaption></figure>`).join('');
      $('gallery').querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    } else empty('gallery', 'Fotografías aún no disponibles', 'Aquí podrás conocer las imágenes de la cooperativa cuando estén registradas.');
  }
  async function loadPage() {
    if (loading) return;
    loading = true;
    $('retryPage').hidden = true;
    try {
      if (!preview && !/^[A-Z0-9_-]{1,5}$/.test(id)) throw Object.assign(new Error('Selecciona una cooperativa desde la página principal.'), { status: 400 });
      const data = await get(preview ? '/coop/perfil/vista-previa' : `/public/cooperativas/${encodeURIComponent(id)}`);
      if (preview) {
        id = data.cooperativa.ID_COP;
        document.querySelector('.system-bar span').textContent = 'Vista previa privada · no publicada';
      }
      renderProfile(data);
      $('pageStatus').hidden = true;
      $('profilePage').hidden = false;
      await Promise.all([loadRoutes(), loadDepartures()]);
    } catch (error) {
      $('profilePage').hidden = true;
      $('pageStatus').hidden = false;
      $('statusTitle').textContent = error.status === 404 ? 'Página no disponible' : error.status === 400 ? 'Cooperativa no válida' : 'No pudimos cargar esta página';
      $('statusDetail').textContent = error.message;
      $('retryPage').hidden = [400, 404].includes(error.status);
    } finally { loading = false; }
  }
  function closeMenu() { $('navigation').classList.remove('open'); $('menuToggle').setAttribute('aria-expanded', 'false'); $('menuToggle').setAttribute('aria-label', 'Abrir menú'); }
  $('menuToggle').addEventListener('click', () => {
    const open = $('navigation').classList.toggle('open');
    $('menuToggle').setAttribute('aria-expanded', String(open));
    $('menuToggle').setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  $('navigation').addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  $('origen').addEventListener('change', destinations);
  $('cooperativeSearch').addEventListener('submit', (event) => {
    event.preventDefault();
    if ($('cooperativeSearch').reportValidity()) location.href = catalog($('origen').value, $('destino').value);
  });
  $('retryPage').addEventListener('click', loadPage);
  $('retryTrips').addEventListener('click', async () => {
    $('retryTrips').disabled = true;
    await Promise.all([loadRoutes(), loadDepartures()]);
    $('retryTrips').disabled = false;
  });
  loadPage();
})();
