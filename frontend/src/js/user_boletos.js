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

                return `
                    <div class="usuario-card" style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid var(--usuario-border); display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
                        <div style="flex: 1;">
                            <strong style="font-size: 16px; color: var(--usuario-primary);">Boleto N°: ${escapeHtml(b.ID_BOL)}</strong><br>
                            <span style="font-size: 14px; color: var(--usuario-muted);">Ruta: <strong>${escapeHtml(b.ORI_TRA_BOL)} ➔ ${escapeHtml(b.DES_TRA_BOL)}</strong></span><br>
                            <span style="font-size: 13px;">Asiento: <strong>${escapeHtml(b.ID_ASI_PER)}</strong> · Bus N°: ${escapeHtml(b.NUM_BUS)} · Hoja: ${escapeHtml(b.ID_HOJ_PER)}</span><br>
                            <span style="font-size: 13px;">Precio: <strong>$${Number(b.PRE_FIN_BOL || 0).toFixed(2)}</strong> · Método: ${escapeHtml(b.MET_PAG_BOL)}</span><br>
                            <span style="font-size: 13px;">Estado: <strong style="color: ${colorEstado};">${escapeHtml(b.EST_BOL)}</strong></span><br>
                            <div style="margin-top: 12px; display: flex; align-items: center; gap: 15px;">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(b.COD_QR_BOL)}" alt="Código QR del boleto" style="width: 90px; height: 90px; border-radius: 8px; border: 1px solid var(--usuario-border); background: #fff; padding: 4px;" />
    <div style="font-size: 11px; color: var(--usuario-muted); word-break: break-all; max-width: 250px;">
        <strong>Código QR:</strong><br>
        <code>${escapeHtml(b.COD_QR_BOL)}</code>
    </div>
</div>
                        </div>
                        <div>
                            ${esReservado ? `
                                <button class="usuario-button usuario-button-secondary" style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;" onclick="cancelarBoleto('${escapeHtml(b.ID_BOL)}')">
                                    Cancelar Reserva
                                </button>
                            ` : ''}
                        </div>
                    </div>
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

    window.TransportSession.ready.then(user => {
        if (!user) return;
        cedulaTitular = user.id;
        cargarHistorial();
    });
