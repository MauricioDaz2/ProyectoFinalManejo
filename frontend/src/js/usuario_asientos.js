const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
const idHoja = new URLSearchParams(window.location.search).get('idHoja');

const usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null');
const cedulaTitular = usuarioSesion?.id || usuarioSesion?.COR_USU || usuarioSesion?.cedula || '';

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
const depositoInfo = document.querySelector('#depositoInfo');
const transferenciaInfo = document.querySelector('#transferenciaInfo');
const bancoOrigenInput = document.querySelector('#bancoOrigen');
const comprobanteInput = document.querySelector('#comprobante');
const cancelReservation = document.querySelector('#cancelReservation');
const btnSubmitAccion = document.querySelector('#btnSubmitAccion');

let seats = [];
let selectedSeats = [];
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
            const precioFiltro = Number(seat.PRE_TIP || 0).toFixed(2);
            return `${seatIndex === 2 ? aisle : ''}<button class="seat ${state}${selected ? ' selected' : ''}" data-seat="${escapeHtml(seat.ID_ASI)}" type="button" ${disabled} title="${escapeHtml(seat.NOM_TIP)} - $${precioFiltro}">${escapeHtml(seat.ID_ASI)}<small style="font-size:8px; display:block;">$${precioFiltro}</small></button>`;
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

const renderPassengerTypes = () => {
    if (!selectedSeats.length) {
        passengerTypesContainer.innerHTML = '';
        return;
    }
    passengerTypesContainer.innerHTML = selectedSeats.map((seat) => `
        <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border: 1px solid var(--usuario-border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span><strong>Asiento ${escapeHtml(seat.ID_ASI)}</strong> ($${Number(seat.PRE_TIP || 0).toFixed(2)})</span>
            <div style="width: 200px;">
                <select class="passenger-type-select" data-seat-id="${escapeHtml(seat.ID_ASI)}" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid var(--usuario-border);">
                    <option value="ADULTO">Adulto (100%)</option>
                    <option value="NINO">Niño (50%)</option>
                    <option value="ADULTO_MAYOR">Adulto mayor (50%)</option>
                </select>
            </div>
        </div>
    `).join('');
};

const selectSeat = (seatId) => {
    const seat = seats.find((item) => item.ID_ASI === seatId);
    if (selectedSeats.some((item) => item.ID_ASI === seatId)) {
        selectedSeats = selectedSeats.filter((item) => item.ID_ASI !== seatId);
    } else {
        selectedSeats.push(seat);
    }
    renderFloor(activeFloor);
    renderPassengerTypes();
    
    const totalEstimado = selectedSeats.reduce((sum, item) => sum + Number(item.PRE_TIP || 0), 0);
    reservationSummary.textContent = `${selectedSeats.length} asiento(s) seleccionado(s). Titular: ${cedulaTitular || 'No detectada'}. Total: $${totalEstimado.toFixed(2)}`;
    reservationPanel.classList.toggle('visible', selectedSeats.length > 0);
};

const cancelarReserva = () => {
    selectedSeats = [];
    reservationForm.reset();
    depositoInfo.hidden = true;
    transferenciaInfo.hidden = true;
    passengerTypesContainer.innerHTML = '';
    reservationPanel.classList.remove('visible');
    renderFloor(activeFloor);
    seatStatus.textContent = 'Selección cancelada.';
};

const loadSeats = async () => {
    if (!idHoja) return showError('Falta seleccionar una hoja de ruta.');
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idHoja)}/asientos`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar los asientos.');
        seats = data.asientos;
        
        const viaje = data.viaje;
        tripSummary.innerHTML = `
            ${viaje.imgBus ? `<img src="${escapeHtml(viaje.imgBus)}" alt="Bus ${escapeHtml(viaje.numeroBus)}" style="width: 110px; height: 75px; object-fit: cover; border-radius: 8px; border: 1px solid var(--usuario-border);" />` : ''}
            <div>
                <strong style="font-size: 16px; color: var(--usuario-primary);">Bus N° ${escapeHtml(viaje.numeroBus)} (${escapeHtml(viaje.pisos)} piso(s))</strong><br>
                <span style="color: var(--usuario-muted); font-size: 13px;">Hoja de ruta: ${escapeHtml(viaje.idHoja)} · Fecha: ${escapeHtml(viaje.fecha?.slice(0, 10))}</span>
            </div>
        `;

        const floors = [...new Set(seats.map((seat) => Number(seat.PIS_ASI)))].sort((a, b) => a - b);
        activeFloor = floors[0];
        renderTabs(floors);
        renderFloor(activeFloor);
        seatStatus.textContent = `Hay ${seats.filter((seat) => seat.ESTADO_ASIENTO === 'LIBRE').length} asiento(s) libre(s).`;
    } catch (error) {
        showError(error.message);
        seatGrid.innerHTML = '<p class="usuario-empty">No se pudo cargar el mapa de asientos.</p>';
    }
};

metodoPagoInput.addEventListener('change', () => {
    const metodo = metodoPagoInput.value;
    depositoInfo.hidden = metodo !== 'DEPOSITO';
    transferenciaInfo.hidden = metodo !== 'TRANSFERENCIA';
    bancoOrigenInput.required = metodo === 'TRANSFERENCIA';
    comprobanteInput.required = metodo === 'TRANSFERENCIA';
});

reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedSeats.length) return showError('Selecciona al menos un asiento.');
    if (!cedulaTitular) return showError('No se detectó la cédula del usuario en la sesión.');

    const pasajeros = selectedSeats.map((seat) => {
        const select = passengerTypesContainer.querySelector(`[data-seat-id="${seat.ID_ASI}"]`);
        return {
            cedula: cedulaTitular,
            tipo: select ? select.value : 'ADULTO'
        };
    });

    btnSubmitAccion.disabled = true;
    seatStatus.textContent = 'Procesando pago y generando boletos...';
    
    const values = new FormData(reservationForm);
    values.append('idHoja', idHoja);
    values.append('idAsientos', JSON.stringify(selectedSeats.map((seat) => seat.ID_ASI)));
    values.append('pasajeros', JSON.stringify(pasajeros));
    values.append('cedulaTitular', cedulaTitular);
    values.append('metodoPago', metodoPagoInput.value);

    try {
        const response = await fetch(`${API_BASE}/usuario/reservas`, { method: 'POST', body: values });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible procesar la solicitud.');
        
        qrResult.hidden = false;
        qrResult.innerHTML = `<strong>¡Operación exitosa!</strong><br>${escapeHtml(data.message)}<br><small>Titular: ${cedulaTitular}</small>`;
        
        selectedSeats.forEach((seat) => { 
            seat.ESTADO_ASIENTO = metodoPagoInput.value === 'DEPOSITO' ? 'OCUPADO' : 'RESERVADO'; 
        });
        renderFloor(activeFloor);
        selectedSeats = [];
        passengerTypesContainer.innerHTML = '';
        reservationPanel.classList.remove('visible');
        seatStatus.textContent = 'Boletos generados correctamente en la base de datos.';
    } catch (error) {
        showError(error.message);
    } finally {
        btnSubmitAccion.disabled = false;
    }
});

cancelReservation.addEventListener('click', cancelarReserva);
loadSeats();