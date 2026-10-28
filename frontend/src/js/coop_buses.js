(() => {
  'use strict';

  const usuario = App.sesion();
  if (!usuario) return;

  const cooperativa = usuario.cooperativaId;
  const tabla = document.getElementById('tablaBuses');
  const stats = document.getElementById('statsBuses');
  const contador = document.getElementById('contadorBuses');
  const buscar = document.getElementById('buscarBus');
  const filtroEstado = document.getElementById('filtroEstado');
  const botonRecargar = document.getElementById('btnRecargar');
  const botonNuevo = document.getElementById('btnNuevoBus');

  const formBus = document.getElementById('formBus');
  const modalBus = document.getElementById('modalBus');
  const tituloModalBus = document.getElementById('tituloModalBus');
  const subtituloModalBus = document.getElementById('subtituloModalBus');
  const codigoBus = document.getElementById('codigoBus');
  const numeroBus = document.getElementById('numeroBus');
  const placaBus = document.getElementById('placaBus');
  const anioBus = document.getElementById('anioBus');
  const pisosBus = document.getElementById('pisosBus');
  const estadoBus = document.getElementById('estadoBus');
  const asientosP1 = document.getElementById('asientosP1');
  const asientosP2 = document.getElementById('asientosP2');
  const ayudaAsientosP2 = document.getElementById('ayudaAsientosP2');
  const imagenBus = document.getElementById('imagenBus');
  const avisoAsientos = document.getElementById('avisoAsientos');
  const botonGuardarBus = document.getElementById('btnGuardarBus');

  const modalAsientos = document.getElementById('modalAsientos');
  const tituloModalAsientos = document.getElementById('tituloModalAsientos');
  const subtituloModalAsientos = document.getElementById('subtituloModalAsientos');
  const mapaAsientos = document.getElementById('mapaAsientos');

  const modalTipoAsiento = document.getElementById('modalTipoAsiento');
  const infoTipoAsiento = document.getElementById('infoTipoAsiento');
  const selectTipoAsiento = document.getElementById('selectTipoAsiento');
  const botonGuardarTipo = document.getElementById('btnGuardarTipoAsiento');

  let buses = [];
  let tiposAsiento = [];
  let busEnEdicion = null;
  let busAsientosActual = null;
  let asientoSeleccionado = null;
  let asientosOriginales = { p1: 20, p2: 0 };

  const cargando = new Set();

  function actualizarStats(lista) {
    const total = lista.length;
    const activos = lista.filter((bus) => bus.EST_BUS === 'ACTIVO').length;
    const taller = lista.filter((bus) => bus.EST_BUS === 'TALLER').length;
    const inactivos = lista.filter((bus) => bus.EST_BUS === 'INACTIVO').length;
    const valores = [
      ['Buses registrados', total, '▤'],
      ['Activos', activos, '✓'],
      ['En taller', taller, '⚙'],
      ['Inactivos', inactivos, '⏸']
    ];
    stats.innerHTML = valores.map(([etiqueta, valor, icono]) => `
      <article class="stat-card">
        <div class="stat-icon" aria-hidden="true">${icono}</div>
        <div class="stat-copy">
          <div class="stat-label">${App.escapar(etiqueta)}</div>
          <div class="stat-value">${App.numero(valor)}</div>
        </div>
      </article>`).join('');
  }

  function opcionesEstado(actual) {
    return ['ACTIVO', 'TALLER', 'INACTIVO'].map((estado) => `
      <option value="${estado}" ${estado === actual ? 'selected' : ''}>${App.etiquetaEstado(estado)}</option>
    `).join('');
  }

  function filaBus(bus) {
    const asientos = Number(bus.TOTAL_ASIENTOS) || (Number(bus.ASIENTOS_P1) || 0) + (Number(bus.ASIENTOS_P2) || 0);
    return `
      <tr data-id="${App.escapar(bus.ID_BUS)}">
        <td class="mono strong">${App.escapar(bus.ID_BUS)}</td>
        <td>
          <div class="cell-main">
            <strong>Bus ${App.escapar(bus.NUM_BUS)}</strong>
            <span>${App.escapar(bus.PLA_BUS)}</span>
          </div>
        </td>
        <td>${App.escapar(bus.ANIO_BUS)}</td>
        <td>${Number(bus.NUM_PIS) === 2 ? '2 pisos' : '1 piso'}</td>
        <td>${App.numero(asientos)}</td>
        <td>${App.insignia(bus.EST_BUS)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" data-accion="editar" data-id="${App.escapar(bus.ID_BUS)}">Editar</button>
            <button class="btn btn-secondary btn-sm" type="button" data-accion="asientos" data-id="${App.escapar(bus.ID_BUS)}">Asientos</button>
            <select class="filter-select" data-estado-bus="${App.escapar(bus.ID_BUS)}" aria-label="Cambiar estado del bus ${App.escapar(bus.NUM_BUS)}">
              ${opcionesEstado(bus.EST_BUS)}
            </select>
            <button class="btn btn-danger-soft btn-sm" type="button" data-accion="baja" data-id="${App.escapar(bus.ID_BUS)}">Baja</button>
          </div>
        </td>
      </tr>`;
  }

  function render() {
    const filtrados = buses;
    contador.textContent = `${App.numero(filtrados.length)} bus${filtrados.length === 1 ? '' : 'es'}`;
    tabla.innerHTML = filtrados.length > 0
      ? filtrados.map(filaBus).join('')
      : `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">▤</div>
          <h3>No hay buses para mostrar</h3>
          <p>Registra la primera unidad de la cooperativa o ajusta los filtros de búsqueda.</p>
          <button class="btn btn-primary mt-2" type="button" data-accion="nuevo">Registrar bus</button>
        </div></td></tr>`;
  }

  async function cargar() {
    if (!cooperativa) {
      tabla.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>Tu usuario no tiene una cooperativa asociada.</p></div></td></tr>`;
      return;
    }

    App.textoBoton(botonRecargar, 'Cargando…');
    try {
      const datos = await App.api('/coop/buses', {
        query: {
          cooperativa,
          buscar: buscar.value.trim(),
          estado: filtroEstado.value
        }
      });
      buses = datos.buses || [];
      render();
      if (!buscar.value.trim() && !filtroEstado.value) {
        actualizarStats(buses);
      }
    } catch (error) {
      App.aviso(error.message, 'error');
      tabla.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudo cargar la flota</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    } finally {
      App.restaurarBoton(botonRecargar);
    }
  }

  async function cargarTiposAsiento() {
    if (tiposAsiento.length > 0) return tiposAsiento;
    const datos = await App.api('/coop/tipos-asiento');
    tiposAsiento = datos.tipos || [];
    return tiposAsiento;
  }

  function abrirNuevoBus() {
    busEnEdicion = null;
    formBus.reset();
    codigoBus.disabled = false;
    codigoBus.value = '';
    numeroBus.value = '';
    placaBus.value = '';
    anioBus.value = new Date().getFullYear();
    pisosBus.value = '1';
    estadoBus.value = 'ACTIVO';
    asientosP1.value = 20;
    asientosP2.value = 0;
    asientosP2.disabled = true;
    ayudaAsientosP2.textContent = 'Disponible solo para buses de 2 pisos.';
    imagenBus.value = '';
    avisoAsientos.classList.add('hidden');
    tituloModalBus.textContent = 'Nuevo bus';
    subtituloModalBus.textContent = 'Completa los datos de la unidad y su distribución de asientos.';
    App.abrirModal('modalBus');
  }

  function abrirEdicion(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;

    busEnEdicion = bus;
    formBus.reset();
    codigoBus.disabled = true;
    codigoBus.value = bus.ID_BUS || '';
    numeroBus.value = bus.NUM_BUS || '';
    placaBus.value = bus.PLA_BUS || '';
    anioBus.value = bus.ANIO_BUS || '';
    pisosBus.value = String(bus.NUM_PIS || 1);
    estadoBus.value = bus.EST_BUS || 'ACTIVO';
    const piso1 = Number(bus.ASIENTOS_P1) || 20;
    const totalAsientos = Number(bus.TOTAL_ASIENTOS) || piso1;
    const piso2 = Math.max(0, totalAsientos - piso1);
    asientosP1.value = piso1;
    asientosP2.value = piso2;
    asientosOriginales = { p1: piso1, p2: piso2 };
    imagenBus.value = bus.IMG_URL_BUS || '';
    actualizarPisos();
    avisoAsientos.classList.remove('hidden');
    tituloModalBus.textContent = `Editar bus ${bus.NUM_BUS}`;
    subtituloModalBus.textContent = `${bus.ID_BUS} · ${bus.PLA_BUS}`;
    App.abrirModal('modalBus');
  }

  function actualizarPisos() {
    const dosPisos = pisosBus.value === '2';
    asientosP2.disabled = !dosPisos;
    if (!dosPisos) {
      asientosP2.value = 0;
      ayudaAsientosP2.textContent = 'Disponible solo para buses de 2 pisos.';
    } else {
      if (Number(asientosP2.value) < 4) asientosP2.value = 16;
      ayudaAsientosP2.textContent = 'Mínimo 4 y máximo 60 asientos.';
    }
    if (Number(asientosP1.value) < 4) asientosP1.value = 20;
  }

  async function guardarBus(evento) {
    evento.preventDefault();
    if (!cooperativa) {
      App.aviso('No tienes una cooperativa asignada.', 'error');
      return;
    }

    const numero = numeroBus.value.trim();
    const placa = placaBus.value.trim().toUpperCase();
    const anio = Number(anioBus.value);
    const pisos = Number(pisosBus.value);
    const p1 = Number(asientosP1.value);
    const p2 = pisos === 2 ? Number(asientosP2.value) : 0;

    if (!numero || numero.length > 5) {
      App.aviso('El número del bus es obligatorio (máximo 5 caracteres).', 'error');
      return;
    }
    if (!/^[A-Z0-9-]{5,10}$/.test(placa)) {
      App.aviso('La placa debe tener entre 5 y 10 caracteres (letras, números o guion).', 'error');
      return;
    }
    if (!Number.isFinite(anio) || anio < 1980 || anio > new Date().getFullYear() + 1) {
      App.aviso('El año del bus no es válido.', 'error');
      return;
    }
    if (!Number.isFinite(p1) || p1 < 4 || p1 > 60) {
      App.aviso('El piso 1 debe tener entre 4 y 60 asientos.', 'error');
      return;
    }
    if (pisos === 2 && (!Number.isFinite(p2) || p2 < 4 || p2 > 60)) {
      App.aviso('El piso 2 debe tener entre 4 y 60 asientos.', 'error');
      return;
    }

    const cuerpo = {
      NUM_BUS: numero,
      PLA_BUS: placa,
      ANIO_BUS: anio,
      NUM_PIS: pisos,
      EST_BUS: estadoBus.value,
      IMG_URL_BUS: imagenBus.value.trim(),
      ID_COP_PER: cooperativa
    };

    if (!busEnEdicion) {
      const codigo = codigoBus.value.trim().toUpperCase();
      if (codigo) cuerpo.ID_BUS = codigo;
      cuerpo.ASIENTOS_P1 = p1;
      cuerpo.ASIENTOS_P2 = p2;
    } else {
      const cambioAsientos = p1 !== asientosOriginales.p1 || p2 !== asientosOriginales.p2;
      if (cambioAsientos) {
        cuerpo.ASIENTOS_P1 = p1;
        cuerpo.ASIENTOS_P2 = p2;
      }
    }

    App.textoBoton(botonGuardarBus, busEnEdicion ? 'Guardando…' : 'Registrando…');
    try {
      if (busEnEdicion) {
        await App.api(`/coop/buses/${encodeURIComponent(busEnEdicion.ID_BUS)}`, { method: 'PUT', body: cuerpo });
        App.aviso('Bus actualizado correctamente.', 'success');
      } else {
        const datos = await App.api('/coop/buses', { method: 'POST', body: cuerpo });
        App.aviso(datos.message || 'Bus registrado correctamente.', 'success');
      }
      App.cerrarModal('modalBus');
      await cargar();
    } catch (error) {
      App.aviso(error.message, 'error');
      if (error.datos?.codigo === 'ASIENTOS_BLOQUEADOS') {
        avisoAsientos.classList.remove('hidden');
      }
    } finally {
      App.restaurarBoton(botonGuardarBus);
    }
  }

  async function cambiarEstado(id, estado, elemento) {
    if (!estado) return;
    elemento.disabled = true;
    try {
      await App.api(`/coop/buses/${encodeURIComponent(id)}/estado`, {
        method: 'PATCH',
        body: { EST_BUS: estado }
      });
      const bus = buses.find((elementoBus) => elementoBus.ID_BUS === id);
      if (bus) bus.EST_BUS = estado;
      App.aviso(`Estado del bus actualizado a ${App.etiquetaEstado(estado)}.`, 'success');
      render();
      if (!buscar.value.trim() && !filtroEstado.value) actualizarStats(buses);
    } catch (error) {
      App.aviso(error.message, 'error');
      const bus = buses.find((elementoBus) => elementoBus.ID_BUS === id);
      if (bus) elemento.value = bus.EST_BUS;
    } finally {
      elemento.disabled = false;
    }
  }

  async function darDeBaja(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;
    const confirmado = await App.confirmar({
      titulo: 'Dar de baja el bus',
      mensaje: `El bus ${bus.NUM_BUS} (${bus.PLA_BUS}) quedará inactivo y no podrá asignarse a nuevas hojas de ruta. ¿Continuar?`,
      aceptar: 'Dar de baja',
      peligro: true
    });
    if (!confirmado) return;

    try {
      await App.api(`/coop/buses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      App.aviso('El bus fue dado de baja.', 'success');
      await cargar();
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  function renderAsientos(datos) {
    busAsientosActual = datos;
    const pisos = (datos.pisos || []).filter((piso) => (piso.asientos || []).length > 0);
    if (pisos.length === 0) {
      mapaAsientos.innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><h3>Sin asientos configurados</h3><p>Edita el bus y define la cantidad de asientos por piso.</p></div>`;
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
            return `<button class="seat ${vip ? 'vip' : ''}" type="button"
              data-asiento="${App.escapar(asiento.ID_ASI)}"
              data-etiqueta="${App.escapar(asiento.ETIQUETA)}"
              data-tipo="${App.escapar(asiento.ID_TIP_PER)}"
              data-tipo-nombre="${App.escapar(asiento.NOM_TIP || '')}"
              title="${App.escapar(asiento.ETIQUETA)} · ${App.escapar(asiento.NOM_TIP || '')} · ${App.dinero(asiento.PRE_TIP)}">
              ${App.escapar(String(asiento.NUMERO).padStart(2, '0'))}
              <small>${App.escapar((asiento.NOM_TIP || '').slice(0, 8))}</small>
            </button>`;
          }).join('')}
        </div>
      </section>`).join('')}</div>`;
  }

  async function abrirAsientos(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;
    tituloModalAsientos.textContent = `Asientos del bus ${bus.NUM_BUS}`;
    subtituloModalAsientos.textContent = `${bus.ID_BUS} · ${bus.PLA_BUS} · ${bus.NUM_PIS} piso(s)`;
    mapaAsientos.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Cargando asientos…</p></div>`;
    App.abrirModal('modalAsientos');

    try {
      await cargarTiposAsiento();
      const datos = await App.api(`/coop/buses/${encodeURIComponent(id)}/asientos`);
      renderAsientos(datos);
    } catch (error) {
      mapaAsientos.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>No se pudieron cargar los asientos</h3><p>${App.escapar(error.message)}</p></div>`;
    }
  }

  function abrirTipoAsiento(boton) {
    asientoSeleccionado = {
      id: boton.dataset.asiento,
      etiqueta: boton.dataset.etiqueta,
      tipo: boton.dataset.tipo,
      tipoNombre: boton.dataset.tipoNombre
    };
    infoTipoAsiento.textContent = `Asiento ${asientoSeleccionado.etiqueta} · Tipo actual: ${asientoSeleccionado.tipoNombre || 'sin definir'}`;
    selectTipoAsiento.innerHTML = tiposAsiento.map((tipo) => `
      <option value="${App.escapar(tipo.ID_TIP)}" ${tipo.ID_TIP === asientoSeleccionado.tipo ? 'selected' : ''}>
        ${App.escapar(tipo.NOM_TIP)} · ${App.dinero(tipo.PRE_TIP)}
      </option>`).join('');
    App.abrirModal('modalTipoAsiento');
  }

  async function guardarTipoAsiento() {
    if (!asientoSeleccionado) return;
    const tipo = selectTipoAsiento.value;
    if (!tipo) {
      App.aviso('Selecciona un tipo de asiento.', 'error');
      return;
    }
    App.textoBoton(botonGuardarTipo, 'Guardando…');
    try {
      await App.api(`/coop/asientos/${encodeURIComponent(asientoSeleccionado.id)}/tipo`, {
        method: 'PATCH',
        body: { ID_TIP_PER: tipo }
      });
      App.aviso('Tipo de asiento actualizado.', 'success');
      App.cerrarModal('modalTipoAsiento');
      if (busAsientosActual?.hoja?.ID_BUS) {
        await abrirAsientos(busAsientosActual.hoja.ID_BUS);
      } else if (busAsientosActual?.bus?.ID_BUS) {
        await abrirAsientos(busAsientosActual.bus.ID_BUS);
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(botonGuardarTipo);
    }
  }

  tabla.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    const id = boton.dataset.id;
    if (accion === 'nuevo') abrirNuevoBus();
    if (accion === 'editar') abrirEdicion(id);
    if (accion === 'asientos') abrirAsientos(id);
    if (accion === 'baja') darDeBaja(id);
  });

  tabla.addEventListener('change', (evento) => {
    const selector = evento.target.closest('[data-estado-bus]');
    if (selector) cambiarEstado(selector.dataset.estadoBus, selector.value, selector);
  });

  mapaAsientos.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-asiento]');
    if (boton) abrirTipoAsiento(boton);
  });

  pisosBus.addEventListener('change', actualizarPisos);
  formBus.addEventListener('submit', guardarBus);
  botonNuevo.addEventListener('click', abrirNuevoBus);
  botonRecargar.addEventListener('click', cargar);
  botonGuardarTipo.addEventListener('click', guardarTipoAsiento);
  filtroEstado.addEventListener('change', cargar);
  buscar.addEventListener('input', App.debounce(cargar, 380));

  cargar();
})();
