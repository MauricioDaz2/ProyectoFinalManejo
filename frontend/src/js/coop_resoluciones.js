(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;

  let usuario = App.sesion();
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
  const inicioResolucion = document.getElementById('inicioResolucion');
  const finResolucion = document.getElementById('finResolucion');
  const resolucionRevocada = document.getElementById('resolucionRevocada');
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
  const configFrecuencia = document.getElementById('configFrecuencia');
  const cupoUnidades = document.getElementById('cupoUnidadesFrecuencia');
  const cupoPasajeros = document.getElementById('cupoPasajerosFrecuencia');
  const categoriaFrecuencia = document.getElementById('categoriaFrecuencia');
  const campoCategoriaFrecuencia = categoriaFrecuencia.closest('.field');
  const estadoCatalogo = document.getElementById('catalogoFrecuenciaEstado');
  const niveles = [['Provincia','ID_PRO','NOM_PRO'], ['Canton','ID_CAN','NOM_CAN'],
    ['Parroquia','ID_PAR','NOM_PAR'], ['Punto','ID_PUN','NOM_PUN']];
  const lados = Object.fromEntries(['origen','destino'].map(lado => [
    lado, niveles.map(([campo]) => document.getElementById(lado + campo))
  ]));

  const filtroOrigen = document.getElementById('filtroOrigen');
  const filtroDestino = document.getElementById('filtroDestino');
  const filtroEstadoFrecuencia = document.getElementById('filtroEstadoFrecuencia');

  let resoluciones = [];
  let frecuencias = [];
  let resolucionEnEdicion = null;
  let frecuenciaEnEdicion = null;
  let tabActiva = 'resoluciones';
  let controlFrecuencias = false;
  let categoriasOperativas = [];
  let categoriasDisponibles = false;
  let puntos = [];
  let cargaCatalogo;
  let versionModal = 0;
  const permitido = (permiso) => usuario.accesoConfigurado !== true || usuario.principal || usuario.permisos?.includes(permiso);

  function aviso(mensaje, tipo = 'warning') {
    avisoGlobal.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoGlobal.innerHTML = '';
  }

  function activarControl(habilitado) {
    controlFrecuencias = habilitado === true;
    for (const fieldset of [document.getElementById('vigenciaResolucion'), configFrecuencia]) {
      fieldset.hidden = fieldset.disabled = !controlFrecuencias;
    }
    for (const campo of [origenFrecuencia, destinoFrecuencia]) {
      campo.disabled = campo.closest('.field').hidden = controlFrecuencias;
    }
  }

  function renderCascada(lado, punto, desde = 0) {
    const controles = lados[lado];
    let filtrados = puntos;
    niveles.forEach(([_, clave, nombre], i) => {
      const campo = controles[i];
      if (i >= desde) {
        const valor = punto ? String(punto[clave]) : '';
        const opciones = [...new Map(filtrados.map(p => [String(p[clave]), p[nombre]])).entries()];
        campo.replaceChildren(new Option('Selecciona…', ''),
          ...opciones.map(([id, texto]) => new Option(texto, id)));
        campo.disabled = opciones.length === 0;
        campo.value = valor;
      }
      filtrados = filtrados.filter(p => String(p[clave]) === campo.value);
    });
  }

  function mostrarTrayecto() {
    const [a,b] = Object.values(lados).map(controles =>
      puntos.find(p => String(p.ID_PUN) === controles.at(-1).value));
    estadoCatalogo.textContent = a && b
      ? a.ID_PUN === b.ID_PUN ? 'Selecciona dos puntos distintos.'
        : a.ID_PRO !== b.ID_PRO ? 'Trayecto interprovincial.'
        : a.ID_CAN === b.ID_CAN ? 'Trayecto intracantonal.' : 'Trayecto entre cantones de una misma provincia: fuera de alcance.'
      : 'Completa el origen y el destino.';
  }

  for (const lado of Object.keys(lados)) lados[lado].forEach((campo, i) => campo.addEventListener('change', () => {
    renderCascada(lado, null, i + 1);
    mostrarTrayecto();
  }));

  async function prepararCatalogo(frecuencia) {
    const version = ++versionModal;
    if (!controlFrecuencias) return;
    puntos = [];
    for (const lado of Object.keys(lados)) renderCascada(lado);
    estadoCatalogo.textContent = 'Cargando catálogo territorial…';
    try {
      cargaCatalogo ||= App.api('/coop/catalogo-territorial').then(data => data.puntos || []).catch(error => {
        cargaCatalogo = null;
        throw error;
      });
      const lista = await cargaCatalogo;
      if (version !== versionModal) return;
      puntos = lista;
      renderCascada('origen', puntos.find(p => p.ID_PUN === frecuencia?.ID_PUN_ORI));
      renderCascada('destino', puntos.find(p => p.ID_PUN === frecuencia?.ID_PUN_DES));
      if (puntos.length) mostrarTrayecto();
      else estadoCatalogo.textContent = 'No hay puntos cargados. Solicita a Operaciones importar el catálogo.';
    } catch (error) {
      if (version !== versionModal) return;
      estadoCatalogo.textContent = `No se pudo cargar el catálogo. Cierra y vuelve a abrir el formulario para reintentar.`;
    }
  }

  const textoVigencia = estado => ({
    VIGENTE: 'Vigente', PENDIENTE: 'Aún no vigente', VENCIDA: 'Vencida', REVOCADA: 'Revocada',
    INACTIVA: 'Suspendida', SIN_VIGENCIA_ANT: 'Sin vigencia ANT registrada', SIN_VIGENCIA_COMUN: 'Sin vigencia común'
  }[estado] || 'Sin configurar');

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
        <td>${App.fecha(resolucion.FEC_EMI_RES)}
          ${controlFrecuencias ? `<br><small>${textoVigencia(resolucion.EST_VIGENCIA)}
              ${resolucion.FEC_INI_VIG_RES ? ` · ${App.fecha(resolucion.FEC_INI_VIG_RES)} → ${resolucion.FEC_FIN_VIG_RES ? App.fecha(resolucion.FEC_FIN_VIG_RES) : 'Sin caducidad'}` : ''}</small>` : ''}</td>
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
    const uso = (max, used, unidad) => max == null ? '' : `<small>${App.numero(used)} / ${App.numero(max)} ${unidad} hoy</small><br>`;
    const categoria = frecuencia.NOM_CAT || categoriasOperativas.find((elemento) => elemento.ID_CAT === frecuencia.ID_CAT_OP)?.NOM_CAT;
    return `
      <tr>
        <td class="mono strong">${App.escapar(frecuencia.ID_FRE)}</td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(frecuencia.CIU_ORI_FRE)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(frecuencia.CIU_DES_FRE)}</span>
          </div>
          ${controlFrecuencias ? `<small>${frecuencia.TIPO_TRAYECTO === 'INTRACANTONAL' ? 'Intracantonal'
            : frecuencia.TIPO_TRAYECTO === 'INTERPROVINCIAL' ? 'Interprovincial' : 'Trayecto sin configurar'}</small>` : ''}
          ${categoriasDisponibles ? `<small>${categoria ? App.escapar(categoria) : 'Sin categoría operativa'}</small>` : ''}
        </td>
        <td class="nowrap">${etiquetaVigencia(frecuencia)}</td>
        <td>${App.numero(frecuencia.DIAS_VIGENCIA)}</td>
        <td>${App.numero(frecuencia.TOTAL_HOJAS)}
          ${controlFrecuencias ? `<br>${uso(frecuencia.MAX_UNIDADES, frecuencia.UNIDADES_USADAS, 'buses')}
            ${uso(frecuencia.MAX_PASAJEROS, frecuencia.PASAJEROS_USADOS, 'pasajeros')}` : ''}</td>
        <td class="mono">${App.escapar(frecuencia.ID_RES_PER)}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-estado-frecuencia="${App.escapar(frecuencia.ID_FRE)}" ${activa ? 'checked' : ''} aria-label="Cambiar estado de la frecuencia ${App.escapar(frecuencia.ID_FRE)}">
             <span>${activa ? (controlFrecuencias ? 'Habilitada' : 'Activa') : (controlFrecuencias ? 'Suspendida' : 'Inactiva')}</span>
           </label>
           ${controlFrecuencias ? `<br><small>${frecuencia.TIPO_TRAYECTO ? textoVigencia(frecuencia.EST_VIGENCIA) : 'Pendiente de configurar'}</small>` : ''}
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
    if (!permitido('resoluciones') && !permitido('rutas')) return;
    if (!cooperativa) {
      aviso('Tu usuario no tiene una cooperativa asignada.', 'danger');
      tablaResoluciones.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>No se pueden consultar las resoluciones.</p></div></td></tr>`;
      return;
    }

    try {
      const datos = await App.api(permitido('resoluciones') ? '/coop/resoluciones' : '/coop/resoluciones-opciones', { query: { cooperativa } });
      activarControl(datos.controlFrecuencias);
      resoluciones = datos.resoluciones || [];
      if (permitido('resoluciones')) renderResoluciones();
      actualizarSelectResoluciones();
    } catch (error) {
      App.aviso(error.message, 'error');
      tablaResoluciones.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las resoluciones</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cargarFrecuencias() {
    if (!permitido('rutas')) return;
    if (!cooperativa) return;
    try {
      const datos = await App.api('/coop/frecuencias', { query: { cooperativa } });
      activarControl(datos.controlFrecuencias);
      frecuencias = datos.frecuencias || [];
      renderFrecuencias();
    } catch (error) {
      App.aviso(error.message, 'error');
      tablaFrecuencias.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las frecuencias</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cargarCategorias() {
    try {
      const datos = await App.api('/coop/categorias-operativas');
      categoriasOperativas = datos.categorias || [];
      categoriasDisponibles = Array.isArray(datos.categorias);
    } catch (error) {
      categoriasOperativas = [];
      categoriasDisponibles = false;
      if (!['LOTES_NO_HABILITADOS', 'CC01_REQUERIDO'].includes(error.datos?.code)) {
        console.warn('No se pudieron cargar las categorías operativas.', error);
      }
    }
    campoCategoriaFrecuencia.hidden = !categoriasDisponibles;
    categoriaFrecuencia.replaceChildren(new Option('Selecciona…', ''),
      ...categoriasOperativas.map((categoria) => new Option(categoria.NOM_CAT, categoria.ID_CAT)));
  }

  async function cargarTodo() {
    try {
      usuario = (await App.api('/auth/me')).usuario;
      window.CoopAccess?.apply(usuario);
      if (!permitido(tabActiva === 'frecuencias' ? 'rutas' : tabActiva)) activarTab(permitido('rutas') ? 'frecuencias' : 'resoluciones');
    } catch (error) { aviso(error.message, 'danger'); return; }
    App.textoBoton(btnRecargar, 'Actualizando…');
    limpiarAviso();
    await cargarCategorias();
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
       const noConfigurable = controlFrecuencias && (resolucion.REVOCADA_RES || !resolucion.FEC_INI_VIG_RES);
       return `<option value="${App.escapar(resolucion.ID_RES)}" ${seleccionada === resolucion.ID_RES ? 'selected' : ''}
         ${noConfigurable && seleccionada !== resolucion.ID_RES ? 'disabled' : ''}>
         ${App.escapar(resolucion.ID_RES)} · ${controlFrecuencias ? `${textoVigencia(resolucion.EST_VIGENCIA || (resolucion.REVOCADA_RES ? 'REVOCADA' : !resolucion.FEC_INI_VIG_RES ? 'SIN_VIGENCIA_ANT' : ''))} · ` : ''}
         ${App.fecha(resolucion.FEC_EMI_RES)} · ${disponibles} cupos libres
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
    inicioResolucion.value = App.fechaInput(resolucion.FEC_INI_VIG_RES);
    finResolucion.value = App.fechaInput(resolucion.FEC_FIN_VIG_RES);
    resolucionRevocada.checked = Boolean(resolucion.REVOCADA_RES);
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
    if (controlFrecuencias) {
      if (!inicioResolucion.value || (finResolucion.value && finResolucion.value < inicioResolucion.value)) {
        return App.aviso('Indica un inicio válido y un fin igual o posterior.', 'error');
      }
      cuerpo.FEC_INI_VIG_RES = inicioResolucion.value;
      cuerpo.FEC_FIN_VIG_RES = finResolucion.value || null;
      cuerpo.REVOCADA_RES = resolucionRevocada.checked;
    }

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
    categoriaFrecuencia.value = '';
    actualizarSelectResoluciones();
    tituloModalFrecuencia.textContent = 'Nueva frecuencia';
    App.abrirModal('modalFrecuencia');
    prepararCatalogo(null);
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
    cupoUnidades.value = frecuencia.MAX_UNIDADES ?? '';
    cupoPasajeros.value = frecuencia.MAX_PASAJEROS ?? '';
    categoriaFrecuencia.value = frecuencia.ID_CAT_OP || '';
    tituloModalFrecuencia.textContent = `Editar frecuencia ${frecuencia.ID_FRE}`;
    App.abrirModal('modalFrecuencia');
    prepararCatalogo(frecuencia);
  }

  async function guardarFrecuencia(evento) {
    evento.preventDefault();

    const origen = origenFrecuencia.value.trim().toUpperCase();
    const destino = destinoFrecuencia.value.trim().toUpperCase();
    const inicio = inicioFrecuencia.value;
    const fin = finFrecuencia.value;
    const resolucion = resolucionFrecuencia.value;

    if (!controlFrecuencias && (!origen || origen.length > 15 || !destino || destino.length > 15)) {
      App.aviso('Origen y destino son obligatorios (máximo 15 caracteres).', 'error');
      return;
    }
    if (!controlFrecuencias && origen === destino) {
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
    if (controlFrecuencias) {
      const origenId = Number(lados.origen.at(-1).value);
      const destinoId = Number(lados.destino.at(-1).value);
      if (!origenId || !destinoId || origenId === destinoId || (!cupoUnidades.value && !cupoPasajeros.value)) {
        return App.aviso('Selecciona puntos distintos e indica al menos un cupo diario.', 'error');
      }
      delete cuerpo.CIU_ORI_FRE;
      delete cuerpo.CIU_DES_FRE;
      Object.assign(cuerpo, { ID_PUN_ORI: origenId, ID_PUN_DES: destinoId,
        MAX_UNIDADES: cupoUnidades.value || null, MAX_PASAJEROS: cupoPasajeros.value || null });
    }

    if (!frecuenciaEnEdicion) {
      const codigo = codigoFrecuencia.value.trim().toUpperCase();
      if (codigo) cuerpo.ID_FRE = codigo;
    }
    if (categoriasDisponibles && !categoriaFrecuencia.value) {
      App.aviso('Selecciona la categoría operativa de la frecuencia.', 'error');
      return;
    }

    App.textoBoton(btnGuardarFrecuencia, 'Guardando…');
    try {
      let creada;
      if (frecuenciaEnEdicion) {
        await App.api(`/coop/frecuencias/${encodeURIComponent(frecuenciaEnEdicion.ID_FRE)}`, { method: 'PUT', body: cuerpo });
      } else {
        creada = await App.api('/coop/frecuencias', { method: 'POST', body: cuerpo });
      }
      const idFrecuencia = frecuenciaEnEdicion?.ID_FRE || creada?.frecuencia?.ID_FRE;
      if (categoriasDisponibles && idFrecuencia) {
        try {
          await App.api(`/coop/frecuencias/${encodeURIComponent(idFrecuencia)}/categoria`, {
            method: 'PUT',
            body: { categoria: categoriaFrecuencia.value }
          });
        } catch (error) {
          if (creada?.frecuencia) frecuenciaEnEdicion = creada.frecuencia;
          App.aviso(`La frecuencia se guardó, pero no se asignó la categoría: ${error.message}`, 'error');
          return;
        }
      }
      App.aviso(frecuenciaEnEdicion ? 'Frecuencia actualizada correctamente.' : (creada?.message || 'Frecuencia registrada correctamente.'), 'success');
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
      await Promise.all([cargarFrecuencias(), cargarResoluciones()]);
      App.aviso(activa ? 'Frecuencia habilitada sujeta a su vigencia.' : 'Frecuencia suspendida.', 'success');
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
