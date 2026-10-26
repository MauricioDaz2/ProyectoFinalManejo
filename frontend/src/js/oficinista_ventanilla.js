(() => {
  'use strict';

  const usuario = App.sesion();
  if (!usuario) return;

  const cooperativa = usuario.cooperativaId;

  const fechaInput = document.getElementById('fechaVentanilla');
  const btnRecargar = document.getElementById('btnRecargarVentanilla');
  const avisoPanel = document.getElementById('avisoVentanilla');
  const stats = document.getElementById('statsVentanilla');
  const subtituloHojas = document.getElementById('subtituloHojas');
  const contadorHojas = document.getElementById('contadorHojas');
  const tablaHojas = document.getElementById('tablaHojas');

  const panelAsientos = document.getElementById('panelAsientos');
  const tituloAsientos = document.getElementById('tituloAsientos');
  const subtituloAsientos = document.getElementById('subtituloAsientos');
  const resumenDisponibles = document.getElementById('resumenDisponibles');
  const mapaAsientos = document.getElementById('mapaAsientosVenta');

  const resumenAsiento = document.getElementById('resumenAsiento');
  const precioBoleto = document.getElementById('precioBoleto');
  const metodoPago = document.getElementById('metodoPago');
  const btnEmitir = document.getElementById('btnEmitirBoleto');

  const cedulaPasajero = document.getElementById('cedulaPasajero');
  const btnBuscarPasajero = document.getElementById('btnBuscarPasajero');
  const resultadosPasajero = document.getElementById('resultadosPasajero');
  const pasajeroSeleccionado = document.getElementById('pasajeroSeleccionado');
  const formRegistro = document.getElementById('formRegistroPasajero');
  const nombrePasajero = document.getElementById('nombrePasajero');
  const apellidoPasajero = document.getElementById('apellidoPasajero');
  const telefonoPasajero = document.getElementById('telefonoPasajero');
  const correoPasajero = document.getElementById('correoPasajero');
  const btnRegistrarPasajero = document.getElementById('btnRegistrarPasajero');

  const modalBoleto = document.getElementById('modalBoleto');
  const ticketContenido = document.getElementById('ticketContenido');
  const btnImprimir = document.getElementById('btnImprimirBoleto');

  let hojas = [];
  let hojaSeleccionada = null;
  let asientos = [];
  let asientoSeleccionado = null;
  let pasajero = null;

  function aviso(mensaje, tipo = 'danger') {
    avisoPanel.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoPanel.innerHTML = '';
  }

  function renderStats(resumen) {
    const tarjetas = [
      {
        etiqueta: 'Boletos emitidos hoy',
        valor: App.numero(resumen.BOLETOS_HOY),
        pista: `${App.numero(resumen.HOJAS_HOY)} hojas de ruta`,
        icono: '▣'
      },
      {
        etiqueta: 'Ventas confirmadas',
        valor: App.numero(resumen.VENDIDOS_HOY),
        pista: `${App.numero(resumen.RESERVADOS_HOY)} reservas pendientes`,
        icono: '✓'
      },
      {
        etiqueta: 'Boletos validados',
        valor: App.numero(resumen.VALIDADOS_HOY),
        pista: 'Abordajes registrados hoy',
        icono: '◉'
      },
      {
        etiqueta: 'Ingresos del día',
        valor: App.dinero(resumen.INGRESOS_HOY),
        pista: `${App.dinero(resumen.PROMEDIO_BOLETO)} promedio`,
        icono: '$',
        acento: true
      }
    ];

    stats.innerHTML = tarjetas.map((tarjeta) => `
      <article class="stat-card ${tarjeta.acento ? 'accent' : ''}">
        <div class="stat-icon" aria-hidden="true">${tarjeta.icono}</div>
        <div class="stat-copy">
          <div class="stat-label">${App.escapar(tarjeta.etiqueta)}</div>
          <div class="stat-value">${App.escapar(tarjeta.valor)}</div>
          <div class="stat-hint">${App.escapar(tarjeta.pista)}</div>
        </div>
      </article>`).join('');
  }

  async function cargarResumen() {
    if (!cooperativa) return;
    try {
      const datos = await App.api('/oficinista/resumen', {
        query: { cooperativa, fecha: fechaInput.value }
      });
      renderStats(datos.resumen || {});
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  function filaHoja(hoja) {
    const seleccionada = hojaSeleccionada?.ID_HOJ === hoja.ID_HOJ;
    const disponibles = Number(hoja.ASIENTOS_DISPONIBLES) || 0;
    const total = Number(hoja.TOTAL_ASIENTOS) || 0;
    const porcentaje = total > 0 ? Math.round(((Number(hoja.ASIENTOS_OCUPADOS) || 0) / total) * 100) : 0;
    const clase = porcentaje >= 100 ? 'danger' : porcentaje >= 80 ? 'warn' : '';

    return `
      <tr ${seleccionada ? 'style="background:var(--panel-tint);"' : ''}>
        <td>
          <div class="cell-route">
            <span>${App.escapar(hoja.CIU_ORI_FRE)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(hoja.CIU_DES_FRE)}</span>
          </div>
          <span class="muted mono">${App.escapar(hoja.ID_HOJ)} · ${App.escapar(hoja.NOM_COP)}</span>
        </td>
        <td>
          <div class="cell-main">
            <strong>${App.escapar(hoja.NUM_BUS)}</strong>
            <span>${App.escapar(hoja.PLA_BUS)}</span>
          </div>
        </td>
        <td>
          <div class="cell-main">
            <strong>${App.fecha(hoja.FEC_PRO_HOJ)}</strong>
            <span>${App.fecha(hoja.FEC_HOR_INI_FRE)}</span>
          </div>
        </td>
        <td style="min-width:110px;">
          <div class="cell-main">
            <span>${App.numero(disponibles)} de ${App.numero(total)}</span>
            <div class="progress ${clase}"><span style="width:${Math.min(porcentaje, 100)}%"></span></div>
          </div>
        </td>
        <td>${App.insignia(hoja.EST_VIA_HOJ)}</td>
        <td class="text-right">
          <button class="btn ${seleccionada ? 'btn-primary' : 'btn-secondary'} btn-sm" type="button" data-hoja="${App.escapar(hoja.ID_HOJ)}" ${disponibles === 0 && !seleccionada ? 'disabled' : ''}>
            ${seleccionada ? 'Seleccionada' : 'Seleccionar'}
          </button>
        </td>
      </tr>`;
  }

  function renderHojas() {
    subtituloHojas.textContent = App.fechaLarga(fechaInput.value || App.hoyISO());
    contadorHojas.textContent = `${App.numero(hojas.length)} hoja${hojas.length === 1 ? '' : 's'}`;
    tablaHojas.innerHTML = hojas.length > 0
      ? hojas.map(filaHoja).join('')
      : `<tr><td colspan="6"><div class="empty-state">
          <div class="empty-icon">⇄</div>
          <h3>Sin hojas de ruta para esta fecha</h3>
          <p>La cooperativa no tiene salidas programadas o en curso. Cambia la fecha o solicita la programación de una hoja de ruta.</p>
        </div></td></tr>`;
  }

  async function cargarHojas() {
    if (!cooperativa) {
      aviso('Tu usuario no tiene una cooperativa asignada. Contacta al administrador para completar tu registro.', 'danger');
      tablaHojas.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>No se pueden consultar las hojas de ruta.</p></div></td></tr>`;
      return;
    }

    try {
      const datos = await App.api('/oficinista/hojas', {
        query: { cooperativa, fecha: fechaInput.value }
      });
      hojas = datos.hojas || [];

      if (hojaSeleccionada) {
        const sigueDisponible = hojas.find((hoja) => hoja.ID_HOJ === hojaSeleccionada.ID_HOJ);
        if (sigueDisponible) {
          hojaSeleccionada = sigueDisponible;
        } else {
          hojaSeleccionada = null;
          panelAsientos.hidden = true;
          limpiarSeleccionAsiento();
        }
      }

      renderHojas();
    } catch (error) {
      App.aviso(error.message, 'error');
      tablaHojas.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las hojas</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  function renderAsientos(datos) {
    asientos = datos.asientos || [];
    const pisos = (datos.pisos || []).filter((piso) => (piso.asientos || []).length > 0);

    resumenDisponibles.textContent = `${App.numero(datos.resumen?.disponibles || 0)} disponibles`;

    if (pisos.length === 0) {
      mapaAsientos.innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><h3>Sin asientos configurados</h3><p>La unidad asignada no tiene asientos registrados.</p></div>`;
      return;
    }

    mapaAsientos.innerHTML = `<div class="bus-layout">${pisos.map((piso) => `
      <section class="bus-floor">
        <div class="bus-floor-head">
          <h4>${piso.piso === 1 ? 'Piso 1 · Planta baja' : 'Piso 2 · Planta alta'}</h4>
          <span>${piso.asientos.length} asientos</span>
        </div>
        <div class="driver" aria-hidden="true">◉</div>
        <div class="seat-grid">
          ${piso.asientos.map((asiento) => {
            const vip = /VIP|CAMA|EJECUTIV|PREMIUM/i.test(asiento.NOM_TIP || '');
            const ocupado = !asiento.DISPONIBLE;
            return `<button class="seat ${vip ? 'vip' : ''} ${ocupado ? 'occupied' : ''}" type="button"
              data-asiento-venta="${App.escapar(asiento.ID_ASI)}"
              ${ocupado ? 'disabled' : ''}
              title="${App.escapar(asiento.ETIQUETA)} · ${App.escapar(asiento.NOM_TIP || '')} · ${ocupado ? 'Ocupado' : App.dinero(asiento.PRE_TIP)}">
              ${App.escapar(String(asiento.NUMERO).padStart(2, '0'))}
              <small>${ocupado ? 'Ocupado' : App.escapar((asiento.NOM_TIP || '').slice(0, 8))}</small>
            </button>`;
          }).join('')}
        </div>
      </section>`).join('')}</div>`;
  }

  async function cargarAsientos(hoja) {
    panelAsientos.hidden = false;
    tituloAsientos.textContent = `${hoja.CIU_ORI_FRE} → ${hoja.CIU_DES_FRE}`;
    subtituloAsientos.textContent = `Hoja ${hoja.ID_HOJ} · Bus ${hoja.NUM_BUS} (${hoja.PLA_BUS}) · ${App.fecha(hoja.FEC_PRO_HOJ)}`;
    mapaAsientos.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Cargando asientos…</p></div>`;

    try {
      const datos = await App.api(`/oficinista/hojas/${encodeURIComponent(hoja.ID_HOJ)}/asientos`);
      renderAsientos(datos);
      marcarAsientoSeleccionado();
    } catch (error) {
      App.aviso(error.message, 'error');
      mapaAsientos.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar los asientos</h3><p>${App.escapar(error.message)}</p></div>`;
    }
  }

  async function seleccionarHoja(id) {
    const hoja = hojas.find((elemento) => elemento.ID_HOJ === id);
    if (!hoja) return;
    hojaSeleccionada = hoja;
    limpiarSeleccionAsiento();
    renderHojas();
    await cargarAsientos(hoja);
  }

  function limpiarSeleccionAsiento() {
    asientoSeleccionado = null;
    precioBoleto.value = '';
    precioBoleto.disabled = true;
    metodoPago.value = '';
    metodoPago.disabled = true;
    resumenAsiento.innerHTML = `
      <div>
        <strong>Sin asiento</strong>
        <span>Selecciona un asiento del mapa</span>
      </div>
      <span class="badge badge-neutral">—</span>`;
    marcarAsientoSeleccionado();
    actualizarBotonEmitir();
  }

  function marcarAsientoSeleccionado() {
    mapaAsientos.querySelectorAll('[data-asiento-venta]').forEach((boton) => {
      boton.classList.toggle('selected', Boolean(asientoSeleccionado) && boton.dataset.asientoVenta === asientoSeleccionado.ID_ASI);
    });
  }

  function seleccionarAsiento(id) {
    const asiento = asientos.find((elemento) => elemento.ID_ASI === id);
    if (!asiento || !asiento.DISPONIBLE) return;
    asientoSeleccionado = asiento;
    precioBoleto.value = Number(asiento.PRE_TIP) || '';
    precioBoleto.disabled = false;
    metodoPago.disabled = false;
    resumenAsiento.innerHTML = `
      <div>
        <strong>Asiento ${App.escapar(asiento.ETIQUETA)}</strong>
        <span>${App.escapar(asiento.NOM_TIP || 'Normal')} · ${hojaSeleccionada ? App.escapar(hojaSeleccionada.CIU_ORI_FRE + ' → ' + hojaSeleccionada.CIU_DES_FRE) : ''}</span>
      </div>
      <span class="badge badge-success">${App.dinero(asiento.PRE_TIP)}</span>`;
    marcarAsientoSeleccionado();
    actualizarBotonEmitir();
  }

  function renderPasajero() {
    if (!pasajero) {
      pasajeroSeleccionado.innerHTML = '';
      return;
    }
    const iniciales = `${(pasajero.NOM_USU || '?').charAt(0)}${(pasajero.APE_USU || '').charAt(0)}`.toUpperCase();
    pasajeroSeleccionado.innerHTML = `
      <div class="passenger-card">
        <div class="passenger-avatar" aria-hidden="true">${App.escapar(iniciales)}</div>
        <div style="flex:1;min-width:0;">
          <strong>${App.escapar(`${pasajero.NOM_USU || ''} ${pasajero.APE_USU || ''}`.trim())}</strong>
          <span>Cédula ${App.escapar(pasajero.COR_USU || pasajero.ID_USU || '—')}${pasajero.TEL_USU ? ` · ${App.escapar(pasajero.TEL_USU)}` : ''}</span>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" id="btnQuitarPasajero">Quitar</button>
      </div>`;
    document.getElementById('btnQuitarPasajero')?.addEventListener('click', quitarPasajero);
  }

  function quitarPasajero() {
    pasajero = null;
    resultadosPasajero.innerHTML = '';
    formRegistro.classList.add('hidden');
    renderPasajero();
    actualizarBotonEmitir();
  }

  function seleccionarPasajero(datosPasajero) {
    pasajero = datosPasajero;
    resultadosPasajero.innerHTML = '';
    formRegistro.classList.add('hidden');
    renderPasajero();
    actualizarBotonEmitir();
  }

  async function buscarPasajero() {
    const cedula = cedulaPasajero.value.replace(/\D/g, '');
    if (!cedula) {
      pasajero = null;
      resultadosPasajero.innerHTML = '';
      formRegistro.classList.add('hidden');
      renderPasajero();
      actualizarBotonEmitir();
      return;
    }
    if (cedula.length < 6) {
      App.aviso('Ingresa una cédula válida (mínimo 6 dígitos).', 'error');
      return;
    }

    App.textoBoton(btnBuscarPasajero, 'Buscando…');
    try {
      const datos = await App.api('/oficinista/pasajeros', { query: { q: cedula } });
      const lista = datos.pasajeros || [];

      if (lista.length === 0) {
        pasajero = null;
        renderPasajero();
        formRegistro.classList.remove('hidden');
        resultadosPasajero.innerHTML = `<div class="notice warning"><span aria-hidden="true">!</span><span>No existe un pasajero registrado con la cédula ${App.escapar(cedula)}.</span></div>`;
      } else if (lista.length === 1) {
        seleccionarPasajero(lista[0]);
        limpiarAviso();
      } else {
        pasajero = null;
        renderPasajero();
        formRegistro.classList.add('hidden');
        resultadosPasajero.innerHTML = `
          <p class="help">Se encontraron ${lista.length} coincidencias. Selecciona al pasajero correcto:</p>
          ${lista.map((item) => `
            <button class="btn btn-secondary btn-block" type="button"
              data-seleccionar-pasajero="${App.escapar(item.ID_USU)}"
              data-nombre="${App.escapar(item.NOM_USU || '')}"
              data-apellido="${App.escapar(item.APE_USU || '')}"
              data-cedula="${App.escapar(item.COR_USU || item.ID_USU || '')}"
              data-telefono="${App.escapar(item.TEL_USU || '')}">
              ${App.escapar(`${item.NOM_USU} ${item.APE_USU}`)} · ${App.escapar(item.COR_USU || item.ID_USU)}
            </button>`).join('')}`;
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnBuscarPasajero);
      actualizarBotonEmitir();
    }
  }

  async function registrarPasajero() {
    const cedula = cedulaPasajero.value.replace(/\D/g, '');
    const nombre = nombrePasajero.value.trim();
    const apellido = apellidoPasajero.value.trim();
    const telefono = telefonoPasajero.value.replace(/\D/g, '');
    const correo = correoPasajero.value.trim();

    if (!/^\d{6,10}$/.test(cedula)) {
      App.aviso('La cédula debe tener entre 6 y 10 dígitos.', 'error');
      return;
    }
    if (!nombre || !apellido) {
      App.aviso('Nombres y apellidos son obligatorios.', 'error');
      return;
    }
    if (!/^\d{7,10}$/.test(telefono)) {
      App.aviso('El teléfono debe tener entre 7 y 10 dígitos.', 'error');
      return;
    }

    App.textoBoton(btnRegistrarPasajero, 'Registrando…');
    try {
      const datos = await App.api('/oficinista/pasajeros', {
        method: 'POST',
        body: {
          CEDULA: cedula,
          NOMBRE: nombre,
          APELLIDO: apellido,
          TELEFONO: telefono,
          CORREO: correo,
          ID_COP_PER: cooperativa
        }
      });
      seleccionarPasajero(datos.pasajero);
      formRegistro.classList.add('hidden');
      App.aviso(datos.message || 'Pasajero registrado correctamente.', 'success');
      if (datos.passwordTemporal) {
        App.aviso(`Contraseña temporal del pasajero: ${datos.passwordTemporal}`, 'info');
      }
      nombrePasajero.value = '';
      apellidoPasajero.value = '';
      telefonoPasajero.value = '';
      correoPasajero.value = '';
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnRegistrarPasajero);
      actualizarBotonEmitir();
    }
  }

  function actualizarBotonEmitir() {
    const cedula = cedulaPasajero.value.replace(/\D/g, '');
    const precio = Number(precioBoleto.value);
    const listo = Boolean(hojaSeleccionada)
      && Boolean(asientoSeleccionado)
      && Number.isFinite(precio) && precio > 0
      && Boolean(metodoPago.value)
      && (!cedula || Boolean(pasajero));
    btnEmitir.disabled = !listo;
  }

  function renderTicket(boleto) {
    const asiento = boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || boleto.ID_ASI_PER || '—';
    const pasajeroNombre = boleto.PASAJERO || 'Pasajero sin registro';
    const cedula = boleto.CEDULA_PASAJERO || '—';
    const bus = boleto.HOJA?.BUS || {};
    const frecuencia = boleto.HOJA?.FRECUENCIA || {};

    ticketContenido.innerHTML = `
      <article class="ticket">
        <header class="ticket-head">
          <div>
            <strong>Transporte UTA</strong>
            <span>Boleto de viaje</span>
          </div>
          <div class="text-right">
            <strong>${App.dinero(boleto.PRE_FIN_BOL)}</strong>
            <span>${App.escapar(boleto.MET_PAG_BOL || '')}</span>
          </div>
        </header>
        <div class="ticket-body">
          <div class="ticket-route">
            <div>
              <span>Origen</span>
              <strong>${App.escapar(boleto.ORI_TRA_BOL || frecuencia.CIU_ORI_FRE || '—')}</strong>
            </div>
            <span class="arrow" aria-hidden="true">→</span>
            <div class="text-right">
              <span>Destino</span>
              <strong>${App.escapar(boleto.DES_TRA_BOL || frecuencia.CIU_DES_FRE || '—')}</strong>
            </div>
          </div>
          <div class="ticket-grid">
            <div><span>Boleto</span><strong class="mono">${App.escapar(boleto.ID_BOL)}</strong></div>
            <div><span>Asiento</span><strong>${App.escapar(asiento)}</strong></div>
            <div><span>Pasajero</span><strong>${App.escapar(pasajeroNombre)}</strong></div>
            <div><span>Cédula</span><strong>${App.escapar(cedula)}</strong></div>
            <div><span>Bus / Placa</span><strong>${App.escapar(`${bus.NUM_BUS || '—'} · ${bus.PLA_BUS || '—'}`)}</strong></div>
            <div><span>Fecha de compra</span><strong>${App.fecha(boleto.FEC_COM_BOL)}</strong></div>
            <div><span>Hoja de ruta</span><strong class="mono">${App.escapar(boleto.ID_HOJ_PER || '—')}</strong></div>
            <div><span>Estado</span><strong>${App.escapar(boleto.EST_BOL || 'EMITIDO')}</strong></div>
          </div>
        </div>
        <div class="ticket-qr">
          ${App.patronQR(boleto.COD_QR_BOL)}
          <div class="ticket-qr-text">
            <span>Código QR de validación</span>
            <code>${App.escapar(boleto.COD_QR_BOL)}</code>
          </div>
        </div>
      </article>`;
  }

  async function emitirBoleto() {
    if (!hojaSeleccionada || !asientoSeleccionado) {
      App.aviso('Selecciona una hoja de ruta y un asiento disponible.', 'error');
      return;
    }

    const cedula = cedulaPasajero.value.replace(/\D/g, '');
    if (cedula && !pasajero) {
      App.aviso('Verifica o registra al pasajero antes de emitir el boleto.', 'error');
      return;
    }

    const precio = Number(precioBoleto.value);
    if (!Number.isFinite(precio) || precio <= 0) {
      App.aviso('Ingresa un precio válido para el boleto.', 'error');
      return;
    }
    if (!metodoPago.value) {
      App.aviso('Selecciona el método de pago.', 'error');
      return;
    }

    App.textoBoton(btnEmitir, 'Emitiendo…');
    try {
      const datos = await App.api('/oficinista/boletos/ventanilla', {
        method: 'POST',
        body: {
          ID_HOJ_PER: hojaSeleccionada.ID_HOJ,
          ID_ASI_PER: asientoSeleccionado.ID_ASI,
          ID_USU_OFI: usuario.id,
          ID_USU_FIN: pasajero?.ID_USU || undefined,
          PRE_FIN_BOL: precio,
          MET_PAG_BOL: metodoPago.value,
          TIP_DES_BOL: asientoSeleccionado.NOM_TIP || 'NORMAL',
          ORI_TRA_BOL: hojaSeleccionada.CIU_ORI_FRE,
          DES_TRA_BOL: hojaSeleccionada.CIU_DES_FRE
        }
      });

      renderTicket(datos.boleto);
      App.abrirModal('modalBoleto');
      App.aviso('Boleto emitido correctamente.', 'success');

      limpiarSeleccionAsiento();
      quitarPasajero();
      cedulaPasajero.value = '';
      await Promise.all([cargarHojas(), cargarResumen()]);
      if (hojaSeleccionada) await cargarAsientos(hojaSeleccionada);
    } catch (error) {
      App.aviso(error.message, 'error');
      if (error.status === 409) {
        await Promise.all([cargarHojas(), cargarResumen()]);
        if (hojaSeleccionada) await cargarAsientos(hojaSeleccionada);
      }
    } finally {
      App.restaurarBoton(btnEmitir);
      actualizarBotonEmitir();
    }
  }

  async function recargarTodo() {
    limpiarAviso();
    App.textoBoton(btnRecargar, 'Actualizando…');
    try {
      await Promise.all([cargarHojas(), cargarResumen()]);
      if (hojaSeleccionada) await cargarAsientos(hojaSeleccionada);
    } finally {
      App.restaurarBoton(btnRecargar);
    }
  }

  tablaHojas.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-hoja]');
    if (boton) seleccionarHoja(boton.dataset.hoja);
  });

  mapaAsientos.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-asiento-venta]');
    if (boton) seleccionarAsiento(boton.dataset.asientoVenta);
  });

  resultadosPasajero.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-seleccionar-pasajero]');
    if (!boton) return;
    const datos = boton.dataset;
    seleccionarPasajero({
      ID_USU: datos.seleccionarPasajero,
      NOM_USU: datos.nombre,
      APE_USU: datos.apellido,
      COR_USU: datos.cedula,
      TEL_USU: datos.telefono
    });
  });

  btnBuscarPasajero.addEventListener('click', buscarPasajero);
  cedulaPasajero.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      buscarPasajero();
    }
  });
  cedulaPasajero.addEventListener('input', () => {
    if (pasajero && cedulaPasajero.value.replace(/\D/g, '') !== String(pasajero.COR_USU || pasajero.ID_USU || '')) {
      pasajero = null;
      renderPasajero();
    }
    actualizarBotonEmitir();
  });
  btnRegistrarPasajero.addEventListener('click', registrarPasajero);
  precioBoleto.addEventListener('input', actualizarBotonEmitir);
  metodoPago.addEventListener('change', actualizarBotonEmitir);
  btnEmitir.addEventListener('click', emitirBoleto);
  btnRecargar.addEventListener('click', recargarTodo);
  fechaInput.addEventListener('change', () => {
    hojaSeleccionada = null;
    panelAsientos.hidden = true;
    limpiarSeleccionAsiento();
    recargarTodo();
  });
  btnImprimir.addEventListener('click', () => window.print());

  fechaInput.value = App.hoyISO();
  marcadorInicial();
  recargarTodo();

  function marcadorInicial() {
    tablaHojas.innerHTML = `<tr class="loading-row"><td colspan="6"><span class="spinner"></span>Cargando hojas de ruta…</td></tr>`;
  }
})();
