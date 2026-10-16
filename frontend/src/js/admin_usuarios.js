(() => {
  'use strict';

  const API_COOPERATIVAS = 'http://localhost:3000/api/admin/cooperativas';
  const registros = [];
  const cooperativas = new Map();
  const $ = (id) => document.getElementById(id);
  const tabla = $('tablaPersonal');
  const formulario = $('formPersonal');
  const modal = $('modalPersonal');
  const notificacion = $('mensajePersonal');

  let identificacionEditada = null;
  let temporizadorNotificacion;

  function tipoActual() {
    return window.location.hash === '#controladores' ? 'R004' : 'R003';
  }

  function etiquetaRol(rol) {
    return rol === 'R004' ? 'controlador' : 'oficinista';
  }

  function normalizar(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function avisar(mensaje) {
    notificacion.textContent = mensaje;
    notificacion.hidden = false;
    clearTimeout(temporizadorNotificacion);
    temporizadorNotificacion = setTimeout(() => {
      notificacion.hidden = true;
    }, 4500);
  }

  function mostrarError(mensaje) {
    $('errorPersonal').textContent = mensaje;
    $('errorPersonal').hidden = false;
  }

  function celda(valor) {
    const td = document.createElement('td');
    td.textContent = valor ?? '';
    return td;
  }

  function crearAccion(texto, accion, id, nombreClase = '') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `staff-action ${nombreClase}`.trim();
    boton.textContent = texto;
    boton.dataset.accion = accion;
    boton.dataset.id = id;
    return boton;
  }

  function crearFila(usuario) {
    const fila = document.createElement('tr');
    fila.append(celda(usuario.ID_USU));

    const nombre = document.createElement('td');
    const presentacion = document.createElement('div');
    presentacion.className = 'staff-name';

    const avatar = document.createElement('span');
    avatar.className = 'staff-avatar';
    avatar.textContent = usuario.NOM_USU.charAt(0).toUpperCase();

    const nombreCompleto = document.createElement('span');
    nombreCompleto.textContent = `${usuario.NOM_USU} ${usuario.APE_USU}`;
    presentacion.append(avatar, nombreCompleto);
    nombre.append(presentacion);
    fila.append(nombre);

    fila.append(celda(usuario.COR_USU));
    const coop = cooperativas.get(usuario.ID_COP_PER);
    fila.append(celda(coop ? `${coop} (${usuario.ID_COP_PER})` : usuario.ID_COP_PER));
    fila.append(celda(usuario.TEL_USU));

    const estado = document.createElement('td');
    const insignia = document.createElement('span');
    const activo = usuario.EST_USU === '1';
    insignia.className = `staff-badge ${activo ? 'staff-badge-active' : 'staff-badge-inactive'}`;
    insignia.textContent = activo ? 'Activo' : 'Inactivo';
    estado.append(insignia);
    fila.append(estado);

    const acciones = document.createElement('td');
    const grupo = document.createElement('div');
    grupo.className = 'staff-actions';
    grupo.append(
      crearAccion('Editar', 'editar', usuario.ID_USU),
      crearAccion(activo ? 'Desactivar' : 'Activar', 'estado', usuario.ID_USU, 'staff-action-muted')
    );
    acciones.append(grupo);
    fila.append(acciones);

    return fila;
  }

  function renderizar() {
    const rol = tipoActual();
    const busqueda = normalizar($('buscarPersonal').value);
    const filtroEstado = $('filtroEstadoPersonal').value;
    const tipo = rol === 'R004' ? 'Controladores' : 'Oficinistas';

    const filtrados = registros.filter((usuario) => {
      if (usuario.ID_ROL_PER !== rol) return false;
      if (filtroEstado !== 'todos' && usuario.EST_USU !== filtroEstado) return false;

      const texto = normalizar([
        usuario.ID_USU,
        usuario.NOM_USU,
        usuario.APE_USU,
        usuario.COR_USU,
        usuario.TEL_USU,
        usuario.ID_COP_PER,
        cooperativas.get(usuario.ID_COP_PER)
      ].join(' '));
      return texto.includes(busqueda);
    });

    const fragmento = document.createDocumentFragment();
    filtrados.forEach((usuario) => fragmento.append(crearFila(usuario)));
    tabla.replaceChildren(fragmento);

    $('totalPersonal').textContent = registros.length;
    $('totalActivos').textContent = registros.filter((u) => u.EST_USU === '1').length;
    $('totalInactivos').textContent = registros.filter((u) => u.EST_USU === '0').length;
    $('cantidadOficinistas').textContent = registros.filter((u) => u.ID_ROL_PER === 'R003').length;
    $('cantidadControladores').textContent = registros.filter((u) => u.ID_ROL_PER === 'R004').length;
    $('etiquetaTipoPersonal').textContent = tipo;
    $('contadorPersonal').textContent = `${filtrados.length} resultados de ${registros.filter((u) => u.ID_ROL_PER === rol).length}`;

    $('personalVacio').hidden = filtrados.length !== 0;
    if (filtrados.length === 0) {
      const tieneRegistros = registros.some((u) => u.ID_ROL_PER === rol);
      $('tituloPersonalVacio').textContent = tieneRegistros ? 'Sin resultados' : `Todavía no hay ${tipo.toLowerCase()}`;
      $('descripcionPersonalVacio').textContent = tieneRegistros
        ? 'Prueba otro nombre o cambia el filtro de estado.'
        : 'Utiliza «Nuevo usuario» para añadir un registro de prueba.';
    }
  }

  function actualizarPestanas() {
    const controladores = tipoActual() === 'R004';
    $('tabOficinistas').classList.toggle('active', !controladores);
    $('tabControladores').classList.toggle('active', controladores);
    $('tabOficinistas').setAttribute('aria-current', controladores ? 'false' : 'page');
    $('tabControladores').setAttribute('aria-current', controladores ? 'page' : 'false');
    renderizar();
  }

  function abrirFormulario(usuario = null) {
    formulario.reset();
    $('errorPersonal').hidden = true;
    identificacionEditada = usuario?.ID_USU ?? null;

    $('tituloModalPersonal').textContent = usuario
      ? `Editar ${etiquetaRol(usuario.ID_ROL_PER)}`
      : `Nuevo ${etiquetaRol(tipoActual())}`;
    $('btnGuardarPersonal').textContent = usuario ? 'Guardar cambios' : 'Guardar registro';
    $('idUsuario').readOnly = Boolean(usuario);
    $('rolUsuario').value = usuario?.ID_ROL_PER ?? tipoActual();
    $('estadoUsuario').value = usuario?.EST_USU ?? '1';

    const grupoClave = $('grupoClaveUsuario');
    grupoClave.hidden = Boolean(usuario);
    $('claveUsuario').required = !usuario;
    $('claveUsuario').value = '';

    if (usuario) {
      for (const campo of ['ID_USU', 'NOM_USU', 'APE_USU', 'COR_USU', 'TEL_USU', 'ID_COP_PER']) {
        formulario.elements.namedItem(campo).value = usuario[campo];
      }
    }

    modal.showModal();
    $('idUsuario').focus();
  }

  function cerrarFormulario() {
    if (modal.open) modal.close();
    $('claveUsuario').value = '';
  }

  function datosFormulario() {
    const campos = ['ID_USU', 'NOM_USU', 'APE_USU', 'COR_USU', 'TEL_USU', 'ID_COP_PER', 'ID_ROL_PER', 'EST_USU'];
    const datos = Object.fromEntries(campos.map((campo) => [campo, formulario.elements.namedItem(campo).value.trim()]));
    datos.ID_USU = datos.ID_USU.toUpperCase();
    datos.ID_COP_PER = datos.ID_COP_PER.toUpperCase();
    datos.COR_USU = datos.COR_USU.toLowerCase();
    return datos;
  }

  function validarRegistro(datos) {
    const idDuplicado = registros.some((u) => u.ID_USU === datos.ID_USU && u.ID_USU !== identificacionEditada);
    if (idDuplicado) return 'Ya existe un usuario con esa identificación.';

    const correoDuplicado = registros.some((u) =>
      u.COR_USU.toLowerCase() === datos.COR_USU && u.ID_USU !== identificacionEditada
    );
    if (correoDuplicado) return 'Ya existe un usuario con ese correo electrónico.';

    if (!/^[A-Za-z0-9]{1,5}$/.test(datos.ID_COP_PER)) {
      return 'El código de cooperativa debe contener entre 1 y 5 letras o números.';
    }

    if (cooperativas.size > 0 && !cooperativas.has(datos.ID_COP_PER)) {
      return 'Selecciona el código de una cooperativa registrada.';
    }

    return '';
  }

  function guardarUsuario(evento) {
    evento.preventDefault();
    $('errorPersonal').hidden = true;
    if (!formulario.reportValidity()) return;

    const datos = datosFormulario();
    const error = validarRegistro(datos);
    if (error) {
      mostrarError(error);
      return;
    }

    if (identificacionEditada) {
      const indice = registros.findIndex((u) => u.ID_USU === identificacionEditada);
      if (indice === -1) {
        mostrarError('El usuario ya no está disponible.');
        return;
      }
      registros[indice] = datos;
      avisar('Los cambios se aplicaron en la vista previa.');
    } else {
      registros.push(datos);
      avisar('Usuario agregado a la vista previa.');
    }

    cerrarFormulario();
    window.location.hash = datos.ID_ROL_PER === 'R004' ? 'controladores' : 'oficinistas';
    actualizarPestanas();
  }

  function gestionarAccion(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    const usuario = registros.find((u) => u.ID_USU === boton.dataset.id);
    if (!usuario) return;

    if (boton.dataset.accion === 'editar') {
      abrirFormulario(usuario);
      return;
    }

    const nuevoEstado = usuario.EST_USU === '1' ? '0' : '1';
    const accion = nuevoEstado === '1' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${accion} a ${usuario.NOM_USU} ${usuario.APE_USU}?`)) return;

    usuario.EST_USU = nuevoEstado;
    renderizar();
    avisar(`Estado de ${etiquetaRol(usuario.ID_ROL_PER)} actualizado en la vista previa.`);
  }

  async function cargarCooperativas() {
    try {
      const respuesta = await fetch(API_COOPERATIVAS, { cache: 'no-store' });
      if (!respuesta.ok) return;
      const datos = await respuesta.json();
      if (!Array.isArray(datos.cooperativas)) return;

      const lista = $('cooperativasDisponibles');
      lista.replaceChildren();
      cooperativas.clear();

      for (const coop of datos.cooperativas) {
        if (!coop.ID_COP || !coop.NOM_COP) continue;
        cooperativas.set(coop.ID_COP.toUpperCase(), coop.NOM_COP);
        const opcion = document.createElement('option');
        opcion.value = coop.ID_COP;
        opcion.label = coop.NOM_COP;
        lista.append(opcion);
      }

      $('ayudaCooperativa').textContent = cooperativas.size > 0
        ? 'Selecciona un código del listado de cooperativas.'
        : 'Registra una cooperativa antes de asignar personal operativo.';
      renderizar();
    } catch {
      $('ayudaCooperativa').textContent = 'Escribe el código de la cooperativa correspondiente.';
    }
  }

  $('btnNuevoPersonal').addEventListener('click', () => abrirFormulario());
  $('btnCerrarPersonal').addEventListener('click', cerrarFormulario);
  $('btnCancelarPersonal').addEventListener('click', cerrarFormulario);
  $('buscarPersonal').addEventListener('input', renderizar);
  $('filtroEstadoPersonal').addEventListener('change', renderizar);
  formulario.addEventListener('submit', guardarUsuario);
  tabla.addEventListener('click', gestionarAccion);
  window.addEventListener('hashchange', actualizarPestanas);

  actualizarPestanas();
  cargarCooperativas();
})();
