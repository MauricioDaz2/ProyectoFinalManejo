const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
const searchForm = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#searchStatus');
const dateInput = document.querySelector('#fecha');
const origenInput = document.querySelector('#origen');
const destinoInput = document.querySelector('#destino');
let rutas = [];
let passengers = 1;
let pending = new URLSearchParams(window.location.search);
if (!window.location.search) {
    try { pending = new URLSearchParams(sessionStorage.getItem('publicTripSearch') || ''); } catch {}
}
const cooperative = pending.has('cooperativa') ? pending.get('cooperativa').trim().toUpperCase() : null;
const cooperativeQuery = cooperative !== null ? `?${new URLSearchParams({ cooperativa: cooperative })}` : '';
document.querySelectorAll('a[href="catalogo_viajes.html"]').forEach((link) => { link.href += cooperativeQuery; });
const profileLink = document.querySelector('#cooperativeProfileLink');
if (cooperative !== null && profileLink) {
    profileLink.hidden = false;
    profileLink.href = `../public/cooperativa.html?${new URLSearchParams({ id: cooperative })}`;
}
function searchContext() {
    const query = new URLSearchParams({ origen: origenInput.value, destino: destinoInput.value, fecha: dateInput.value, pasajeros: String(passengers) });
    if (cooperative !== null) query.set('cooperativa', cooperative);
    return query;
}
passengers = Math.min(6, Math.max(1, Number(pending.get('pasajeros')) || 1));
const passengersInput = document.querySelector('#cantidadPasajeros');
passengersInput.value = String(passengers);

const today = new Date();
dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-EC') : 'Fecha no disponible';

const option = (value, label = value) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;

const cargarRutas = async () => {
    try {
        const response = await fetch(`${API_BASE}/usuario/viajes/rutas${cooperativeQuery}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar las rutas.');
        rutas = data.rutas;
        const origenes = [...new Set(rutas.map((ruta) => ruta.ORIGEN))];
        origenInput.innerHTML = `<option value="">Selecciona una ciudad</option>${origenes.map((ciudad) => option(ciudad)).join('')}`;
        status.textContent = `${data.total} ruta(s) disponible(s).`;
        if (pending.get('origen')) {
            origenInput.value = pending.get('origen');
            origenInput.dispatchEvent(new Event('change'));
            destinoInput.value = pending.get('destino');
            dateInput.value = pending.get('fecha') >= dateInput.min ? pending.get('fecha') : dateInput.min;
            if (origenInput.value && destinoInput.value && dateInput.value) searchForm.requestSubmit();
        }
    } catch (error) {
        origenInput.innerHTML = '<option value="">No se pudieron cargar las rutas</option>';
        status.className = 'usuario-status error';
        status.textContent = error.message;
    }
};

origenInput.addEventListener('change', () => {
    const destinos = [...new Set(rutas
        .filter((ruta) => ruta.ORIGEN === origenInput.value)
        .map((ruta) => ruta.DESTINO))];
    destinoInput.innerHTML = destinos.length
        ? `<option value="">Selecciona una ciudad</option>${destinos.map((ciudad) => option(ciudad)).join('')}`
        : '<option value="">No hay destinos disponibles</option>';
    destinoInput.disabled = destinos.length === 0;
});

// RFC-000087: hora de salida, tarifa base y detalle «Ver más» con foto, placa, pisos y asientos libres.
const API_ORIGIN = (() => { try { return new URL(API_BASE).origin; } catch { return window.location.origin; } })();
const resolveImage = (url) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^(https?:|data:)/i.test(value)) return value;
    return `${API_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
};
const departureTime = (trip) => {
    if (trip.SALIDA_PLAN_UTC) {
        const date = new Date(trip.SALIDA_PLAN_UTC);
        if (!Number.isNaN(date.getTime())) {
            return new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Guayaquil' }).format(date);
        }
    }
    const hour = String(trip.HORA_SAL_FRE || '').slice(0, 5);
    return /^\d{2}:\d{2}$/.test(hour) ? hour : 'Por confirmar';
};
const fareText = (trip) => (trip.TAR_BAS_FRE === null || trip.TAR_BAS_FRE === undefined || trip.TAR_BAS_FRE === '' || Number.isNaN(Number(trip.TAR_BAS_FRE)))
    ? 'Por confirmar'
    : `$${Number(trip.TAR_BAS_FRE).toFixed(2)}`;

const renderResults = (viajes) => {
    if (!viajes.length) {
        results.innerHTML = '<p class="usuario-empty">No encontramos frecuencias para los criterios seleccionados.</p>';
        return;
    }
    results.innerHTML = viajes.map(({ trip: viaje, free }, index) => {
        const detailId = `detalleViaje${index}`;
        const image = resolveImage(viaje.IMG_URL_BUS);
        return `
        <article class="viaje-card">
            <div class="viaje-main">
                <span class="viaje-coop">${escapeHtml(viaje.NOM_COP)}</span>
                <div class="viaje-route">${escapeHtml(viaje.CIU_ORI_FRE)} <span aria-hidden="true">&rarr;</span><span class="sr-only"> a </span> ${escapeHtml(viaje.CIU_DES_FRE)}</div>
                <dl class="viaje-facts">
                    <div><dt>Fecha</dt><dd>${formatDate(viaje.FEC_PRO_HOJ)}</dd></div>
                    <div><dt>Hora de salida</dt><dd class="viaje-hora">${escapeHtml(departureTime(viaje))}</dd></div>
                    <div><dt>Precio base</dt><dd class="viaje-precio">${escapeHtml(fareText(viaje))}</dd></div>
                </dl>
            </div>
            <div class="viaje-action">
                <a class="usuario-button" href="seleccion_asientos.html?idHoja=${encodeURIComponent(viaje.ID_HOJ)}&amp;${escapeHtml(searchContext().toString())}">Elegir asiento</a>
                <button class="viaje-more" type="button" data-ver-mas="${detailId}" aria-expanded="false" aria-controls="${detailId}">Ver más</button>
            </div>
            <div class="viaje-detail-panel" id="${detailId}" hidden>
                <div class="viaje-photo">${image
                    ? `<img src="${escapeHtml(image)}" alt="Fotografía del bus ${escapeHtml(viaje.NUM_BUS)} de ${escapeHtml(viaje.NOM_COP)}" loading="lazy">`
                    : '<span class="viaje-photo-empty">Fotografía no disponible</span>'}</div>
                <dl class="viaje-facts viaje-bus-facts">
                    <div><dt>Bus</dt><dd>N.º ${escapeHtml(viaje.NUM_BUS)}</dd></div>
                    <div><dt>Placa</dt><dd>${escapeHtml(viaje.PLA_BUS || 'No registrada')}</dd></div>
                    <div><dt>Pisos</dt><dd>${escapeHtml(viaje.NUM_PIS ?? '—')}</dd></div>
                    <div><dt>Asientos disponibles</dt><dd>${escapeHtml(free)} de ${escapeHtml(viaje.TOTAL_ASIENTOS)}</dd></div>
                </dl>
            </div>
        </article>`;
    }).join('');
};

results.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-ver-mas]');
    if (!button) return;
    const panel = document.getElementById(button.dataset.verMas);
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Ver menos' : 'Ver más';
});

results.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href^="seleccion_asientos.html"]');
    if (!link) return;
    event.preventDefault();
    try {
        const user = await window.TransportSession.current();
        if (['R005','R004','R006'].includes(user?.rolId)) { window.location.href = link.href; return; }
        if (user) { status.textContent = 'Esta cuenta no tiene habilitadas las reservas personales.'; return; }
    } catch { status.textContent = 'No se pudo comprobar la sesión. Inténtalo nuevamente.'; return; }
    try {
        sessionStorage.setItem('publicTripSearch', searchContext().toString());
    } catch {}
    window.location.href = '../public/index.html?login=1';
});

searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    passengers = Number(passengersInput.value);
    const values = new FormData(searchForm);
    const query = new URLSearchParams({
        origen: values.get('origen').trim(),
        destino: values.get('destino').trim(),
        fecha: values.get('fecha')
    });
    if (cooperative !== null) query.set('cooperativa', cooperative);

    status.className = 'usuario-status';
    status.textContent = 'Consultando frecuencias...';
    results.innerHTML = '';
    searchForm.querySelector('button').disabled = true;

    try {
        const response = await fetch(`${API_BASE}/usuario/viajes?${query}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible consultar los viajes.');
        if (cooperative !== null && data.viajes.some((trip) => trip.ID_COP !== cooperative)) throw new Error('La respuesta no corresponde a la cooperativa seleccionada.');
        const checked = await Promise.all(data.viajes.map(async (trip) => {
            const seatsResponse = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(trip.ID_HOJ)}/asientos${cooperativeQuery}`);
            const seatsData = await seatsResponse.json();
            if (!seatsResponse.ok || !seatsData.success) throw new Error('No se pudo comprobar la disponibilidad. Inténtalo nuevamente.');
            const asientosLibres = seatsData.asientos.filter((seat) => seat.ESTADO_ASIENTO === 'LIBRE').length;
            return { trip, free: Math.min(asientosLibres, seatsData.viaje?.cupoPasajerosDisponible ?? Infinity) };
        }));
        const available = checked.filter((item) => item.free >= passengers);
        renderResults(available);
        status.textContent = `${available.length} frecuencia(s) con plazas para ${passengers} pasajero(s). Selecciona esa cantidad de asientos al continuar. La disponibilidad se confirma al reservar.`;
        try { sessionStorage.removeItem('publicTripSearch'); } catch {}
    } catch (error) {
        status.className = 'usuario-status error';
        status.textContent = error.message;
        results.innerHTML = '<p class="usuario-empty">Revisa la conexión con el servidor e inténtalo nuevamente.</p>';
    } finally {
        searchForm.querySelector('button').disabled = false;
    }
});

cargarRutas();
