const API_BASE = window.API_BASE_URL || 'http://localhost:3001/api';
const API_BASE = window.API_BASE_URL || 'http://127.0.0.1:3001/api';
const searchForm = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#searchStatus');
const dateInput = document.querySelector('#fecha');
const origenInput = document.querySelector('#origen');
const destinoInput = document.querySelector('#destino');
const logoutButton = document.querySelector('#logoutButton');
let rutas = [];

const today = new Date();
dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-EC') : 'Fecha no disponible';

const option = (value, label = value) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;

const cargarRutas = async () => {
    try {
        const response = await fetch(`${API_BASE}/usuario/viajes/rutas`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar las rutas.');
        rutas = data.rutas;
        const origenes = [...new Set(rutas.map((ruta) => ruta.ORIGEN))];
        origenInput.innerHTML = `<option value="">Selecciona una ciudad</option>${origenes.map((ciudad) => option(ciudad)).join('')}`;
        status.textContent = `${data.total} ruta(s) disponible(s).`;
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

logoutButton.addEventListener('click', () => {
    localStorage.removeItem('usuario');
    window.location.href = '../auth/login.html';
});

const renderResults = (viajes) => {
    if (!viajes.length) {
        results.innerHTML = '<p class="usuario-empty">No encontramos frecuencias para los criterios seleccionados.</p>';
        return;
    }
    results.innerHTML = viajes.map((viaje) => `
        <article class="viaje-card">
            <div>
                <div class="viaje-route">${escapeHtml(viaje.CIU_ORI_FRE)} &rarr; ${escapeHtml(viaje.CIU_DES_FRE)}</div>
                <div class="viaje-detail">${escapeHtml(viaje.NOM_COP)} · Bus ${escapeHtml(viaje.NUM_BUS)} · ${escapeHtml(viaje.TOTAL_ASIENTOS)} asientos</div>
            </div>
            <div class="viaje-detail">
                <strong>Salida:</strong> ${formatDate(viaje.FEC_HOR_INI_FRE)}<br>
                <strong>Viaje:</strong> ${formatDate(viaje.FEC_PRO_HOJ)} · ${escapeHtml(viaje.NUM_PIS)} piso(s)
            </div>
            <div class="viaje-action">
                <a class="usuario-button" href="seleccion_asientos.html?idHoja=${encodeURIComponent(viaje.ID_HOJ)}">Elegir asiento</a>
            </div>
        </article>
    `).join('');
};

searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(searchForm);
    const query = new URLSearchParams({
        origen: values.get('origen').trim(),
        destino: values.get('destino').trim(),
        fecha: values.get('fecha')
    });

    cargarRutas();
    status.className = 'usuario-status';
    status.textContent = 'Consultando frecuencias...';
    results.innerHTML = '';
    searchForm.querySelector('button').disabled = true;

    try {
        const response = await fetch(`${API_BASE}/usuario/viajes?${query}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible consultar los viajes.');
        renderResults(data.viajes);
        status.textContent = `${data.total} frecuencia(s) encontrada(s).`;
    } catch (error) {
        status.className = 'usuario-status error';
        status.textContent = error.message;
        results.innerHTML = '<p class="usuario-empty">Revisa la conexión con el servidor e inténtalo nuevamente.</p>';
    } finally {
        searchForm.querySelector('button').disabled = false;
    }
});

cargarRutas();
