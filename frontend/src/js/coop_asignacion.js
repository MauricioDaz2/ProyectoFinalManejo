(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let loading = false, loaded = false, loteDisponible = false, disponibilidadLista = false;
  let reintentoLote = null;
  let disponibilidad = { buses: [], personal: [], categoria: null };

  async function request(path, body) {
    let respuesta;
    try {
      respuesta = await fetch(window.API_BASE_URL + path, {
        method: body ? 'POST' : 'GET', cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      const red = new Error('No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
      red.esRed = true;
      red.causa = error;
      throw red;
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !datos.success) {
      const fallo = new Error(datos.message || 'No se pudo consultar la programación.');
      fallo.status = respuesta.status;
      fallo.datos = datos;
      throw fallo;
    }
    return datos;
  }

  function option(value, text) {
    const elemento = document.createElement('option');
    elemento.value = value;
    elemento.textContent = text;
    return elemento;
  }

  function options(id, rows, value, label) {
    const select = $(id);
    select.replaceChildren();
    select.append(option('', rows.length ? 'Selecciona una opción' : 'No hay registros disponibles'));
    for (const row of rows) select.append(option(row[value], label(row)));
  }

  function opcionesHtml(rows, value, label, seleccionado) {
    return ['<option value="">Selecciona…</option>', ...rows.map(row =>
      `<option value="${App.escapar(row[value])}" ${row[value] === seleccionado ? 'selected' : ''}>${App.escapar(label(row))}</option>`
    )].join('');
  }

  const busLabel = row => `Bus ${row.NUM_BUS} · ${row.PLA_BUS}`;
  const personaLabel = row => `${row.NOM_USU} ${row.APE_USU}`;
  const isoEcuador = value => new Date(`${value}:00-05:00`).toISOString();

  function estadoMensaje(mensaje, tono = 'info') {
    const el = $('assignmentStatus');
    if (!el) return;
    el.textContent = mensaje;
    if (el.dataset) el.dataset.tone = tono;
  }

  function notificarHojasActualizadas() {
    if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
      window.dispatchEvent(new Event('coop:hojas-updated'));
    }
  }

  function sugerirIntervaloEcuador() {
    if (!$('batchStart') || !$('batchEnd')) return;
    if ($('batchStart').value || $('batchEnd').value) return;
    try {
      const ahora = new Date(Date.now() - 5 * 3600000);
      ahora.setUTCMinutes(0, 0, 0);
      const inicio = new Date(ahora.getTime() + 3600000);
      const fin = new Date(inicio.getTime() + 2 * 3600000);
      $('batchStart').value = inicio.toISOString().slice(0, 16);
      $('batchEnd').value = fin.toISOString().slice(0, 16);
    } catch {}
  }

  function filaHtml(indice, fila = {}) {
    return `
      <tr>
        <td class="mono row-idx">${indice}</td>
        <td><select data-campo="bus" required aria-label="Bus de la fila ${indice}">${opcionesHtml(disponibilidad.buses, 'ID_BUS', busLabel, fila.busId)}</select></td>
        <td><select data-campo="chofer" required aria-label="Chofer de la fila ${indice}">${opcionesHtml(disponibilidad.personal.filter(p => p.ID_ROL_PER === 'R006'), 'ID_USU', personaLabel, fila.choferId)}</select></td>
        <td><select data-campo="controlador" required aria-label="Controlador de la fila ${indice}">${opcionesHtml(disponibilidad.personal.filter(p => p.ID_ROL_PER === 'R004'), 'ID_USU', personaLabel, fila.controladorId)}</select></td>
        <td><input data-campo="observacion" maxlength="50" placeholder="Opcional" aria-label="Observación de la fila ${indice}" value="${App.escapar(fila.observacion || '')}"></td>
        <td class="text-right"><button class="btn btn-danger-soft btn-sm" type="button" data-quitar>Quitar</button></td>
      </tr>`;
  }

  function recolectar() {
    return Array.from($('batchRows').children).map(fila => ({
      busId: fila.querySelector('[data-campo="bus"]').value,
      choferId: fila.querySelector('[data-campo="chofer"]').value,
      controladorId: fila.querySelector('[data-campo="controlador"]').value,
      observacion: fila.querySelector('[data-campo="observacion"]').value.trim()
    }));
  }

  function renumerarFilas() {
    const trs = Array.from($('batchRows').children);
    trs.forEach((tr, idx) => {
      const celda = tr.querySelector?.('.row-idx');
      if (celda) celda.textContent = String(idx + 1);
      const quitar = tr.querySelector?.('[data-quitar]');
      if (quitar) quitar.disabled = trs.length === 1;
    });
  }

  function renderFilas(filas = [{}]) {
    $('batchRows').innerHTML = filas.map((fila, indice) => filaHtml(indice + 1, fila)).join('');
    renumerarFilas();
    validarFilas();
  }

  function agregarFila() {
    if ($('batchRows').children.length >= 100) return;
    $('batchRows').insertAdjacentHTML('beforeend', filaHtml($('batchRows').children.length + 1));
    renumerarFilas();
    validarFilas();
  }

  function validarFilas() {
    const trs = Array.from($('batchRows').children);
    const filas = recolectar();
    const conteo = new Map();
    for (const fila of filas) {
      for (const valor of [fila.busId, fila.choferId, fila.controladorId]) {
        if (valor) conteo.set(valor, (conteo.get(valor) || 0) + 1);
      }
    }

    const usados = new Set();
    let problema = filas.length === 0 ? 'Agrega al menos una fila.' : '';
    for (const [indice, fila] of filas.entries()) {
      const tr = trs[indice];
      const marcar = (campo, mal) => tr?.querySelector?.(`[data-campo="${campo}"]`)?.classList?.toggle?.('is-conflict', mal);
      const dupBus = Boolean(fila.busId && conteo.get(fila.busId) > 1);
      const dupCho = Boolean(fila.choferId && conteo.get(fila.choferId) > 1);
      const dupCon = Boolean(fila.controladorId && conteo.get(fila.controladorId) > 1);
      const mismoTrip = Boolean(fila.choferId && fila.choferId === fila.controladorId);
      marcar('bus', dupBus);
      marcar('chofer', dupCho || mismoTrip);
      marcar('controlador', dupCon || mismoTrip);

      if (!fila.busId || !fila.choferId || !fila.controladorId) {
        problema ||= `Completa bus, chofer y controlador en la fila ${indice + 1}.`;
        continue;
      }
      if (mismoTrip) problema ||= `El chofer y el controlador deben ser distintos en la fila ${indice + 1}.`;
      for (const valor of [fila.busId, fila.choferId, fila.controladorId]) {
        if (usados.has(valor)) problema ||= 'Un bus o integrante de la tripulación no puede repetirse en el lote.';
        usados.add(valor);
      }
    }
    $('batchConflicts').textContent = problema;
    return !problema;
  }

  function actualizarResumen() {
    $('batchCategory').textContent = disponibilidad.categoria?.nombre || '—';
    $('batchSummary').textContent = disponibilidadLista
      ? `${disponibilidad.buses.length} buses y ${disponibilidad.personal.length} tripulantes disponibles.`
      : 'Consulta la disponibilidad para cargar buses y tripulación.';
  }

  function invalidarDisponibilidad() {
    disponibilidadLista = false;
    reintentoLote = null;
    disponibilidad = { buses: [], personal: [], categoria: null };
    $('batchSubmit').disabled = true;
    actualizarResumen();
  }

  function nuevoLote() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, caracter => {
      const valor = Math.random() * 16 | 0;
      return (caracter === 'x' ? valor : (valor & 3 | 8)).toString(16);
    });
  }

  async function consultarDisponibilidad() {
    const frecuenciaId = $('batchFrequency').value;
    const inicio = $('batchStart').value;
    const fin = $('batchEnd').value;
    if (!frecuenciaId || !inicio || !fin) {
      estadoMensaje('Selecciona la frecuencia y el intervalo completo.', 'warning');
      return;
    }

    const previas = recolectar();
    $('batchCheck').disabled = true;
    $('batchSubmit').disabled = true;
    estadoMensaje('Consultando disponibilidad…', 'info');
    try {
      const consulta = new URLSearchParams({
        frecuenciaId, inicio: isoEcuador(inicio), fin: isoEcuador(fin)
      });
      const datos = await request('/coop/hojas-ruta/disponibilidad?' + consulta.toString());
      disponibilidad = { buses: datos.buses || [], personal: datos.personal || [], categoria: datos.categoria || null };
      disponibilidadLista = true;
      renderFilas(previas.length ? previas : [{}]);
      actualizarResumen();
      estadoMensaje(
        disponibilidad.buses.length && disponibilidad.personal.length
          ? 'Disponibilidad cargada. Asigna bus, chofer y controlador en el Paso 2.'
          : 'No hay buses o tripulación disponibles para ese intervalo.',
        disponibilidad.buses.length && disponibilidad.personal.length ? 'success' : 'warning'
      );
    } catch (error) {
      invalidarDisponibilidad();
      estadoMensaje(error.message, 'error');
    } finally {
      $('batchCheck').disabled = false;
      $('batchSubmit').disabled = !disponibilidadLista;
    }
  }

  async function confirmarLote(evento) {
    evento.preventDefault();
    if (!disponibilidadLista) {
      estadoMensaje('Vuelve a consultar la disponibilidad antes de confirmar.', 'warning');
      return;
    }
    const filas = recolectar();
    if (!validarFilas()) return;

    const inicio = $('batchStart').value;
    const fin = $('batchEnd').value;
    const rutaElem = $('batchFrequency');
    const rutaTexto = rutaElem.options?.[rutaElem.selectedIndex]?.textContent || 'seleccionada';
    const confirmado = await App.confirmar({
      titulo: 'Confirmar lote',
      mensaje: `Se crearán ${filas.length} hoja${filas.length === 1 ? '' : 's'} para la ruta ${rutaTexto}, de ${inicio.replace('T', ' ')} a ${fin.replace('T', ' ')}.`,
      aceptar: 'Confirmar lote'
    });
    if (!confirmado) return;

    const idLote = reintentoLote || nuevoLote();
    $('batchSubmit').disabled = true;
    App.textoBoton($('batchSubmit'), 'Confirmando…');
    try {
      const datos = await request('/coop/hojas-ruta/lotes', {
        idLote, frecuenciaId: $('batchFrequency').value,
        inicio: isoEcuador(inicio), fin: isoEcuador(fin), filas
      });
      reintentoLote = null;
      const hojas = (datos.hojas || []).map(hoja => hoja.idHoja);
      const el = $('assignmentStatus');
      if (el.dataset) el.dataset.tone = 'success';
      el.innerHTML = `Lote confirmado${datos.repetido ? ' (ya estaba registrado)' : ''}: <strong>${App.escapar(hojas.join(', ') || 'sin hojas')}</strong>. <button type="button" class="link-inline" id="verHojasConfirmadas">Ver hojas programadas →</button>`;
      $('verHojasConfirmadas')?.addEventListener('click', () => $('tabHojas')?.click?.());
      $('batchRows').innerHTML = '';
      disponibilidadLista = false;
      disponibilidad = { buses: [], personal: [], categoria: null };
      actualizarResumen();
      renderFilas();
      $('batchSubmit').disabled = true;
      notificarHojasActualizadas();
    } catch (error) {
      reintentoLote = error.esRed || !error.datos ? idLote : null;
      estadoMensaje(error.message, 'error');
      $('batchSubmit').disabled = false;
    } finally {
      App.restaurarBoton($('batchSubmit'));
      $('batchSubmit').disabled = !disponibilidadLista;
    }
  }

  async function load() {
    if (loading || loaded || !$('coopAssignment').open) return;
    loading = true;
    $('assignmentSubmit').disabled = true;
    try {
      const data = await request('/operacion/asignaciones/opciones');
      loteDisponible = data.lotesDisponibles === true;
      options('assignmentBus', data.buses || [], 'ID_BUS', busLabel);
      options('assignmentRoute', data.frecuencias || [], 'ID_FRE', row => `${row.CIU_ORI_FRE} → ${row.CIU_DES_FRE}`);
      for (const [id, role] of [['assignmentDriver', 'R006'], ['assignmentController', 'R004']]) {
        options(id, (data.personal || []).filter(p => p.ID_ROL_PER === role), 'ID_USU', personaLabel);
      }
      options('batchFrequency', data.frecuencias || [], 'ID_FRE', row => `${row.CIU_ORI_FRE} → ${row.CIU_DES_FRE}`);

      $('singleAssignment').hidden = loteDisponible;
      $('batchForm').hidden = !loteDisponible;
      $('assignmentHelp').textContent = loteDisponible
        ? '1) Elige frecuencia y horario, consulta disponibilidad. 2) Asigna bus, chofer y controlador sin repetirlos en el lote.'
        : 'Selecciona personal activo de tu cooperativa. Se comprobarán horarios laborales y reservas personales.';
      if (loteDisponible) {
        sugerirIntervaloEcuador();
        invalidarDisponibilidad();
        renderFilas();
      }
      loaded = true;
      estadoMensaje('Horarios en Ecuador continental (UTC−5).', 'info');
    } catch (e) {
      estadoMensaje(e.message, 'error');
    } finally {
      loading = false;
      $('assignmentSubmit').disabled = !loaded;
    }
  }

  $('coopAssignment').addEventListener('toggle', load);
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('coop:frecuencias-updated', () => {
      loaded = false;
      if ($('coopAssignment').open) load();
    });
  }

  $('assignmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (loading || !loaded) return;
    loading = true;
    $('assignmentSubmit').disabled = true;
    try {
      const body = {
        idBus: $('assignmentBus').value, idFre: $('assignmentRoute').value,
        idUsuCho: $('assignmentDriver').value, idUsuCon: $('assignmentController').value,
        salida: isoEcuador($('assignmentStart').value), llegada: isoEcuador($('assignmentEnd').value)
      };
      const data = await request('/coop/hojas-ruta', body);
      estadoMensaje((data.message || 'Salida programada correctamente.') + (data.idHoja ? ' Código: ' + data.idHoja : ''), 'success');
      $('assignmentForm').reset();
      notificarHojasActualizadas();
    } catch (e) {
      estadoMensaje(e.message, 'error');
    } finally {
      loading = false;
      $('assignmentSubmit').disabled = false;
    }
  });

  $('batchCheck').addEventListener('click', consultarDisponibilidad);
  $('batchAdd').addEventListener('click', agregarFila);
  $('batchFrequency').addEventListener('change', invalidarDisponibilidad);
  $('batchStart').addEventListener('change', invalidarDisponibilidad);
  $('batchEnd').addEventListener('change', invalidarDisponibilidad);
  $('batchRows').addEventListener('click', evento => {
    const quitar = evento.target.closest('[data-quitar]');
    if (!quitar) return;
    if ($('batchRows').children.length === 1) return;
    quitar.closest('tr').remove();
    renumerarFilas();
    validarFilas();
  });
  $('batchRows').addEventListener('change', () => { reintentoLote = null; validarFilas(); });
  $('batchRows').addEventListener('input', () => { reintentoLote = null; });
  $('batchForm').addEventListener('submit', confirmarLote);

  request('/auth/me').then(({ usuario }) => {
    $('coopAssignment').hidden = !['R002', 'R003'].includes(usuario.rolId) || !(usuario.rolId === 'R003' || usuario.principal || usuario.permisos?.includes('rutas'));
  }).catch(() => {});
})();
