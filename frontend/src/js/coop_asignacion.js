(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let loading = false, loaded = false, loteDisponible = false, disponibilidadLista = false;
  let reintentoLote = null;
  let disponibilidad = { buses: [], personal: [], categoria: null, cupos: null };

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

  function filaHtml(indice, fila = {}) {
    return `
      <tr>
        <td class="mono">${indice}</td>
        <td><select data-campo="bus" required aria-label="Bus de la fila ${indice}">${opcionesHtml(disponibilidad.buses, 'ID_BUS', busLabel, fila.busId)}</select></td>
        <td><select data-campo="chofer" required aria-label="Chofer de la fila ${indice}">${opcionesHtml(disponibilidad.personal.filter(p => p.ID_ROL_PER === 'R006'), 'ID_USU', personaLabel, fila.choferId)}</select></td>
        <td><select data-campo="controlador" required aria-label="Controlador de la fila ${indice}">${opcionesHtml(disponibilidad.personal.filter(p => p.ID_ROL_PER === 'R004'), 'ID_USU', personaLabel, fila.controladorId)}</select></td>
        <td><input data-campo="observacion" maxlength="50" placeholder="Opcional" aria-label="Observación de la fila ${indice}" value="${App.escapar(fila.observacion || '')}"></td>
        <td><button class="btn btn-danger-soft btn-sm" type="button" data-quitar>Quitar</button></td>
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

  function renderFilas(filas = [{}]) {
    $('batchRows').innerHTML = filas.map((fila, indice) => filaHtml(indice + 1, fila)).join('');
    validarFilas();
  }

  function agregarFila() {
    if ($('batchRows').children.length >= 100) return;
    $('batchRows').insertAdjacentHTML('beforeend', filaHtml($('batchRows').children.length + 1));
    validarFilas();
  }

  function validarFilas() {
    const filas = recolectar();
    const usados = new Set();
    let problema = filas.length === 0 ? 'Agrega al menos una fila.' : '';
    for (const [indice, fila] of filas.entries()) {
      if (!fila.busId || !fila.choferId || !fila.controladorId) {
        problema ||= `Completa bus, chofer y controlador en la fila ${indice + 1}.`;
        continue;
      }
      if (fila.choferId === fila.controladorId) problema ||= `El chofer y el controlador deben ser distintos en la fila ${indice + 1}.`;
      for (const valor of [fila.busId, fila.choferId, fila.controladorId]) {
        if (usados.has(valor)) problema ||= 'Un bus o integrante de la tripulación no puede repetirse en el lote.';
        usados.add(valor);
      }
    }
    $('batchConflicts').textContent = problema;
    return !problema;
  }

  function resumenCupo() {
    const cupos = disponibilidad.cupos;
    if (!cupos) return '';
    const partes = [];
    if (cupos.MAX_UNIDADES != null) partes.push(`${cupos.UNIDADES_USADAS || 0}/${cupos.MAX_UNIDADES} buses`);
    if (cupos.MAX_PASAJEROS != null) partes.push(`${cupos.PASAJEROS_USADOS || 0}/${cupos.MAX_PASAJEROS} pasajeros`);
    return partes.length ? `Cupo del día: ${partes.join(' · ')}` : '';
  }

  function actualizarResumen() {
    $('batchCategory').textContent = disponibilidad.categoria?.nombre || '—';
    const cupo = resumenCupo();
    $('batchSummary').textContent = disponibilidadLista
      ? `${disponibilidad.buses.length} buses y ${disponibilidad.personal.length} tripulantes disponibles.${cupo ? ` ${cupo}.` : ''}`
      : 'Consulta la disponibilidad para cargar buses y tripulación.';
  }

  function invalidarDisponibilidad() {
    disponibilidadLista = false;
    reintentoLote = null;
    disponibilidad = { buses: [], personal: [], categoria: null, cupos: null };
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
      $('assignmentStatus').textContent = 'Selecciona la frecuencia y el intervalo completo.';
      return;
    }

    const previas = recolectar();
    $('batchCheck').disabled = true;
    $('batchSubmit').disabled = true;
    $('assignmentStatus').textContent = 'Consultando disponibilidad…';
    try {
      const consulta = new URLSearchParams({
        frecuenciaId, inicio: isoEcuador(inicio), fin: isoEcuador(fin)
      });
      const datos = await request('/coop/hojas-ruta/disponibilidad?' + consulta.toString());
      disponibilidad = { buses: datos.buses || [], personal: datos.personal || [], categoria: datos.categoria || null, cupos: datos.cupos || null };
      disponibilidadLista = true;
      renderFilas(previas.length ? previas : [{}]);
      actualizarResumen();
      $('assignmentStatus').textContent = disponibilidad.buses.length && disponibilidad.personal.length
        ? 'Disponibilidad orientativa. La confirmación valida otra vez los cruces y el cupo.'
        : 'No hay buses o tripulación disponibles para ese intervalo.';
    } catch (error) {
      invalidarDisponibilidad();
      $('assignmentStatus').textContent = error.message;
    } finally {
      $('batchCheck').disabled = false;
      $('batchSubmit').disabled = !disponibilidadLista;
    }
  }

  async function confirmarLote(evento) {
    evento.preventDefault();
    if (!disponibilidadLista) {
      $('assignmentStatus').textContent = 'Vuelve a consultar la disponibilidad antes de confirmar.';
      return;
    }
    const filas = recolectar();
    if (!validarFilas()) return;

    const inicio = $('batchStart').value;
    const fin = $('batchEnd').value;
    const confirmado = await App.confirmar({
      titulo: 'Confirmar lote',
      mensaje: `Se crearán ${filas.length} hoja${filas.length === 1 ? '' : 's'} para la frecuencia ${$('batchFrequency').value}, de ${inicio.replace('T', ' ')} a ${fin.replace('T', ' ')}.`,
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
      $('assignmentStatus').innerHTML = `Lote confirmado${datos.repetido ? ' (ya estaba registrado)' : ''}: ${App.escapar(hojas.join(', ') || 'sin hojas')}. <a href="dashboard_coop.html#salidas">Ver salidas</a>`;
      $('batchRows').innerHTML = '';
      disponibilidadLista = false;
      disponibilidad = { buses: [], personal: [], categoria: null, cupos: null };
      actualizarResumen();
      renderFilas();
      $('batchSubmit').disabled = true;
    } catch (error) {
      reintentoLote = error.esRed || !error.datos ? idLote : null;
      $('assignmentStatus').textContent = error.message;
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
        ? 'Selecciona la frecuencia y el intervalo, consulta la disponibilidad y asigna bus, chofer y controlador por fila. El lote se confirma completo o se rechaza completo.'
        : 'Selecciona personal activo de tu cooperativa. Se comprobarán horarios laborales y reservas personales.';
      if (loteDisponible) {
        invalidarDisponibilidad();
        renderFilas();
      }
      loaded = true;
      $('assignmentStatus').textContent = 'Horarios en Ecuador continental (UTC−5).';
    } catch (e) {
      $('assignmentStatus').textContent = e.message;
    } finally {
      loading = false;
      $('assignmentSubmit').disabled = !loaded;
    }
  }

  $('coopAssignment').addEventListener('toggle', load);

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
      $('assignmentStatus').textContent = data.message + ' Código: ' + data.idHoja;
      $('assignmentForm').reset();
    } catch (e) {
      $('assignmentStatus').textContent = e.message;
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
    validarFilas();
  });
  $('batchRows').addEventListener('change', () => { reintentoLote = null; validarFilas(); });
  $('batchRows').addEventListener('input', () => { reintentoLote = null; });
  $('batchForm').addEventListener('submit', confirmarLote);

  request('/auth/me').then(({ usuario }) => {
    $('coopAssignment').hidden = usuario.rolId !== 'R002' || !(usuario.principal || usuario.permisos?.includes('rutas'));
  }).catch(() => {});
})();
