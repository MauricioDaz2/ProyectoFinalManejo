(() => {
  'use strict';

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
  let streamCamara = null;
  let detector = null;
  let temporizadorEscaneo = null;

  function mostrarAviso(mensaje, tipo = 'danger') {
    avisoValidacion.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoValidacion.innerHTML = '';
  }

  /* ------------------------------- Recientes ------------------------------- */

  function leerRecientes() {
    try {
      const datos = JSON.parse(localStorage.getItem(claveRecientes) || '[]');
      return Array.isArray(datos) ? datos : [];
    } catch (error) {
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
          <strong>${App.escapar(item.PASAJERO || 'Pasajero sin registro')}</strong>
          <span>Boleto ${App.escapar(item.ID_BOL)} · Asiento ${App.escapar(item.ASIENTO || '—')} · ${App.escapar(item.RUTA || '')}</span>
        </div>
        <span class="muted nowrap">${App.fechaHora(item.validadoEn)}</span>
      </div>`).join('');
  }

  function agregarReciente(boleto) {
    const lista = leerRecientes();
    const item = {
      ID_BOL: boleto.ID_BOL,
      PASAJERO: boleto.PASAJERO,
      ASIENTO: boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO,
      RUTA: `${boleto.ORI_TRA_BOL || ''} → ${boleto.DES_TRA_BOL || ''}`,
      validadoEn: new Date().toISOString()
    };
    guardarRecientes([item, ...lista.filter((elemento) => elemento.ID_BOL !== item.ID_BOL)]);
    renderRecientes();
  }

  /* -------------------------------- Resultado ------------------------------- */

  function detalleBoleto(boleto) {
    return `
      <div class="detail-grid">
        <div><span>Boleto</span><strong class="mono">${App.escapar(boleto.ID_BOL)}</strong></div>
        <div><span>Estado</span><strong>${App.insignia(boleto.EST_BOL)}</strong></div>
        <div><span>Pasajero</span><strong>${App.escapar(boleto.PASAJERO || 'Sin registro')}</strong></div>
        <div><span>Cédula</span><strong>${App.escapar(boleto.CEDULA_PASAJERO || '—')}</strong></div>
        <div><span>Ruta</span><strong>${App.escapar(`${boleto.ORI_TRA_BOL || '—'} → ${boleto.DES_TRA_BOL || '—'}`)}</strong></div>
        <div><span>Asiento</span><strong>${App.escapar(boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—')}</strong></div>
        <div><span>Bus / Placa</span><strong>${App.escapar(`${boleto.HOJA?.BUS?.NUM_BUS || '—'} · ${boleto.HOJA?.BUS?.PLA_BUS || '—'}`)}</strong></div>
        <div><span>Hoja de ruta</span><strong class="mono">${App.escapar(boleto.ID_HOJ_PER || '—')}</strong></div>
        <div><span>Compra</span><strong>${App.fecha(boleto.FEC_COM_BOL)}</strong></div>
        <div><span>Uso</span><strong>${boleto.FEC_USO_BOL ? App.fecha(boleto.FEC_USO_BOL) : 'Pendiente'}</strong></div>
        <div><span>Valor</span><strong>${App.dinero(boleto.PRE_FIN_BOL)}</strong></div>
        <div><span>Pago</span><strong>${App.escapar(boleto.MET_PAG_BOL || '—')}</strong></div>
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

      if (codigoError === 'MULTIPLES_BOLETOS') {
        const acciones = (error.datos.boletos || []).map((boleto) => `
          <button class="btn btn-secondary btn-sm" type="button" data-validar-candidato="${App.escapar(boleto.COD_QR_BOL || boleto.ID_BOL)}">
            Validar ${App.escapar(boleto.ID_BOL)} (${App.escapar(boleto.EST_BOL)})
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
    const estado = String(boleto.EST_BOL || '');
    if (['RESERVADO', 'EMITIDO', 'PAGADO'].includes(estado)) {
      const validar = `<button class="btn btn-success btn-sm" type="button" data-validar-codigo="${App.escapar(boleto.COD_QR_BOL || boleto.ID_BOL)}">Validar</button>`;
      const pagar = estado !== 'PAGADO'
        ? `<button class="btn btn-secondary btn-sm" type="button" data-pagar="${App.escapar(boleto.ID_BOL)}">Marcar pagado</button>`
        : '';
      const anular = `<button class="btn btn-danger-soft btn-sm" type="button" data-anular="${App.escapar(boleto.ID_BOL)}">Anular</button>`;
      return `${validar}${pagar}${anular}`;
    }
    return '<span class="muted">Sin acciones</span>';
  }

  function filaBoleto(boleto) {
    const comprobante = boleto.COM_PAG_URL
      ? `<a href="http://127.0.0.1:3001${App.escapar(boleto.COM_PAG_URL)}" target="_blank" rel="noopener">Ver comprobante</a>`
      : 'Sin comprobante';
    return `
      <tr>
        <td>
          <div class="cell-main">
            <strong class="mono">${App.escapar(boleto.ID_BOL)}</strong>
            <span class="mono">${App.escapar((boleto.COD_QR_BOL || '').slice(0, 22))}…</span>
          </div>
        </td>
        <td>
          <div class="cell-main">
            <strong>${App.escapar(boleto.PASAJERO || 'Sin registro')}</strong>
            <span>${App.escapar(boleto.CEDULA_PASAJERO || '—')}</span>
          </div>
        </td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(boleto.ORI_TRA_BOL)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(boleto.DES_TRA_BOL)}</span>
          </div>
        </td>
        <td>
          <div class="cell-main">
            <strong>${App.escapar(boleto.ASIENTO?.ETIQUETA || boleto.ETIQUETA_ASIENTO || '—')}</strong>
            <span>${App.escapar(boleto.ASIENTO?.TIPO || '—')}</span>
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
      : `<tr><td colspan="7"><div class="empty-state">
          <div class="empty-icon">⌕</div>
          <h3>Sin resultados</h3>
          <p>No se encontraron boletos con el código o la cédula ingresada.</p>
        </div></td></tr>`;
  }

  async function buscarBoletos() {
    const valor = busquedaBoletos.value.trim();
    if (!valor) {
      boletos = [];
      renderBoletos();
      App.aviso('Ingresa un código QR, código de boleto o cédula.', 'warning');
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
        mensaje: `El boleto ${id} quedará anulado y el asiento volverá a estar disponible. ¿Continuar?`,
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
      await buscarBoletos();
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
    } catch (error) {
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
    } catch (error) {
      detenerCamara();
      App.cerrarModal('modalCamara');
      App.aviso('No se pudo iniciar la cámara. Verifica los permisos del navegador.', 'error');
    }
  }

  /* -------------------------------- Eventos -------------------------------- */

  formValidacion.addEventListener('submit', (evento) => {
    evento.preventDefault();
    validarCodigo(codigoValidacion.value);
  });

  resultadoValidacion.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-validar-candidato]');
    if (!boton) return;
    const codigo = boton.dataset.validarCandidato;
    codigoValidacion.value = codigo;
    validarCodigo(codigo);
  });

  tablaBoletos.addEventListener('click', (evento) => {
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
  codigoValidacion.focus();
})();
