const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
const idHoja = new URLSearchParams(window.location.search).get('idHoja');
const searchContext = new URLSearchParams(window.location.search);
searchContext.delete('idHoja');
document.querySelectorAll('a[href="catalogo_viajes.html"]').forEach((link) => {
    if (searchContext.has('cooperativa')) link.href = `catalogo_viajes.html?${searchContext}`;
});

let cedulaTitular = '';

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

const temporizadorBox = document.querySelector('#temporizadorTransferencia');
const relojTransferencia = document.querySelector('#relojTransferencia');
const barraProgresoTimer = document.querySelector('#barraProgresoTimer');
const textoTemporizador = document.querySelector('#textoTemporizadorTransferencia');

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

const iniciarTemporizadorTransferencia = (segundos = DURACION_TIMER_SEGUNDOS, expiraIso = null) => {
    detenerTemporizadorTransferencia();
    const destinoMs = expiraIso ? new Date(expiraIso).getTime() : (Date.now() + segundos * 1000);
    timerExpiraMs = Number.isFinite(destinoMs) && destinoMs > Date.now()
        ? destinoMs
        : (Date.now() + DURACION_TIMER_SEGUNDOS * 1000);

    if (temporizadorBox) temporizadorBox.style.display = 'block';
    actualizarVistaReloj();
    timerInterval = setInterval(actualizarVistaReloj, 1000);
};

const manejarExpiracionTemporizador = async () => {
    detenerTemporizadorTransferencia();
    const idsPorExpirar = [...boletosRetenidos];
    boletosRetenidos = [];

    if (idsPorExpirar.length > 0) {
        try {
            await fetch(`${API_BASE}/usuario/reservas/expirar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idBoletos: idsPorExpirar })
            });
        } catch {}
    }

    selectedSeats = [];
    if (reservationForm) reservationForm.reset();
    if (depositoInfo) depositoInfo.style.display = 'none';
    if (transferenciaInfo) transferenciaInfo.style.display = 'none';
    if (passengerTypesContainer) passengerTypesContainer.innerHTML = '';
    if (reservationPanel) reservationPanel.classList.remove('visible');
    if (btnSubmitAccion) btnSubmitAccion.textContent = 'Generar solicitud de viaje';

    await loadSeats();
    showError('⏰ El tiempo de 5 minutos para subir el comprobante de transferencia expiró. La reserva venció y el asiento fue liberado automáticamente.');
    if (qrResult) {
        qrResult.hidden = false;
        qrResult.innerHTML = '<strong>Reserva expirada por tiempo (5 minutos)</strong><br>No se adjuntó el comprobante de transferencia a tiempo y el asiento volvió a quedar libre.';
    }
};

const calcularTotalSeleccionado = () => {
    return selectedSeats.reduce((sum, seat) => {
        const base = Number(seat.PRE_TIP || seat.PRECIO_ASIENTO || viajeActual?.tarifaBase || 5);
        const select = passengerTypesContainer?.querySelector(`[data-seat-id="${seat.ID_ASI}"]`);
        const tipo = select ? select.value : 'ADULTO';
        const mitad = ['NINO', 'ADULTO_MAYOR', 'DISCAPACIDAD'].includes(tipo);
        return sum + Math.round(Math.round(base * 100) * (mitad ? 0.5 : 1)) / 100;
    }, 0);
};

const actualizarResumenReserva = () => {
    if (!reservationSummary) return;
    const totalEstimado = calcularTotalSeleccionado();
    selectedSeats.forEach(seat => {
        const select = passengerTypesContainer.querySelector(`[data-seat-id="${seat.ID_ASI}"]`);
        const line = select?.parentElement.querySelector('output');
        if (!line) return;
        const cents = Math.round(seat.PRE_TIP * 100);
        const final = select.value === 'ADULTO' ? cents : Math.round(cents / 2);
        line.textContent = 'Descuento USD ' + ((cents-final)/100).toFixed(2) + ' · Individual USD ' + (final/100).toFixed(2);
    });
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

const renderPassengerTypes = () => {
    if (!selectedSeats.length) {
        passengerTypesContainer.innerHTML = '';
        return;
    }
    passengerTypesContainer.innerHTML = selectedSeats.map((seat) => {
        const etiqueta = etiquetaVisibleAsiento(seat);

        const precioBase = Number(seat.PRE_TIP || seat.PRECIO_ASIENTO || 5).toFixed(2);
        return `
            <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border: 1px solid var(--usuario-border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span><strong>Asiento N° ${escapeHtml(etiqueta)}</strong> · ${escapeHtml(seat.NOM_TIP || 'NORMAL')} (base ${Number(viajeActual.tarifaBase).toFixed(2)} + recargo ${Number(seat.RECARGO_TIP).toFixed(2)} = ${precioBase})</span>
                <div style="width: 220px;">
                    <select class="passenger-type-select" data-seat-id="${escapeHtml(seat.ID_ASI)}" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid var(--usuario-border);">
                        <option value="ADULTO">Adulto (100%)</option>
                        <option value="NINO">Niño / Menor (50%)</option>
                        <option value="ADULTO_MAYOR">Adulto mayor (50%)</option>
                        <option value="DISCAPACIDAD">Discapacidad (50%)</option>
                    </select><output aria-live="polite"></output>
                </div>
            </div>
        `;
    }).join('');

    passengerTypesContainer.querySelectorAll('.passenger-type-select').forEach((sel) => {
        sel.addEventListener('change', actualizarResumenReserva);
    });
};

const selectSeat = (seatId) => {
    if (boletosRetenidos.length > 0) {
        return showError('Tienes una reserva por transferencia retenida pendiente de comprobante. Sube el comprobante o cancela la reserva actual.');
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
    renderPassengerTypes();
    actualizarResumenReserva();
    reservationPanel.classList.toggle('visible', selectedSeats.length > 0);
    if (!selectedSeats.length) {
        detenerTemporizadorTransferencia();
    } else if (metodoPagoInput?.value === 'TRANSFERENCIA' && !timerInterval) {
        iniciarTemporizadorTransferencia(DURACION_TIMER_SEGUNDOS);
    }
};

const cancelarReserva = async () => {
    detenerTemporizadorTransferencia();
    if (boletosRetenidos.length > 0) {
        const porCancelar = [...boletosRetenidos];
        boletosRetenidos = [];
        for (const idBol of porCancelar) {
            try {
                await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idBol)}/cancelar`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cedula: cedulaTitular })
                });
            } catch {}
        }
        await loadSeats();
    }
    selectedSeats = [];
    reservationForm.reset();
    depositoInfo.style.display = 'none';
    transferenciaInfo.style.display = 'none';
    passengerTypesContainer.innerHTML = '';
    reservationPanel.classList.remove('visible');
    if (btnSubmitAccion) btnSubmitAccion.textContent = 'Generar solicitud de viaje';
    renderFloor(activeFloor);
    seatStatus.textContent = 'Selección cancelada.';
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

metodoPagoInput.addEventListener('change', () => {
    const metodo = metodoPagoInput.value;

    depositoInfo.style.display = metodo === 'DEPOSITO' ? 'block' : 'none';
    transferenciaInfo.style.display = metodo === 'TRANSFERENCIA' ? 'block' : 'none';

    bancoOrigenInput.required = false;
    comprobanteInput.required = false;

    if (metodo === 'TRANSFERENCIA') {
        if (!timerInterval) {
            iniciarTemporizadorTransferencia(DURACION_TIMER_SEGUNDOS);
        }
        if (btnSubmitAccion) {
            btnSubmitAccion.textContent = comprobanteInput.files?.length
                ? 'Enviar comprobante y reservar'
                : 'Retener asiento (5 min) / Enviar transferencia';
        }
    } else {
        if (boletosRetenidos.length === 0) {
            detenerTemporizadorTransferencia();
        }
        if (btnSubmitAccion) {
            btnSubmitAccion.textContent = 'Confirmar compra de boleto';
        }
    }
});

if (comprobanteInput) {
    comprobanteInput.addEventListener('change', () => {
        if (metodoPagoInput.value === 'TRANSFERENCIA' && btnSubmitAccion) {
            btnSubmitAccion.textContent = comprobanteInput.files?.length
                ? 'Enviar comprobante a revisión del oficinista'
                : (boletosRetenidos.length ? 'Adjunta el comprobante antes de que expire el reloj' : 'Retener asiento (5 min) / Enviar transferencia');
        }
    });
}

reservationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cedulaTitular) return showError('No se detectó la sesión del usuario.');

    // Si ya tiene boletos retenidos en espera de comprobante dentro de los 5 minutos:
    if (boletosRetenidos.length > 0) {
        if (!comprobanteInput.files || !comprobanteInput.files.length) {
            return showError('Selecciona la imagen o PDF del comprobante de transferencia antes de que termine el temporizador de 5 minutos.');
        }
        btnSubmitAccion.disabled = true;
        seatStatus.textContent = 'Subiendo comprobante de transferencia...';
        const formComp = new FormData();
        formComp.append('idBoletos', JSON.stringify(boletosRetenidos));
        formComp.append('bancoOrigen', bancoOrigenInput.value || '');
        formComp.append('comprobante', comprobanteInput.files[0]);

        try {
            const resp = await fetch(`${API_BASE}/usuario/reservas/comprobante`, {
                method: 'POST',
                body: formComp
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.message || 'No fue posible subir el comprobante.');

            detenerTemporizadorTransferencia();
            boletosRetenidos = [];
            qrResult.hidden = false;
            qrResult.innerHTML = `<strong>¡Comprobante enviado a revisión!</strong><br>${escapeHtml(data.message)}<br><small>El oficinista verificará tu transferencia y habilitará tu boleto en Mis Boletos.</small>`;
            selectedSeats = [];
            passengerTypesContainer.innerHTML = '';
            reservationPanel.classList.remove('visible');
            await loadSeats();
            seatStatus.textContent = 'Comprobante enviado a la bandeja de aprobación del oficinista.';
        } catch (error) {
            showError(error.message);
            if (/expir/i.test(error.message)) {
                boletosRetenidos = [];
                detenerTemporizadorTransferencia();
                await loadSeats();
            }
        } finally {
            btnSubmitAccion.disabled = false;
        }
        return;
    }

    if (!selectedSeats.length) return showError('Selecciona al menos un asiento.');

    const pasajeros = selectedSeats.map((seat) => {
        const select = passengerTypesContainer.querySelector(`[data-seat-id="${seat.ID_ASI}"]`);
        return {
            cedula: cedulaTitular,
            precioEsperado: Math.round(Math.round(seat.PRE_TIP * 100) * (select?.value && select.value !== 'ADULTO' ? 0.5 : 1)) / 100,
            tipo: select ? select.value : 'ADULTO'
        };
    });

    const metodoPagoSeleccionado = metodoPagoInput.value;
    if (metodoPagoSeleccionado === 'EFECTIVO') {
        return showError('El pago en efectivo solo se realiza en la ventanilla física con el oficinista.');
    }
    const estadoBoleto = metodoPagoSeleccionado === 'DEPOSITO' ? 'PAGADO' : 'RESERVADO';

    btnSubmitAccion.disabled = true;
    seatStatus.textContent = 'Procesando operación...';

    const values = new FormData(reservationForm);
    values.append('idHoja', idHoja);
    values.append('idAsientos', JSON.stringify(selectedSeats.map((seat) => seat.ID_ASI)));
    values.append('pasajeros', JSON.stringify(pasajeros));
    values.append('cedulaTitular', cedulaTitular);
    values.append('estado', estadoBoleto);

    try {
        const response = await fetch(`${API_BASE}/usuario/reservas`, {
            method: 'POST',
            body: values
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible procesar la solicitud.');

        // Si es transferencia sin comprobante aún, iniciar el bloqueo de 5 minutos
        if (data.requiereComprobante && Array.isArray(data.reservas) && data.reservas.length > 0) {
            boletosRetenidos = data.reservas.map((r) => r.idBoleto);
            iniciarTemporizadorTransferencia(data.segundosRestantes || DURACION_TIMER_SEGUNDOS, data.expiraEnUtc);
            if (textoTemporizador) {
                textoTemporizador.textContent = '¡Asiento retenido por 5 minutos! Adjunta ahora tu comprobante de transferencia y pulsa "Enviar comprobante a revisión del oficinista".';
            }
            if (btnSubmitAccion) {
                btnSubmitAccion.textContent = 'Enviar comprobante a revisión del oficinista';
            }
            qrResult.hidden = false;
            qrResult.innerHTML = `<strong>⏱ Asiento retenido por 5 minutos</strong><br>${escapeHtml(data.message)}<br><small>Sube el comprobante de transferencia arriba antes de que el reloj llegue a 00:00.</small>`;
            selectedSeats.forEach((seat) => {
                seat.ESTADO_ASIENTO = 'RESERVADO';
            });
            renderFloor(activeFloor);
            seatStatus.textContent = 'Asiento retenido por 5 minutos. Sube el comprobante para confirmar.';
            return;
        }

        detenerTemporizadorTransferencia();
        boletosRetenidos = [];
        qrResult.hidden = false;
        qrResult.innerHTML = `<strong>¡Operación exitosa!</strong><br>${escapeHtml(data.message)}<br><small>Estado del boleto: ${escapeHtml(estadoBoleto)}</small>`;

        selectedSeats.forEach((seat) => {
            seat.ESTADO_ASIENTO = estadoBoleto;
        });
        renderFloor(activeFloor);
        selectedSeats = [];
        passengerTypesContainer.innerHTML = '';
        reservationPanel.classList.remove('visible');
        seatStatus.textContent = `Boletos generados correctamente (${estadoBoleto}).`;
    } catch (error) {
        showError(error.message);
    } finally {
        btnSubmitAccion.disabled = false;
    }
});

cancelReservation.addEventListener('click', cancelarReserva);
window.TransportSession.ready.then((user) => {
    if (!user) return;
    cedulaTitular = user.id;
    loadSeats();
});
