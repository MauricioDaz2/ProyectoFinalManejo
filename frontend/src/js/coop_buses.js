(async () => {
  'use strict';
  if (window.TransportSession) await window.TransportSession.ready;

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
  const plantillaModeloBus = document.getElementById('plantillaModeloBus');
  const estadoBus = document.getElementById('estadoBus');
  const asientosP1 = document.getElementById('asientosP1');
  const asientosP2 = document.getElementById('asientosP2');
  const ayudaAsientosP2 = document.getElementById('ayudaAsientosP2');
  const imagenBus = document.getElementById('imagenBus');
  const archivoImagenBus = document.getElementById('archivoImagenBus');
  const btnSeleccionarFotoBus = document.getElementById('btnSeleccionarFotoBus');
  const btnQuitarFotoBus = document.getElementById('btnQuitarFotoBus');
  const previewImagenBus = document.getElementById('previewImagenBus');
  const estadoImagenBus = document.getElementById('estadoImagenBus');
  const avisoAsientos = document.getElementById('avisoAsientos');
  const botonGuardarBus = document.getElementById('btnGuardarBus');

  const modalAsientos = document.getElementById('modalAsientos');
  const tituloModalAsientos = document.getElementById('tituloModalAsientos');
  const subtituloModalAsientos = document.getElementById('subtituloModalAsientos');
  const mapaAsientos = document.getElementById('mapaAsientos');
  const selectModeloPlantilla = document.getElementById('selectModeloPlantilla');
  const btnAplicarModeloPlantilla = document.getElementById('btnAplicarModeloPlantilla');
  const btnAgregarFilaPlantilla = document.getElementById('btnAgregarFilaPlantilla');
  const btnQuitarFilaPlantilla = document.getElementById('btnQuitarFilaPlantilla');
  const btnLimpiarPisoPlantilla = document.getElementById('btnLimpiarPisoPlantilla');
  const tabsPisosDisenador = document.getElementById('tabsPisosDisenador');
  const herramientasPlantilla = document.getElementById('herramientasPlantilla');
  const resumenPlantillaAsientos = document.getElementById('resumenPlantillaAsientos');
  const btnGuardarPlantillaAsientos = document.getElementById('btnGuardarPlantillaAsientos');

  const modalTipoAsiento = document.getElementById('modalTipoAsiento');
  const infoTipoAsiento = document.getElementById('infoTipoAsiento');
  const selectTipoAsiento = document.getElementById('selectTipoAsiento');
  const botonGuardarTipo = document.getElementById('btnGuardarTipoAsiento');

  const modalCategoriasBus = document.getElementById('modalCategoriasBus');
  const tituloModalCategoriasBus = document.getElementById('tituloModalCategoriasBus');
  const categoriasBusLista = document.getElementById('categoriasBusLista');
  const botonGuardarCategoriasBus = document.getElementById('btnGuardarCategoriasBus');

  let buses = [];
  let tiposAsiento = [];
  let busEnEdicion = null;
  let busAsientosActual = null;
  let asientoSeleccionado = null;
  let asientosOriginales = { p1: 38, p2: 0 };
  let categorias = [];
  let categoriasPorBus = new Map();
  let cc02Disponible = false;
  let busCategoriasEnEdicion = null;
  let archivoFotoPendiente = null;
  let urlPreviewTemporal = null;

  let plantillaActiva = null;
  let pisoActivoDisenador = 1;
  let herramientaActiva = 'NORMAL';
  let pintandoArrastre = false;

  const MODELOS_NOMBRE = {
    MARCO_POLO_1P: 'Marco Polo Estándar (2x2)',
    EJECUTIVO_2X1: 'Ejecutivo VIP (2x1)',
    MARCO_POLO_2P: 'Marco Polo Doble Piso',
    DESDE_CERO: 'Personalizada',
    PERSONALIZADA: 'Personalizada'
  };

  function ubicacionColumna(col) {
    if (col === 0 || col === 4) return 'VENTANA';
    if (col === 1 || col === 3) return 'PASILLO';
    return 'CENTRO';
  }

  function idTipoPorRol(rol) {
    const r = String(rol || 'NORMAL').toUpperCase();
    const encontrado = tiposAsiento.find((t) => String(t.NOM_TIP || '').toUpperCase().includes(r));
    if (encontrado) return encontrado.ID_TIP;
    if (r === 'VIP') return 'TIP02';
    if (r === 'DISCAPACIDAD') return 'TIP03';
    return 'TIP01';
  }

  function crearPisoDesdeModelo(piso, modelo, cantidadObjetivo = null) {
    const celdas = [];
    let filas = 10;
    if (cantidadObjetivo && cantidadObjetivo >= 4) {
      filas = Math.max(2, Math.min(15, Math.ceil(cantidadObjetivo / (modelo === 'EJECUTIVO_2X1' ? 3 : 4))));
    } else if (modelo === 'MARCO_POLO_2P') {
      filas = piso === 1 ? 4 : 11;
    } else if (modelo === 'EJECUTIVO_2X1') {
      filas = 9;
    }

    let asientosCreados = 0;
    const limiteAsientos = cantidadObjetivo && cantidadObjetivo >= 4 ? cantidadObjetivo : 999;

    for (let f = 1; f <= filas; f += 1) {
      for (let c = 0; c < 5; c += 1) {
        let tipoCelda = 'NORMAL';
        if (c === 2) {
          tipoCelda = 'PASILLO';
        } else if (modelo === 'EJECUTIVO_2X1' && c === 3) {
          // Filas de 1 asiento a la derecha (2x1): ventana izq (0), pasillo izq (1), pasillo central (2), vacío (3), ventana der (4)
          tipoCelda = 'PASILLO';
        } else if (modelo === 'MARCO_POLO_1P') {
          if (f === 1 && (c === 0 || c === 1)) {
            tipoCelda = 'DISCAPACIDAD';
          } else if (f === filas && (c === 3 || c === 4)) {
            tipoCelda = 'BANO';
          } else {
            tipoCelda = 'NORMAL';
          }
        } else if (modelo === 'EJECUTIVO_2X1') {
          if (f === 1 && c === 0) {
            tipoCelda = 'DISCAPACIDAD';
          } else if (f === filas && c === 4) {
            tipoCelda = 'BANO';
          } else {
            tipoCelda = 'VIP';
          }
        } else if (modelo === 'MARCO_POLO_2P') {
          if (piso === 1) {
            if (f === 1 && (c === 3 || c === 4)) tipoCelda = 'ESCALERA';
            else if (f === filas && (c === 3 || c === 4)) tipoCelda = 'BANO';
            else if (f === 1 && c === 0) tipoCelda = 'DISCAPACIDAD';
            else if (c === 3) tipoCelda = 'PASILLO';
            else tipoCelda = 'VIP';
          } else {
            if (f === 2 && (c === 3 || c === 4)) tipoCelda = 'ESCALERA';
            else if (f === 1 && (c === 0 || c === 1)) tipoCelda = 'VIP';
            else tipoCelda = 'NORMAL';
          }
        } else if (modelo === 'DESDE_CERO') {
          if (asientosCreados >= limiteAsientos) {
            tipoCelda = 'VACIO';
          } else {
            tipoCelda = 'NORMAL';
          }
        }

        if (['NORMAL', 'VIP', 'DISCAPACIDAD'].includes(tipoCelda)) {
          if (asientosCreados >= limiteAsientos) {
            tipoCelda = 'VACIO';
          } else {
            asientosCreados += 1;
          }
        }

        celdas.push({
          fila: f,
          col: c,
          tipoCelda,
          idTipo: ['NORMAL', 'VIP', 'DISCAPACIDAD'].includes(tipoCelda) ? idTipoPorRol(tipoCelda) : null,
          ubicacion: ubicacionColumna(c)
        });
      }
    }

    return { piso, filas, columnas: 5, celdas };
  }

  function generarPlantillaPorModelo(modelo, numPisos, p1Count = null, p2Count = null) {
    const pisos = [crearPisoDesdeModelo(1, modelo, p1Count)];
    if (Number(numPisos) === 2) {
      pisos.push(crearPisoDesdeModelo(2, modelo, p2Count));
    }
    return {
      modelo: modelo || 'MARCO_POLO_1P',
      pisos
    };
  }

  function construirPlantillaDesdeAsientosExistentes(datos) {
    const bus = datos.bus || {};
    const numPisos = Number(bus.NUM_PIS) === 2 ? 2 : 1;
    if (datos.plantilla && Array.isArray(datos.plantilla.pisos) && datos.plantilla.pisos.length > 0) {
      return JSON.parse(JSON.stringify(datos.plantilla));
    }
    const lista = datos.asientos || [];
    if (lista.length === 0) {
      return generarPlantillaPorModelo('MARCO_POLO_1P', numPisos);
    }
    const pisos = [];
    for (let p = 1; p <= numPisos; p += 1) {
      const asientosPiso = lista.filter((a) => Number(a.PIS_ASI) === p);
      const filas = Math.max(2, Math.ceil((asientosPiso.length || 4) / 4));
      const celdas = [];
      let idx = 0;
      for (let f = 1; f <= filas; f += 1) {
        for (let c = 0; c < 5; c += 1) {
          if (c === 2) {
            celdas.push({ fila: f, col: c, tipoCelda: 'PASILLO', idTipo: null, ubicacion: 'CENTRO' });
          } else if (idx < asientosPiso.length) {
            const a = asientosPiso[idx];
            idx += 1;
            const nom = String(a.NOM_TIP || 'NORMAL').toUpperCase();
            const tipoCelda = nom.includes('DISCAP') ? 'DISCAPACIDAD' : (nom.includes('VIP') || nom.includes('CAMA') ? 'VIP' : 'NORMAL');
            celdas.push({
              fila: f,
              col: c,
              tipoCelda,
              idTipo: a.ID_TIP_PER || idTipoPorRol(tipoCelda),
              idAsiento: a.ID_ASI,
              ubicacion: a.UBI_ASI || ubicacionColumna(c)
            });
          } else {
            celdas.push({ fila: f, col: c, tipoCelda: 'VACIO', idTipo: null, ubicacion: ubicacionColumna(c) });
          }
        }
      }
      pisos.push({ piso: p, filas, columnas: 5, celdas });
    }
    return { modelo: bus.MOD_PLA_BUS || 'PERSONALIZADA', pisos };
  }

  function contarAsientosPlantilla(plantilla) {
    if (!plantilla || !Array.isArray(plantilla.pisos)) return { p1: 0, p2: 0, total: 0 };
    let p1 = 0;
    let p2 = 0;
    for (const p of plantilla.pisos) {
      const n = (p.celdas || []).filter((c) => ['NORMAL', 'VIP', 'DISCAPACIDAD'].includes(c.tipoCelda)).length;
      if (Number(p.piso) === 2) p2 += n;
      else p1 += n;
    }
    return { p1, p2, total: p1 + p2 };
  }

  function resolverUrlImagen(url) {
    if (!url) return '';
    if (/^(https?:|blob:|data:)/i.test(url)) return url;
    const base = window.API_BASE_URL ? new URL(window.API_BASE_URL).origin : window.location.origin;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  function renderPreviewFoto(url, textoEstado = '') {
    const resuelta = resolverUrlImagen(url);
    if (resuelta) {
      previewImagenBus.innerHTML = `<img src="${App.escapar(resuelta)}" alt="Vista previa del bus">`;
      btnQuitarFotoBus?.classList.remove('hidden');
    } else {
      previewImagenBus.innerHTML = '<span class="muted">Sin foto</span>';
      btnQuitarFotoBus?.classList.add('hidden');
    }
    if (estadoImagenBus) {
      estadoImagenBus.textContent = textoEstado || 'Formatos admitidos: JPG, PNG o WebP (máx. 5 MB).';
    }
  }

  function limpiarFotoSeleccionada() {
    archivoFotoPendiente = null;
    if (urlPreviewTemporal) {
      URL.revokeObjectURL(urlPreviewTemporal);
      urlPreviewTemporal = null;
    }
    if (archivoImagenBus) archivoImagenBus.value = '';
    imagenBus.value = '';
    renderPreviewFoto('');
  }

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

  function celdaCategorias(bus) {
    const asignadas = categoriasPorBus.get(bus.ID_BUS) || [];
    if (!cc02Disponible || asignadas.length === 0) return '<span class="muted">Sin asignar</span>';
    const id = asignadas[0];
    const categoria = categorias.find((elemento) => elemento.ID_CAT === id);
    return `<span class="badge badge-info">${App.escapar(categoria?.NOM_CAT || id)}</span>`;
  }

  function miniaturaBus(bus) {
    const url = resolverUrlImagen(bus.IMG_URL_BUS);
    if (!url) {
      return '<div class="bus-thumb-placeholder" aria-label="Sin fotografía">🚌</div>';
    }
    return `<img class="bus-thumb" src="${App.escapar(url)}" alt="Unidad ${App.escapar(bus.NUM_BUS)}" loading="lazy">`;
  }

  function filaBus(bus) {
    const asientos = Number(bus.TOTAL_ASIENTOS) || (Number(bus.ASIENTOS_P1) || 0) + (Number(bus.ASIENTOS_P2) || 0);
    const modeloTexto = MODELOS_NOMBRE[bus.MOD_PLA_BUS] || bus.MOD_PLA_BUS || 'Marco Polo Estándar';
    return `
      <tr data-id="${App.escapar(bus.ID_BUS)}">
        <td>${miniaturaBus(bus)}</td>
        <td>
          <div class="cell-main">
            <strong>Unidad N° ${App.escapar(bus.NUM_BUS)}</strong>
            <span>Placa ${App.escapar(bus.PLA_BUS)}</span>
          </div>
        </td>
        <td>${App.escapar(bus.ANIO_BUS)}</td>
        <td>
          <div class="cell-main">
            <strong>${Number(bus.NUM_PIS) === 2 ? '2 pisos' : '1 piso'}</strong>
            <span>${App.escapar(modeloTexto)}</span>
          </div>
        </td>
        <td>${App.numero(asientos)} plazas</td>
        <td>${celdaCategorias(bus)}</td>
        <td>${App.insignia(bus.EST_BUS)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" data-accion="editar" data-id="${App.escapar(bus.ID_BUS)}">Editar</button>
            ${cc02Disponible ? `<button class="btn btn-secondary btn-sm" type="button" data-accion="categorias" data-id="${App.escapar(bus.ID_BUS)}">Categoría</button>` : ''}
            <button class="btn btn-secondary btn-sm" type="button" data-accion="asientos" data-id="${App.escapar(bus.ID_BUS)}">Plantilla de asientos</button>
            <select class="filter-select" data-estado-bus="${App.escapar(bus.ID_BUS)}" aria-label="Cambiar estado de la unidad ${App.escapar(bus.NUM_BUS)}">
              ${opcionesEstado(bus.EST_BUS)}
            </select>
            <button class="btn btn-danger-soft btn-sm" type="button" data-accion="baja" data-id="${App.escapar(bus.ID_BUS)}">Baja</button>
          </div>
        </td>
      </tr>`;
  }

  function render() {
    const filtrados = buses;
    contador.textContent = `${App.numero(filtrados.length)} unidad${filtrados.length === 1 ? '' : 'es'}`;
    tabla.innerHTML = filtrados.length > 0
      ? filtrados.map(filaBus).join('')
      : `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">▤</div>
          <h3>No hay buses para mostrar</h3>
          <p>Registra la primera unidad de la cooperativa o ajusta los filtros de búsqueda.</p>
          <button class="btn btn-primary mt-2" type="button" data-accion="nuevo">Registrar bus</button>
        </div></td></tr>`;
  }

  async function cargarCategorias() {
    if (!cooperativa) return;
    try {
      const datos = await App.api('/coop/categorias-operativas');
      categorias = datos.categorias || [];
      categoriasPorBus = new Map((datos.buses || []).map((bus) => [bus.ID_BUS, bus.categorias || []]));
      cc02Disponible = true;
    } catch (error) {
      if (!['LOTES_NO_HABILITADOS', 'CC01_REQUERIDO'].includes(error.datos?.code)) {
        console.warn('No se pudieron cargar las categorías operativas.', error);
      }
      cc02Disponible = false;
    }
  }

  function abrirCategorias(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;
    busCategoriasEnEdicion = bus;
    const asignadaActual = (categoriasPorBus.get(id) || [])[0] || '';
    tituloModalCategoriasBus.textContent = `Categoría de la unidad N° ${bus.NUM_BUS}`;
    categoriasBusLista.innerHTML = categorias.length
      ? [
          `<label class="category-choice">
            <input type="radio" name="categoriaUnicaBus" value="" ${!asignadaActual ? 'checked' : ''}>
            <span>Sin categoría asignada</span>
          </label>`,
          ...categorias.map((categoria) => `
          <label class="category-choice">
            <input type="radio" name="categoriaUnicaBus" value="${App.escapar(categoria.ID_CAT)}" ${asignadaActual === categoria.ID_CAT ? 'checked' : ''}>
            <span>${App.escapar(categoria.NOM_CAT)}</span>
          </label>`)
        ].join('')
      : '<p class="muted">No hay categorías operativas configuradas.</p>';
    App.abrirModal('modalCategoriasBus');
  }

  async function guardarCategoriasBus() {
    if (!busCategoriasEnEdicion) return;
    const seleccionado = categoriasBusLista.querySelector('input[name="categoriaUnicaBus"]:checked');
    const valores = seleccionado && seleccionado.value ? [seleccionado.value] : [];
    App.textoBoton(botonGuardarCategoriasBus, 'Guardando…');
    try {
      await App.api(`/coop/buses/${encodeURIComponent(busCategoriasEnEdicion.ID_BUS)}/categorias`, {
        method: 'PUT',
        body: { categorias: valores }
      });
      categoriasPorBus.set(busCategoriasEnEdicion.ID_BUS, valores);
      App.cerrarModal('modalCategoriasBus');
      render();
      App.aviso('Categoría del bus actualizada.', 'success');
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(botonGuardarCategoriasBus);
    }
  }

  async function cargar() {
    if (!cooperativa) {
      tabla.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>Tu usuario no tiene una cooperativa asociada.</p></div></td></tr>`;
      return;
    }

    App.textoBoton(botonRecargar, 'Cargando…');
    try {
      const [datos] = await Promise.all([
        App.api('/coop/buses', {
          query: {
            cooperativa,
            buscar: buscar.value.trim(),
            estado: filtroEstado.value
          }
        }),
        cargarCategorias()
      ]);
      buses = datos.buses || [];
      render();
      if (!buscar.value.trim() && !filtroEstado.value) {
        actualizarStats(buses);
      }
    } catch (error) {
      App.aviso(error.message, 'error');
      tabla.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudo cargar la flota</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
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

  function sincronizarConteosPorModeloModal() {
    if (!plantillaModeloBus) return;
    const modelo = plantillaModeloBus.value;
    if (modelo === 'MARCO_POLO_2P') {
      pisosBus.value = '2';
    }
    const dosPisos = pisosBus.value === '2';
    asientosP2.disabled = !dosPisos;
    if (modelo !== 'DESDE_CERO') {
      const plant = generarPlantillaPorModelo(modelo, dosPisos ? 2 : 1);
      const conteo = contarAsientosPlantilla(plant);
      asientosP1.value = conteo.p1;
      asientosP2.value = dosPisos ? conteo.p2 : 0;
    } else {
      if (!dosPisos) asientosP2.value = 0;
      else if (Number(asientosP2.value) < 4) asientosP2.value = 20;
    }
    ayudaAsientosP2.textContent = dosPisos ? 'Mínimo 4 y máximo 60 asientos.' : 'Disponible solo para buses de 2 pisos.';
  }

  const templateSelect = document.getElementById('busPlantillaGuardada');
  const templateEdit = document.getElementById('busPlantillaEdicion');
  const templateName = document.getElementById('busPlantillaNombre');
  const crewFields = {ID_CHO_1:'R006',ID_CHO_2:'R006',ID_CON_DEF:'R004'};
  let catalog = [], crewReady = false;
  function option(value,label) {
    const node = document.createElement('option');
    node.value=value;node.textContent=label;return node;
  }
  async function loadTemplates(bus=null) {
    if (!templateSelect) return;
    crewReady=false;
    try {
      const {plantillas,personal}=await App.api('/coop/plantillas-bus');
      catalog=plantillas;
      for(const [select,title] of [[templateSelect,'Usar modelo base'],[templateEdit,'Nueva plantilla']]){
        select.replaceChildren(option('',title),...catalog.map(row=>option(row.ID_PLA,row.NOM_PLA)));
      }
      templateName.value='';
      for(const [field,role] of Object.entries(crewFields)){
        const select=document.getElementById(field);
        select.replaceChildren(option('','Sin asignar'),...personal.filter(u=>u.ID_ROL_PER===role).map(u=>option(u.ID_USU,[u.NOM_USU,u.APE_USU].join(' '))));
        if(bus?.[field]&&!personal.some(u=>u.ID_USU===bus[field]))select.append(option(bus[field],'Asignaci?n anterior'));
        select.value=bus?.[field]||'';
      }
      crewReady=true;
    }catch(error){App.aviso(error.message,'error');}
  }
  templateSelect?.addEventListener('change',()=>{
    const saved=catalog.find(row=>String(row.ID_PLA)===templateSelect.value);
    if(!saved)return;
    pisosBus.value=String(saved.NUM_PIS);
    actualizarPisos();
    const count=contarAsientosPlantilla(saved.PLANTILLA);
    asientosP1.value=count.p1;asientosP2.value=count.p2;
  });
  templateEdit?.addEventListener('change',()=>{
    const saved=catalog.find(row=>String(row.ID_PLA)===templateEdit.value);
    templateName.value=saved?.NOM_PLA||'';
    if(saved){
      plantillaActiva=JSON.parse(JSON.stringify(saved.PLANTILLA));
      pisoActivoDisenador=1;
      renderDisenadorPlantilla();
    }
  });
  document.getElementById('busPlantillaGuardar')?.addEventListener('click',async()=>{
    if(!plantillaActiva||!templateName.value.trim()){App.aviso('Indica el nombre de la plantilla.','error');return;}
    const id=templateEdit.value;
    try{
      await App.api('/coop/plantillas-bus'+(id?'/'+id:''),{method:id?'PUT':'POST',body:{NOM_PLA:templateName.value,PLANTILLA:plantillaActiva}});
      await loadTemplates();App.aviso('Plantilla guardada.','success');
    }catch(error){App.aviso(error.message,'error');}
  });
  document.getElementById('busPlantillaEliminar')?.addEventListener('click',async()=>{
    const id=templateEdit.value;
    if(!id||!window.confirm('?Eliminar esta plantilla del cat?logo?'))return;
    try{
      await App.api('/coop/plantillas-bus/'+id,{method:'DELETE'});
      await loadTemplates();App.aviso('Plantilla eliminada.','success');
    }catch(error){App.aviso(error.message,'error');}
  });

  function abrirNuevoBus() {
    busEnEdicion = null;
    formBus.reset();
    codigoBus.value = '';
    numeroBus.value = '';
    placaBus.value = '';
    anioBus.value = new Date().getFullYear();
    pisosBus.value = '1';
    if (plantillaModeloBus) plantillaModeloBus.value = 'MARCO_POLO_1P';
    estadoBus.value = 'ACTIVO';
    asientosP1.value = 38;
    asientosP2.value = 0;
    asientosP2.disabled = true;
    ayudaAsientosP2.textContent = 'Disponible solo para buses de 2 pisos.';
    limpiarFotoSeleccionada();
    avisoAsientos.classList.add('hidden');
    tituloModalBus.textContent = 'Nuevo bus';
    subtituloModalBus.textContent = 'Completa los datos de la unidad, su fotografía local y la plantilla base de asientos.';
    if(templateSelect){templateSelect.disabled=false;loadTemplates();}
    App.abrirModal('modalBus');
  }

  function abrirEdicion(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;

    busEnEdicion = bus;
    formBus.reset();
    codigoBus.value = bus.ID_BUS || '';
    numeroBus.value = bus.NUM_BUS || '';
    placaBus.value = bus.PLA_BUS || '';
    anioBus.value = bus.ANIO_BUS || '';
    pisosBus.value = String(bus.NUM_PIS || 1);
    if (plantillaModeloBus) plantillaModeloBus.value = bus.MOD_PLA_BUS && MODELOS_NOMBRE[bus.MOD_PLA_BUS] ? bus.MOD_PLA_BUS : 'DESDE_CERO';
    estadoBus.value = bus.EST_BUS || 'ACTIVO';
    const piso1 = Number(bus.ASIENTOS_P1) || 20;
    const totalAsientos = Number(bus.TOTAL_ASIENTOS) || piso1;
    const piso2 = Math.max(0, totalAsientos - piso1);
    asientosP1.value = piso1;
    asientosP2.value = piso2;
    asientosOriginales = { p1: piso1, p2: piso2, pisos: Number(bus.NUM_PIS || 1), modelo: plantillaModeloBus?.value };
    archivoFotoPendiente = null;
    imagenBus.value = bus.IMG_URL_BUS || '';
    renderPreviewFoto(bus.IMG_URL_BUS || '', bus.IMG_URL_BUS ? 'Fotografía actual cargada.' : '');
    actualizarPisos();
    avisoAsientos.classList.remove('hidden');
    tituloModalBus.textContent = `Editar unidad N° ${bus.NUM_BUS}`;
    if(templateSelect){templateSelect.disabled=true;loadTemplates(bus);}
    subtituloModalBus.textContent = `Placa ${bus.PLA_BUS} · Año ${bus.ANIO_BUS}`;
    App.abrirModal('modalBus');
  }

  function actualizarPisos() {
    const dosPisos = pisosBus.value === '2';
    asientosP2.disabled = !dosPisos;
    if (!dosPisos) {
      asientosP2.value = 0;
      ayudaAsientosP2.textContent = 'Disponible solo para buses de 2 pisos.';
      if (plantillaModeloBus && plantillaModeloBus.value === 'MARCO_POLO_2P') {
        plantillaModeloBus.value = 'MARCO_POLO_1P';
      }
    } else {
      if (Number(asientosP2.value) < 4) asientosP2.value = 20;
      ayudaAsientosP2.textContent = 'Mínimo 4 y máximo 60 asientos.';
    }
    if (Number(asientosP1.value) < 4) asientosP1.value = 20;
  }

  async function subirArchivoFotoSiExiste() {
    if (!archivoFotoPendiente) return imagenBus.value.trim();
    const formData = new FormData();
    formData.append('imagen', archivoFotoPendiente);
    const respuesta = await fetch(`${window.API_BASE_URL || '/api'}/coop/buses/imagen`, {
      method: 'POST',
      body: formData
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !datos.success) {
      throw new Error(datos.message || 'No se pudo cargar la fotografía del bus.');
    }
    archivoFotoPendiente = null;
    imagenBus.value = datos.url;
    return datos.url;
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
    const modelo = plantillaModeloBus ? plantillaModeloBus.value : 'MARCO_POLO_1P';

    if (!numero || numero.length > 5) {
      App.aviso('El número de la unidad es obligatorio (máximo 5 caracteres).', 'error');
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

    App.textoBoton(botonGuardarBus, busEnEdicion ? 'Guardando…' : 'Registrando…');
    try {
      await cargarTiposAsiento().catch(() => {});
      const urlFoto = await subirArchivoFotoSiExiste();

      const cuerpo = {
        NUM_BUS: numero,
        PLA_BUS: placa,
        ANIO_BUS: anio,
        NUM_PIS: pisos,
        EST_BUS: estadoBus.value,
        IMG_URL_BUS: urlFoto,
        ID_COP_PER: cooperativa
      };

      if(crewReady)for(const field of Object.keys(crewFields)){
        const value=document.getElementById(field).value;
        if(!busEnEdicion||value!==(busEnEdicion[field]||''))cuerpo[field]=value||null;
      }
      if (!busEnEdicion) {
        const saved=catalog.find(row=>String(row.ID_PLA)===templateSelect?.value);
        if(saved&&saved.NUM_PIS!==pisos)throw new Error('Selecciona una plantilla compatible con el n?mero de pisos.');
        const plantillaGenerada = saved?.PLANTILLA || generarPlantillaPorModelo(
          modelo,
          pisos,
          modelo === 'DESDE_CERO' ? p1 : null,
          modelo === 'DESDE_CERO' ? p2 : null
        );
        const conteo = contarAsientosPlantilla(plantillaGenerada);
        cuerpo.ASIENTOS_P1 = conteo.p1;
        cuerpo.ASIENTOS_P2 = pisos === 2 ? conteo.p2 : 0;
        cuerpo.MOD_PLA_BUS = saved ? 'PERSONALIZADA' : modelo;
        cuerpo.PLANTILLA = plantillaGenerada;
      } else {
        const cambioAsientos = p1 !== asientosOriginales.p1
          || p2 !== asientosOriginales.p2
          || pisos !== asientosOriginales.pisos
          || (plantillaModeloBus && modelo !== asientosOriginales.modelo);
        if (cambioAsientos) {
          const plantillaGenerada = generarPlantillaPorModelo(
            modelo,
            pisos,
            modelo === 'DESDE_CERO' ? p1 : null,
            modelo === 'DESDE_CERO' ? p2 : null
          );
          const conteo = contarAsientosPlantilla(plantillaGenerada);
          cuerpo.ASIENTOS_P1 = conteo.p1;
          cuerpo.ASIENTOS_P2 = pisos === 2 ? conteo.p2 : 0;
          cuerpo.MOD_PLA_BUS = modelo;
          cuerpo.PLANTILLA = plantillaGenerada;
        }
      }

      if (busEnEdicion) {
        await App.api(`/coop/buses/${encodeURIComponent(busEnEdicion.ID_BUS)}`, { method: 'PUT', body: cuerpo });
        App.aviso('Unidad actualizada correctamente.', 'success');
      } else {
        const datos = await App.api('/coop/buses', { method: 'POST', body: cuerpo });
        App.aviso(datos.message || 'Unidad registrada correctamente.', 'success');
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
      mensaje: `La unidad N° ${bus.NUM_BUS} (Placa ${bus.PLA_BUS}) quedará inactiva y no podrá asignarse a nuevas hojas de ruta. ¿Continuar?`,
      aceptar: 'Dar de baja',
      peligro: true
    });
    if (!confirmado) return;

    try {
      await App.api(`/coop/buses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      App.aviso('La unidad fue dada de baja.', 'success');
      await cargar();
    } catch (error) {
      App.aviso(error.message, 'error');
    }
  }

  /* ----------------- Diseñador de Plantilla de Asientos ----------------- */

  function etiquetaCeldaEspecial(tipo) {
    switch (tipo) {
      case 'PASILLO': return '<span class="cell-special-icon">🚶</span><small>Pasillo</small>';
      case 'BANO': return '<span class="cell-special-icon">🚻</span><small>Baño WC</small>';
      case 'ESCALERA': return '<span class="cell-special-icon">🪜</span><small>Escalera</small>';
      case 'VACIO': return '<span class="cell-special-icon">🚫</span><small>Bloqueado</small>';
      default: return '';
    }
  }

  function renderTabsPisosDisenador(pisos) {
    if (!tabsPisosDisenador) return;
    if (pisos.length <= 1) {
      tabsPisosDisenador.innerHTML = `
        <div class="designer-floor-bar">
          <span class="floor-pill active">🚌 Piso 1 · Planta única (${contarAsientosPlantilla(plantillaActiva).p1} asientos)</span>
          <span class="designer-hint">💡 Haz clic o mantén presionado y arrastra sobre los asientos para pintarlos rápidamente.</span>
        </div>`;
      return;
    }
    const conteo = contarAsientosPlantilla(plantillaActiva);
    tabsPisosDisenador.innerHTML = `
      <div class="designer-floor-bar">
        <div class="floor-pill-group" role="tablist" aria-label="Pisos del bus">
          ${pisos.map((p) => {
            const n = Number(p.piso) || 1;
            const activo = n === pisoActivoDisenador;
            const cant = n === 2 ? conteo.p2 : conteo.p1;
            return `<button type="button" role="tab" aria-selected="${activo}" class="floor-pill ${activo ? 'active' : ''}" data-select-piso="${n}">
              ${n === 1 ? '🚌 Piso 1 · Planta Baja' : '🚍 Piso 2 · Planta Alta Panoramic'} <strong>(${cant} asientos)</strong>
            </button>`;
          }).join('')}
        </div>
        <span class="designer-hint">💡 Haz clic o arrastra sobre el plano del bus para aplicar la herramienta seleccionada.</span>
      </div>`;
  }

  function renderDisenadorPlantilla() {
    if (!plantillaActiva || !Array.isArray(plantillaActiva.pisos)) return;
    const pisos = plantillaActiva.pisos;
    if (!pisos.some((p) => Number(p.piso) === pisoActivoDisenador)) {
      pisoActivoDisenador = Number(pisos[0]?.piso) || 1;
    }

    renderTabsPisosDisenador(pisos);

    const conteo = contarAsientosPlantilla(plantillaActiva);
    if (resumenPlantillaAsientos) {
      resumenPlantillaAsientos.innerHTML = pisos.length === 2
        ? `<strong>Total unidad: ${conteo.total} asientos</strong> · Piso 1: ${conteo.p1} · Piso 2: ${conteo.p2}`
        : `<strong>Total configurado: ${conteo.p1} asientos comerciales</strong>`;
    }

    const pisoObj = pisos.find((p) => Number(p.piso) === pisoActivoDisenador) || pisos[0];
    const numPiso = Number(pisoObj.piso) || 1;
    let contadorAsiento = 0;
    const celdasOrdenadas = [...(pisoObj.celdas || [])].sort((a, b) => (a.fila - b.fila) || (a.col - b.col));
    const totalFilas = pisoObj.filas || Math.ceil(celdasOrdenadas.length / 5);
    const filasMap = new Map();
    for (const celda of celdasOrdenadas) {
      if (!filasMap.has(celda.fila)) filasMap.set(celda.fila, []);
      filasMap.get(celda.fila).push(celda);
    }

    mapaAsientos.innerHTML = `
      <div class="bus-chassis-wrapper">
        <div class="bus-chassis" data-floor-box="${numPiso}">
          <div class="bus-mirror bus-mirror-left" aria-hidden="true"></div>
          <div class="bus-mirror bus-mirror-right" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-fl" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-fr" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-rl" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-rr" aria-hidden="true"></div>

          <div class="bus-nose">
            <div class="bus-headlights"><span class="headlight"></span><span class="bus-grille">══════</span><span class="headlight"></span></div>
            <div class="bus-windshield-curve">PARABRISAS FRONTAL · ${numPiso === 1 ? 'PLANTA BAJA' : 'PLANTA ALTA PANORÁMICA'}</div>
            <div class="bus-cockpit">
              <div class="cockpit-driver">
                <span class="steering-wheel">🛞</span>
                <div>
                  <strong>Cabina del Chofer</strong>
                  <small>${numPiso === 1 ? 'Volante y panel de instrumentos' : 'Mirador delantero superior'}</small>
                </div>
              </div>
              <div class="cockpit-door">
                <span>🚪</span>
                <div>
                  <strong>${numPiso === 1 ? 'Puerta de Abordaje' : 'Acceso Escalera'}</strong>
                  <small>Gradas de ingreso</small>
                </div>
              </div>
            </div>
          </div>

          <div class="bus-cabin-body">
            <div class="bus-columns-guide">
              <span class="col-row-tag">Fila</span>
              <span>🪟 Ventana Izq.</span>
              <span>🚶 Pasillo Izq.</span>
              <span>⇅ Corredor</span>
              <span>🚶 Pasillo Der.</span>
              <span>🪟 Ventana Der.</span>
            </div>

            <div class="bus-rows-container">
              ${Array.from(filasMap.entries()).map(([numFila, celdasFila]) => `
                <div class="bus-chassis-row">
                  <span class="row-number-badge" title="Fila ${numFila}">F${numFila}</span>
                  ${celdasFila.map((celda) => {
                    const esAsiento = ['NORMAL', 'VIP', 'DISCAPACIDAD'].includes(celda.tipoCelda);
                    let contenido = '';
                    let claseExtra = '';
                    if (esAsiento) {
                      contadorAsiento += 1;
                      const etiqueta = `${numPiso}${String(contadorAsiento).padStart(2, '0')}`;
                      if (celda.tipoCelda === 'VIP') claseExtra = 'vip';
                      else if (celda.tipoCelda === 'DISCAPACIDAD') claseExtra = 'disability';
                      const sub = celda.tipoCelda === 'DISCAPACIDAD'
                        ? '♿ Discap.'
                        : (celda.tipoCelda === 'VIP' ? '⭐ VIP/Cama' : (celda.ubicacion === 'VENTANA' ? '🪟 Ventana' : '🚶 Pasillo'));
                      contenido = `
                        <span class="seat-backrest" aria-hidden="true"></span>
                        <strong class="seat-number">${App.escapar(etiqueta)}</strong>
                        <small class="seat-sub">${App.escapar(sub)}</small>`;
                    } else {
                      claseExtra = `cell-${celda.tipoCelda.toLowerCase()}`;
                      contenido = etiquetaCeldaEspecial(celda.tipoCelda);
                    }

                    return `<button class="seat template-cell ${claseExtra}" type="button"
                      data-celda-piso="${numPiso}"
                      data-celda-fila="${celda.fila}"
                      data-celda-col="${celda.col}"
                      title="Fila ${celda.fila} · ${celda.ubicacion || ''} (Clic para cambiar a ${herramientaActiva})">
                      ${contenido}
                    </button>`;
                  }).join('')}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bus-tail">
            <span>🚨 Salida de emergencia posterior · Motor trasero · ${totalFilas} filas configuradas</span>
            <div class="bus-taillights"><span class="taillight"></span><span class="taillight"></span></div>
          </div>
        </div>
      </div>`;
  }

  function modificarCeldaPlantilla(piso, fila, col) {
    if (!plantillaActiva) return;
    pisoActivoDisenador = Number(piso) || 1;
    const pisoObj = plantillaActiva.pisos.find((p) => Number(p.piso) === pisoActivoDisenador);
    if (!pisoObj) return;
    const celda = pisoObj.celdas.find((c) => Number(c.fila) === Number(fila) && Number(c.col) === Number(col));
    if (!celda) return;

    celda.tipoCelda = herramientaActiva;
    celda.ubicacion = ubicacionColumna(Number(col));
    celda.idTipo = ['NORMAL', 'VIP', 'DISCAPACIDAD'].includes(herramientaActiva) ? idTipoPorRol(herramientaActiva) : null;
    plantillaActiva.modelo = 'PERSONALIZADA';
    renderDisenadorPlantilla();
  }

  function agregarFilaDisenador() {
    if (!plantillaActiva) return;
    const pisoObj = plantillaActiva.pisos.find((p) => Number(p.piso) === pisoActivoDisenador) || plantillaActiva.pisos[0];
    if (!pisoObj) return;
    const maxFila = pisoObj.celdas.reduce((m, c) => Math.max(m, Number(c.fila) || 0), 0);
    if (maxFila >= 16) {
      App.aviso('Se alcanzó el máximo de 16 filas por piso.', 'warning');
      return;
    }
    const nuevaFila = maxFila + 1;
    for (let c = 0; c < 5; c += 1) {
      const esPasillo = c === 2;
      pisoObj.celdas.push({
        fila: nuevaFila,
        col: c,
        tipoCelda: esPasillo ? 'PASILLO' : 'NORMAL',
        idTipo: esPasillo ? null : idTipoPorRol('NORMAL'),
        ubicacion: ubicacionColumna(c)
      });
    }
    pisoObj.filas = nuevaFila;
    renderDisenadorPlantilla();
  }

  function quitarFilaDisenador() {
    if (!plantillaActiva) return;
    const pisoObj = plantillaActiva.pisos.find((p) => Number(p.piso) === pisoActivoDisenador) || plantillaActiva.pisos[0];
    if (!pisoObj) return;
    const maxFila = pisoObj.celdas.reduce((m, c) => Math.max(m, Number(c.fila) || 0), 0);
    if (maxFila <= 2) {
      App.aviso('Cada piso debe conservar al menos 2 filas.', 'warning');
      return;
    }
    pisoObj.celdas = pisoObj.celdas.filter((c) => Number(c.fila) < maxFila);
    pisoObj.filas = maxFila - 1;
    renderDisenadorPlantilla();
  }

  async function abrirAsientos(id) {
    const bus = buses.find((elemento) => elemento.ID_BUS === id);
    if (!bus) return;
    tituloModalAsientos.textContent = `Estructura y plantilla · Unidad N° ${bus.NUM_BUS}`;
    subtituloModalAsientos.textContent = `Placa ${bus.PLA_BUS} · ${bus.NUM_PIS} piso(s) · Haz clic en cualquier espacio para personalizarlo`;
    mapaAsientos.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Cargando estructura del bus…</p></div>`;
    App.abrirModal('modalAsientos');
    loadTemplates();

    try {
      await cargarTiposAsiento();
      const datos = await App.api(`/coop/buses/${encodeURIComponent(id)}/asientos`);
      busAsientosActual = datos;
      pisoActivoDisenador = 1;
      plantillaActiva = construirPlantillaDesdeAsientosExistentes(datos);
      if (selectModeloPlantilla) {
        selectModeloPlantilla.value = MODELOS_NOMBRE[plantillaActiva.modelo] && plantillaActiva.modelo !== 'PERSONALIZADA'
          ? plantillaActiva.modelo
          : (Number(bus.NUM_PIS) === 2 ? 'MARCO_POLO_2P' : 'MARCO_POLO_1P');
      }
      renderDisenadorPlantilla();
    } catch (error) {
      mapaAsientos.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>No se pudo cargar la plantilla</h3><p>${App.escapar(error.message)}</p></div>`;
    }
  }

  async function guardarPlantillaCompleta() {
    const idBus = busAsientosActual?.bus?.ID_BUS;
    if (!idBus || !plantillaActiva) return;
    const conteo = contarAsientosPlantilla(plantillaActiva);
    if (conteo.p1 < 4 || conteo.p1 > 60) {
      App.aviso('El piso 1 debe tener entre 4 y 60 asientos habilitados.', 'error');
      return;
    }
    if (Number(busAsientosActual.bus.NUM_PIS) === 2 && (conteo.p2 < 4 || conteo.p2 > 60)) {
      App.aviso('El piso 2 debe tener entre 4 y 60 asientos habilitados.', 'error');
      return;
    }

    App.textoBoton(btnGuardarPlantillaAsientos, 'Guardando plantilla…');
    try {
      const res = await App.api(`/coop/buses/${encodeURIComponent(idBus)}/plantilla`, {
        method: 'PUT',
        body: {
          MOD_PLA_BUS: plantillaActiva.modelo || 'PERSONALIZADA',
          PLANTILLA: plantillaActiva
        }
      });
      App.aviso(res.message || 'Plantilla de asientos actualizada.', 'success');
      App.cerrarModal('modalAsientos');
      await cargar();
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(btnGuardarPlantillaAsientos);
    }
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
      if (busAsientosActual?.bus?.ID_BUS) {
        await abrirAsientos(busAsientosActual.bus.ID_BUS);
      }
    } catch (error) {
      App.aviso(error.message, 'error');
    } finally {
      App.restaurarBoton(botonGuardarTipo);
    }
  }

  /* ------------------------------ Eventos ------------------------------ */

  btnSeleccionarFotoBus?.addEventListener('click', () => archivoImagenBus?.click());

  archivoImagenBus?.addEventListener('change', () => {
    const file = archivoImagenBus.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      App.aviso('Selecciona una imagen en formato JPG, PNG o WebP.', 'error');
      archivoImagenBus.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      App.aviso('La imagen supera el límite de 5 MB.', 'error');
      archivoImagenBus.value = '';
      return;
    }
    archivoFotoPendiente = file;
    if (urlPreviewTemporal) URL.revokeObjectURL(urlPreviewTemporal);
    urlPreviewTemporal = URL.createObjectURL(file);
    renderPreviewFoto(urlPreviewTemporal, `Archivo seleccionado: ${file.name} (${Math.round(file.size / 1024)} KB)`);
  });

  btnQuitarFotoBus?.addEventListener('click', limpiarFotoSeleccionada);

  plantillaModeloBus?.addEventListener('change', sincronizarConteosPorModeloModal);

  herramientasPlantilla?.addEventListener('click', (evento) => {
    const chip = evento.target.closest('[data-tool]');
    if (!chip) return;
    herramientaActiva = chip.dataset.tool;
    herramientasPlantilla.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn === chip);
    });
  });

  function aplicarModeloActual() {
    if (!busAsientosActual?.bus) return;
    const modelo = selectModeloPlantilla?.value || 'MARCO_POLO_1P';
    const numPisos = Number(busAsientosActual.bus.NUM_PIS) === 2 ? 2 : 1;
    plantillaActiva = generarPlantillaPorModelo(modelo, numPisos);
    renderDisenadorPlantilla();
  }

  function limpiarPisoActivo() {
    if (!plantillaActiva) return;
    const pisoObj = plantillaActiva.pisos.find((p) => Number(p.piso) === pisoActivoDisenador) || plantillaActiva.pisos[0];
    if (!pisoObj) return;
    for (const celda of pisoObj.celdas) {
      const esPasillo = Number(celda.col) === 2;
      celda.tipoCelda = esPasillo ? 'PASILLO' : 'NORMAL';
      celda.idTipo = esPasillo ? null : idTipoPorRol('NORMAL');
      celda.ubicacion = ubicacionColumna(Number(celda.col));
    }
    plantillaActiva.modelo = 'PERSONALIZADA';
    renderDisenadorPlantilla();
  }

  btnAplicarModeloPlantilla?.addEventListener('click', aplicarModeloActual);
  selectModeloPlantilla?.addEventListener('change', aplicarModeloActual);
  btnLimpiarPisoPlantilla?.addEventListener('click', limpiarPisoActivo);

  tabsPisosDisenador?.addEventListener('click', (evento) => {
    const btn = evento.target.closest('[data-select-piso]');
    if (!btn) return;
    pisoActivoDisenador = Number(btn.dataset.selectPiso) || 1;
    renderDisenadorPlantilla();
  });

  btnAgregarFilaPlantilla?.addEventListener('click', agregarFilaDisenador);
  btnQuitarFilaPlantilla?.addEventListener('click', quitarFilaDisenador);
  btnGuardarPlantillaAsientos?.addEventListener('click', guardarPlantillaCompleta);

  tabla.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    const id = boton.dataset.id;
    if (accion === 'nuevo') abrirNuevoBus();
    if (accion === 'editar') abrirEdicion(id);
    if (accion === 'categorias') abrirCategorias(id);
    if (accion === 'asientos') abrirAsientos(id);
    if (accion === 'baja') darDeBaja(id);
  });

  tabla.addEventListener('change', (evento) => {
    const selector = evento.target.closest('[data-estado-bus]');
    if (selector) cambiarEstado(selector.dataset.estadoBus, selector.value, selector);
  });

  mapaAsientos.addEventListener('click', (evento) => {
    const pisoBox = evento.target.closest('[data-floor-box]');
    if (pisoBox) pisoActivoDisenador = Number(pisoBox.dataset.floorBox) || 1;
    const celdaBtn = evento.target.closest('button[data-celda-piso]');
    if (celdaBtn) {
      modificarCeldaPlantilla(celdaBtn.dataset.celdaPiso, celdaBtn.dataset.celdaFila, celdaBtn.dataset.celdaCol);
    }
  });

  mapaAsientos.addEventListener('mousedown', (evento) => {
    const celdaBtn = evento.target.closest('button[data-celda-piso]');
    if (celdaBtn && evento.button === 0) {
      pintandoArrastre = true;
    }
  });

  mapaAsientos.addEventListener('mouseover', (evento) => {
    if (!pintandoArrastre) return;
    const celdaBtn = evento.target.closest('button[data-celda-piso]');
    if (celdaBtn) {
      modificarCeldaPlantilla(celdaBtn.dataset.celdaPiso, celdaBtn.dataset.celdaFila, celdaBtn.dataset.celdaCol);
    }
  });

  document.addEventListener('mouseup', () => {
    pintandoArrastre = false;
  });

  pisosBus.addEventListener('change', () => {
    actualizarPisos();
    sincronizarConteosPorModeloModal();
  });
  formBus.addEventListener('submit', guardarBus);
  botonNuevo.addEventListener('click', abrirNuevoBus);
  botonRecargar.addEventListener('click', cargar);
  botonGuardarTipo?.addEventListener('click', guardarTipoAsiento);
  botonGuardarCategoriasBus.addEventListener('click', guardarCategoriasBus);
  filtroEstado.addEventListener('change', cargar);
  buscar.addEventListener('input', App.debounce(cargar, 380));

  cargar();
})();
