(() => {
  'use strict';

  const API_URL = 'http://localhost:3001/api/admin/cooperativas';

  const estado = {
    cooperativas: [],
    idEnEdicion: null,
    busqueda: '',
    filtro: 'todos',
    cargando: false,
    guardando: false,
    cambiandoEstado: false,
    inicializado: false
  };

  const $ = (id) => document.getElementById(id);
  const tabla = $('tablaCooperativas');
  const dialogo = $('modalCooperativa');
  const formulario = $('formCooperativa');
  const notificacion = $('notificacionCooperativa');
  let temporizadorNotificacion;

  function normalizar(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function mostrarNotificacion(mensaje, error = false) {
    notificacion.textContent = mensaje;
    notificacion.classList.toggle('is-error', error);
    notificacion.hidden = false;
    clearTimeout(temporizadorNotificacion);
    temporizadorNotificacion = setTimeout(() => { notificacion.hidden = true; }, 5000);
  }

  function actualizarAviso(mensaje, error = false) {
    $('mensajeConexion').textContent = mensaje;
    $('avisoCooperativas').classList.toggle('is-error', error);
  }

  async function solicitar(ruta = '', metodo = 'GET', cuerpo) {
    const opciones = {
      method: metodo,
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    };

    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
      respuesta = await fetch(`${API_URL}${ruta}`, opciones);
    } catch {
      throw new Error('No se pudo conectar al servidor. Verifica que Node.js esté en ejecución.');
    }

    let datos;
    try {
      datos = await respuesta.json();
    } catch {
      throw new Error('El servidor devolvió una respuesta que no se pudo interpretar.');
    }

    if (!respuesta.ok || datos.success !== true) {
      throw new Error(datos.message || `Error al procesar la solicitud (${respuesta.status}).`);
    }

    return datos;
  }

  function contarRegistros() {
    $('totalCooperativas').textContent = estado.cooperativas.length;
    $('cooperativasActivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '1').length;
    $('cooperativasInactivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '0').length;
  }

  function celda(texto) {
    const td = document.createElement('td');
    td.textContent = texto ?? '';
    return td;
  }

  function crearFila(cooperativa) {
    const fila = document.createElement('tr');
    fila.append(celda(cooperativa.ID_COP));

    const nombre = document.createElement('td');
    const contenidoNombre = document.createElement('div');
    contenidoNombre.className = 'coop-name-cell';
    const inicial = document.createElement('span');
    inicial.className = 'coop-avatar';
    inicial.textContent = cooperativa.NOM_COP.slice(0, 1).toUpperCase();
    const etiquetaNombre = document.createElement('span');
    etiquetaNombre.textContent = cooperativa.NOM_COP;
    contenidoNombre.append(inicial, etiquetaNombre);
    nombre.append(contenidoNombre);
    fila.append(nombre);

    fila.append(celda(cooperativa.RUC_COP));
    fila.append(celda(cooperativa.DIR_COP));
    fila.append(celda(cooperativa.TEL_COP));

    const estadoCelda = document.createElement('td');
    const insignia = document.createElement('span');
    insignia.className = `coop-badge ${cooperativa.EST_COP === '1' ? 'coop-badge-active' : 'coop-badge-inactive'}`;
    insignia.textContent = cooperativa.EST_COP === '1' ? 'Activa' : 'Inactiva';
    estadoCelda.append(insignia);
    fila.append(estadoCelda);

    const accionesCelda = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'coop-actions';

    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'coop-action';
    editar.textContent = 'Editar';
    editar.dataset.action = 'editar';
    editar.dataset.id = cooperativa.ID_COP;
    editar.disabled = estado.cambiandoEstado;

    const cambiarEstado = document.createElement('button');
    cambiarEstado.type = 'button';
    cambiarEstado.className = 'coop-action coop-action-muted';
    cambiarEstado.textContent = cooperativa.EST_COP === '1' ? 'Desactivar' : 'Activar';
    cambiarEstado.dataset.action = 'estado';
    cambiarEstado.dataset.id = cooperativa.ID_COP;
    cambiarEstado.disabled = estado.cambiandoEstado;
    cambiarEstado.setAttribute('aria-label', `${cambiarEstado.textContent} ${cooperativa.NOM_COP}`);

    acciones.append(editar, cambiarEstado);
    accionesCelda.append(acciones);
    fila.append(accionesCelda);
    return fila;
  }

  function renderizarTabla() {
    contarRegistros();

    const filtradas = estado.cooperativas.filter((cooperativa) => {
      const coincideEstado = estado.filtro === 'todos' || cooperativa.EST_COP === estado.filtro;
      const texto = normalizar(`${cooperativa.ID_COP} ${cooperativa.NOM_COP} ${cooperativa.RUC_COP}`);
      return coincideEstado && texto.includes(estado.busqueda);
    });

    tabla.replaceChildren(...filtradas.map(crearFila));
    $('estadoVacio').hidden = filtradas.length > 0;

    if (estado.cargando && !estado.inicializado) {
      $('tituloEstadoVacio').textContent = 'Cargando cooperativas';
      $('textoEstadoVacio').textContent = 'Consultando los registros del sistema...';
    } else if (!estado.inicializado) {
      $('tituloEstadoVacio').textContent = 'No se pudieron cargar las cooperativas';
      $('textoEstadoVacio').textContent = 'Revisa la conexión y presiona «Actualizar» para intentar nuevamente.';
    } else if (estado.cooperativas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Todavía no hay cooperativas';
      $('textoEstadoVacio').textContent = 'Utiliza «Nueva cooperativa» para registrar una empresa de transporte.';
    } else if (filtradas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Sin resultados';
      $('textoEstadoVacio').textContent = 'No encontramos registros con esos filtros. Prueba otra búsqueda.';
    }

    $('contadorResultados').textContent = `${filtradas.length} de ${estado.cooperativas.length} cooperativas`;
  }

  async function cargarCooperativas() {
    if (estado.cargando) return false;
    estado.cargando = true;
    $('btnActualizarCooperativas').disabled = true;
    $('btnActualizarCooperativas').textContent = 'Actualizando...';
    actualizarAviso('Consultando las cooperativas registradas...');
    renderizarTabla();

    try {
      const datos = await solicitar();
      if (!Array.isArray(datos.cooperativas)) {
        throw new Error('El servidor no devolvió un listado válido de cooperativas.');
      }
      estado.cooperativas = datos.cooperativas;
      estado.inicializado = true;
      actualizarAviso('Información sincronizada con SQL Server. Puedes administrar las cooperativas registradas.');
      return true;
    } catch (error) {
      actualizarAviso(error.message, true);
      mostrarNotificacion(error.message, true);
      return false;
    } finally {
      estado.cargando = false;
      $('btnActualizarCooperativas').disabled = false;
      $('btnActualizarCooperativas').textContent = 'Actualizar';
      renderizarTabla();
    }
  }

  function abrirFormulario(cooperativa = null) {
    if (estado.guardando || estado.cambiandoEstado) return;
    formulario.reset();
    $('errorFormulario').hidden = true;
    estado.idEnEdicion = cooperativa?.ID_COP || null;
    const editar = Boolean(cooperativa);
    $('tituloModal').textContent = editar ? 'Editar cooperativa' : 'Nueva cooperativa';
    $('btnGuardarCooperativa').textContent = editar ? 'Guardar cambios' : 'Guardar registro';
    $('idCop').readOnly = editar;

    if (editar) {
      for (const [campo, valor] of Object.entries(cooperativa)) {
        const input = formulario.elements.namedItem(campo);
        if (input) input.value = valor;
      }
    } else {
      $('estadoCop').value = '1';
    }

    dialogo.showModal();
    $('idCop').focus();
  }

  function cerrarFormulario() {
    if (estado.guardando) return;
    dialogo.close();
  }

  function recogerDatos() {
    const datos = new FormData(formulario);
    return {
      ID_COP: String(datos.get('ID_COP') || '').trim().toUpperCase(),
      NOM_COP: String(datos.get('NOM_COP') || '').trim(),
      RUC_COP: String(datos.get('RUC_COP') || '').trim(),
      DIR_COP: String(datos.get('DIR_COP') || '').trim(),
      TEL_COP: String(datos.get('TEL_COP') || '').trim(),
      LOG_URL_COP: String(datos.get('LOG_URL_COP') || '').trim(),
      EST_COP: String(datos.get('EST_COP') || '1')
    };
  }

  function verificarDatos(datos) {
    if (!/^[A-Z0-9_-]{1,5}$/.test(datos.ID_COP)) return 'El código debe tener entre 1 y 5 caracteres, con letras o números.';
    if (!datos.NOM_COP || datos.NOM_COP.length > 20) return 'El nombre es obligatorio y debe tener máximo 20 caracteres.';
    if (!/^\d{13}$/.test(datos.RUC_COP)) return 'El RUC debe contener exactamente 13 dígitos.';
    if (!datos.DIR_COP || datos.DIR_COP.length > 20) return 'La dirección es obligatoria y debe tener máximo 20 caracteres.';
    if (!/^\d{7,10}$/.test(datos.TEL_COP)) return 'El teléfono debe contener entre 7 y 10 dígitos.';
    if (!datos.LOG_URL_COP || datos.LOG_URL_COP.length > 500) return 'La URL del logotipo es obligatoria y debe tener máximo 500 caracteres.';
    try {
      const url = new URL(datos.LOG_URL_COP);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo no admitido');
    } catch {
      return 'Ingresa una URL válida para el logotipo.';
    }
    return '';
  }

  function mostrarErrorFormulario(mensaje) {
    $('errorFormulario').textContent = mensaje;
    $('errorFormulario').hidden = false;
  }

  function cambiarGuardando(guardando) {
    estado.guardando = guardando;
    $('btnGuardarCooperativa').disabled = guardando;
    $('btnCancelarModal').disabled = guardando;
    $('btnCerrarModal').disabled = guardando;
    $('btnGuardarCooperativa').textContent = guardando
      ? 'Guardando...'
      : estado.idEnEdicion ? 'Guardar cambios' : 'Guardar registro';
  }

  $('btnNuevaCooperativa').addEventListener('click', () => abrirFormulario());
  $('btnActualizarCooperativas').addEventListener('click', cargarCooperativas);
  $('btnCerrarModal').addEventListener('click', cerrarFormulario);
  $('btnCancelarModal').addEventListener('click', cerrarFormulario);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) cerrarFormulario();
  });
  dialogo.addEventListener('cancel', (evento) => {
    if (estado.guardando) evento.preventDefault();
  });
  dialogo.addEventListener('close', () => { estado.idEnEdicion = null; });

  $('buscarCooperativa').addEventListener('input', (evento) => {
    estado.busqueda = normalizar(evento.target.value);
    renderizarTabla();
  });
  $('filtrarEstado').addEventListener('change', (evento) => {
    estado.filtro = evento.target.value;
    renderizarTabla();
  });

  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-action]');
    if (!boton || estado.cambiandoEstado || estado.guardando) return;
    const cooperativa = estado.cooperativas.find((item) => item.ID_COP === boton.dataset.id);
    if (!cooperativa) return;

    if (boton.dataset.action === 'editar') {
      abrirFormulario(cooperativa);
      return;
    }

    if (boton.dataset.action !== 'estado') return;
    const nuevoEstado = cooperativa.EST_COP === '1' ? '0' : '1';
    const accion = nuevoEstado === '1' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${accion} ${cooperativa.NOM_COP}?`)) return;

    estado.cambiandoEstado = true;
    renderizarTabla();
    try {
      const datos = await solicitar(`/${encodeURIComponent(cooperativa.ID_COP)}/estado`, 'PATCH', { EST_COP: nuevoEstado });
      const actualizado = await cargarCooperativas();
      if (actualizado) mostrarNotificacion(datos.message || 'Estado actualizado correctamente.');
    } catch (error) {
      mostrarNotificacion(error.message, true);
    } finally {
      estado.cambiandoEstado = false;
      renderizarTabla();
    }
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (estado.guardando || !formulario.reportValidity()) return;

    const datos = recogerDatos();
    const error = verificarDatos(datos);
    if (error) {
      mostrarErrorFormulario(error);
      return;
    }

    $('errorFormulario').hidden = true;
    const idEnEdicion = estado.idEnEdicion;
    cambiarGuardando(true);

    try {
      const respuesta = await solicitar(
        idEnEdicion ? `/${encodeURIComponent(idEnEdicion)}` : '',
        idEnEdicion ? 'PUT' : 'POST',
        datos
      );
      cambiarGuardando(false);
      cerrarFormulario();
      const actualizado = await cargarCooperativas();
      if (actualizado) mostrarNotificacion(respuesta.message || 'Cooperativa guardada correctamente.');
    } catch (error) {
      mostrarErrorFormulario(error.message);
      cambiarGuardando(false);
    }
  });

  cargarCooperativas();
})();
