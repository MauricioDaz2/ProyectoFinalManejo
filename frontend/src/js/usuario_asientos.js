const API_BASE = window.API_BASE_URL || 'http://localhost:3001/api';
const idHoja = new URLSearchParams(window.location.search).get('idHoja');
const tripSummary = document.querySelector('#tripSummary');
const floorTabs = document.querySelector('#floorTabs');
const seatGrid = document.querySelector('#seatGrid');
const seatStatus = document.querySelector('#seatStatus');
const reservationPanel = document.querySelector('#reservationPanel');
const reservationSummary = document.querySelector('#reservationSummary');
const reservationForm = document.querySelector('#reservationForm');
const qrResult = document.querySelector('#qrResult');
const metodoPagoInput = document.querySelector('#metodoPago');
const comprobanteField = document.querySelector('#comprobanteField');
const comprobanteInput = document.querySelector('#comprobante');
const paymentHelp = document.querySelector('#paymentHelp');
const cancelReservation = document.querySelector('#cancelReservation');
let seats = [];
let selectedSeat = null;
let activeFloor = 1;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const seatStatusClass = (status) => String(status || 'LIBRE').toLowerCase();

const showError = (message) => {
    seatStatus.className = 'usuario-status error';
    seatStatus.textContent = message;
};

const renderFloor = (floor) => {
    activeFloor = floor;
    document.querySelectorAll('.floor-tab').forEach((tab) => tab.classList.toggle('active', Number(tab.dataset.floor) === floor));
    const floorSeats = seats
        .filter((seat) => Number(seat.PIS_ASI) === floor)
        .sort((first, second) => first.ID_ASI.localeCompare(second.ID_ASI, undefined, { numeric: true }));
    const rows = [];
    for (let index = 0; index < floorSeats.length; index += 4) {
        const rowSeats = floorSeats.slice(index, index + 4);
        rows.push(`<div class="bus-seat-row">${rowSeats.map((seat, seatIndex) => {
            const state = seatStatusClass(seat.ESTADO_ASIENTO);
            const disabled = state !== 'libre' ? 'disabled' : '';
            const aisle = seatIndex === 2 ? '<span class="bus-aisle" aria-hidden="true"></span>' : '';
            return `${seatIndex === 2 ? aisle : ''}<button class="seat ${state}" data-seat="${escapeHtml(seat.ID_ASI)}" type="button" ${disabled} title="${escapeHtml(seat.NOM_TIP)}">${
                escapeHtml(seat.ID_ASI)
            }</button>`;
        }).join('')}</div>`);
    }
    seatGrid.innerHTML = `
        <div class="bus-cabin">
            <div class="bus-front"><span class="bus-driver">Conductor</span><span class="bus-windshield">Frente del bus</span></div>
            <div class="bus-seat-rows">${rows.join('')}</div>
            <div class="bus-rear">Salida de emergencia</div>
        </div>`;
    if (!floorSeats.length) seatGrid.innerHTML = '<p class="usuario-empty">No hay asientos en esta planta.</p>';
    seatGrid.querySelectorAll('.seat.libre').forEach((button) => button.addEventListener('click', () => selectSeat(button.dataset.seat)));
};

const renderTabs = (floors) => {
    floorTabs.innerHTML = floors.map((floor) => `<button class="floor-tab${floor === activeFloor ? ' active' : ''}" data-floor="${floor}" role="tab" type="button">${
        floors.length > 1 ? (floor === 1 ? 'Planta baja' : 'Planta alta') : 'Asientos'
    }</button>`).join('');
    floorTabs.querySelectorAll('.floor-tab').forEach((button) => button.addEventListener('click', () => renderFloor(Number(button.dataset.floor))));
};

const selectSeat = (seatId) => {
    selectedSeat = seats.find((seat) => seat.ID_ASI === seatId);
    document.querySelectorAll('.seat').forEach((button) => button.classList.toggle('selected', button.dataset.seat === seatId));
    reservationPanel.classList.add('visible');
    reservationSummary.textContent = `Asiento ${selectedSeat.ID_ASI} · ${selectedSeat.NOM_TIP} · Precio: $${selectedSeat.PRE_TIP}`;
    qrResult.hidden = true;
    reservationPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const cancelarReserva = () => {
    document.querySelectorAll('.seat.selected').forEach((button) => button.classList.remove('selected'));
    selectedSeat = null;
    reservationForm.reset();
    comprobanteField.hidden = true;
    comprobanteInput.required = false;
    paymentHelp.textContent = 'La cédula identifica al pasajero y se valida antes de registrar la reserva.';
    reservationSummary.textContent = '';
    qrResult.hidden = true;
    reservationPanel.classList.remove('visible');
    seatStatus.className = 'usuario-status';
    seatStatus.textContent = 'Selección cancelada. Elige otro asiento cuando estés listo.';
};

const loadSeats = async () => {
    if (!idHoja) return showError('Falta seleccionar una hoja de ruta.');
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idHoja)}/asientos`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar los asientos.');
        seats = data.asientos;
        tripSummary.textContent = `Bus ${data.viaje.numeroBus} · ${data.viaje.pisos} piso(s) · Hoja ${data.viaje.idHoja}`;
        const floors = [...new Set(seats.map((seat) => Number(seat.PIS_ASI)))].sort((a, b) => a - b);
        activeFloor = floors[0];
        renderTabs(floors);
        renderFloor(activeFloor);
    } catch (error) {
        showError(error.message);
        seatGrid.innerHTML = '<p class="usuario-empty">No se pudo cargar el mapa de asientos.</p>';
    }
};

reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedSeat) return showError('Selecciona un asiento libre.');
    const button = reservationForm.querySelector('button');
    button.disabled = true;
    seatStatus.textContent = 'Confirmando disponibilidad...';
    const values = new FormData(reservationForm);
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas`, {
            method: 'POST',
            body: values
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible crear la reserva.');
        qrResult.hidden = false;
        qrResult.innerHTML = `<strong>Reserva ${escapeHtml(data.reserva.idBoleto)} creada.</strong><br>${escapeHtml(data.message)}<br><small>QR temporal: ${escapeHtml(data.reserva.codigoQr)}</small>`;
        selectedSeat.ESTADO_ASIENTO = 'RESERVADO';
        renderFloor(activeFloor);
        reservationForm.reset();
        reservationPanel.classList.remove('visible');
        seatStatus.className = 'usuario-status';
        seatStatus.textContent = 'El asiento quedó reservado y ya no está disponible para otra selección.';
    } catch (error) {
        showError(error.message);
    } finally {
        button.disabled = false;
    }
});

metodoPagoInput.addEventListener('change', () => {
    const transferencia = metodoPagoInput.value === 'TRANSFERENCIA';
    comprobanteField.hidden = !transferencia;
    comprobanteInput.required = transferencia;
    paymentHelp.textContent = transferencia
        ? 'Adjunta el comprobante para que el administrador valide la transferencia.'
        : metodoPagoInput.value === 'EFECTIVO'
            ? 'La reserva quedará pendiente de pago hasta que se confirme el efectivo.'
            : 'La cédula identifica al pasajero y se valida antes de registrar la reserva.';
});

cancelReservation.addEventListener('click', cancelarReserva);
loadSeats();
