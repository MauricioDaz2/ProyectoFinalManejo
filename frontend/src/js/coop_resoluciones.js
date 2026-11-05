(() => {
  'use strict';

  const usuario = App.sesion();
  if (!usuario) return;

  const cooperativa = usuario.cooperativaId;

  const tablaResoluciones = document.getElementById('tablaResoluciones');
  const tablaFrecuencias = document.getElementById('tablaFrecuencias');
  const statsResoluciones = document.getElementById('statsResoluciones');
  const contadorResoluciones = document.getElementById('contadorResoluciones');
  const contadorFrecuencias = document.getElementById('contadorFrecuencias');
  const avisoGlobal = document.getElementById('avisoGlobal');

  const btnRecargar = document.getElementById('btnRecargar');
  const btnNuevaResolucion = document.getElementById('btnNuevaResolucion');
  const btnNuevaFrecuencia = document.getElementById('btnNuevaFrecuencia');

  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const panelResoluciones = document.getElementById('panelResoluciones');
  const panelFrecuencias = document.getElementById('panelFrecuencias');

  const formResolucion = document.getElementById('formResolucion');
  const modalResolucion = document.getElementById('modalResolucion');
  const tituloModalResolucion = document.getElementById('tituloModalResolucion');
  const codigoResolucion = document.getElementById('codigoResolucion');
  const fechaResolucion = document.getElementById('fechaResolucion');
  const cupoResolucion = document.getElementById('cupoResolucion');
  const documentoResolucion = document.getElementById('documentoResolucion');
  const btnGuardarResolucion = document.getElementById('btnGuardarResolucion');

  const formFrecuencia = document.getElementById('formFrecuencia');
  const modalFrecuencia = document.getElementById('modalFrecuencia');
  const tituloModalFrecuencia = document.getElementById('tituloModalFrecuencia');
  const codigoFrecuencia = document.getElementById('codigoFrecuencia');
  const resolucionFrecuencia = document.getElementById('resolucionFrecuencia');
  const origenFrecuencia = document.getElementById('origenFrecuencia');
  const destinoFrecuencia = document.getElementById('destinoFrecuencia');
  const inicioFrecuencia = document.getElementById('inicioFrecuencia');
  const finFrecuencia = document.getElementById('finFrecuencia');
  const estadoFrecuencia = document.getElementById('estadoFrecuencia');
  const btnGuardarFrecuencia = document.getElementById('btnGuardarFrecuencia');

  const filtroOrigen = document.getElementById('filtroOrigen');
  const filtroDestino = document.getElementById('filtroDestino');
  const filtroEstadoFrecuencia = document.getElementById('filtroEstadoFrecuencia');

  let resoluciones = [];
  let frecuencias = [];
  let resolucionEnEdicion = null;
  let frecuenciaEnEdicion = null;
  let tabActiva = 'resoluciones';

  function aviso(mensaje, tipo = 'warning') {
    avisoGlobal.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoGlobal.innerHTML = '';
  }

  function activarTab(nombre) {
    tabActiva = nombre;
    tabs.forEach((tab) => {
      const activo = tab.dataset.tab === nombre;
      tab.classList.toggle('active', activo);
      tab.setAttribute('aria-selected', String(activo));
    });
    panelResoluciones.hidden = nombre !== 'resoluciones';
    panelFrecuencias.hidden = nombre !== 'frecuencias';
    btnNuevaResolucion.classList.toggle('hidden', nombre !== 'resoluciones');
    btnNuevaFrecuencia.classList.toggle('hidden', nombre !== 'frecuencias');

    const url = new URL(window.location.href);
    if (nombre === 'frecuencias') {
      url.hash = 'frecuencias';
    } else {
      url.hash = '';
    }
    window.history.replaceState({}, '', url);
  }

  function tarjeta(etiqueta, valor, icono, pista) {
    return `
      <article class="stat-card">
        <div class="stat-icon" aria-hidden="true">${icono}</div>
        <div class="stat-copy">
          <div class="stat-label">${App.escapar(etiqueta)}</div>
          <div class="stat-value">${App.escapar(valor)}</div>
          ${pista ? `<div class="stat-hint">${App.escapar(pista)}</div>` : ''}
        </div>
      </article>`;
  }

  function renderStats() {
    const cupoTotal = resoluciones.reduce((suma, resolucion) => suma + (Number(resolucion.CUP_FRE_MAX) || 0), 0);
    const usadas = resoluciones.reduce((suma, resolucion) => suma + (Number(resolucion.TOTAL_FRECUENCIAS) || 0), 0);
    const disponibles = resoluciones.reduce((suma, resolucion) => {
      const cupo = Number(resolucion.CUP_FRE_MAX) || 0;
      const total = Number(resolucion.TOTAL_FRECUENCIAS) || 0;
      return suma + Math.max(0, cupo - total);
    }, 0);

    statsResoluciones.innerHTML = [
      tarjeta('Resoluciones', App.numero(resoluciones.length), '▧', 'Registradas en la cooperativa'),
      tarjeta('Cupo autorizado', App.numero(cupoTotal), 'Σ', 'Frecuencias permitidas por la ANT'),
      tarjeta('Frecuencias asignadas', App.numero(usadas), '⇄', `${App.numero(frecuencias.length)} frecuencias registradas`),
      tarjeta('Cupo disponible', App.numero(disponibles), '✓', 'Para nuevas frecuencias')
    ].join('');
  }

  function enlaceDocumento(url) {
    if (!url) return '<span class="muted">Sin documento</span>';
    const seguro = /^https?:\/\//i.test(url);
    if (!seguro) return `<span class="muted">${App.escapar(url)}</span>`;
    return `<a href="${App.escapar(url)}" target="_blank" rel="noopener noreferrer">Ver documento</a>`;
  }

  function filaResolucion(resolucion) {
    const cupo = Number(resolucion.CUP_FRE_MAX) || 0;
    const usadas = Number(resolucion.TOTAL_FRECUENCIAS) || 0;
    const activas = Number(resolucion.FRECUENCIAS_ACTIVAS) || 0;
    const porcentaje = cupo > 0 ? Math.round((usadas / cupo) * 100) : 0;
    const clase = porcentaje >= 100 ? 'danger' : porcentaje >= 80 ? 'warn' : '';

    return `
      <tr>
        <td class="mono strong">${App.escapar(resolucion.ID_RES)}</td>
        <td>${App.fecha(resolucion.FEC_EMI_RES)}</td>
        <td>${App.numero(cupo)}</td>
        <td>
          <div class="cell-main" style="min-width:120px;">
            <span>${usadas} usadas · ${activas} activas</span>
            <div class="progress ${clase}"><span style="width:${Math.min(porcentaje, 100)}%"></span></div>
          </div>
        </td>
        <td>${enlaceDocumento(resolucion.DOC_URL_RES)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" data-accion-resolucion="editar" data-id="${App.escapar(resolucion.ID_RES)}">Editar</button>
            <button class="btn btn-danger-soft btn-sm" type="button" data-accion-resolucion="eliminar" data-id="${App.escapar(resolucion.ID_RES)}">Eliminar</button>
          </div>
        </td>
      </tr>`;
  }

  function renderResoluciones() {
    contadorResoluciones.textContent = `${App.numero(resoluciones.length)} resolución${resoluciones.length === 1 ? '' : 'es'}`;
    tablaResoluciones.innerHTML = resoluciones.length > 0
      ? resoluciones.map(filaResolucion).join('')
      : `<tr><td colspan="6"><div class="empty-state">
          <div class="empty-icon">▧</div>
          <h3>Sin resoluciones registradas</h3>
          <p>Registra la resolución emitida por la ANT para habilitar la creación de frecuencias.</p>
          <button class="btn btn-primary mt-2" type="button" data-accion-resolucion="nueva">Registrar resolución</button>
        </div></td></tr>`;
    renderStats();
  }

  function etiquetaVigencia(frecuencia) {
    const inicio = App.fecha(frecuencia.FEC_HOR_INI_FRE);
    if (!frecuencia.FEC_HOR_FIN_FRE) return `${inicio} · Indefinida`;
    return `${inicio} → ${App.fecha(frecuencia.FEC_HOR_FIN_FRE)}`;
  }

  function filaFrecuencia(frecuencia) {
    const activa = String(frecuencia.EST_RES) === '1';
    return `
      <tr>
        <td class="mono strong">${App.escapar(frecuencia.ID_FRE)}</td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(frecuencia.CIU_ORI_FRE)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(frecuencia.CIU_DES_FRE)}</span>
          </div>
        </td>
        <td class="nowrap">${etiquetaVigencia(frecuencia)}</td>
        <td>${App.numero(frecuencia.DIAS_VIGENCIA)}</td>
        <td>${App.numero(frecuencia.TOTAL_HOJAS)}</td>
        <td class="mono">${App.escapar(frecuencia.ID_RES_PER)}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-estado-frecuencia="${App.escapar(frecuencia.ID_FRE)}" ${activa ? 'checked' : ''} aria-label="Cambiar estado de la frecuencia ${App.escapar(frecuencia.ID_FRE)}">
            <span>${activa ? 'Activa' : 'Inactiva'}</span>
          </label>
        </td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" data-accion-frecuencia="editar" data-id="${App.escapar(frecuencia.ID_FRE)}">Editar</button>
            <button class="btn btn-danger-soft btn-sm" type="button" data-accion-frecuencia="eliminar" data-id="${App.escapar(frecuencia.ID_FRE)}">Eliminar</button>
          </div>
        </td>
      </tr>`;
  }

  function frecuenciasFiltradas() {
    const origen = filtroOrigen.value.trim().toUpperCase();
    const destino = filtroDestino.value.trim().toUpperCase();
    const estado = filtroEstadoFrecuencia.value;

    return frecuencias.filter((frecuencia) => {
      if (origen && !String(frecuencia.CIU_ORI_FRE || '').toUpperCase().includes(origen)) return false;
      if (destino && !String(frecuencia.CIU_DES_FRE || '').toUpperCase().includes(destino)) return false;
      if (estado && String(frecuencia.EST_RES) !== estado) return false;
      return true;
    });
  }

  function renderFrecuencias() {
    const lista = frecuenciasFiltradas();
    contadorFrecuencias.textContent = `${App.numero(lista.length)} de ${App.numero(frecuencias.length)} frecuencias`;
    tablaFrecuencias.innerHTML = lista.length > 0
      ? lista.map(filaFrecuencia).join('')
      : `<tr><td colspan="8"><div class="empty-state">
          <div class="empty-icon">⇄</div>
          <h3>No hay frecuencias para mostrar</h3>
          <p>Crea una frecuencia asociada a una resolución ANT o ajusta los filtros aplicados.</p>
          <button class="btn btn-primary mt-2" type="button" data-accion-frecuencia="nueva">Crear frecuencia</button>
        </div></td></tr>`;
  }

  async function cargarResoluciones() {
    if (!cooperativa) {
      aviso('Tu usuario no tiene una cooperativa asignada.', 'danger');
      tablaResoluciones.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>No se pueden consultar las resoluciones.</p></div></td></tr>`;
      return;
    }

    try {
      const datos = await App.api('/coop/resoluciones', { query: { cooperativa } });
      resoluciones = datos.resoluciones || [];
      renderResoluciones();
      actualizarSelectResoluciones();
    } catch (error) {
      App.aviso(error.message, 'error');
      tablaResoluciones.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las resoluciones</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cargarFrecuencias() {
    if (!cooperativa) return;
    try {
      const datos = await App.api('/coop/frecuencias', { query: { cooperativa } });
      frecuencias = datos.frecuencias || [];
      renderFrecuencias();
    } catch (error) {
      App.aviso(error.message, 'error');
      tablaFrecuencias.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las frecuencias</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cargarTodo() {
    App.textoBoton(btnRecargar, 'Actualizando…');
    limpiarAviso();
    await Promise.all([cargarResoluciones(), cargarFrecuencias()]);
    App.restaurarBoton(btnRecargar);
  }

  function actualizarSelectResoluciones(seleccionada) {
    if (resoluciones.length === 0) {
      resolucionFrecuencia.innerHTML = '<option value="">Sin resoluciones registradas</option>';
      return;
    }
    resolucionFrecuencia.innerHTML = resoluciones.map((resolucion) => {
      const cupo = Number(resolucion.CUP_FRE_MAX) || 0;
      const usadas = Number(resolucion.TOTAL_FRECUENCIAS) || 0;
      const disponibles = Math.max(0, cupo - usadas);
      return `<option value="${App.escapar(resolucion.ID_RES)}" ${seleccionada === resolucion.ID_RES ? 'selected' : ''}>
        ${App.escapar(resolucion.ID_RES)} · ${App.fecha(resolucion.FEC_EMI_RES)} · ${disponibles} cupos libres
      </option>`;
    }).join('');
  }

  function abrirNuevaResolucion() {
    resolucionEnEdicion = null;
    formResolucion.reset();
    codigoResolucion.disabled = false;
    codigoResolucion.value = '';
    fechaResolucion.value = App.hoyISO();
    cupoResolucion.value = 10;
    documentoResolucion.value = '';
    tituloModalResolucion.textContent = 'Nueva resolución ANT';
    App.abrirModal('modalResolucion');
  }

  function abrirEditarResolucion(id) {
    const resolucion = resoluciones.find((elemento) => elemento.ID_RES === id);
    if (!resolucion) return;
    resolucionEnEdicion = resolucion;
    formResolucion.reset();
    codigoResolucion.disabled = true;
    codigoResolucion.value = resolucion.ID_RES || '';
    fechaResolucion.value = App.fechaInput(resolucion.FEC_EMI_RES);
    cupoResolucion.value = Number(resolucion.CUP_FRE_MAX) || 1;
    documentoResolucion.value = resolucion.DOC_URL_RES || '';
    tituloModalResolucion.textContent = `Editar resolución ${resolucion.ID_RES}`;
    App.abrirModal('modalResolucion');
  }

  async function guardarResolucion(evento) {
    evento.preventDefault();
    if (!cooperativa) return;

    const fecha = fechaResolucion.value;
    const cupo = Number(cupoResolucion.value);
    if (!fecha) {
      App.aviso('La fecha de emisión es obligatoria.', 'error');
      return;
    }
    if (!Number.isInteger(cupo) || cupo < 1 || cupo > 999) {
      App.aviso('El cupo debe estar entre 1 y 999 frecuencias.', 'error');
      return;
    }

    const cuerpo = {
      FEC_EMI_RES: fecha,
      CUP_FRE_MAX: cupo,
      DOC_URL_RES: documentoResolucion.value.trim(),
      ID_COP_PER: cooperativa
    };

    if (!resolucionEnEdicion) {
      const codigo = codigoResolucion.value.trim().toUpperCase();
      if (codigo) cuerpo.ID_RES = codigo;
    }

    App.textoBoton(btnGuardarResolucion, 'Guardando…');
    try {
      if (resolucionEnEdicion) {
        await App.api(`/coop/resoluciones/${encodeURIComponent(resolucionEnEdicion.ID_RES)}`, { method: 'PUT', body: cuerpo });
        App.aviso('Resolución actualizada correctamente.', 'success');
      } else {
        const datos = await App.api('/coop/resoluciones', { method: 'POST', body: cuerpo });
        App.aviso(datos.message || 'Resolución registrada correctamente.', 'success');
      }
      App.cerrarModal('modalResolucion');
      await cargarResoluciones();
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnGuardarResolucion);
    }
  }

  async function eliminarResolucion(id) {
    const resolucion = resoluciones.find((elemento) => elemento.ID_RES === id);
    if (!resolucion) return;
    const confirmado = await App.confirmar({
      titulo: 'Eliminar resolución',
      mensaje: `Se eliminará la resolución ${id}. Solo es posible si no tiene frecuencias asociadas. ¿Continuar?`,
      aceptar: 'Eliminar',
      peligro: true
    });
    if (!confirmado) return;

    try {
      await App.api(`/coop/resoluciones/${encodeURIComponent(id)}`, { method: 'DELETE' });
      App.aviso('Resolución eliminada correctamente.', 'success');
      await cargarTodo();
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  function abrirNuevaFrecuencia() {
    if (resoluciones.length === 0) {
      App.aviso('Primero registra una resolución ANT para respaldar la frecuencia.', 'error');
      activarTab('resoluciones');
      return;
    }

    frecuenciaEnEdicion = null;
    formFrecuencia.reset();
    codigoFrecuencia.disabled = false;
    codigoFrecuencia.value = '';
    origenFrecuencia.value = '';
    destinoFrecuencia.value = '';
    inicioFrecuencia.value = App.hoyISO();
    finFrecuencia.value = '';
    estadoFrecuencia.value = '1';
    actualizarSelectResoluciones();
    tituloModalFrecuencia.textContent = 'Nueva frecuencia';
    App.abrirModal('modalFrecuencia');
  }

  function abrirEditarFrecuencia(id) {
    const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
    if (!frecuencia) return;
    frecuenciaEnEdicion = frecuencia;
    formFrecuencia.reset();
    codigoFrecuencia.disabled = true;
    codigoFrecuencia.value = frecuencia.ID_FRE || '';
    actualizarSelectResoluciones(frecuencia.ID_RES_PER);
    origenFrecuencia.value = frecuencia.CIU_ORI_FRE || '';
    destinoFrecuencia.value = frecuencia.CIU_DES_FRE || '';
    inicioFrecuencia.value = App.fechaInput(frecuencia.FEC_HOR_INI_FRE);
    finFrecuencia.value = App.fechaInput(frecuencia.FEC_HOR_FIN_FRE);
    estadoFrecuencia.value = String(frecuencia.EST_RES) === '1' ? '1' : '0';
    tituloModalFrecuencia.textContent = `Editar frecuencia ${frecuencia.ID_FRE}`;
    App.abrirModal('modalFrecuencia');
  }

  async function guardarFrecuencia(evento) {
    evento.preventDefault();

    const origen = origenFrecuencia.value.trim().toUpperCase();
    const destino = destinoFrecuencia.value.trim().toUpperCase();
    const inicio = inicioFrecuencia.value;
    const fin = finFrecuencia.value;
    const resolucion = resolucionFrecuencia.value;

    if (!origen || origen.length > 15 || !destino || destino.length > 15) {
      App.aviso('Origen y destino son obligatorios (máximo 15 caracteres).', 'error');
      return;
    }
    if (origen === destino) {
      App.aviso('La ciudad de origen y destino deben ser diferentes.', 'error');
      return;
    }
    if (!inicio) {
      App.aviso('La fecha de inicio de vigencia es obligatoria.', 'error');
      return;
    }
    if (fin && fin < inicio) {
      App.aviso('La fecha de fin no puede ser anterior al inicio.', 'error');
      return;
    }
    if (!resolucion) {
      App.aviso('Debes seleccionar una resolución ANT.', 'error');
      return;
    }

    const cuerpo = {
      CIU_ORI_FRE: origen,
      CIU_DES_FRE: destino,
      FEC_HOR_INI_FRE: inicio,
      FEC_HOR_FIN_FRE: fin || null,
      EST_RES: estadoFrecuencia.value,
      ID_RES_PER: resolucion,
      ID_COP_PER: cooperativa
    };

    if (!frecuenciaEnEdicion) {
      const codigo = codigoFrecuencia.value.trim().toUpperCase();
      if (codigo) cuerpo.ID_FRE = codigo;
    }

    App.textoBoton(btnGuardarFrecuencia, 'Guardando…');
    try {
      if (frecuenciaEnEdicion) {
        await App.api(`/coop/frecuencias/${encodeURIComponent(frecuenciaEnEdicion.ID_FRE)}`, { method: 'PUT', body: cuerpo });
        App.aviso('Frecuencia actualizada correctamente.', 'success');
      } else {
        const datos = await App.api('/coop/frecuencias', { method: 'POST', body: cuerpo });
        App.aviso(datos.message || 'Frecuencia registrada correctamente.', 'success');
      }
      App.cerrarModal('modalFrecuencia');
      await Promise.all([cargarFrecuencias(), cargarResoluciones()]);
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnGuardarFrecuencia);
    }
  }

  async function eliminarFrecuencia(id) {
    const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
    if (!frecuencia) return;
    const confirmado = await App.confirmar({
      titulo: 'Eliminar frecuencia',
      mensaje: `Se eliminará la frecuencia ${id} (${frecuencia.CIU_ORI_FRE} → ${frecuencia.CIU_DES_FRE}). Solo es posible si no tiene hojas de ruta asociadas. ¿Continuar?`,
      aceptar: 'Eliminar',
      peligro: true
    });
    if (!confirmado) return;

    try {
      await App.api(`/coop/frecuencias/${encodeURIComponent(id)}`, { method: 'DELETE' });
      App.aviso('Frecuencia eliminada correctamente.', 'success');
      await Promise.all([cargarFrecuencias(), cargarResoluciones()]);
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  async function cambiarEstadoFrecuencia(id, activa, checkbox) {
    checkbox.disabled = true;
    try {
      await App.api(`/coop/frecuencias/${encodeURIComponent(id)}/estado`, {
        method: 'PATCH',
        body: { EST_RES: activa ? '1' : '0' }
      });
      const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
      if (frecuencia) frecuencia.EST_RES = activa ? '1' : '0';
      renderFrecuencias();
      await cargarResoluciones();
      App.aviso(activa ? 'Frecuencia activada.' : 'Frecuencia desactivada.', 'success');
    } catch (error) {
      App.aviso(error.message, 'error');
      checkbox.checked = !activa;
      checkbox.disabled = false;
    }
  }

  tablaResoluciones.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion-resolucion]');
    if (!boton) return;
    const accion = boton.dataset.accionResolucion;
    if (accion === 'nueva') abrirNuevaResolucion();
    if (accion === 'editar') abrirEditarResolucion(boton.dataset.id);
    if (accion === 'eliminar') eliminarResolucion(boton.dataset.id);
  });

  tablaFrecuencias.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion-frecuencia]');
    if (!boton) return;
    const accion = boton.dataset.accionFrecuencia;
    if (accion === 'nueva') abrirNuevaFrecuencia();
    if (accion === 'editar') abrirEditarFrecuencia(boton.dataset.id);
    if (accion === 'eliminar') eliminarFrecuencia(boton.dataset.id);
  });

  tablaFrecuencias.addEventListener('change', (evento) => {
    const checkbox = evento.target.closest('[data-estado-frecuencia]');
    if (checkbox) cambiarEstadoFrecuencia(checkbox.dataset.estadoFrecuencia, checkbox.checked, checkbox);
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activarTab(tab.dataset.tab));
  });

  filtroOrigen.addEventListener('input', App.debounce(renderFrecuencias, 220));
  filtroDestino.addEventListener('input', App.debounce(renderFrecuencias, 220));
  filtroEstadoFrecuencia.addEventListener('change', renderFrecuencias);

  btnNuevaResolucion.addEventListener('click', abrirNuevaResolucion);
  btnNuevaFrecuencia.addEventListener('click', abrirNuevaFrecuencia);
  btnRecargar.addEventListener('click', cargarTodo);
  formResolucion.addEventListener('submit', guardarResolucion);
  formFrecuencia.addEventListener('submit', guardarFrecuencia);

  if (window.location.hash === '#frecuencias') {
    activarTab('frecuencias');
  } else {
    activarTab('resoluciones');
  }

  cargarTodo();
})();
