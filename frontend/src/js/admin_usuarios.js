(() => {
  'use strict';

  const API_USUARIOS = 'http://localhost:3000/api/admin/usuarios';
  const API_COOPERATIVAS = 'http://localhost:3000/api/admin/cooperativas';
  const $ = (id) => document.getElementById(id);
  const tabla = $('tablaPersonal');
  const formulario = $('formPersonal');
  const modal = $('modalPersonal');
  const notificacion = $('mensajePersonal');

  const estado = {
    usuarios: [],
    cooperativas: new Map(),
    identificacionEditada: null,
    cargando: false,
    guardando: false,
    cambiandoEstado: false,
    consultaRealizada: false,
    errorConexion: false
  };

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

  function mostrarAviso(mensaje, error = false) {
    $('mensajeConexionPersonal').textContent = mensaje;
    $('avisoPersonal').classList.toggle('is-error', error);
  }

  function avisar(mensaje, error = false) {
    notificacion.textContent = mensaje;
    notificacion.classList.toggle('is-error', error);
    notificacion.hidden = false;
    clearTimeout(temporizadorNotificacion);
    temporizadorNotificacion = setTimeout(() => {
      notificacion.hidden = true;
    }, 5000);
  }

  function mostrarError(mensaje) {
    $('errorPersonal').textContent = mensaje;
    $('errorPersonal').hidden = false;
  }

  async function solicitar(url, metodo = 'GET', datos) {
    const opciones = {
      method: metodo,
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    };

    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }

    let respuesta;
    try {
      respuesta = await fetch(url, opciones);
    } catch {
      throw new Error('No se pudo conectar al servidor. Verifica que Node.js esté en ejecución.');
    }

    let contenido;
    try {
      contenido = await respuesta.json();
    } catch {
      throw new Error('El servidor devolvió una respuesta que no se pudo interpretar.');
    }

    if (!respuesta.ok || contenido.success !== true) {
      throw new Error(contenido.message || 'No se pudo completar la operación.');
    }

    return contenido;
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
    boton.disabled = estado.cambiandoEstado || estado.guardando || estado.cargando;
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
    avatar.textContent = String(usuario.NOM_USU || '?').charAt(0).toUpperCase();

    const nombreCompleto = document.createElement('span');
    nombreCompleto.textContent = `${usuario.NOM_USU} ${usuario.APE_USU}`;
    presentacion.append(avatar, nombreCompleto);
    nombre.append(presentacion);
    fila.append(nombre);

    fila.append(celda(usuario.COR_USU));
    const nombreCooperativa = estado.cooperativas.get(usuario.ID_COP_PER) || usuario.NOM_COP;
    fila.append(celda(nombreCooperativa
      ? `${nombreCooperativa} (${usuario.ID_COP_PER})`
      : usuario.ID_COP_PER));
    fila.append(celda(usuario.TEL_USU));

    const estadoCelda = document.createElement('td');
    const insignia = document.createElement('span');
    const activo = usuario.EST_USU === '1';
    insignia.className = `staff-badge ${activo ? 'staff-badge-active' : 'staff-badge-inactive'}`;
    insignia.textContent = activo ? 'Activo' : 'Inactivo';
    estadoCelda.append(insignia);
    fila.append(estadoCelda);

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
    const usuariosRol = estado.usuarios.filter((usuario) => usuario.ID_ROL_PER === rol);

    const filtrados = usuariosRol.filter((usuario) => {
      if (filtroEstado !== 'todos' && usuario.EST_USU !== filtroEstado) return false;

      const texto = normalizar([
        usuario.ID_USU,
        usuario.NOM_USU,
        usuario.APE_USU,
        usuario.COR_USU,
        usuario.TEL_USU,
        usuario.ID_COP_PER,
        usuario.NOM_COP,
        estado.cooperativas.get(usuario.ID_COP_PER)
      ].join(' '));
      return texto.includes(busqueda);
    });

    const fragmento = document.createDocumentFragment();
    filtrados.forEach((usuario) => fragmento.append(crearFila(usuario)));
    tabla.replaceChildren(fragmento);

    $('totalPersonal').textContent = estado.usuarios.length;
    $('totalActivos').textContent = estado.usuarios.filter((u) => u.EST_USU === '1').length;
    $('totalInactivos').textContent = estado.usuarios.filter((u) => u.EST_USU === '0').length;
    $('cantidadOficinistas').textContent = estado.usuarios.filter((u) => u.ID_ROL_PER === 'R003').length;
    $('cantidadControladores').textContent = estado.usuarios.filter((u) => u.ID_ROL_PER === 'R004').length;
    $('etiquetaTipoPersonal').textContent = tipo;
    $('contadorPersonal').textContent = `${filtrados.length} resultados de ${usuariosRol.length}`;

    const sinResultados = filtrados.length === 0;
    $('personalVacio').hidden = !sinResultados;

    if (sinResultados) {
      if (estado.cargando && !estado.consultaRealizada) {
        $('tituloPersonalVacio').textContent = 'Cargando personal';
        $('descripcionPersonalVacio').textContent = 'Consultando los registros del sistema.';
      } else if (estado.errorConexion && !estado.consultaRealizada) {
        $('tituloPersonalVacio').textContent = 'No se pudieron cargar los usuarios';
        $('descripcionPersonalVacio').textContent = 'Comprueba el servidor y utiliza el botón Actualizar.';
      } else if (usuariosRol.length > 0) {
        $('tituloPersonalVacio').textContent = 'Sin resultados';
        $('descripcionPersonalVacio').textContent = 'Prueba otro nombre o cambia el filtro de estado.';
      } else {
        $('tituloPersonalVacio').textContent = `Todavía no hay ${tipo.toLowerCase()}`;
        $('descripcionPersonalVacio').textContent = 'Los usuarios registrados en SQL Server aparecerán aquí.';
      }
    }

    $('btnNuevoPersonal').disabled = estado.cargando || estado.guardando || estado.cambiandoEstado || estado.errorConexion;
  }

  function actualizarPestanas() {
    const controladores = tipoActual() === 'R004';
    $('tabOficinistas').classList.toggle('active', !controladores);
    $('tabControladores').classList.toggle('active', controladores);
    $('tabOficinistas').setAttribute('aria-current', controladores ? 'false' : 'page');
    $('tabControladores').setAttribute('aria-current', controladores ? 'page' : 'false');
    renderizar();
  }

  async function cargarUsuarios() {
    if (estado.cargando || estado.guardando || estado.cambiandoEstado) return false;

    estado.cargando = true;
    estado.errorConexion = false;
    $('btnActualizarPersonal').disabled = true;
    $('btnActualizarPersonal').textContent = 'Actualizando...';
    mostrarAviso('Consultando personal operativo en SQL Server...');
    renderizar();

    try {
      const datos = await solicitar(API_USUARIOS);
      if (!Array.isArray(datos.usuarios)) {
        throw new Error('La respuesta del servidor no contiene una lista válida de usuarios.');
      }

      estado.usuarios = datos.usuarios.map((usuario) => ({
        ...usuario,
        ID_USU: String(usuario.ID_USU ?? '').trim(),
        ID_COP_PER: String(usuario.ID_COP_PER ?? '').trim(),
        ID_ROL_PER: String(usuario.ID_ROL_PER ?? '').trim(),
        EST_USU: String(usuario.EST_USU ?? '').trim()
      }));
      estado.consultaRealizada = true;
      mostrarAviso('Conectado a SQL Server. Los registros mostrados provienen de la base de datos.');
      return true;
    } catch (error) {
      estado.errorConexion = true;
      mostrarAviso(error.message, true);
      avisar(error.message, true);
      return false;
    } finally {
      estado.cargando = false;
      $('btnActualizarPersonal').disabled = false;
      $('btnActualizarPersonal').textContent = 'Actualizar';
      renderizar();
    }
  }

  async function cargarCooperativas() {
    try {
      const datos = await solicitar(API_COOPERATIVAS);
      if (!Array.isArray(datos.cooperativas)) {
        throw new Error('No se encontró el listado de cooperativas.');
      }

      const lista = $('cooperativasDisponibles');
      lista.replaceChildren();
      estado.cooperativas.clear();

      for (const coop of datos.cooperativas) {
        if (!coop.ID_COP || !coop.NOM_COP) continue;
        const codigo = String(coop.ID_COP).trim().toUpperCase();
        estado.cooperativas.set(codigo, coop.NOM_COP);
        if (String(coop.EST_COP).trim() !== '1') continue;
        const opcion = document.createElement('option');
        opcion.value = codigo;
        opcion.label = coop.NOM_COP;
        lista.append(opcion);
      }

      $('ayudaCooperativa').textContent = estado.cooperativas.size > 0
        ? 'Selecciona el código de una cooperativa activa.'
        : 'Primero debes registrar una cooperativa activa.';
      renderizar();
    } catch {
      $('ayudaCooperativa').textContent = 'No se pudo consultar el listado. Comprueba que la API de cooperativas esté disponible.';
    }
  }

  function abrirFormulario(usuario = null) {
    if (estado.cargando || estado.guardando || estado.cambiandoEstado || estado.errorConexion) return;

    formulario.reset();
    $('errorPersonal').hidden = true;
    estado.identificacionEditada = usuario?.ID_USU ?? null;

    $('tituloModalPersonal').textContent = usuario
      ? `Editar ${etiquetaRol(usuario.ID_ROL_PER)}`
      : `Nuevo ${etiquetaRol(tipoActual())}`;
    $('btnGuardarPersonal').textContent = usuario ? 'Guardar cambios' : 'Guardar registro';
    $('idUsuario').readOnly = Boolean(usuario);
    $('rolUsuario').value = usuario?.ID_ROL_PER ?? tipoActual();
    $('estadoUsuario').value = usuario?.EST_USU ?? '1';

    $('grupoClaveUsuario').hidden = Boolean(usuario);
    $('claveUsuario').required = !usuario;
    $('claveUsuario').value = '';

    if (usuario) {
      for (const campo of ['ID_USU', 'NOM_USU', 'APE_USU', 'COR_USU', 'TEL_USU', 'ID_COP_PER']) {
        formulario.elements.namedItem(campo).value = usuario[campo] ?? '';
      }
    }

    modal.showModal();
    $('idUsuario').focus();
  }

  function cerrarFormulario() {
    if (estado.guardando) return;
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
    const repetido = estado.usuarios.find((usuario) => usuario.ID_USU !== estado.identificacionEditada &&
      (usuario.ID_USU === datos.ID_USU || usuario.COR_USU.toLowerCase() === datos.COR_USU));

    if (repetido) {
      return repetido.ID_USU === datos.ID_USU
        ? 'Ya existe un usuario con esa identificación.'
        : 'Ya existe un usuario con ese correo electrónico.';
    }

    if (!/^[A-Z0-9]{1,5}$/.test(datos.ID_COP_PER)) {
      return 'El código de cooperativa debe contener entre 1 y 5 letras o números.';
    }

    if (estado.cooperativas.size > 0 && !estado.cooperativas.has(datos.ID_COP_PER)) {
      return 'Selecciona una cooperativa registrada.';
    }

    return '';
  }

  async function guardarUsuario(evento) {
    evento.preventDefault();
    if (estado.guardando || estado.cambiandoEstado || estado.cargando) return;
    $('errorPersonal').hidden = true;
    if (!formulario.reportValidity()) return;

    const datos = datosFormulario();
    const error = validarRegistro(datos);
    if (error) {
      mostrarError(error);
      return;
    }

    const editando = Boolean(estado.identificacionEditada);
    const ruta = editando ? `${API_USUARIOS}/${encodeURIComponent(estado.identificacionEditada)}` : API_USUARIOS;
    if (!editando) datos.password = $('claveUsuario').value;

    estado.guardando = true;
    $('btnGuardarPersonal').disabled = true;
    $('btnGuardarPersonal').textContent = 'Guardando...';
    $('btnCerrarPersonal').disabled = true;
    $('btnCancelarPersonal').disabled = true;

    try {
      const resultado = await solicitar(ruta, editando ? 'PUT' : 'POST', datos);
      cerrarFormularioExitoso();
      window.location.hash = datos.ID_ROL_PER === 'R004' ? '#controladores' : '#oficinistas';
      actualizarPestanas();
      avisar(resultado.message || (editando ? 'Usuario actualizado correctamente.' : 'Usuario registrado correctamente.'));
    } catch (problema) {
      mostrarError(problema.message);
      return;
    } finally {
      estado.guardando = false;
      $('btnGuardarPersonal').disabled = false;
      $('btnGuardarPersonal').textContent = editando ? 'Guardar cambios' : 'Guardar registro';
      $('btnCerrarPersonal').disabled = false;
      $('btnCancelarPersonal').disabled = false;
    }

    await cargarUsuarios();
    await cargarCooperativas();
  }

  function cerrarFormularioExitoso() {
    if (modal.open) modal.close();
    $('claveUsuario').value = '';
    estado.identificacionEditada = null;
  }

  async function gestionarAccion(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton || estado.guardando || estado.cargando || estado.cambiandoEstado) return;

    const usuario = estado.usuarios.find((registro) => registro.ID_USU === boton.dataset.id);
    if (!usuario) return;

    if (boton.dataset.accion === 'editar') {
      abrirFormulario(usuario);
      return;
    }

    const nuevoEstado = usuario.EST_USU === '1' ? '0' : '1';
    const accion = nuevoEstado === '1' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${accion} a ${usuario.NOM_USU} ${usuario.APE_USU}?`)) return;

    estado.cambiandoEstado = true;
    renderizar();
    try {
      const resultado = await solicitar(
        `${API_USUARIOS}/${encodeURIComponent(usuario.ID_USU)}/estado`,
        'PATCH',
        { EST_USU: nuevoEstado }
      );
      usuario.EST_USU = nuevoEstado;
      avisar(resultado.message || 'Estado del usuario actualizado correctamente.');
    } catch (error) {
      avisar(error.message, true);
      estado.cambiandoEstado = false;
      renderizar();
      return;
    }

    estado.cambiandoEstado = false;
    renderizar();
    await cargarUsuarios();
  }

  $('btnNuevoPersonal').addEventListener('click', () => abrirFormulario());
  $('btnActualizarPersonal').addEventListener('click', async () => {
    await cargarUsuarios();
    await cargarCooperativas();
  });
  $('btnCerrarPersonal').addEventListener('click', cerrarFormulario);
  $('btnCancelarPersonal').addEventListener('click', cerrarFormulario);
  $('buscarPersonal').addEventListener('input', renderizar);
  $('filtroEstadoPersonal').addEventListener('change', renderizar);
  formulario.addEventListener('submit', guardarUsuario);
  tabla.addEventListener('click', gestionarAccion);
  modal.addEventListener('cancel', (evento) => {
    if (estado.guardando) evento.preventDefault();
  });
  window.addEventListener('hashchange', actualizarPestanas);

  actualizarPestanas();
  cargarUsuarios();
  cargarCooperativas();
})();
