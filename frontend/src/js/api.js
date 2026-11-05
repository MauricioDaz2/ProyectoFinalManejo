(() => {
  'use strict';

  const API_URL = 'http://localhost:3000/api';

  function sesion() {
    try {
      return JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch (error) {
      console.warn('Sesión local ilegible', error);
      return null;
    }
  }

  function guardarSesion(usuario) {
    localStorage.setItem('usuario', JSON.stringify(usuario));
  }

  function cerrarSesion() {
    localStorage.removeItem('usuario');
    window.location.replace('../auth/login.html');
  }

  function requiereSesion(roles = []) {
    const usuario = sesion();
    if (!usuario) {
      window.location.replace('../auth/login.html');
      return null;
    }
    if (roles.length > 0 && !roles.includes(usuario.rolId)) {
      window.location.replace('../auth/login.html');
      return null;
    }
    return usuario;
  }

  function construirConsulta(query) {
    if (!query) return '';
    const parametros = new URLSearchParams();
    Object.entries(query).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        parametros.set(clave, String(valor).trim());
      }
    });
    const cadena = parametros.toString();
    return cadena ? `?${cadena}` : '';
  }

  async function api(ruta, opciones = {}) {
    const { method = 'GET', body, query, headers = {} } = opciones;
    const url = `${API_URL}${ruta}${construirConsulta(query)}`;

    let respuesta;
    try {
      respuesta = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      const red = new Error('No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
      red.causa = error;
      red.esRed = true;
      throw red;
    }

    let datos = {};
    try {
      datos = await respuesta.json();
    } catch (error) {
      datos = {};
    }

    if (!respuesta.ok || datos.success === false) {
      const fallo = new Error(datos.message || `Error ${respuesta.status} al procesar la solicitud.`);
      fallo.status = respuesta.status;
      fallo.datos = datos;
      throw fallo;
    }

    return datos;
  }

  function escapar(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dinero(valor) {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(numero);
  }

  function numero(valor) {
    return new Intl.NumberFormat('es-EC').format(Number(valor) || 0);
  }

  function fecha(valor) {
    if (!valor) return '—';
    const texto = String(valor).slice(0, 10);
    const partes = texto.split('-');
    if (partes.length !== 3) return texto;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function fechaLarga(valor) {
    if (!valor) return '—';
    const texto = String(valor).slice(0, 10);
    const partes = texto.split('-').map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return texto;
    const fechaObjeto = new Date(partes[0], partes[1] - 1, partes[2]);
    return fechaObjeto.toLocaleDateString('es-EC', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function fechaHora(valor) {
    if (!valor) return '—';
    const fechaObjeto = new Date(valor);
    if (Number.isNaN(fechaObjeto.getTime())) return fecha(valor);
    return fechaObjeto.toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function hoyISO() {
    const ahora = new Date();
    const desfase = ahora.getTimezoneOffset() * 60000;
    return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
  }

  function claseEstado(estado) {
    const valor = String(estado || '').toUpperCase();
    if (['ACTIVO', 'PAGADO', 'USADO', 'FINALIZADA', '1', 'DISPONIBLE', 'VALIDADO'].includes(valor)) return 'success';
    if (['PROGRAMADA', 'RESERVADO', 'EMITIDO', 'EN CURSO', 'TALLER'].includes(valor)) return 'info';
    if (['PENDIENTE', 'INACTIVO'].includes(valor)) return 'warning';
    if (['CANCELADA', 'ANULADO', 'CANCELADO', '0', 'OCUPADO'].includes(valor)) return 'danger';
    return 'neutral';
  }

  function etiquetaEstado(estado) {
    const valor = String(estado ?? '').toUpperCase();
    const etiquetas = {
       1: 'ACTIVO',
       0: 'INACTIVO',
       'EN CURSO': 'EN CURSO'
    };
    return etiquetas[valor] || valor || '—';
  }

  function insignia(estado) {
    return `<span class="badge badge-${claseEstado(estado)}">${escapar(etiquetaEstado(estado))}</span>`;
  }

  function aviso(mensaje, tipo = 'success') {
    let pila = document.getElementById('toastStack');
    if (!pila) {
      pila = document.createElement('div');
      pila.id = 'toastStack';
      pila.className = 'toast-stack';
      pila.setAttribute('aria-live', 'polite');
      document.body.appendChild(pila);
    }

    const tarjeta = document.createElement('div');
    tarjeta.className = `toast toast-${tipo}`;
    const iconos = { success: '✓', error: '✕', warning: '!', info: 'i' };
    tarjeta.innerHTML = `<span class="toast-icon" aria-hidden="true">${iconos[tipo] || 'i'}</span>
      <span class="toast-text">${escapar(mensaje)}</span>`;
    pila.appendChild(tarjeta);

    window.setTimeout(() => {
      tarjeta.classList.add('toast-out');
      window.setTimeout(() => tarjeta.remove(), 250);
    }, 4200);
  }

  function confirmar(opciones = {}) {
    const {
      titulo = 'Confirmar acción',
      mensaje = '¿Deseas continuar?',
      aceptar = 'Aceptar',
      cancelar = 'Cancelar',
      peligro = false
    } = typeof opciones === 'string' ? { mensaje: opciones } : opciones;

    return new Promise((resolver) => {
      const contenedor = document.createElement('div');
      contenedor.className = 'modal confirm-modal';
      contenedor.innerHTML = `
        <div class="modal-backdrop" data-cerrar="1"></div>
        <div class="modal-card modal-small" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <header class="modal-header">
            <h3 id="confirmTitle">${escapar(titulo)}</h3>
            <button type="button" class="modal-close" data-cerrar="1" aria-label="Cerrar">×</button>
          </header>
          <div class="modal-body"><p class="confirm-text">${escapar(mensaje)}</p></div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-secondary" data-cerrar="1">${escapar(cancelar)}</button>
            <button type="button" class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-aceptar="1">${escapar(aceptar)}</button>
          </footer>
        </div>`;
      document.body.appendChild(contenedor);
      document.body.classList.add('modal-open');

      const finalizar = (valor) => {
        contenedor.remove();
        if (!document.querySelector('.modal')) document.body.classList.remove('modal-open');
        resolver(valor);
      };

      contenedor.querySelectorAll('[data-cerrar]').forEach((elemento) => {
        elemento.addEventListener('click', () => finalizar(false));
      });
      contenedor.querySelector('[data-aceptar]').addEventListener('click', () => finalizar(true));
      contenedor.querySelector('[data-aceptar]').focus();

      const alPresionar = (evento) => {
        if (evento.key === 'Escape') {
          document.removeEventListener('keydown', alPresionar);
          finalizar(false);
        }
      };
      document.addEventListener('keydown', alPresionar);
    });
  }

  function abrirModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const enfocable = modal.querySelector('input, select, textarea, button');
    if (enfocable) window.setTimeout(() => enfocable.focus(), 50);
  }

  function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) {
      document.body.classList.remove('modal-open');
    }
  }

  function prepararModales() {
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.querySelectorAll('[data-cerrar-modal]').forEach((elemento) => {
        elemento.addEventListener('click', () => {
          modal.hidden = true;
          if (!document.querySelector('.modal:not([hidden])')) {
            document.body.classList.remove('modal-open');
          }
        });
      });
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      const abierto = document.querySelector('.modal:not([hidden])');
      if (abierto) {
        abierto.hidden = true;
        if (!document.querySelector('.modal:not([hidden])')) {
          document.body.classList.remove('modal-open');
        }
      }
    });
  }

  function textoBoton(boton, texto) {
    if (!boton) return;
    if (!boton.dataset.textoOriginal) {
      boton.dataset.textoOriginal = boton.innerHTML;
    }
    boton.disabled = true;
    boton.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapar(texto)}`;
  }

  function restaurarBoton(boton) {
    if (!boton) return;
    boton.disabled = false;
    if (boton.dataset.textoOriginal) {
      boton.innerHTML = boton.dataset.textoOriginal;
    }
  }

  /**
   * Dibuja un patrón visual determinista a partir del código del boleto.
   * No sustituye a un lector QR real, pero permite imprimir una referencia estable.
   */
  function patronQR(codigo, tamano = 21) {
    const texto = String(codigo || 'SIN-CODIGO');
    let semilla = 2166136261;
    for (let i = 0; i < texto.length; i += 1) {
      semilla ^= texto.charCodeAt(i);
      semilla = Math.imul(semilla, 16777619) >>> 0;
    }

    const celdas = [];
    let estado = semilla || 1;
    for (let i = 0; i < tamano * tamano; i += 1) {
      estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
      celdas.push((estado >>> 28) & 1);
    }

    const esEsquina = (fila, columna) => {
      const enCuadro = (f, c) => f >= 0 && f < 7 && c >= 0 && c < 7;
      return enCuadro(fila, columna)
        || enCuadro(fila, columna - (tamano - 7))
        || enCuadro(fila - (tamano - 7), columna);
    };

    const esBordeCuadro = (fila, columna) => {
      const borde = (f, c) => {
        const dentro = f >= 0 && f < 7 && c >= 0 && c < 7;
        if (!dentro) return false;
        const marco = f === 0 || f === 6 || c === 0 || c === 6;
        const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
        return marco || centro;
      };
      return borde(fila, columna)
        || borde(fila, columna - (tamano - 7))
        || borde(fila - (tamano - 7), columna);
    };

    const celdasHtml = celdas.map((valor, indice) => {
      const fila = Math.floor(indice / tamano);
      const columna = indice % tamano;
      let activo = Boolean(valor);
      if (esEsquina(fila, columna)) activo = esBordeCuadro(fila, columna);
      return `<i class="${activo ? 'qr-on' : 'qr-off'}"></i>`;
    }).join('');

    return `<div class="qr-dibujo" style="--qr-size:${tamano}" role="img" aria-label="Código QR ${escapar(codigo)}">${celdasHtml}</div>`;
  }

  function fechaInput(valor) {
    return String(valor || '').slice(0, 10);
  }

  function debounce(funcion, espera = 350) {
    let temporizador;
    return (...argumentos) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => funcion(...argumentos), espera);
    };
  }

  window.App = {
    API_URL,
    sesion,
    guardarSesion,
    cerrarSesion,
    requiereSesion,
    api,
    escapar,
    dinero,
    numero,
    fecha,
    fechaLarga,
    fechaHora,
    fechaInput,
    hoyISO,
    claseEstado,
    etiquetaEstado,
    insignia,
    aviso,
    confirmar,
    abrirModal,
    cerrarModal,
    prepararModales,
    textoBoton,
    restaurarBoton,
    patronQR,
    debounce
  };
})();
