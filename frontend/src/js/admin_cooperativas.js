/* Interfaz de cooperativas: vista previa con datos temporales en memoria.
   La persistencia se realizará a través de la API administrativa del sistema. */
(() => {
  'use strict';

  const estado = {
    cooperativas: [],
    idEnEdicion: null,
    busqueda: '',
    filtro: 'todos'
  };

  const $ = (id) => document.getElementById(id);
  const tabla = $('tablaCooperativas');
  const dialogo = $('modalCooperativa');
  const formulario = $('formCooperativa');
  const notificacion = $('notificacionCooperativa');
  let ocultarNotificacion;

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function mostrarNotificacion(mensaje) {
    notificacion.textContent = mensaje;
    notificacion.hidden = false;
    clearTimeout(ocultarNotificacion);
    ocultarNotificacion = setTimeout(() => { notificacion.hidden = true; }, 4600);
  }

  function contarRegistros() {
    $('totalCooperativas').textContent = estado.cooperativas.length;
    $('cooperativasActivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '1').length;
    $('cooperativasInactivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '0').length;
  }

  function celda(texto) {
    const td = document.createElement('td');
    td.textContent = texto;
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

    const cambiarEstado = document.createElement('button');
    cambiarEstado.type = 'button';
    cambiarEstado.className = 'coop-action coop-action-muted';
    cambiarEstado.textContent = cooperativa.EST_COP === '1' ? 'Desactivar' : 'Activar';
    cambiarEstado.dataset.action = 'estado';
    cambiarEstado.dataset.id = cooperativa.ID_COP;
    cambiarEstado.setAttribute('aria-label', `${cambiarEstado.textContent} ${cooperativa.NOM_COP}`);

    acciones.append(editar, cambiarEstado);
    accionesCelda.append(acciones);
    fila.append(accionesCelda);

    return fila;
  }

  function renderizarTabla() {
    contarRegistros();

    const filtradas = estado.cooperativas.filter((c) => {
      const coincideEstado = estado.filtro === 'todos' || c.EST_COP === estado.filtro;
      const texto = normalizar(`${c.ID_COP} ${c.NOM_COP} ${c.RUC_COP}`);
      return coincideEstado && texto.includes(estado.busqueda);
    });

    tabla.replaceChildren(...filtradas.map(crearFila));
    $('estadoVacio').hidden = filtradas.length > 0;

    if (estado.cooperativas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Todavía no hay cooperativas';
      $('textoEstadoVacio').textContent = 'Utiliza «Nueva cooperativa» para ingresar un registro de prueba.';
    } else if (filtradas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Sin resultados';
      $('textoEstadoVacio').textContent = 'No encontramos registros con esos filtros. Prueba otra búsqueda.';
    }

    $('contadorResultados').textContent = `${filtradas.length} de ${estado.cooperativas.length} cooperativas`;
  }

  function abrirFormulario(cooperativa = null) {
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
    dialogo.close();
    estado.idEnEdicion = null;
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
    if (Object.values(datos).some((valor) => !valor)) return 'Completa todos los campos obligatorios.';
    if (!/^[0-9]{13}$/.test(datos.RUC_COP)) return 'El RUC debe tener exactamente 13 dígitos.';
    if (!/^[0-9]{7,10}$/.test(datos.TEL_COP)) return 'El teléfono debe contener entre 7 y 10 dígitos.';

    const duplicadoCodigo = estado.cooperativas.some(
      (c) => c.ID_COP === datos.ID_COP && c.ID_COP !== estado.idEnEdicion
    );
    if (duplicadoCodigo) return 'Ya existe una cooperativa con este código.';

    const duplicadoRuc = estado.cooperativas.some(
      (c) => c.RUC_COP === datos.RUC_COP && c.ID_COP !== estado.idEnEdicion
    );
    if (duplicadoRuc) return 'Ya existe una cooperativa con este RUC.';
    return '';
  }

  $('btnNuevaCooperativa').addEventListener('click', () => abrirFormulario());
  $('btnCerrarModal').addEventListener('click', cerrarFormulario);
  $('btnCancelarModal').addEventListener('click', cerrarFormulario);
  dialogo.addEventListener('click', (event) => {
    if (event.target === dialogo) cerrarFormulario();
  });
  dialogo.addEventListener('close', () => { estado.idEnEdicion = null; });

  $('buscarCooperativa').addEventListener('input', (event) => {
    estado.busqueda = normalizar(event.target.value);
    renderizarTabla();
  });
  $('filtrarEstado').addEventListener('change', (event) => {
    estado.filtro = event.target.value;
    renderizarTabla();
  });

  tabla.addEventListener('click', (event) => {
    const boton = event.target.closest('button[data-action]');
    if (!boton) return;
    const cooperativa = estado.cooperativas.find((c) => c.ID_COP === boton.dataset.id);
    if (!cooperativa) return;

    if (boton.dataset.action === 'editar') {
      abrirFormulario(cooperativa);
    } else if (boton.dataset.action === 'estado') {
      const activar = cooperativa.EST_COP !== '1';
      if (!window.confirm(`¿Deseas ${activar ? 'activar' : 'desactivar'} ${cooperativa.NOM_COP}?`)) return;
      cooperativa.EST_COP = activar ? '1' : '0';
      renderizarTabla();
      mostrarNotificacion('Estado actualizado temporalmente. No se ha guardado en SQL Server.');
    }
  });

  formulario.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!formulario.reportValidity()) return;

    const datos = recogerDatos();
    const error = verificarDatos(datos);
    if (error) {
      $('errorFormulario').textContent = error;
      $('errorFormulario').hidden = false;
      return;
    }

    if (estado.idEnEdicion) {
      const indice = estado.cooperativas.findIndex((c) => c.ID_COP === estado.idEnEdicion);
      if (indice !== -1) estado.cooperativas[indice] = datos;
    } else {
      estado.cooperativas.push(datos);
    }

    cerrarFormulario();
    renderizarTabla();
    mostrarNotificacion('Registro actualizado en esta vista. El guardado en SQL Server se habilitará próximamente.');
  });

  renderizarTabla();
})();
