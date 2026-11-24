const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
    let cedulaTitular = '';

    const historialContainer = document.querySelector('#historialContainer');
    const historialStatus = document.querySelector('#historialStatus');

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));

    const cargarHistorial = async () => {
        if (!cedulaTitular) {
            historialStatus.className = 'usuario-status error';
            historialStatus.textContent = 'No se detectó la sesión del usuario.';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/usuario/reservas/mis-boletos/${encodeURIComponent(cedulaTitular)}`);
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cargar el historial.');

            const boletos = data.boletos;
            if (!boletos.length) {
                historialStatus.textContent = 'No tienes boletos registrados en tu historial.';
                historialContainer.innerHTML = '';
                return;
            }

            historialStatus.textContent = `Se encontraron ${boletos.length} boleto(s).`;
            historialContainer.innerHTML = boletos.map((b) => {
                const estado = String(b.EST_BOL || '').toUpperCase();
                const esReservado = ['RESERVADO', 'PENDIENTE'].includes(estado);
                const colorEstado = estado === 'PAGADO' || estado === 'EMITIDO' ? 'green' : (esReservado ? 'orange' : 'red');

                const claseEstado = estado === 'PAGADO' || estado === 'EMITIDO' ? 'is-ok' : (esReservado ? 'is-pending' : 'is-off');
                return `
                    <article class="ticket-card">
                        <div class="ticket-main">
                            <div class="ticket-head">
                                <span class="ticket-number">Boleto N.º ${escapeHtml(b.ID_BOL)}</span>
                                <span class="ticket-state ${claseEstado}">${escapeHtml(b.EST_BOL)}</span>
                            </div>
                            <div class="ticket-route">${escapeHtml(b.ORI_TRA_BOL)} <span aria-hidden="true">→</span><span class="sr-only"> a </span> ${escapeHtml(b.DES_TRA_BOL)}</div>
                            <dl class="viaje-facts">
                                <div><dt>Asiento</dt><dd>${escapeHtml(b.ID_ASI_PER)}</dd></div>
                                <div><dt>Bus</dt><dd>N.º ${escapeHtml(b.NUM_BUS)}</dd></div>
                                <div><dt>Hoja de ruta</dt><dd>${escapeHtml(b.ID_HOJ_PER)}</dd></div>
                                <div><dt>Precio</dt><dd class="viaje-precio">$${Number(b.PRE_FIN_BOL || 0).toFixed(2)}</dd></div>
                                <div><dt>Método de pago</dt><dd>${escapeHtml(b.MET_PAG_BOL)}</dd></div>
                            </dl>
                            ${esReservado ? `<button class="usuario-button ticket-cancel" type="button" data-cancelar-boleto="${escapeHtml(b.ID_BOL)}">Cancelar reserva</button>` : ''}
                        </div>
                        <div class="ticket-qr">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(b.COD_QR_BOL)}" alt="Código QR del boleto" width="96" height="96">
                            <code>${escapeHtml(b.COD_QR_BOL)}</code>
                        </div>
                    </article>
                `;
            }).join('');
        } catch (error) {
            historialStatus.className = 'usuario-status error';
            historialStatus.textContent = error.message;
        }
    };

    const cancelarBoleto = async (idBoleto) => {
        if (!confirm(`¿Estás seguro de cancelar la reserva del boleto ${idBoleto}? El asiento será liberado.`)) return;
        try {
            const response = await fetch(`${API_BASE}/usuario/reservas/${idBoleto}/cancelar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cedula: cedulaTitular })
});
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cancelar.');
            
            alert(data.message);
            cargarHistorial(); // Recarga la lista para reflejar los cambios
        } catch (error) {
            alert(error.message);
        }
    };

    historialContainer.addEventListener('click', (event) => {
        const boton = event.target.closest('button[data-cancelar-boleto]');
        if (boton) cancelarBoleto(boton.dataset.cancelarBoleto);
    });

    window.TransportSession.ready.then(user => {
        if (!user) return;
        cedulaTitular = user.id;
        cargarHistorial();
    });
