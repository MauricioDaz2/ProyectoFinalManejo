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

            return `
                <div class="usuario-card" data-boleto="${escapeHtml(b.ID_BOL)}" style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid var(--usuario-border); display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 260px;">
                        <strong style="font-size: 16px; color: var(--usuario-primary);">Ruta: ${escapeHtml(b.ORI_TRA_BOL)} ➔ ${escapeHtml(b.DES_TRA_BOL)}</strong><br>
                        <span style="font-size: 13px;">Asiento N°: <strong>${escapeHtml(asientoEtiqueta)}</strong> · Bus N°: ${escapeHtml(b.NUM_BUS)}${b.PLA_BUS ? ` (${escapeHtml(b.PLA_BUS)})` : ''}</span><br>
                        <span style="font-size: 13px; color: var(--usuario-muted);">Fecha de viaje: <strong>${escapeHtml(fechaViaje)}</strong> · Salida: <strong>${escapeHtml(horaSalida)}</strong></span><br>
                        <span style="font-size: 13px;">Precio: <strong>$${Number(b.PRE_FIN_BOL || 0).toFixed(2)}</strong> · Método: ${escapeHtml(b.MET_PAG_BOL)}</span><br>
                        <span style="font-size: 13px;">Estado: <strong style="color: ${colorEstado};">${escapeHtml(b.EST_BOL)}</strong>${enRevision ? ' <small style="color:#b45309;">(Comprobante en revisión por oficinista)</small>' : ''}</span><br>

                        ${faltaComprobante ? `
                            <div style="margin-top: 10px; padding: 10px 12px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; font-size: 13px; color: #9a3412;">
                                <strong>⏱ Pendiente de comprobante de transferencia</strong>
                                ${Number(b.SEGUNDOS_RESTANTES) > 0 ? `<span> · Tiempo restante: <strong>${formatearMinutos(b.SEGUNDOS_RESTANTES)}</strong></span>` : ''}
                                <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                    <input type="file" data-archivo-comprobante="${escapeHtml(b.ID_BOL)}" accept=".jpg,.jpeg,.png,.webp,.pdf" style="font-size: 12px;">
                                    <button type="button" class="usuario-button" data-subir-comprobante="${escapeHtml(b.ID_BOL)}" style="padding: 6px 12px; font-size: 12px;">Subir comprobante</button>
                                </div>
                            </div>
                        ` : ''}

                        <div style="margin-top: 12px; display: flex; align-items: center; gap: 15px;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(b.COD_QR_BOL)}" alt="Código QR del boleto" style="width: 90px; height: 90px; border-radius: 8px; border: 1px solid var(--usuario-border); background: #fff; padding: 4px;" />
                            <div style="font-size: 11px; color: var(--usuario-muted); word-break: break-all; max-width: 250px;">
                                <strong>Código QR de abordaje:</strong><br>
                                <code>${escapeHtml(b.COD_QR_BOL)}</code>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                        ${!esInactivo ? `
                            <button class="usuario-button" type="button" data-descargar-pdf="${escapeHtml(b.ID_BOL)}" style="background: #0d5c4a; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                                Descargar PDF
                            </button>
                        ` : ''}
                        ${esReservado ? `
                            <button class="usuario-button usuario-button-secondary" type="button" data-cancelar-boleto="${escapeHtml(b.ID_BOL)}" style="background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;" onclick="cancelarBoleto('${escapeHtml(b.ID_BOL)}')">
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
    if (!confirm('¿Estás seguro de cancelar esta reserva? El asiento será liberado.')) return;
    try {
        const response = await fetch(`${API_BASE}/usuario/reservas/${idBoleto}/cancelar`, {
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
