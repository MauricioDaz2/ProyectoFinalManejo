const API_BASE = window.API_BASE_URL || 'http://localhost:3000/api';
let cedulaTitular = '';

const historialContainer = document.querySelector('#historialContainer');
const historialStatus = document.querySelector('#historialStatus');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const formatearMinutos = (seg) => {
    const s = Math.max(0, Number(seg) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const descargarBoletoPdf = async (idBoleto, boton = null) => {
    const codigo = String(idBoleto || '').trim().toUpperCase();
    if (!codigo) return;
    const textoOriginal = boton ? boton.textContent : '';
    if (boton) {
        boton.disabled = true;
        boton.textContent = 'Generando PDF...';
    }
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(codigo)}/pdf`, {
            method: 'GET',
            headers: { Accept: 'application/pdf' }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'No fue posible descargar el boleto en PDF.');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `boleto-${codigo}.pdf`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        historialStatus.className = 'usuario-status';
        historialStatus.textContent = 'Boleto descargado en PDF correctamente.';
    } catch (error) {
        historialStatus.className = 'usuario-status error';
        historialStatus.textContent = error.message;
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = textoOriginal || 'Descargar PDF';
        }
    }
};

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
            const esInactivo = ['CANCELADO', 'ANULADO', 'VENCIDO'].includes(estado);
            const colorEstado = estado === 'PAGADO' || estado === 'EMITIDO' ? 'green' : (esReservado ? 'orange' : 'red');
            const asientoEtiqueta = b.ETIQUETA_ASIENTO || b.NUMERO_ASIENTO || '—';
            const fechaViaje = b.FEC_PRO_HOJ ? String(b.FEC_PRO_HOJ).slice(0, 10) : '—';
            const horaSalida = b.HORA_SAL_FRE ? String(b.HORA_SAL_FRE).slice(0, 5) : '08:00';
            const faltaComprobante = esReservado && String(b.MET_PAG_BOL || '').toUpperCase() === 'TRANSFERENCIA' && !b.COM_PAG_URL;
            const enRevision = esReservado && String(b.MET_PAG_BOL || '').toUpperCase() === 'TRANSFERENCIA' && Boolean(b.COM_PAG_URL);

            const claseEstado = estado === 'PAGADO' || estado === 'EMITIDO' ? 'is-ok' : (esReservado ? 'is-pending' : 'is-off');

            return `
                <article class="ticket-card" data-boleto="${escapeHtml(b.ID_BOL)}">
                    <div class="ticket-main">
                        <div class="ticket-head">
                            <span class="ticket-number">Boleto</span>
                            <span class="ticket-state ${claseEstado}">${escapeHtml(b.EST_BOL)}</span>
                            ${enRevision ? '<span class="ticket-note">Comprobante en revisión por oficinista</span>' : ''}
                        </div>
                        <div class="ticket-route">${escapeHtml(b.ORI_TRA_BOL)} <span aria-hidden="true">→</span><span class="sr-only"> a </span> ${escapeHtml(b.DES_TRA_BOL)}</div>
                        <dl class="viaje-facts">
                            <div><dt>Fecha de viaje</dt><dd>${escapeHtml(fechaViaje)}</dd></div>
                            <div><dt>Salida</dt><dd class="viaje-hora">${escapeHtml(horaSalida)}</dd></div>
                            <div><dt>Asiento</dt><dd>${escapeHtml(asientoEtiqueta)}</dd></div>
                            <div><dt>Bus</dt><dd>N.º ${escapeHtml(b.NUM_BUS)}${b.PLA_BUS ? ` (${escapeHtml(b.PLA_BUS)})` : ''}</dd></div>
                            <div><dt>Precio</dt><dd class="viaje-precio">$${Number(b.PRE_FIN_BOL || 0).toFixed(2)}</dd></div>
                            <div><dt>Método de pago</dt><dd>${escapeHtml(b.MET_PAG_BOL)}</dd></div>
                        </dl>

                        ${faltaComprobante ? `
                            <div class="ticket-alert">
                                <strong>⏱ Pendiente de comprobante de transferencia</strong>
                                ${Number(b.SEGUNDOS_RESTANTES) > 0 ? `<span> · Tiempo restante: <strong>${formatearMinutos(b.SEGUNDOS_RESTANTES)}</strong></span>` : ''}
                                <div class="ticket-upload">
                                    <input type="file" data-archivo-comprobante="${escapeHtml(b.ID_BOL)}" accept=".jpg,.jpeg,.png,.webp,.pdf">
                                    <button type="button" class="usuario-button" data-subir-comprobante="${escapeHtml(b.ID_BOL)}">Subir comprobante</button>
                                </div>
                            </div>
                        ` : ''}

                        <div class="ticket-actions">
                            ${!esInactivo ? `<button class="usuario-button ticket-pdf" type="button" data-descargar-pdf="${escapeHtml(b.ID_BOL)}">Descargar PDF</button>` : ''}
                            ${esReservado ? `<button class="usuario-button ticket-cancel" type="button" data-cancelar-boleto="${escapeHtml(b.ID_BOL)}">Cancelar reserva</button>` : ''}
                        </div>
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
    if (!confirm('¿Estás seguro de cancelar esta reserva? El asiento será liberado.')) return;
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idBoleto)}/cancelar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cedula: cedulaTitular })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible cancelar.');

        alert(data.message);
        cargarHistorial();
    } catch (error) {
        alert(error.message);
    }
};

if (historialContainer) {
    historialContainer.addEventListener('click', async (event) => {
        const btnCancelar = event.target.closest('[data-cancelar-boleto]');
        if (btnCancelar) {
            cancelarBoleto(btnCancelar.dataset.cancelarBoleto);
            return;
        }
        const btnPdf = event.target.closest('[data-descargar-pdf]');
        if (btnPdf) {
            descargarBoletoPdf(btnPdf.dataset.descargarPdf, btnPdf);
            return;
        }
        const btn = event.target.closest('[data-subir-comprobante]');
        if (!btn) return;
        const idBoleto = btn.dataset.subirComprobante;
        const input = historialContainer.querySelector(`[data-archivo-comprobante="${idBoleto}"]`);
        if (!input || !input.files || !input.files.length) {
            alert('Selecciona la imagen o PDF del comprobante de transferencia.');
            return;
        }
        btn.disabled = true;
        const form = new FormData();
        form.append('comprobante', input.files[0]);
        try {
            const resp = await fetch(`${API_BASE}/usuario/reservas/${encodeURIComponent(idBoleto)}/comprobante`, {
                method: 'POST',
                body: form
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.message || 'No se pudo subir el comprobante.');
            alert(data.message);
            cargarHistorial();
        } catch (error) {
            alert(error.message);
            cargarHistorial();
        } finally {
            btn.disabled = false;
        }
    });
}

window.TransportSession.ready.then((user) => {
    if (!user) return;
    cedulaTitular = user.id;
    cargarHistorial();
});
