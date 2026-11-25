(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;

  let usuario = App.sesion();
  if (!usuario) return;

  const tablaFrecuencias = document.getElementById('tablaFrecuencias');
  const tablaHojas = document.getElementById('tablaHojas');
  const statsFrecuencias = document.getElementById('statsFrecuencias');
  const contadorFrecuencias = document.getElementById('contadorFrecuencias');
  const contadorHojas = document.getElementById('contadorHojas');
  const badgeTotalHojas = document.getElementById('badgeTotalHojas');
  const avisoGlobal = document.getElementById('avisoGlobal');

  const btnRecargar = document.getElementById('btnRecargar');
  const btnNuevaFrecuencia = document.getElementById('btnNuevaFrecuencia');
  const btnIntercambiarRuta = document.getElementById('btnIntercambiarRuta');
  const btnAbrirProgramacion = document.getElementById('btnAbrirProgramacion');

  const tabFrecuencias = document.getElementById('tabFrecuencias');
  const tabHojas = document.getElementById('tabHojas');
  const panelFrecuencias = document.getElementById('panelFrecuencias');
  const panelHojas = document.getElementById('panelHojas');

  const formFrecuencia = document.getElementById('formFrecuencia');
  const tituloModalFrecuencia = document.getElementById('tituloModalFrecuencia');
  const numeroResolucionFrecuencia = document.getElementById('numeroResolucionFrecuencia');
  const inicioFrecuencia = document.getElementById('inicioFrecuencia');
  const finFrecuencia = document.getElementById('finFrecuencia');
  const estadoFrecuencia = document.getElementById('estadoFrecuencia');
  const horaFrecuencia = document.getElementById('horaFrecuencia');
  const tarifaBaseFrecuencia = document.getElementById('tarifaBaseFrecuencia');
  const btnGuardarFrecuencia = document.getElementById('btnGuardarFrecuencia');
  const categoriaFrecuencia = document.getElementById('categoriaFrecuencia');
  const campoCategoriaFrecuencia = document.getElementById('campoCategoriaFrecuencia') || categoriaFrecuencia.closest('.field');
  const estadoRutaFrecuencia = document.getElementById('estadoRutaFrecuencia');

  const lados = {
    origen: {
      provincia: document.getElementById('origenProvincia'),
      ciudad: document.getElementById('origenCiudad')
    },
    destino: {
      provincia: document.getElementById('destinoProvincia'),
      ciudad: document.getElementById('destinoCiudad')
    }
  };

  const filtroOrigen = document.getElementById('filtroOrigen');
  const filtroDestino = document.getElementById('filtroDestino');
  const filtroEstadoFrecuencia = document.getElementById('filtroEstadoFrecuencia');
  const filtroFrecuenciaHoja = document.getElementById('filtroFrecuenciaHoja');
  const filtroEstadoHoja = document.getElementById('filtroEstadoHoja');

  let frecuencias = [];
  let hojas = [];
  let frecuenciaEnEdicion = null;
  let categoriasOperativas = [];
  let categoriasDisponibles = false;
  let ubicaciones = [];
  let cargaUbicaciones = null;

  const permitido = (permiso) => usuario.rolId === 'R003'
    ? ['rutas', 'salidas', 'ventanilla'].includes(permiso)
    : (usuario.accesoConfigurado !== true || usuario.principal || usuario.permisos?.includes(permiso));
  const normalizarTexto = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const claveCiudad = (valor) => String(valor || '').trim().toUpperCase();

  function aviso(mensaje, tipo = 'warning') {
    avisoGlobal.innerHTML = `<div class="notice ${tipo}"><span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span></div>`;
  }

  function limpiarAviso() {
    avisoGlobal.innerHTML = '';
  }

  const textoVigencia = (estado) => ({
    VIGENTE: 'Vigente',
    PENDIENTE: 'Aún no vigente',
    VENCIDA: 'Vencida',
    INACTIVA: 'Suspendida'
  }[estado] || 'Activa');

  function formatearHorarioHoja(hoja) {
    if (hoja.SALIDA_PLAN_UTC) {
      try {
        const ini = new Date(hoja.SALIDA_PLAN_UTC);
        const fin = hoja.LLEGADA_PLAN_UTC ? new Date(hoja.LLEGADA_PLAN_UTC) : null;
        const fmtFecha = new Intl.DateTimeFormat('es-EC', {
          timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const fmtHora = new Intl.DateTimeFormat('es-EC', {
          timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false
        });
        const fechaIni = fmtFecha.format(ini);
        const horaIni = fmtHora.format(ini);
        if (fin && !Number.isNaN(fin.getTime())) {
          const fechaFin = fmtFecha.format(fin);
          const horaFin = fmtHora.format(fin);
          const detalleFin = fechaFin === fechaIni ? horaFin : `${fechaFin} ${horaFin}`;
          return `<strong>${App.escapar(fechaIni)}</strong><span class="muted block-sub">${App.escapar(horaIni)} – ${App.escapar(detalleFin)}</span>`;
        }
        return `<strong>${App.escapar(fechaIni)}</strong><span class="muted block-sub">${App.escapar(horaIni)}</span>`;
      } catch {}
    }
    return `<strong>${App.escapar(App.fecha(hoja.FEC_PRO_HOJ))}</strong><span class="muted block-sub">Sin hora fija</span>`;
  }

  function todasLasCiudades() {
    const lista = [];
    for (const grupo of ubicaciones) {
      for (const ciudad of grupo.ciudades || []) {
        lista.push({ provincia: grupo.provincia, nombre: ciudad.nombre, valor: claveCiudad(ciudad.valor) });
      }
    }
    return lista;
  }

  function encontrarCiudad(valor) {
    const buscado = claveCiudad(valor);
    if (!buscado) return null;
    return todasLasCiudades().find((item) => item.valor === buscado || normalizarTexto(item.nombre) === normalizarTexto(buscado)) || null;
  }

  async function cargarUbicaciones() {
    if (ubicaciones.length) return ubicaciones;
    if (Array.isArray(window.ECUADOR_UBICACIONES) && window.ECUADOR_UBICACIONES.length) {
      ubicaciones = window.ECUADOR_UBICACIONES;
      return ubicaciones;
    }
    cargaUbicaciones ||= fetch('../../data/ecuador_ubicaciones.json', { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar el catálogo de provincias y cantones.');
        return res.json();
      })
      .then((data) => {
        ubicaciones = Array.isArray(data) ? data : [];
        return ubicaciones;
      })
      .catch((error) => {
        cargaUbicaciones = null;
        throw error;
      });
    return cargaUbicaciones;
  }

  function renderLado(lado, valorSeleccionado = null) {
    const ctrl = lados[lado];
    const actual = valorSeleccionado !== null ? claveCiudad(valorSeleccionado) : claveCiudad(ctrl.ciudad.value);
    const coincidencia = encontrarCiudad(actual);

    const provinciaPrevia = valorSeleccionado !== null
      ? (coincidencia ? coincidencia.provincia : '')
      : ctrl.provincia.value;

    const opcionesProv = [new Option('Todas las provincias', '')];
    for (const grupo of ubicaciones) {
      opcionesProv.push(new Option(grupo.provincia, grupo.provincia));
    }
    ctrl.provincia.replaceChildren(...opcionesProv);
    const provinciaActiva = ubicaciones.some((g) => g.provincia === provinciaPrevia) ? provinciaPrevia : '';
    ctrl.provincia.value = provinciaActiva;

    const elementosCiudad = [new Option('Selecciona una ciudad / cantón…', '')];
    const valoresValidos = new Set();

    if (provinciaActiva) {
      const grupo = ubicaciones.find((g) => g.provincia === provinciaActiva);
      for (const c of grupo?.ciudades || []) {
        const valor = claveCiudad(c.valor);
        valoresValidos.add(valor);
        elementosCiudad.push(new Option(c.nombre, valor));
      }
    } else if (typeof document.createElement === 'function') {
      for (const grupo of ubicaciones) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = grupo.provincia;
        for (const c of grupo.ciudades || []) {
          const valor = claveCiudad(c.valor);
          valoresValidos.add(valor);
          optgroup.appendChild(new Option(c.nombre, valor));
        }
        elementosCiudad.push(optgroup);
      }
    } else {
      for (const c of todasLasCiudades()) {
        valoresValidos.add(c.valor);
        elementosCiudad.push(new Option(`${c.nombre} (${c.provincia})`, c.valor));
      }
    }

    // Compatibilidad con registros históricos (ej. AMBATO DEMO) al editar
    if (actual && !valoresValidos.has(actual)) {
      valoresValidos.add(actual);
      elementosCiudad.push(new Option(`${actual} (registro actual)`, actual));
    }

    ctrl.ciudad.replaceChildren(...elementosCiudad);
    ctrl.ciudad.value = actual && valoresValidos.has(actual) ? actual : '';
  }

  function actualizarEstadoRuta() {
    const oriVal = claveCiudad(lados.origen.ciudad.value);
    const desVal = claveCiudad(lados.destino.ciudad.value);
    estadoRutaFrecuencia.classList?.remove?.('is-error', 'is-ready');

    if (!oriVal || !desVal) {
      estadoRutaFrecuencia.textContent = 'Selecciona provincia y ciudad de origen y destino.';
      return;
    }
    if (oriVal === desVal) {
      estadoRutaFrecuencia.classList?.add?.('is-error');
      estadoRutaFrecuencia.textContent = 'El origen y el destino deben ser ciudades distintas.';
      return;
    }
    const ori = encontrarCiudad(oriVal);
    const des = encontrarCiudad(desVal);
    estadoRutaFrecuencia.classList?.add?.('is-ready');
    if (ori && des) {
      const tipo = ori.provincia === des.provincia
        ? `Trayecto intercantonal (${ori.provincia})`
        : `Trayecto interprovincial (${ori.provincia} → ${des.provincia})`;
      estadoRutaFrecuencia.textContent = `${tipo}: ${ori.nombre} → ${des.nombre}`;
    } else {
      estadoRutaFrecuencia.textContent = `Ruta seleccionada: ${oriVal} → ${desVal}`;
    }
  }

  for (const lado of ['origen', 'destino']) {
    lados[lado].provincia.addEventListener('change', () => {
      renderLado(lado);
      actualizarEstadoRuta();
    });
    lados[lado].ciudad.addEventListener('change', () => {
      const item = encontrarCiudad(lados[lado].ciudad.value);
      if (item && lados[lado].provincia.value !== item.provincia) {
        lados[lado].provincia.value = item.provincia;
        renderLado(lado, item.valor);
      }
      actualizarEstadoRuta();
    });
  }

  btnIntercambiarRuta?.addEventListener('click', () => {
    const oriActual = claveCiudad(lados.origen.ciudad.value);
    const desActual = claveCiudad(lados.destino.ciudad.value);
    renderLado('origen', desActual);
    renderLado('destino', oriActual);
    actualizarEstadoRuta();
  });

  function cambiarVista(vista, frecuenciaId = null) {
    const esHojas = vista === 'hojas';
    tabFrecuencias?.classList?.toggle?.('active', !esHojas);
    tabHojas?.classList?.toggle?.('active', esHojas);
    tabFrecuencias?.setAttribute?.('aria-selected', String(!esHojas));
    tabHojas?.setAttribute?.('aria-selected', String(esHojas));
    if (panelFrecuencias) panelFrecuencias.hidden = esHojas;
    if (panelHojas) panelHojas.hidden = !esHojas;

    if (esHojas && frecuenciaId !== null && filtroFrecuenciaHoja) {
      filtroFrecuenciaHoja.value = frecuenciaId;
      renderHojas();
    }
  }

  tabFrecuencias?.addEventListener('click', () => cambiarVista('frecuencias'));
  tabHojas?.addEventListener('click', () => cambiarVista('hojas'));

  btnAbrirProgramacion?.addEventListener('click', () => {
    const panel = document.getElementById('coopAssignment');
    if (!panel || panel.hidden) return;
    panel.open = true;
    panel.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });

  function actualizarStatsFrecuencias() {
    const total = frecuencias.length;
    const activas = frecuencias.filter((f) => f.EST_RES === '1').length;
    const suspendidas = total - activas;
    const totalHojas = hojas.length || frecuencias.reduce((suma, f) => suma + (Number(f.TOTAL_HOJAS) || 0), 0);

    if (badgeTotalHojas) badgeTotalHojas.textContent = String(totalHojas);

    statsFrecuencias.innerHTML = `
      <article class="stat-card">
        <div class="stat-icon" aria-hidden="true">⇄</div>
        <div class="stat-copy">
          <div class="stat-label">Frecuencias</div>
          <div class="stat-value">${App.numero(total)}</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" aria-hidden="true">✓</div>
        <div class="stat-copy">
          <div class="stat-label">Vigentes / activas</div>
          <div class="stat-value">${App.numero(activas)}</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" aria-hidden="true">⏸</div>
        <div class="stat-copy">
          <div class="stat-label">Suspendidas</div>
          <div class="stat-value">${App.numero(suspendidas)}</div>
        </div>
      </article>
      <article class="stat-card stat-card-action" id="cardHojasProgramadas" role="button" tabindex="0" title="Ver listado de hojas programadas">
        <div class="stat-icon" aria-hidden="true">▤</div>
        <div class="stat-copy">
          <div class="stat-label">Hojas programadas</div>
          <div class="stat-value">${App.numero(totalHojas)}</div>
          <div class="stat-hint">Ver listado →</div>
        </div>
      </article>`;

    const cardHojas = document.getElementById('cardHojasProgramadas');
    const abrirHojas = () => cambiarVista('hojas', '');
    cardHojas?.addEventListener('click', abrirHojas);
    cardHojas?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirHojas();
      }
    });
  }

  function actualizarSelectCategorias(actual = '') {
    if (!campoCategoriaFrecuencia) return;
    campoCategoriaFrecuencia.hidden = !categoriasDisponibles;
    categoriaFrecuencia.disabled = !categoriasDisponibles;
    categoriaFrecuencia.required = categoriasDisponibles;
    if (!categoriasDisponibles) return;
    categoriaFrecuencia.replaceChildren(
      new Option('Selecciona…', ''),
      ...categoriasOperativas.map((categoria) => new Option(categoria.NOM_CAT, categoria.ID_CAT))
    );
    categoriaFrecuencia.value = actual || '';
  }

  async function cargarCategoriasOperativas() {
    try {
      const datos = await App.api('/coop/categorias-operativas');
      categoriasOperativas = datos.categorias || [];
      categoriasDisponibles = categoriasOperativas.length > 0;
    } catch {
      categoriasOperativas = [];
      categoriasDisponibles = false;
    }
    actualizarSelectCategorias(frecuenciaEnEdicion?.ID_CAT_OP || '');
  }

  function poblarFiltroFrecuenciasHojas() {
    if (!filtroFrecuenciaHoja) return;
    const previa = filtroFrecuenciaHoja.value;
    filtroFrecuenciaHoja.replaceChildren(
      new Option('Todas las frecuencias', ''),
      ...frecuencias.map((f) => new Option(`${f.CIU_ORI_FRE} → ${f.CIU_DES_FRE}${f.HORA_SAL_FRE ? ` · ${String(f.HORA_SAL_FRE).slice(0, 5)}` : ""}`, f.ID_FRE))
    );
    filtroFrecuenciaHoja.value = frecuencias.some((f) => f.ID_FRE === previa) ? previa : '';
  }

  function renderFrecuencias() {
    const origen = filtroOrigen.value.trim().toLowerCase();
    const destino = filtroDestino.value.trim().toLowerCase();
    const estado = filtroEstadoFrecuencia.value;

    const filtradas = frecuencias.filter((f) => {
      if (origen && !String(f.CIU_ORI_FRE || '').toLowerCase().includes(origen)) return false;
      if (destino && !String(f.CIU_DES_FRE || '').toLowerCase().includes(destino)) return false;
      if (estado !== '' && f.EST_RES !== estado) return false;
      return true;
    });

    contadorFrecuencias.textContent = `${filtradas.length} frecuencia${filtradas.length === 1 ? '' : 's'}`;

    if (filtradas.length === 0) {
      tablaFrecuencias.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">⇄</div>
            <h3>Sin frecuencias registradas</h3>
            <p>${frecuencias.length === 0 ? 'Registra tu primera ruta y frecuencia con su número de resolución ANT.' : 'No hay frecuencias que coincidan con los filtros.'}</p>
          </div>
        </td></tr>`;
      return;
    }

    const puedeGestionar = permitido('rutas');
    tablaFrecuencias.innerHTML = filtradas.map((f) => {
      const activa = f.EST_RES === '1';
      const fin = f.FEC_HOR_FIN_FRE ? App.fecha(f.FEC_HOR_FIN_FRE) : 'Sin fin';
      const categoria = f.NOM_CAT || f.ID_CAT_OP || '—';
      const estadoEtiqueta = textoVigencia(f.EST_VIGENCIA || (activa ? 'VIGENTE' : 'INACTIVA'));
      const claseEstado = f.EST_VIGENCIA === 'VIGENTE' || (!f.EST_VIGENCIA && activa)
        ? 'badge-success'
        : (f.EST_VIGENCIA === 'PENDIENTE' ? 'badge-info' : 'badge-neutral');
      const totalHojas = Number(f.TOTAL_HOJAS) || 0;

      return `
        <tr data-id="${App.escapar(f.ID_FRE)}">
          <td class="nowrap"><strong>${App.escapar(String(f.HORA_SAL_FRE || "08:00").slice(0, 5))}</strong><span class="muted block-sub">$${Number(f.TAR_BAS_FRE ?? 5).toFixed(2)} base</span></td>
          <td>
            <div class="cell-route">
              <span>${App.escapar(f.CIU_ORI_FRE)}</span>
              <span class="arrow">→</span>
              <span>${App.escapar(f.CIU_DES_FRE)}</span>
            </div>
          </td>
          <td class="mono">${App.escapar(f.NUM_RES_FRE || '—')}</td>
          <td class="nowrap">${App.fecha(f.FEC_HOR_INI_FRE)}<span class="muted block-sub">hasta ${fin}</span></td>
          <td>${categoria !== '—' ? `<span class="badge badge-info">${App.escapar(categoria)}</span>` : '<span class="muted">—</span>'}</td>
          <td>
            <button type="button" class="btn-hojas-link" data-ver-hojas="${App.escapar(f.ID_FRE)}" title="Ver hojas programadas de esta frecuencia">
              ${App.numero(totalHojas)} ${totalHojas === 1 ? 'hoja' : 'hojas'}
            </button>
          </td>
          <td><span class="badge ${claseEstado}">${App.escapar(estadoEtiqueta)}</span></td>
          <td>
            <div class="actions">
              ${puedeGestionar ? `
                <button class="btn btn-secondary btn-sm" type="button" data-accion-frecuencia="editar" data-id="${App.escapar(f.ID_FRE)}">Editar</button>
                <button class="btn btn-secondary btn-sm" type="button" data-accion-frecuencia="estado" data-id="${App.escapar(f.ID_FRE)}">${activa ? 'Suspender' : 'Activar'}</button>
                <button class="btn btn-danger-soft btn-sm" type="button" data-accion-frecuencia="eliminar" data-id="${App.escapar(f.ID_FRE)}">Eliminar</button>
              ` : '<span class="muted">Solo lectura</span>'}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderHojas() {
    if (!tablaHojas) return;
    const idFre = filtroFrecuenciaHoja?.value || '';
    const estado = filtroEstadoHoja?.value || '';

    const filtradas = hojas.filter((h) => {
      if (idFre && h.ID_FRE_PER !== idFre) return false;
      if (estado) {
        const actual = String(h.EST_VIA_HOJ || '').toUpperCase();
        if (estado === 'PROGRAMADA' ? !['PROGRAMADA', 'PROGRAMADO'].includes(actual) : actual !== estado) return false;
      }
      return true;
    });

    if (contadorHojas) {
      contadorHojas.textContent = `${filtradas.length} hoja${filtradas.length === 1 ? '' : 's'} programada${filtradas.length === 1 ? '' : 's'}`;
    }

    if (filtradas.length === 0) {
      tablaHojas.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">▤</div>
            <h3>Sin hojas de ruta programadas</h3>
            <p>${hojas.length === 0 ? 'Usa "Programar salidas con chofer y controlador" arriba para crear tu primera salida.' : 'No hay hojas que coincidan con los filtros seleccionados.'}</p>
          </div>
        </td></tr>`;
      return;
    }

    const puedeCancelar = permitido('rutas');
    tablaHojas.innerHTML = filtradas.map((h) => {
      const est = String(h.EST_VIA_HOJ || 'PROGRAMADA').toUpperCase();
      const claseEstado = est === 'PROGRAMADA' || est === 'PROGRAMADO'
        ? 'badge-info'
        : (est === 'EN CURSO' ? 'badge-warning' : (est === 'FINALIZADA' ? 'badge-success' : 'badge-neutral'));
      const chofer = h.NOM_CHOFER ? `${h.NOM_CHOFER} ${h.APE_CHOFER || ''}`.trim() : 'Sin asignar';
      const controlador = h.NOM_CONTROLADOR ? `${h.NOM_CONTROLADOR} ${h.APE_CONTROLADOR || ''}`.trim() : 'Sin asignar';
      const vendidos = Number(h.BOLETOS_VENDIDOS) || 0;
      const asientos = Number(h.TOTAL_ASIENTOS) || 0;
      const cancelable = puedeCancelar && (est === 'PROGRAMADA' || est === 'PROGRAMADO') && vendidos === 0;

      return `
        <tr data-hoja="${App.escapar(h.ID_HOJ)}">

          <td>
            <div class="cell-main">
              <strong>${App.escapar(h.CIU_ORI_FRE)} → ${App.escapar(h.CIU_DES_FRE)}</strong>
              ${h.OBS_HOJ ? `<span class="muted">${App.escapar(h.OBS_HOJ)}</span>` : ''}
            </div>
          </td>
          <td class="nowrap">${formatearHorarioHoja(h)}</td>
          <td>
            <div class="cell-main">
              <strong>Bus ${App.escapar(h.NUM_BUS || '—')}</strong>
              <span class="mono">${App.escapar(h.PLA_BUS || '—')}</span>
            </div>
          </td>
          <td>
            <div class="cell-main">
              <span><strong>Chofer:</strong> ${App.escapar(chofer)}</span>
              <span><strong>Control:</strong> ${App.escapar(controlador)}</span>
            </div>
          </td>
          <td class="nowrap"><strong>${App.numero(vendidos)}</strong> / ${App.numero(asientos)}</td>
          <td><span class="badge ${claseEstado}">${App.escapar(est)}</span></td>
          <td>
            <div class="actions">
              ${cancelable ? `<button class="btn btn-danger-soft btn-sm" type="button" data-cancelar-hoja="${App.escapar(h.ID_HOJ)}">Cancelar</button>` : '<span class="muted">—</span>'}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  async function cargarFrecuencias() {
    tablaFrecuencias.innerHTML = `<tr class="loading-row"><td colspan="8"><span class="spinner"></span>Cargando frecuencias…</td></tr>`;
    try {
      const datos = await App.api('/coop/frecuencias');
      frecuencias = datos.frecuencias || [];
      poblarFiltroFrecuenciasHojas();
      actualizarStatsFrecuencias();
      renderFrecuencias();
    } catch (error) {
      tablaFrecuencias.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las frecuencias</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cargarHojas() {
    if (!tablaHojas) return;
    if (!permitido('salidas')) {
      hojas = [];
      tablaHojas.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>Sin permiso para consultar salidas</h3><p>Tu cuenta no tiene habilitado el módulo de salidas.</p></div></td></tr>`;
      return;
    }
    tablaHojas.innerHTML = `<tr class="loading-row"><td colspan="8"><span class="spinner"></span>Cargando hojas programadas…</td></tr>`;
    try {
      const datos = await App.api('/coop/hojas-ruta');
      hojas = datos.hojas || [];
      actualizarStatsFrecuencias();
      renderHojas();
    } catch (error) {
      tablaHojas.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar las hojas programadas</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    }
  }

  async function cancelarHoja(id) {
    const hoja = hojas.find((item) => item.ID_HOJ === id);
    if (!hoja) return;
    const confirmado = await App.confirmar({
      titulo: 'Cancelar hoja de ruta',
      mensaje: `¿Seguro que deseas cancelar la salida ${hoja.ID_HOJ} (${hoja.CIU_ORI_FRE} → ${hoja.CIU_DES_FRE})?`,
      aceptar: 'Cancelar salida',
      peligro: true
    });
    if (!confirmado) return;
    try {
      await App.api(`/coop/hojas-ruta/${encodeURIComponent(id)}/estado`, {
        method: 'PATCH',
        body: { EST_VIA_HOJ: 'CANCELADA' }
      });
      App.aviso('Hoja de ruta cancelada.', 'success');
      await Promise.all([cargarHojas(), cargarFrecuencias()]);
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  async function prepararSelectorUbicaciones(frecuencia = null) {
    for (const lado of ['origen', 'destino']) {
      lados[lado].provincia.value = '';
    }
    estadoRutaFrecuencia.textContent = 'Cargando provincias y cantones de Ecuador…';
    try {
      await cargarUbicaciones();
      renderLado('origen', frecuencia?.CIU_ORI_FRE || '');
      renderLado('destino', frecuencia?.CIU_DES_FRE || '');
      actualizarEstadoRuta();
    } catch (error) {
      estadoRutaFrecuencia.textContent = error.message;
    }
  }

  async function abrirNuevaFrecuencia() {
    limpiarAviso();
    frecuenciaEnEdicion = null;
    formFrecuencia.reset();
    tituloModalFrecuencia.textContent = 'Nueva frecuencia';
    inicioFrecuencia.value = App.hoyISO();
    finFrecuencia.value = '';
    estadoFrecuencia.value = '1';
    if (horaFrecuencia) horaFrecuencia.value = '08:00';
    if (tarifaBaseFrecuencia) tarifaBaseFrecuencia.value = '5.00';
    numeroResolucionFrecuencia.value = '';
    actualizarSelectCategorias('');
    App.abrirModal('modalFrecuencia');
    await prepararSelectorUbicaciones(null);
  }

  async function abrirEdicionFrecuencia(id) {
    const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
    if (!frecuencia) return;
    limpiarAviso();
    frecuenciaEnEdicion = frecuencia;
    tituloModalFrecuencia.textContent = `Editar frecuencia ${frecuencia.ID_FRE}`;
    numeroResolucionFrecuencia.value = frecuencia.NUM_RES_FRE || '';
    inicioFrecuencia.value = App.fechaInput(frecuencia.FEC_HOR_INI_FRE);
    finFrecuencia.value = App.fechaInput(frecuencia.FEC_HOR_FIN_FRE);
    estadoFrecuencia.value = frecuencia.EST_RES || '1';
    if (horaFrecuencia) horaFrecuencia.value = String(frecuencia.HORA_SAL_FRE || '08:00').slice(0, 5);
    if (tarifaBaseFrecuencia) tarifaBaseFrecuencia.value = Number(frecuencia.TAR_BAS_FRE ?? 5).toFixed(2);
    actualizarSelectCategorias(frecuencia.ID_CAT_OP || '');
    App.abrirModal('modalFrecuencia');
    await prepararSelectorUbicaciones(frecuencia);
  }

  async function guardarFrecuencia(evento) {
    evento.preventDefault();
    const origen = claveCiudad(lados.origen.ciudad.value);
    const destino = claveCiudad(lados.destino.ciudad.value);
    const numRes = numeroResolucionFrecuencia.value.trim();

    if (!origen || !destino) {
      App.aviso('Selecciona la ciudad o cantón de origen y destino.', 'error');
      return;
    }
    if (origen === destino) {
      App.aviso('La ciudad de origen y destino deben ser diferentes.', 'error');
      return;
    }
    if (!numRes) {
      App.aviso('Ingresa el número de resolución ANT que aprueba esta frecuencia.', 'error');
      return;
    }
    if (categoriasDisponibles && !categoriaFrecuencia.value) {
      App.aviso('Selecciona la categoría operativa de la frecuencia.', 'error');
      return;
    }

    const cuerpo = {
      CIU_ORI_FRE: origen,
      CIU_DES_FRE: destino,
      FEC_HOR_INI_FRE: inicioFrecuencia.value,
      FEC_HOR_FIN_FRE: finFrecuencia.value || null,
      EST_RES: estadoFrecuencia.value,
      NUM_RES_FRE: numRes,
      HORA_SAL_FRE: horaFrecuencia?.value || '08:00',
      TAR_BAS_FRE: Number(tarifaBaseFrecuencia?.value || 5)
    };

    App.textoBoton(btnGuardarFrecuencia, 'Guardando…');
    try {
      let guardada;
      if (frecuenciaEnEdicion) {
        guardada = await App.api(`/coop/frecuencias/${encodeURIComponent(frecuenciaEnEdicion.ID_FRE)}`, {
          method: 'PUT',
          body: cuerpo
        });
      } else {
        guardada = await App.api('/coop/frecuencias', {
          method: 'POST',
          body: cuerpo
        });
      }

      const idGuardada = guardada?.frecuencia?.ID_FRE || frecuenciaEnEdicion?.ID_FRE;
      if (categoriasDisponibles && idGuardada && categoriaFrecuencia.value) {
        await App.api(`/coop/frecuencias/${encodeURIComponent(idGuardada)}/categoria`, {
          method: 'PUT',
          body: { categoria: categoriaFrecuencia.value }
        });
      }

      App.aviso(frecuenciaEnEdicion ? 'Frecuencia actualizada correctamente.' : 'Frecuencia registrada correctamente.', 'success');
      App.cerrarModal('modalFrecuencia');
      await cargarFrecuencias();
      if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
        window.dispatchEvent(new Event('coop:frecuencias-updated'));
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnGuardarFrecuencia);
    }
  }

  async function alternarEstadoFrecuencia(id) {
    const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
    if (!frecuencia) return;
    const nuevo = frecuencia.EST_RES === '1' ? '0' : '1';
    try {
      await App.api(`/coop/frecuencias/${encodeURIComponent(id)}/estado`, {
        method: 'PATCH',
        body: { EST_RES: nuevo }
      });
      App.aviso(nuevo === '1' ? 'Frecuencia activada.' : 'Frecuencia suspendida.', 'success');
      await cargarFrecuencias();
      if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
        window.dispatchEvent(new Event('coop:frecuencias-updated'));
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  async function eliminarFrecuencia(id) {
    const frecuencia = frecuencias.find((elemento) => elemento.ID_FRE === id);
    if (!frecuencia) return;
    const confirmado = await App.confirmar({
      titulo: 'Eliminar frecuencia',
      mensaje: `¿Seguro que deseas eliminar la ruta ${frecuencia.CIU_ORI_FRE} → ${frecuencia.CIU_DES_FRE}? Solo se puede eliminar si no tiene hojas de ruta asociadas.`,
      aceptar: 'Eliminar',
      peligro: true
    });
    if (!confirmado) return;
    try {
      await App.api(`/coop/frecuencias/${encodeURIComponent(id)}`, { method: 'DELETE' });
      App.aviso('Frecuencia eliminada correctamente.', 'success');
      await cargarFrecuencias();
      if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
        window.dispatchEvent(new Event('coop:frecuencias-updated'));
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  tablaFrecuencias.addEventListener('click', (evento) => {
    const verHojas = evento.target.closest('button[data-ver-hojas]');
    if (verHojas) {
      cambiarVista('hojas', verHojas.dataset.verHojas);
      return;
    }
    const boton = evento.target.closest('button[data-accion-frecuencia]');
    if (!boton) return;
    const accion = boton.dataset.accionFrecuencia;
    const id = boton.dataset.id;
    if (accion === 'editar') abrirEdicionFrecuencia(id);
    if (accion === 'estado') alternarEstadoFrecuencia(id);
    if (accion === 'eliminar') eliminarFrecuencia(id);
  });

  tablaHojas?.addEventListener('click', (evento) => {
    const btn = evento.target.closest('button[data-cancelar-hoja]');
    if (btn) cancelarHoja(btn.dataset.cancelarHoja);
  });

  btnNuevaFrecuencia.addEventListener('click', abrirNuevaFrecuencia);
  formFrecuencia.addEventListener('submit', guardarFrecuencia);
  btnRecargar.addEventListener('click', () => Promise.all([cargarFrecuencias(), cargarHojas(), cargarCategoriasOperativas()]));
  filtroOrigen.addEventListener('input', App.debounce(renderFrecuencias, 200));
  filtroDestino.addEventListener('input', App.debounce(renderFrecuencias, 200));
  filtroEstadoFrecuencia.addEventListener('change', renderFrecuencias);
  filtroFrecuenciaHoja?.addEventListener('change', renderHojas);
  filtroEstadoHoja?.addEventListener('change', renderHojas);

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('coop:hojas-updated', () => {
      Promise.all([cargarHojas(), cargarFrecuencias()]);
    });
  }

  try {
    const actual = await App.api('/auth/me');
    if (actual?.usuario) usuario = actual.usuario;
  } catch {}

  if (!permitido('rutas')) {
    btnNuevaFrecuencia.hidden = true;
    aviso('No tienes permisos asignados para gestionar rutas y frecuencias.', 'warning');
  } else {
    await Promise.all([cargarFrecuencias(), cargarHojas(), cargarCategoriasOperativas()]);
  }
})();
