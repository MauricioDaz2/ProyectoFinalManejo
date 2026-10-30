const API_BASE = window.API_BASE_URL || 'http://localhost:3001/api';
const idHoja = new URLSearchParams(window.location.search).get('idHoja');
const tripSummary = document.querySelector('#tripSummary');
const passengerSetup = document.querySelector('#passengerSetup');
const passengerSetupForm = document.querySelector('#passengerSetupForm');
const passengerCountInput = document.querySelector('#passengerCount');
const invoiceOwnerInput = document.querySelector('#invoiceOwner');
const passengerFields = document.querySelector('#passengerFields');
const passengerStatus = document.querySelector('#passengerStatus');
const floorTabs = document.querySelector('#floorTabs');
const seatGrid = document.querySelector('#seatGrid');
const seatStatus = document.querySelector('#seatStatus');
const reservationPanel = document.querySelector('#reservationPanel');
const reservationSummary = document.querySelector('#reservationSummary');
const reservationForm = document.querySelector('#reservationForm');
const qrResult = document.querySelector('#qrResult');
let seats = [];
let selectedSeat = null;
const metodoPagoInput = document.querySelector('#metodoPago');
const comprobanteField = document.querySelector('#comprobanteField');
const comprobanteInput = document.querySelector('#comprobante');
const paymentHelp = document.querySelector('#paymentHelp');
const cancelReservation = document.querySelector('#cancelReservation');
let seats = [];
let selectedSeats = [];
let passengers = [];
let activeFloor = 1;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const seatStatusClass = (status) => String(status || 'LIBRE').toLowerCase();

const showError = (message) => {
    seatStatus.className = 'usuario-status error';
    seatStatus.textContent = message;
};
const isValidCedula = (cedula) => {
    if (!/^\d{10}$/.test(cedula) || /^(\d)\1{9}$/.test(cedula)) return false;
    const province = Number(cedula.slice(0, 2));
    if (province < 1 || province > 24) return false;
    const digits = [...cedula].map(Number);
    const sum = digits.slice(0, 9).reduce((total, digit, index) => {
        const value = index % 2 === 0 ? digit * 2 : digit;
        return total + (value > 9 ? value - 9 : value);
    }, 0);
    return (10 - (sum % 10)) % 10 === digits[9];
};

const renderPassengerFields = () => {
    const count = Math.min(10, Math.max(1, Number(passengerCountInput.value) || 1));
    passengerCountInput.value = count;
    passengerFields.innerHTML = Array.from({ length: count }, (_, index) => `
        <div class="passenger-row">
            <strong>Pasajero ${index + 1}</strong>
            <div class="usuario-field">
                <label for="passengerCedula${index}">Cédula</label>
                <input id="passengerCedula${index}" data-passenger-cedula="${index}" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" minlength="10" required placeholder="10 dígitos">
            </div>
            <div class="usuario-field">
                <label for="passengerType${index}">Tipo de pasajero</label>
                <select id="passengerType${index}" data-passenger-type="${index}" required>
                    <option value="ADULTO">Adulto (100%)</option>
                    <option value="NINO">Niño (50%)</option>
                    <option value="ADULTO_MAYOR">Adulto mayor (50%)</option>
                </select>
            </div>
        </div>`).join('');
};

const renderFloor = (floor) => {
    activeFloor = floor;
    document.querySelectorAll('.floor-tab').forEach((tab) => tab.classList.toggle('active', Number(tab.dataset.floor) === floor));
    const floorSeats = seats.filter((seat) => Number(seat.PIS_ASI) === floor);
    seatGrid.innerHTML = floorSeats.map((seat) => {
        const state = seatStatusClass(seat.ESTADO_ASIENTO);
        const disabled = state !== 'libre' ? 'disabled' : '';
        return `<button class="seat ${state}" data-seat="${escapeHtml(seat.ID_ASI)}" type="button" ${disabled} title="${escapeHtml(seat.NOM_TIP)}">${
            escapeHtml(seat.ID_ASI)
        }</button>`;
    }).join('');
    const floorSeats = seats.filter((seat) => Number(seat.PIS_ASI) === floor)
        .sort((first, second) => first.ID_ASI.localeCompare(second.ID_ASI, undefined, { numeric: true }));
    const rows = [];
    for (let index = 0; index < floorSeats.length; index += 4) {
        const rowSeats = floorSeats.slice(index, index + 4);
        rows.push(`<div class="bus-seat-row">${rowSeats.map((seat, seatIndex) => {
            const state = seatStatusClass(seat.ESTADO_ASIENTO);
            const selected = selectedSeats.some((item) => item.ID_ASI === seat.ID_ASI);
            const disabled = state !== 'libre' ? 'disabled' : '';
            const aisle = seatIndex === 2 ? '<span class="bus-aisle" aria-hidden="true"></span>' : '';
            return `${seatIndex === 2 ? aisle : ''}<button class="seat ${state}${selected ? ' selected' : ''}" data-seat="${escapeHtml(seat.ID_ASI)}" type="button" ${disabled} title="${escapeHtml(seat.NOM_TIP)}">${escapeHtml(seat.ID_ASI)}</button>`;
        }).join('')}</div>`);
    }
    seatGrid.innerHTML = `<div class="bus-cabin"><div class="bus-front"><span class="bus-driver">Conductor</span><span class="bus-windshield">Frente del bus</span></div><div class="bus-seat-rows">${rows.join('')}</div><div class="bus-rear">Salida de emergencia</div></div>`;
    if (!floorSeats.length) seatGrid.innerHTML = '<p class="usuario-empty">No hay asientos en esta planta.</p>';
    seatGrid.querySelectorAll('.seat.libre').forEach((button) => button.addEventListener('click', () => selectSeat(button.dataset.seat)));
};

const renderTabs = (floors) => {
    floorTabs.innerHTML = floors.map((floor) => `<button class="floor-tab${floor === activeFloor ? ' active' : ''}" data-floor="${floor}" role="tab" type="button">${
        floors.length > 1 ? (floor === 1 ? 'Planta baja' : 'Planta alta') : 'Asientos'
    }</button>`).join('');
    floorTabs.innerHTML = floors.map((floor) => `<button class="floor-tab${floor === activeFloor ? ' active' : ''}" data-floor="${floor}" role="tab" type="button">${floors.length > 1 ? (floor === 1 ? 'Planta baja' : 'Planta alta') : 'Asientos'}</button>`).join('');
    floorTabs.querySelectorAll('.floor-tab').forEach((button) => button.addEventListener('click', () => renderFloor(Number(button.dataset.floor))));
};

const selectSeat = (seatId) => {
    selectedSeat = seats.find((seat) => seat.ID_ASI === seatId);
    document.querySelectorAll('.seat').forEach((button) => button.classList.toggle('selected', button.dataset.seat === seatId));
    reservationPanel.classList.add('visible');
    reservationSummary.textContent = `Asiento ${selectedSeat.ID_ASI} · ${selectedSeat.NOM_TIP} · Precio: $${selectedSeat.PRE_TIP}`;
    qrResult.hidden = true;
    reservationPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const seat = seats.find((item) => item.ID_ASI === seatId);
    if (selectedSeats.some((item) => item.ID_ASI === seatId)) {
        selectedSeats = selectedSeats.filter((item) => item.ID_ASI !== seatId);
    } else if (selectedSeats.length < passengers.length) {
        selectedSeats.push(seat);
    } else {
        showError(`Solo puedes seleccionar ${passengers.length} asiento(s).`);
    }
    renderFloor(activeFloor);
    reservationSummary.textContent = `${selectedSeats.length} de ${passengers.length} asiento(s) seleccionado(s). Total estimado: $${selectedSeats.reduce((sum, item, index) => sum + Number(item.PRE_TIP) * (passengers[index]?.tipo === 'ADULTO' ? 1 : .5), 0).toFixed(2)}`;
    reservationPanel.classList.toggle('visible', selectedSeats.length > 0);
};

const cancelarReserva = () => {
    selectedSeats = [];
    reservationForm.reset();
    comprobanteField.hidden = true;
    comprobanteInput.required = false;
    reservationPanel.classList.remove('visible');
    renderFloor(activeFloor);
    seatStatus.textContent = 'Selección cancelada. Elige otros asientos cuando estés listo.';
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
        passengerStatus.textContent = `Hay ${seats.filter((seat) => seat.ESTADO_ASIENTO === 'LIBRE').length} asiento(s) libre(s).`;
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idHoja,
                idAsiento: selectedSeat.ID_ASI,
                usuarioId: values.get('usuarioId').trim(),
                metodoPago: values.get('metodoPago')
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible crear la reserva.');
        qrResult.hidden = false;
        qrResult.innerHTML = `<strong>Reserva ${escapeHtml(data.reserva.idBoleto)} creada.</strong><br>Estado: pendiente de validación.<br><small>QR temporal: ${escapeHtml(data.reserva.codigoQr)}</small>`;
        selectedSeat.ESTADO_ASIENTO = 'RESERVADO';
        renderFloor(activeFloor);
        reservationForm.reset();
        reservationPanel.classList.remove('visible');
        seatStatus.className = 'usuario-status';
        seatStatus.textContent = 'El asiento quedó reservado y ya no está disponible para otra selección.';
passengerCountInput.addEventListener('input', renderPassengerFields);
passengerSetupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const owner = invoiceOwnerInput.value.trim();
    const fields = [...passengerFields.querySelectorAll('[data-passenger-cedula]')];
    const types = [...passengerFields.querySelectorAll('[data-passenger-type]')];
    if (!isValidCedula(owner)) return passengerStatus.textContent = 'La cédula del titular no es válida.';
    passengers = fields.map((field, index) => ({ cedula: field.value.trim(), tipo: types[index].value }));
    if (passengers.some((passenger) => !isValidCedula(passenger.cedula))) return passengerStatus.textContent = 'Todas las cédulas deben ser válidas según el algoritmo ecuatoriano.';
    if (new Set(passengers.map((passenger) => passenger.cedula)).size !== passengers.length) return passengerStatus.textContent = 'Cada pasajero debe tener una cédula diferente.';
    if (passengers.length > seats.filter((seat) => seat.ESTADO_ASIENTO === 'LIBRE').length) return passengerStatus.textContent = 'La cantidad solicitada supera los asientos disponibles.';
    seatGrid.hidden = false;
    renderFloor(activeFloor);
    seatStatus.textContent = `Selecciona exactamente ${passengers.length} asiento(s).`;
    passengerSetup.hidden = true;
    document.querySelector('.seat-legend').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (selectedSeats.length !== passengers.length) return showError(`Debes seleccionar exactamente ${passengers.length} asiento(s).`);
    const button = reservationForm.querySelector('button[type="submit"]');
    button.disabled = true;
    seatStatus.textContent = 'Confirmando disponibilidad...';
    const values = new FormData(reservationForm);
    values.append('idHoja', idHoja);
    values.append('idAsientos', JSON.stringify(selectedSeats.map((seat) => seat.ID_ASI)));
    values.append('pasajeros', JSON.stringify(passengers));
    values.append('cedulaTitular', invoiceOwnerInput.value.trim());
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas`, { method: 'POST', body: values });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible crear la reserva.');
        qrResult.hidden = false;
        qrResult.innerHTML = `<strong>${data.reservas.length} reserva(s) creada(s).</strong><br>${escapeHtml(data.message)}<br><small>La factura se emitirá a nombre del titular de la cuenta.</small>`;
        selectedSeats.forEach((seat) => { seat.ESTADO_ASIENTO = 'RESERVADO'; });
        renderFloor(activeFloor);
        selectedSeats = [];
        reservationPanel.classList.remove('visible');
        seatStatus.textContent = 'Los asientos quedaron reservados y ya no están disponibles.';
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
    paymentHelp.textContent = transferencia ? 'Adjunta el comprobante para que el administrador valide la transferencia.' : metodoPagoInput.value === 'EFECTIVO' ? 'La reserva quedará pendiente de pago hasta que se confirme el efectivo.' : 'El titular de la cuenta recibirá la factura.';
});

cancelReservation.addEventListener('click', cancelarReserva);
renderPassengerFields();
loadSeats();
