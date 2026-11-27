const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
const idHoja = new URLSearchParams(window.location.search).get('idHoja');
const searchContext = new URLSearchParams(window.location.search);
searchContext.delete('idHoja');
document.querySelectorAll('a[href="catalogo_viajes.html"]').forEach((link) => {
    if (searchContext.has('cooperativa')) link.href = `catalogo_viajes.html?${searchContext}`;
});



const tripSummary = document.querySelector('#tripSummary');
const floorTabs = document.querySelector('#floorTabs');
const seatGrid = document.querySelector('#seatGrid');
const seatStatus = document.querySelector('#seatStatus');
const reservationPanel = document.querySelector('#reservationPanel');
const reservationSummary = document.querySelector('#reservationSummary');
const passengerTypesContainer = document.querySelector('#passengerTypesContainer');
const reservationForm = document.querySelector('#reservationForm');
const qrResult = document.querySelector('#qrResult');
const metodoPagoInput = document.querySelector('#metodoPago');
const bancoOrigenInput = document.querySelector('#bancoOrigen');
const comprobanteInput = document.querySelector('#comprobante');
const cancelReservation = document.querySelector('#cancelReservation');
const btnSubmitAccion = document.querySelector('#btnSubmitAccion');

const relojTransferencia = document.querySelector('#relojTransferencia');
const barraProgresoTimer = document.querySelector('#barraProgresoTimer');

const DURACION_TIMER_SEGUNDOS = 5 * 60;

let seats = [];
let viajeActual = null;
let selectedSeats = [];
let activeFloor = 1;
let cupoDisponible = Infinity;

let timerInterval = null;
let timerExpiraMs = 0;
let boletosRetenidos = [];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const seatStatusClass = (status) => String(status || 'LIBRE').toLowerCase();

const etiquetaVisibleAsiento = (seat) => {
    if (!seat) return '—';
    if (seat.ETIQUETA) return String(seat.ETIQUETA);
    const piso = Number(seat.PIS_ASI) === 2 ? 2 : 1;
    const num = Number(seat.NUMERO) || 1;
    return `${piso}${String(num).padStart(2, '0')}`;
};

const showError = (message) => {
    if (!seatStatus) return;
    seatStatus.className = 'usuario-status error';
    seatStatus.textContent = message;
};

const formatearMMSS = (segundos) => {
    const seg = Math.max(0, Math.floor(segundos));
    const min = Math.floor(seg / 60);
    const rem = seg % 60;
    return `${String(min).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

const detenerTemporizadorTransferencia = () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerExpiraMs = 0;
};

const actualizarVistaReloj = () => {
    if (!timerExpiraMs) return;
    const restantes = Math.max(0, Math.ceil((timerExpiraMs - Date.now()) / 1000));
    if (relojTransferencia) {
        relojTransferencia.textContent = formatearMMSS(restantes);
    }
    if (barraProgresoTimer) {
        const pct = Math.min(100, Math.max(0, (restantes / DURACION_TIMER_SEGUNDOS) * 100));
        barraProgresoTimer.style.width = `${pct}%`;
    }
    if (restantes <= 0) {
        manejarExpiracionTemporizador();
    }
};

const holdButton = document.querySelector('#holdSeats');
let busy = false;

function resetSelection() {
    detenerTemporizadorTransferencia();
    selectedSeats = [];
    boletosRetenidos = [];
    reservationForm.reset();
    reservationForm.hidden = true;
    holdButton.hidden = false;
    passengerTypesContainer.replaceChildren();
    reservationPanel.classList.remove('visible');
}

async function manejarExpiracionTemporizador() {
    resetSelection();
    await loadSeats();
    await restoreSelection();
    if (!boletosRetenidos.length) showError('El plazo de selección terminó. Consulta los asientos disponibles.');
}

const calcularTotalSeleccionado = () => {
    return selectedSeats.reduce((sum, seat) => {
        const base = Number(seat.PRE_TIP || seat.PRECIO_ASIENTO || viajeActual?.tarifaBase || 5);
        const select = passengerTypesContainer?.querySelector(`[data-seat-id="${seat.ID_ASI}"]`);
        const tipo = select ? select.value : 'ADULTO';
        const mitad = ['NINO', 'ADULTO_MAYOR', 'DISCAPACIDAD'].includes(tipo);
        const cents = Math.round(base * 100);
        const final = Math.round(cents * (mitad ? 0.5 : 1));
        const line = select?.closest('fieldset')?.querySelector('output');
        if (line) line.textContent = 'Descuento USD ' + ((cents - final) / 100).toFixed(2) + ' · Precio individual USD ' + (final / 100).toFixed(2);
        return sum + final / 100;
    }, 0);
};

const actualizarResumenReserva = () => {
    if (!reservationSummary) return;
    const totalEstimado = calcularTotalSeleccionado();
    const etiquetas = selectedSeats.map(etiquetaVisibleAsiento).join(', ');
    reservationSummary.textContent = `${selectedSeats.length} asiento(s) seleccionado(s) (${etiquetas || 'ninguno'}). Total a pagar: $${totalEstimado.toFixed(2)}`;
};

const renderFloor = (floor) => {
    activeFloor = floor;
    document.querySelectorAll('.floor-tab').forEach((tab) => tab.classList.toggle('active', Number(tab.dataset.floor) === floor));
    const floorSeats = seats.filter((seat) => Number(seat.PIS_ASI) === floor)
        .sort((first, second) => String(first.ID_ASI).localeCompare(String(second.ID_ASI), undefined, { numeric: true }));

    const rows = [];
    for (let index = 0; index < floorSeats.length; index += 4) {
        const rowSeats = floorSeats.slice(index, index + 4);
        rows.push(`<div class="bus-seat-row">${rowSeats.map((seat, seatIndex) => {
            const state = seatStatusClass(seat.ESTADO_ASIENTO);
            const selected = selectedSeats.some((item) => item.ID_ASI === seat.ID_ASI);
            const disabled = state !== 'libre' || cupoDisponible === 0 ? 'disabled' : '';
            const aisle = seatIndex === 2 ? '<span class="bus-aisle" aria-hidden="true"></span>' : '';
            const precioFiltro = Number(seat.PRE_TIP || seat.PRECIO_ASIENTO || 5).toFixed(2);
            const etiqueta = etiquetaVisibleAsiento(seat);
            return `${seatIndex === 2 ? aisle : ''}<button class="seat ${state}${selected ? ' selected' : ''}" data-seat="${escapeHtml(seat.ID_ASI)}" type="button" ${disabled} title="Asiento ${escapeHtml(etiqueta)} · ${escapeHtml(seat.NOM_TIP)} - $${precioFiltro}">${escapeHtml(etiqueta)}<small style="font-size:8px; display:block;">$${precioFiltro}</small></button>`;
        }).join('')}</div>`);
    }

    seatGrid.innerHTML = `<div class="bus-cabin"><div class="bus-front"><span class="bus-driver">🛞 Conductor</span><span class="bus-windshield">Frente del bus (Planta ${floor})</span></div><div class="bus-seat-rows">${rows.join('')}</div><div class="bus-rear">Salida de emergencia</div></div>`;
    if (!floorSeats.length) seatGrid.innerHTML = '<p class="usuario-empty">No hay asientos en esta planta.</p>';

    seatGrid.querySelectorAll('.seat.libre').forEach((button) => button.addEventListener('click', () => selectSeat(button.dataset.seat)));
};

const renderTabs = (floors) => {
    floorTabs.innerHTML = floors.map((floor) => `<button class="floor-tab${floor === activeFloor ? ' active' : ''}" data-floor="${floor}" role="tab" type="button">${floors.length > 1 ? (floor === 1 ? 'Planta baja' : 'Planta alta') : 'Distribución del Bus'}</button>`).join('');
    floorTabs.querySelectorAll('.floor-tab').forEach((button) => button.addEventListener('click', () => renderFloor(Number(button.dataset.floor))));
};

function renderPassengerTypes() {
    passengerTypesContainer.innerHTML = selectedSeats.map(seat => `
        <fieldset class="usuario-field">
          <legend>Pasajero del asiento ${escapeHtml(etiquetaVisibleAsiento(seat))} · $${Number(seat.PRE_TIP).toFixed(2)}</legend>
          <label>Nombre completo <input name="nombre" maxlength="100" required></label>
          <label>Tipo de documento <select name="documento"><option value="cedula">Cédula ecuatoriana</option><option value="extranjero">Documento extranjero</option></select></label>
          <label>Identificación <input name="cedula" maxlength="10" required></label>
          <label>Categoría <select name="tipo" data-seat-id="${escapeHtml(seat.ID_ASI)}">
            <option value="ADULTO">Adulto</option><option value="NINO">Niño</option>
            <option value="ADULTO_MAYOR">Adulto mayor</option><option value="DISCAPACIDAD">Persona con discapacidad</option>
          </select></label>
        </fieldset>`).join('');
}
passengerTypesContainer.addEventListener('change', actualizarResumenReserva);

const selectSeat = (seatId) => {
    if (busy || boletosRetenidos.length > 0) {
        return showError('Completa o cancela la selección actual antes de elegir otros asientos.');
    }
    const seat = seats.find((item) => item.ID_ASI === seatId);
    if (!seat) return;
    if (selectedSeats.some((item) => item.ID_ASI === seatId)) {
        selectedSeats = selectedSeats.filter((item) => item.ID_ASI !== seatId);
    } else {
        if (selectedSeats.length >= cupoDisponible) return showError('Alcanzaste el cupo disponible para esta frecuencia.');
        selectedSeats.push(seat);
    }
    renderFloor(activeFloor);
    actualizarResumenReserva();
    reservationPanel.classList.toggle('visible', selectedSeats.length > 0);
};

const loadSeats = async () => {
    if (!idHoja) return showError('Falta seleccionar una salida.');
    try {
        const cooperativeQuery = searchContext.has('cooperativa') ? `?${new URLSearchParams({ cooperativa: searchContext.get('cooperativa') })}` : '';
        const response = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idHoja)}/asientos${cooperativeQuery}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar los asientos.');
        seats = data.asientos;

        const viaje = data.viaje;
        viajeActual = viaje;
        cupoDisponible = viaje.cupoPasajerosDisponible ?? Infinity;
        const rutaTexto = viaje.origen && viaje.destino ? `${escapeHtml(viaje.origen)} → ${escapeHtml(viaje.destino)} · ` : '';
        const horaTexto = viaje.horaSalida ? `Salida: ${escapeHtml(viaje.horaSalida)} · ` : '';
        const tarifaTexto = viaje.tarifaBase ? ` · Tarifa base: $${Number(viaje.tarifaBase).toFixed(2)}` : '';
        tripSummary.innerHTML = `
            ${viaje.imgBus ? `<img src="${escapeHtml(viaje.imgBus)}" alt="Bus ${escapeHtml(viaje.numeroBus)}" style="width: 110px; height: 75px; object-fit: cover; border-radius: 8px; border: 1px solid var(--usuario-border);" />` : ''}
            <div>
                <strong style="font-size: 16px; color: var(--usuario-primary);">Bus N° ${escapeHtml(viaje.numeroBus)}${viaje.placaBus ? ` · Placa ${escapeHtml(viaje.placaBus)}` : ''} (${escapeHtml(viaje.pisos)} piso(s))</strong><br>
                <span style="color: var(--usuario-muted); font-size: 13px;">${rutaTexto}${horaTexto}Fecha: ${escapeHtml(viaje.fecha?.slice(0, 10))}${tarifaTexto}</span>
            </div>
        `;

        const floors = [...new Set(seats.map((seat) => Number(seat.PIS_ASI)))].sort((a, b) => a - b);
        activeFloor = floors[0];
        renderTabs(floors);
        renderFloor(activeFloor);
        const libres = seats.filter((seat) => seat.ESTADO_ASIENTO === 'LIBRE').length;
        seatStatus.textContent = `Hay ${Math.min(libres, cupoDisponible)} plaza(s) disponible(s).`;
    } catch (error) {
        showError(error.message);
        seatGrid.innerHTML = '<p class="usuario-empty">No se pudo cargar el mapa de asientos.</p>';
    }
};


async function requestCheckout(path, options) {
    const response = await fetch(API_BASE + '/usuario/reservas' + path, options);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo completar la operación.');
    return data;
}

async function restoreSelection() {
    const data = await requestCheckout('/' + encodeURIComponent(idHoja) + '/bloqueos');
    if (!data.bloqueos.length) return;
    const held = data.bloqueos.map(row => {
        const seat = seats.find(item => item.ID_ASI === row.asiento);
        if (!seat) throw new Error('Cambió la unidad asignada. Actualiza la disponibilidad.');
        return {...seat, PRE_TIP: row.precio};
    });
    selectedSeats = held;
    boletosRetenidos = data.bloqueos.map(row => row.boleto);
    reservationPanel.classList.add('visible');
    holdButton.hidden = true;
    reservationForm.hidden = false;
    renderPassengerTypes();
    actualizarResumenReserva();
    renderFloor(activeFloor);
    detenerTemporizadorTransferencia();
    const remaining = Date.parse(data.bloqueos[0].vence) - Date.parse(data.bloqueos[0].ahora);
    timerExpiraMs = Date.now() + remaining;
    timerInterval = setInterval(actualizarVistaReloj, 1000);
    actualizarVistaReloj();
}

holdButton.addEventListener('click', async () => {
    if (busy || !selectedSeats.length) return;
    busy = holdButton.disabled = true;
    qrResult.hidden = true;
    try {
        await requestCheckout('/bloqueos', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({idHoja, asientos:selectedSeats.map(seat => seat.ID_ASI)})
        });
        await loadSeats();
        await restoreSelection();
    } catch (error) {
        showError(error.message);
    } finally {
        busy = holdButton.disabled = false;
    }
});

reservationForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !boletosRetenidos.length || timerExpiraMs <= Date.now()) return;
    const passengers = Array.from(passengerTypesContainer.querySelectorAll('fieldset'), (group, index) => ({
        asiento: selectedSeats[index].ID_ASI, nombre: group.elements.nombre.value.trim(),
        documento: group.elements.documento.value, cedula: group.elements.cedula.value.trim(), tipo: group.elements.tipo.value
    }));
    const values = new FormData();
    values.set('idHoja', idHoja);
    values.set('idBoletos', JSON.stringify(boletosRetenidos));
    values.set('pasajeros', JSON.stringify(passengers));
    values.set('metodoPago', metodoPagoInput.value);
    values.set('bancoOrigen', bancoOrigenInput.value);
    values.set('comprobante', comprobanteInput.files[0]);
    busy = btnSubmitAccion.disabled = cancelReservation.disabled = true;
    try {
        const result = await requestCheckout('', {method:'POST', body:values});
        resetSelection();
        await loadSeats();
        qrResult.hidden = false;
        qrResult.textContent = result.message;
    } catch (error) {
        showError(error.message);
    } finally {
        busy = btnSubmitAccion.disabled = cancelReservation.disabled = false;
    }
});

cancelReservation.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
        for (const id of boletosRetenidos) await requestCheckout('/' + encodeURIComponent(id) + '/cancelar', {method:'PUT'});
        resetSelection();
        await loadSeats();
    } catch (error) {
        resetSelection();
        await loadSeats();
        await restoreSelection();
        showError(error.message);
    } finally { busy = false; }
});

window.TransportSession.ready.then(async user => {
    if (!user || !idHoja) return showError('Abre una salida desde el catálogo.');
    await loadSeats();
    await restoreSelection();
}).catch(error => showError(error.message));
