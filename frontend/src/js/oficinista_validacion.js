(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;

  const usuario = App.sesion();
  if (!usuario) return;

  const cooperativa = usuario.cooperativaId;
  const claveRecientes = `validaciones_recientes_${usuario.id || 'oficinista'}`;

  const formValidacion = document.getElementById('formValidacion');
  const codigoValidacion = document.getElementById('codigoValidacion');
  const btnValidar = document.getElementById('btnValidarBoleto');
  const btnCamara = document.getElementById('btnEscanearCamara');
  const resultadoValidacion = document.getElementById('resultadoValidacion');
  const avisoValidacion = document.getElementById('avisoValidacion');

  const btnRecargarTransferencias = document.getElementById('btnRecargarTransferencias');
  const contadorTransferenciasPendientes = document.getElementById('contadorTransferenciasPendientes');
  const tablaTransferenciasPendientes = document.getElementById('tablaTransferenciasPendientes');

  const modalComprobante = document.getElementById('modalComprobante');
  const subtituloModalComprobante = document.getElementById('subtituloModalComprobante');
  const contenidoModalComprobante = document.getElementById('contenidoModalComprobante');
  const btnAprobarDesdeModal = document.getElementById('btnAprobarDesdeModal');
  const btnRechazarDesdeModal = document.getElementById('btnRechazarDesdeModal');

  const busquedaBoletos = document.getElementById('busquedaBoletos');
  const btnBuscar = document.getElementById('btnBuscarBoletos');
  const tablaBoletos = document.getElementById('tablaBoletos');
  const contadorBusqueda = document.getElementById('contadorBusqueda');
  const totalResultados = document.getElementById('totalResultados');

  const recientes = document.getElementById('validacionesRecientes');
  const btnLimpiarRecientes = document.getElementById('btnLimpiarRecientes');

  const modalCamara = document.getElementById('modalCamara');
  const videoCamara = document.getElementById('videoCamara');
  const estadoCamara = document.getElementById('estadoCamara');

  let boletos = [];
  let transferenciasPendientes = [];
  let boletoModalActual = null;
  let streamCamara = null;
  let detector = null;
  let temporizadorEscaneo = null;

  function mostrarAviso(mensaje, tipo = 'danger') {
    avisoValidacion.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoValidacion.innerHTML = '';
  }

  function urlArchivo(ruta) {
    if (!ruta) return '';
    if (/^https?:\/\//i.test(ruta)) return ruta;
    const base = (window.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/api\/?$/, '');
    return `${base}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
  }

  function formatearSegundos(seg) {
    const s = Math.max(0, Number(seg) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  /* ------------------------------- Recientes ------------------------------- */

  function leerRecientes() {
    try {
      const datos = JSON.parse(localStorage.getItem(claveRecientes) || '[]');
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  }

  function guardarRecientes(lista) {
    localStorage.setItem(claveRecientes, JSON.stringify(lista.slice(0, 6)));
  }

  function renderRecientes() {
    const lista = leerRecientes();
    if (lista.length === 0) {
      recientes.innerHTML = `<div class="empty-state"><div class="empty-icon">◉</div><p>Aún no se han validado boletos en esta sesión.</p></div>`;
      return;
    }

    recientes.innerHTML = lista.map((item) => `
      <div class="recent-item">
        <div class="recent-mark" aria-hidden="true">✓</div>
        <div>
          <strong>${App.escapar(item.PASAJERO || 'Pasajero en ventanilla')}</strong>
          <span>Asiento N° ${App.escapar(item.ASIENTO || '—')} · ${App.escapar(item.RUTA || '')}</span>
        </div>
        <span class="muted nowrap">${App.fechaHora(item.validadoEn)}</span>
      </div>`).join('');
  }

  function agregarReciente(boleto) {
    const lista = leerRecientes();
    const item = {
      CLAVE: boleto.COD_QR_BOL || `${boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO}-${Date.now()}`,
      PASAJERO: boleto.PASAJERO,
      ASIENTO: boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO,
      RUTA: `${boleto.ORI_TRA_BOL || ''} → ${boleto.DES_TRA_BOL || ''}`,
      validadoEn: new Date().toISOString()
    };
    guardarRecientes([item, ...lista.filter((elemento) => elemento.CLAVE !== item.CLAVE)]);
    renderRecientes();
  }

  /* ------------ Bandeja de aprobación de reservas por transferencia -------- */

  function encontrarBoletoPorId(id) {
    return transferenciasPendientes.find((b) => b.ID_BOL === id)
      || boletos.find((b) => b.ID_BOL === id)
      || (boletoModalActual?.ID_BOL === id ? boletoModalActual : null);
  }

  function filaTransferenciaPendiente(boleto) {
    const tieneComprobante = Boolean(boleto.COM_PAG_URL);
    const bus = boleto.HOJA?.BUS || {};
    const hora = boleto.HORA_SAL_FRE || boleto.HOJA?.FRECUENCIA?.HORA_SAL_FRE || '08:00';
    const asiento = boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—';
    const segundos = Number(boleto.SEGUNDOS_RESTANTES) || 0;

    const estadoRevisionHtml = tieneComprobante
      ? '<span class="badge badge-info">Comprobante en revisión</span>'
      : `<span class="badge badge-warning">Esperando comprobante${segundos > 0 ? ` (${formatearSegundos(segundos)})` : ''}</span>`;

    const comprobanteHtml = tieneComprobante
      ? `<button class="btn btn-secondary btn-sm" type="button" data-ver-comprobante="${App.escapar(boleto.ID_BOL)}">Ver comprobante</button>
         ${boleto.BAN_ORI_BOL ? `<div class="muted" style="font-size:12px;margin-top:4px;">Banco: ${App.escapar(boleto.BAN_ORI_BOL)}</div>` : ''}`
      : '<span class="muted">Sin archivo adjunto aún</span>';

    return `
      <tr data-transferencia-id="${App.escapar(boleto.ID_BOL)}">
        <td>
          <div class="cell-main">
            <strong>${App.escapar(boleto.PASAJERO || 'Pasajero registrado')}</strong>
            <span>Cédula ${App.escapar(boleto.CEDULA_PASAJERO || '—')}</span>
          </div>
        </td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(boleto.ORI_TRA_BOL)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(boleto.DES_TRA_BOL)}</span>
          </div>
          <span class="muted">Bus N° ${App.escapar(bus.NUM_BUS || '—')} (${App.escapar(bus.PLA_BUS || '—')}) · Salida ${App.escapar(hora)}</span>
        </td>
        <td>
          <div class="cell-main">
            <strong>Asiento N° ${App.escapar(asiento)} · ${App.dinero(boleto.PRE_FIN_BOL)}</strong>
            <span>${App.escapar(boleto.ASIENTO?.TIPO || boleto.TIP_DES_BOL || 'NORMAL')}</span>
          </div>
        </td>
        <td>${comprobanteHtml}</td>
        <td>
          <div class="cell-main">
            ${estadoRevisionHtml}
            <span class="muted">${App.fecha(boleto.HOJA?.FEC_PRO_HOJ || boleto.FEC_COM_BOL)}</span>
          </div>
        </td>
        <td class="text-right">
          <div class="actions">
            <button class="btn btn-success btn-sm" type="button" data-aprobar-transferencia="${App.escapar(boleto.ID_BOL)}">Aprobar pago</button>
            <button class="btn btn-danger-soft btn-sm" type="button" data-rechazar-transferencia="${App.escapar(boleto.ID_BOL)}">Rechazar pago</button>
          </div>
        </td>
      </tr>`;
  }

  function renderTransferenciasPendientes() {
    if (!tablaTransferenciasPendientes) return;
    const total = transferenciasPendientes.length;
    if (contadorTransferenciasPendientes) {
      contadorTransferenciasPendientes.textContent = `${App.numero(total)} pendiente${total === 1 ? '' : 's'}`;
    }

    if (total === 0) {
      tablaTransferenciasPendientes.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <div class="empty-icon">✓</div>
            <h3>No hay transferencias pendientes de revisión</h3>
            <p>Cuando un pasajero reserve por transferencia en línea, su comprobante aparecerá automáticamente en esta bandeja.</p>
          </div>
        </td></tr>`;
      return;
    }

    tablaTransferenciasPendientes.innerHTML = transferenciasPendientes.map(filaTransferenciaPendiente).join('');
  }

  async function cargarTransferenciasPendientes() {
    if (!tablaTransferenciasPendientes) return;
    try {
      const datos = await App.api('/oficinista/boletos/pendientes-transferencia', {
        query: { cooperativa }
      });
      transferenciasPendientes = datos.boletos || [];
      renderTransferenciasPendientes();
    } catch (error) {
      tablaTransferenciasPendientes.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <div class="empty-icon">!</div>
            <h3>No se pudo cargar la bandeja de transferencias</h3>
            <p>${App.escapar(error.message)}</p>
          </div>
        </td></tr>`;
    }
  }

  function abrirModalComprobante(boleto) {
    if (!boleto || !modalComprobante) return;
    boletoModalActual = boleto;
    const url = urlArchivo(boleto.COM_PAG_URL);
    const esPdf = /\.pdf($|\?)/i.test(url);
    const asiento = boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—';

    if (subtituloModalComprobante) {
      subtituloModalComprobante.textContent = `${boleto.PASAJERO || 'Pasajero'} · Cédula ${boleto.CEDULA_PASAJERO || '—'} · Asiento N° ${asiento} · ${App.dinero(boleto.PRE_FIN_BOL)}`;
    }

    contenidoModalComprobante.innerHTML = `
      <div class="detail-grid mb-2">
        <div><span>Pasajero</span><strong>${App.escapar(boleto.PASAJERO || '—')}</strong></div>
        <div><span>Cédula</span><strong>${App.escapar(boleto.CEDULA_PASAJERO || '—')}</strong></div>
        <div><span>Ruta</span><strong>${App.escapar(`${boleto.ORI_TRA_BOL || '—'} → ${boleto.DES_TRA_BOL || '—'}`)}</strong></div>
        <div><span>Asiento N°</span><strong>${App.escapar(asiento)}</strong></div>
        <div><span>Valor a verificar</span><strong>${App.dinero(boleto.PRE_FIN_BOL)}</strong></div>
        <div><span>Banco de origen</span><strong>${App.escapar(boleto.BAN_ORI_BOL || 'No especificado')}</strong></div>
      </div>
      ${url ? (
        esPdf
          ? `<div class="notice info"><span aria-hidden="true">📄</span><span>El comprobante es un documento PDF. <a href="${App.escapar(url)}" target="_blank" rel="noopener">Abrir PDF en nueva pestaña</a></span></div>`
          : `<div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
               <img id="imagenComprobanteModal" src="${App.escapar(url)}" alt="Comprobante de transferencia" style="max-width:100%;max-height:380px;border-radius:8px;object-fit:contain;">
               <div class="mt-1"><a href="${App.escapar(url)}" target="_blank" rel="noopener">Abrir imagen original en nueva pestaña</a></div>
             </div>`
      ) : '<div class="notice warning"><span aria-hidden="true">!</span><span>El pasajero aún no ha subido el archivo del comprobante.</span></div>'}
    `;

    const habilitarRevision = ['RESERVADO', 'PENDIENTE'].includes(String(boleto.EST_BOL || '').toUpperCase());
    if (btnAprobarDesdeModal) btnAprobarDesdeModal.hidden = !habilitarRevision;
    if (btnRechazarDesdeModal) btnRechazarDesdeModal.hidden = !habilitarRevision;
    App.abrirModal('modalComprobante');
  }

  async function procesarTransferencia(id, accion) {
    const boleto = encontrarBoletoPorId(id);
    const asiento = boleto?.ASIENTO?.ETIQUETA || boleto?.ETIQUETA_ASIENTO || '';
    const pasajeroNombre = boleto?.PASAJERO || 'el pasajero';

    if (accion === 'RECHAZAR') {
      const confirmado = await App.confirmar({
        titulo: 'Rechazar transferencia',
        mensaje: `Se rechazará el pago por transferencia de ${pasajeroNombre}${asiento ? ` (Asiento N° ${asiento})` : ''} y el asiento quedará libre inmediatamente. ¿Continuar?`,
        aceptar: 'Rechazar y liberar asiento',
        peligro: true
      });
      if (!confirmado) return;
    }

    try {
      const resp = await App.api(`/oficinista/boletos/${encodeURIComponent(id)}/revision-transferencia`, {
        method: 'PATCH',
        body: { accion, ID_USU_OFI: usuario.id }
      });
      App.cerrarModal('modalComprobante');
      App.aviso(resp.message || (accion === 'APROBAR' ? 'Pago aprobado.' : 'Pago rechazado.'), 'success');
      await cargarTransferenciasPendientes();
      if (busquedaBoletos.value.trim()) await buscarBoletos();
      if (!resultadoValidacion.hidden && resp.boleto) {
        mostrarResultado(
          accion === 'APROBAR' ? 'success' : 'warning',
          accion === 'APROBAR' ? 'Pago por transferencia aprobado' : 'Transferencia rechazada',
          resp.message,
          resp.boleto
        );
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  /* -------------------------------- Resultado ------------------------------- */

  function detalleBoleto(boleto) {
    const hora = boleto.HORA_SAL_FRE || boleto.HOJA?.FRECUENCIA?.HORA_SAL_FRE || '08:00';
    const comprobanteBtn = boleto.COM_PAG_URL
      ? `<button class="btn btn-secondary btn-sm" type="button" data-ver-comprobante="${App.escapar(boleto.ID_BOL)}">Ver comprobante</button>`
      : '—';
    return `
      <div class="detail-grid">
        <div><span>Estado</span><strong>${App.insignia(boleto.EST_BOL)}</strong></div>
        <div><span>Pasajero</span><strong>${App.escapar(boleto.PASAJERO || 'Sin registro')}</strong></div>
        <div><span>Cédula</span><strong>${App.escapar(boleto.CEDULA_PASAJERO || '—')}</strong></div>
        <div><span>Ruta</span><strong>${App.escapar(`${boleto.ORI_TRA_BOL || '—'} → ${boleto.DES_TRA_BOL || '—'}`)}</strong></div>
        <div><span>Asiento N°</span><strong>${App.escapar(boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—')}</strong></div>
        <div><span>Unidad / Placa</span><strong>${App.escapar(`Bus ${boleto.HOJA?.BUS?.NUM_BUS || '—'} · ${boleto.HOJA?.BUS?.PLA_BUS || '—'}`)}</strong></div>
        <div><span>Hora de salida</span><strong>${App.escapar(hora)}</strong></div>
        <div><span>Compra</span><strong>${App.fecha(boleto.FEC_COM_BOL)}</strong></div>
        <div><span>Abordaje</span><strong>${boleto.FEC_USO_BOL ? App.fecha(boleto.FEC_USO_BOL) : 'Pendiente'}</strong></div>
        <div><span>Valor</span><strong>${App.dinero(boleto.PRE_FIN_BOL)}</strong></div>
        <div><span>Método de pago</span><strong>${App.escapar(boleto.MET_PAG_BOL || '—')}</strong></div>
        <div><span>Comprobante</span><strong>${comprobanteBtn}</strong></div>
      </div>
      ${boleto.COD_QR_BOL ? `<p class="help mt-2">Código QR: <span class="mono">${App.escapar(boleto.COD_QR_BOL)}</span></p>` : ''}`;
  }

  function mostrarResultado(tipo, titulo, mensaje, boleto, acciones = '') {
    const iconos = { success: '✓', danger: '✕', warning: '!', info: 'i' };
    resultadoValidacion.hidden = false;
    resultadoValidacion.innerHTML = `
      <div class="validation-banner ${tipo}">
        <div class="banner-icon" aria-hidden="true">${iconos[tipo] || 'i'}</div>
        <div>
          <h3>${App.escapar(titulo)}</h3>
          <p>${App.escapar(mensaje)}</p>
        </div>
      </div>
      ${boleto || acciones ? `<div class="validation-body">${boleto ? detalleBoleto(boleto) : ''}${acciones ? `<div class="inline-actions mt-2">${acciones}</div>` : ''}</div>` : ''}`;

    resultadoValidacion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function ocultarResultado() {
    resultadoValidacion.hidden = true;
    resultadoValidacion.innerHTML = '';
  }

  /* -------------------------------- Validación ------------------------------ */

  async function validarCodigo(codigo) {
    const valor = String(codigo || '').trim();
    if (!valor) {
      mostrarAviso('Escanea un código QR o ingresa una cédula.', 'warning');
      codigoValidacion.focus();
      return;
    }

    limpiarAviso();
    App.textoBoton(btnValidar, 'Validando…');
    try {
      const datos = await App.api('/oficinista/boletos/validar', {
        method: 'POST',
        body: {
          CODIGO: valor,
          ID_USU_CON: usuario.id,
          ID_COP_PER: cooperativa
        }
      });

      mostrarResultado('success', 'Boleto válido', 'El pasajero puede abordar. El boleto fue marcado como usado.', datos.boleto);
      agregarReciente(datos.boleto);
      App.aviso('Validación registrada correctamente.', 'success');
      codigoValidacion.value = '';
      if (busquedaBoletos.value.trim()) buscarBoletos();
    } catch (error) {
      const codigoError = error.datos?.codigo;

      if (codigoError === 'TRANSFERENCIA_PENDIENTE_APROBACION' && error.datos?.boleto) {
        const b = error.datos.boleto;
        boletoModalActual = b;
        const acciones = `
          ${b.COM_PAG_URL ? `<button class="btn btn-secondary btn-sm" type="button" data-ver-comprobante="${App.escapar(b.ID_BOL)}">Ver comprobante</button>` : ''}
          <button class="btn btn-success btn-sm" type="button" data-aprobar-transferencia="${App.escapar(b.ID_BOL)}">Aprobar pago</button>
          <button class="btn btn-danger-soft btn-sm" type="button" data-rechazar-transferencia="${App.escapar(b.ID_BOL)}">Rechazar pago</button>`;
        mostrarResultado('warning', 'Transferencia pendiente de aprobación', error.message, b, acciones);
      } else if (codigoError === 'MULTIPLES_BOLETOS') {
        const acciones = (error.datos.boletos || []).map((boleto, idx) => `
          <button class="btn btn-secondary btn-sm" type="button" data-validar-candidato="${App.escapar(boleto.COD_QR_BOL || boleto.ID_BOL)}">
            Validar boleto #${idx + 1} (${App.escapar(boleto.EST_BOL)})
          </button>`).join('');
        mostrarResultado('warning', 'Varios boletos encontrados', error.message, null, acciones);
      } else if (codigoError === 'BOLETO_USADO') {
        mostrarResultado('warning', 'Boleto ya utilizado', error.message, error.datos?.boleto || null);
      } else if (codigoError === 'BOLETO_INACTIVO') {
        mostrarResultado('danger', 'Boleto no válido', error.message, null);
      } else {
        mostrarResultado('danger', 'No se pudo validar el boleto', error.message, error.datos?.boleto || null);
      }

      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnValidar);
      codigoValidacion.focus();
    }
  }

  /* -------------------------------- Búsqueda -------------------------------- */

  function accionesBoleto(boleto) {
    const estado = String(boleto.EST_BOL || '').toUpperCase();
    const esTransferenciaReserva = ['RESERVADO', 'PENDIENTE'].includes(estado) && String(boleto.MET_PAG_BOL || '').toUpperCase() === 'TRANSFERENCIA';

    if (esTransferenciaReserva) {
      return `
        ${boleto.COM_PAG_URL ? `<button class="btn btn-secondary btn-sm" type="button" data-ver-comprobante="${App.escapar(boleto.ID_BOL)}">Ver comprobante</button>` : ''}
        <button class="btn btn-success btn-sm" type="button" data-aprobar-transferencia="${App.escapar(boleto.ID_BOL)}">Aprobar pago</button>
        <button class="btn btn-danger-soft btn-sm" type="button" data-rechazar-transferencia="${App.escapar(boleto.ID_BOL)}">Rechazar pago</button>`;
    }

    if (['RESERVADO', 'EMITIDO', 'PAGADO'].includes(estado)) {
      const validar = `<button class="btn btn-success btn-sm" type="button" data-validar-codigo="${App.escapar(boleto.COD_QR_BOL || boleto.ID_BOL)}">Registrar abordaje</button>`;
      const pagar = estado !== 'PAGADO'
        ? `<button class="btn btn-secondary btn-sm" type="button" data-pagar="${App.escapar(boleto.ID_BOL)}">Aprobar pago</button>`
        : '';
      const anular = `<button class="btn btn-danger-soft btn-sm" type="button" data-anular="${App.escapar(boleto.ID_BOL)}">Anular</button>`;
      return `${validar}${pagar}${anular}`;
    }
    return '<span class="muted">Sin acciones</span>';
  }

  function filaBoleto(boleto) {
    const bus = boleto.HOJA?.BUS || {};
    const hora = boleto.HORA_SAL_FRE || boleto.HOJA?.FRECUENCIA?.HORA_SAL_FRE || '08:00';
    const comprobante = boleto.COM_PAG_URL
      ? `<button class="btn btn-ghost btn-sm" type="button" data-ver-comprobante="${App.escapar(boleto.ID_BOL)}">Ver comprobante</button>`
      : `<span class="muted">${App.escapar(boleto.MET_PAG_BOL || '—')}</span>`;
    return `
      <tr data-boleto-id="${App.escapar(boleto.ID_BOL)}">
        <td>
          <div class="cell-main">
            <strong>${App.escapar(boleto.PASAJERO || 'Sin registro')}</strong>
            <span>Cédula ${App.escapar(boleto.CEDULA_PASAJERO || '—')}</span>
          </div>
        </td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(boleto.ORI_TRA_BOL)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(boleto.DES_TRA_BOL)}</span>
          </div>
          <span class="muted">Bus N° ${App.escapar(bus.NUM_BUS || '—')} (${App.escapar(bus.PLA_BUS || '—')}) · Salida ${App.escapar(hora)}</span>
        </td>
        <td>
          <div class="cell-main">
            <strong>Asiento N° ${App.escapar(boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—')}</strong>
            <span>${App.escapar(boleto.ASIENTO?.TIPO || '—')} · ${App.dinero(boleto.PRE_FIN_BOL)}</span>
          </div>
        </td>
        <td class="nowrap">${App.fecha(boleto.FEC_COM_BOL)}<br><small>${comprobante}</small></td>
        <td>${App.insignia(boleto.EST_BOL)}</td>
        <td>
          <div class="actions">${accionesBoleto(boleto)}</div>
        </td>
      </tr>`;
  }

  function renderBoletos() {
    totalResultados.textContent = `${App.numero(boletos.length)} resultado${boletos.length === 1 ? '' : 's'}`;
    contadorBusqueda.textContent = busquedaBoletos.value.trim()
      ? `Búsqueda: “${busquedaBoletos.value.trim()}”`
      : '—';

    tablaBoletos.innerHTML = boletos.length > 0
      ? boletos.map(filaBoleto).join('')
      : `<tr><td colspan="6"><div class="empty-state">
          <div class="empty-icon">⌕</div>
          <h3>Sin resultados</h3>
          <p>No se encontraron boletos con el código QR o la cédula ingresada.</p>
        </div></td></tr>`;
  }

  async function buscarBoletos() {
    const valor = busquedaBoletos.value.trim();
    if (!valor) {
      boletos = [];
      renderBoletos();
      App.aviso('Ingresa un código QR o la cédula del pasajero.', 'warning');
      return;
    }

    App.textoBoton(btnBuscar, 'Buscando…');
    try {
      const datos = await App.api('/oficinista/boletos/buscar', {
        query: { q: valor, cooperativa }
      });
      boletos = datos.boletos || [];
      renderBoletos();
    } catch (error) {
      App.aviso(error.message, 'error');
      boletos = [];
      renderBoletos();
    } finally {
      App.restaurarBoton(btnBuscar);
    }
  }

  async function cambiarEstado(id, estado) {
    if (estado === 'ANULADO') {
      const confirmado = await App.confirmar({
        titulo: 'Anular boleto',
        mensaje: 'El boleto quedará anulado y el asiento volverá a estar disponible. ¿Continuar?',
        aceptar: 'Anular boleto',
        peligro: true
      });
      if (!confirmado) return;
    }

    try {
      await App.api(`/oficinista/boletos/${encodeURIComponent(id)}/estado`, {
        method: 'PATCH',
        body: { EST_BOL: estado, ID_USU_CON: usuario.id }
      });
      App.aviso(`Boleto actualizado a ${estado}.`, 'success');
      await Promise.all([
        cargarTransferenciasPendientes(),
        busquedaBoletos.value.trim() ? buscarBoletos() : Promise.resolve()
      ]);
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  /* --------------------------------- Cámara -------------------------------- */

  function detenerCamara() {
    if (temporizadorEscaneo) {
      clearTimeout(temporizadorEscaneo);
      temporizadorEscaneo = null;
    }
    if (streamCamara) {
      streamCamara.getTracks().forEach((pista) => pista.stop());
      streamCamara = null;
    }
    if (videoCamara) videoCamara.srcObject = null;
  }

  async function escanearFotograma() {
    if (!streamCamara || !detector) return;
    try {
      const codigos = await detector.detect(videoCamara);
      if (codigos.length > 0 && codigos[0].rawValue) {
        const valor = codigos[0].rawValue;
        detenerCamara();
        App.cerrarModal('modalCamara');
        codigoValidacion.value = valor;
        await validarCodigo(valor);
        return;
      }
    } catch {
      // Algunos navegadores fallan en fotogramas aislados; se reintenta.
    }
    temporizadorEscaneo = window.setTimeout(escanearFotograma, 380);
  }

  async function abrirCamara() {
    if (!('BarcodeDetector' in window)) {
      App.aviso('Tu navegador no soporta la detección de QR. Usa el lector o ingresa el código manualmente.', 'warning');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      App.aviso('No se puede acceder a la cámara desde este contexto. Usa el lector o el código manual.', 'warning');
      return;
    }

    detenerCamara();
    estadoCamara.textContent = 'Iniciando cámara…';
    App.abrirModal('modalCamara');

    try {
      streamCamara = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      videoCamara.srcObject = streamCamara;
      await videoCamara.play();
      detector = new BarcodeDetector({ formats: ['qr_code'] });
      estadoCamara.textContent = 'Buscando un código QR…';
      escanearFotograma();
    } catch {
      detenerCamara();
      App.cerrarModal('modalCamara');
      App.aviso('No se pudo iniciar la cámara. Verifica los permisos del navegador.', 'error');
    }
  }

  /* -------------------------------- Eventos -------------------------------- */

  function delegarAccionesTransferencia(evento) {
    const verComp = evento.target.closest('[data-ver-comprobante]');
    if (verComp) {
      const b = encontrarBoletoPorId(verComp.dataset.verComprobante);
      if (b) abrirModalComprobante(b);
      return true;
    }
    const aprobar = evento.target.closest('[data-aprobar-transferencia]');
    if (aprobar) {
      procesarTransferencia(aprobar.dataset.aprobarTransferencia, 'APROBAR');
      return true;
    }
    const rechazar = evento.target.closest('[data-rechazar-transferencia]');
    if (rechazar) {
      procesarTransferencia(rechazar.dataset.rechazarTransferencia, 'RECHAZAR');
      return true;
    }
    return false;
  }

  if (tablaTransferenciasPendientes) {
    tablaTransferenciasPendientes.addEventListener('click', delegarAccionesTransferencia);
  }

  if (btnRecargarTransferencias) {
    btnRecargarTransferencias.addEventListener('click', cargarTransferenciasPendientes);
  }

  if (btnAprobarDesdeModal) {
    btnAprobarDesdeModal.addEventListener('click', () => {
      if (boletoModalActual) procesarTransferencia(boletoModalActual.ID_BOL, 'APROBAR');
    });
  }

  if (btnRechazarDesdeModal) {
    btnRechazarDesdeModal.addEventListener('click', () => {
      if (boletoModalActual) procesarTransferencia(boletoModalActual.ID_BOL, 'RECHAZAR');
    });
  }

  formValidacion.addEventListener('submit', (evento) => {
    evento.preventDefault();
    validarCodigo(codigoValidacion.value);
  });

  resultadoValidacion.addEventListener('click', (evento) => {
    if (delegarAccionesTransferencia(evento)) return;
    const boton = evento.target.closest('[data-validar-candidato]');
    if (!boton) return;
    const codigo = boton.dataset.validarCandidato;
    codigoValidacion.value = codigo;
    validarCodigo(codigo);
  });

  tablaBoletos.addEventListener('click', (evento) => {
    if (delegarAccionesTransferencia(evento)) return;
    const validar = evento.target.closest('[data-validar-codigo]');
    if (validar) {
      codigoValidacion.value = validar.dataset.validarCodigo;
      validarCodigo(validar.dataset.validarCodigo);
      return;
    }
    const pagar = evento.target.closest('[data-pagar]');
    if (pagar) {
      cambiarEstado(pagar.dataset.pagar, 'PAGADO');
      return;
    }
    const anular = evento.target.closest('[data-anular]');
    if (anular) {
      cambiarEstado(anular.dataset.anular, 'ANULADO');
    }
  });

  btnBuscar.addEventListener('click', buscarBoletos);
  busquedaBoletos.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      buscarBoletos();
    }
  });
  busquedaBoletos.addEventListener('input', () => {
    if (!busquedaBoletos.value.trim()) {
      boletos = [];
      renderBoletos();
    }
  });

  btnCamara.addEventListener('click', abrirCamara);
  btnLimpiarRecientes.addEventListener('click', async () => {
    const confirmado = await App.confirmar({
      titulo: 'Limpiar historial',
      mensaje: 'Se eliminará el historial local de validaciones de esta ventanilla. ¿Continuar?',
      aceptar: 'Limpiar',
      peligro: true
    });
    if (!confirmado) return;
    guardarRecientes([]);
    renderRecientes();
    App.aviso('Historial de validaciones eliminado.', 'success');
  });

  modalCamara.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-cerrar-modal]')) detenerCamara();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') detenerCamara();
  });

  renderRecientes();
  ocultarResultado();
  cargarTransferenciasPendientes();
  codigoValidacion.focus();
})();
