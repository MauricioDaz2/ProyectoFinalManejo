/* RFC-000083 · Planificador rotativo «Hoja de ruta y frecuencias» por grupos de 4 buses.
 * La lógica de rotación es pura (CoopRotacion.*) y la interfaz se monta solo si existe #rotacionApp.
 * Los datos se guardan en localStorage aislados por cooperativa (ID_COP_PER).
 */
(function (global) {
  'use strict';

  const VERSION = 1;
  const PREFIJO_CLAVE = 'coop_rotacion_v1_';
  const MS_DIA = 86400000;

  // Filas de la hoja de ruta (orden fijo de arriba hacia abajo).
  const FILAS = Object.freeze([
    Object.freeze({ id: 'AQ', titulo: 'Ambato - Quito', hora: '7:00 am' }),
    Object.freeze({ id: 'QA', titulo: 'Quito - Ambato', hora: '7:00 am' }),
    Object.freeze({ id: 'P1', titulo: 'Parada 1', hora: '' }),
    Object.freeze({ id: 'P2', titulo: 'Parada 2', hora: '' })
  ]);

  // Rotación diaria: Parada 2 -> Ambato - Quito, Ambato - Quito -> Quito - Ambato,
  // Quito - Ambato -> Parada 1, Parada 1 -> Parada 2. Equivale a desplazar la columna 1 fila hacia abajo.
  function rotar(columna, pasos) {
    const n = columna.length;
    const k = ((pasos % n) + n) % n;
    return columna.map((_, i) => columna[(i - k + n) % n]);
  }

  function esFechaIso(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const [a, m, d] = valor.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }

  function diaUtc(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  }

  function diasEntre(desde, hasta) {
    return Math.round((diaUtc(hasta) - diaUtc(desde)) / MS_DIA);
  }

  function sumarDias(iso, dias) {
    return new Date(diaUtc(iso) + dias * MS_DIA).toISOString().slice(0, 10);
  }

  function formatoCorto(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  function esColumnaCompleta(col) {
    return Array.isArray(col) && col.length === 4 && new Set(col).size === 4 &&
      col.every((i) => Number.isInteger(i) && i >= 0 && i < 4);
  }

  function normalizarBus(valor) {
    return String(valor ?? '').trim();
  }

  function validarBuses(buses) {
    if (!Array.isArray(buses) || buses.length !== 4) return 'El grupo debe tener exactamente 4 buses.';
    const limpios = buses.map(normalizarBus);
    if (limpios.some((b) => !b)) return 'Grupo incompleto: ingresa los 4 buses.';
    if (limpios.some((b) => !/^[A-Za-z0-9-]{1,10}$/.test(b))) return 'Cada bus debe tener hasta 10 letras, números o guiones.';
    if (new Set(limpios.map((b) => b.toUpperCase())).size !== 4) return 'Los 4 buses del grupo deben ser distintos.';
    return null;
  }

  function nuevoId(grupos) {
    let n = grupos.length + 1;
    const usados = new Set(grupos.map((g) => g.id));
    while (usados.has(`G${n}`)) n += 1;
    return `G${n}`;
  }

  function estadoInicial() {
    return {
      version: VERSION,
      grupoActivo: 'G1',
      grupos: [{
        id: 'G1',
        nombre: 'Grupo 1',
        buses: ['01', '02', '03', '04'],
        fechas: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
        // Índices de bus (0..3) por fila: [Ambato - Quito, Quito - Ambato, Parada 1, Parada 2].
        asignaciones: {
          '2026-11-25': [0, 1, 2, 3],
          '2026-11-26': [3, 0, 1, 2],
          '2026-11-27': [2, 3, 0, 1],
          '2026-11-28': [1, 2, 3, 0]
        }
      }]
    };
  }

  function sanearEstado(dato) {
    if (!dato || dato.version !== VERSION || !Array.isArray(dato.grupos) || !dato.grupos.length) return null;
    const grupos = [];
    for (const g of dato.grupos) {
      if (!g || typeof g.id !== 'string' || validarBuses(g.buses)) return null;
      const fechas = [...new Set((g.fechas || []).filter(esFechaIso))].sort();
      const asignaciones = {};
      for (const f of fechas) {
        const col = g.asignaciones?.[f];
        if (esColumnaCompleta(col)) asignaciones[f] = col.slice();
      }
      grupos.push({
        id: g.id,
        nombre: String(g.nombre || g.id).slice(0, 40),
        buses: g.buses.map(normalizarBus),
        fechas,
        asignaciones
      });
    }
    const activo = grupos.some((g) => g.id === dato.grupoActivo) ? dato.grupoActivo : grupos[0].id;
    return { version: VERSION, grupoActivo: activo, grupos };
  }

  function grupoActivo(estado) {
    return estado.grupos.find((g) => g.id === estado.grupoActivo) || estado.grupos[0];
  }

  function sugerirFecha(grupo, hoyIso) {
    if (grupo.fechas.length) return sumarDias(grupo.fechas[grupo.fechas.length - 1], 1);
    return hoyIso;
  }

  function agregarFecha(grupo, iso) {
    if (!esFechaIso(iso)) return { ok: false, mensaje: 'Selecciona una fecha válida.' };
    if (grupo.fechas.includes(iso)) return { ok: false, mensaje: `La fecha ${formatoCorto(iso)} ya existe en ${grupo.nombre}.` };
    grupo.fechas = [...grupo.fechas, iso].sort();
    return { ok: true, mensaje: `Fecha ${formatoCorto(iso)} agregada. Pulsa «Generar Bus» para asignar las unidades.` };
  }

  // Completa las columnas vacías respetando las asignaciones previas.
  function generar(grupo) {
    const vacias = grupo.fechas.filter((f) => !esColumnaCompleta(grupo.asignaciones[f]));
    if (!grupo.fechas.length) return { ok: false, mensaje: 'Agrega al menos una fecha antes de generar.' };
    if (!vacias.length) return { ok: false, mensaje: 'No hay fechas vacías para generar.' };
    const error = validarBuses(grupo.buses);
    if (error) return { ok: false, mensaje: error };

    for (const fecha of vacias) {
      const llenas = grupo.fechas.filter((f) => esColumnaCompleta(grupo.asignaciones[f]));
      if (!llenas.length) {
        // Grupo nuevo: se inicializa en su orden de registro.
        grupo.asignaciones[fecha] = [0, 1, 2, 3];
        continue;
      }
      const previas = llenas.filter((f) => f < fecha);
      const referencia = previas.length ? previas[previas.length - 1] : llenas[0];
      grupo.asignaciones[fecha] = rotar(grupo.asignaciones[referencia], diasEntre(referencia, fecha));
    }
    return { ok: true, mensaje: `Se generaron ${vacias.length} fecha(s). Recuerda pulsar «Guardar».` };
  }

  function guardarGrupo(estado, { id, nombre, buses }) {
    const limpios = (buses || []).map(normalizarBus);
    const error = validarBuses(limpios);
    if (error) return { ok: false, mensaje: error };
    const nombreLimpio = String(nombre || '').trim().slice(0, 40);
    if (id) {
      const grupo = estado.grupos.find((g) => g.id === id);
      if (!grupo) return { ok: false, mensaje: 'El grupo ya no existe.' };
      grupo.buses = limpios;
      grupo.nombre = nombreLimpio || grupo.nombre;
      estado.grupoActivo = grupo.id;
      return { ok: true, mensaje: `${grupo.nombre} actualizado.` };
    }
    const nuevo = {
      id: nuevoId(estado.grupos),
      nombre: nombreLimpio || `Grupo ${estado.grupos.length + 1}`,
      buses: limpios,
      fechas: [],
      asignaciones: {}
    };
    estado.grupos.push(nuevo);
    estado.grupoActivo = nuevo.id;
    return { ok: true, mensaje: `${nuevo.nombre} creado. Agrega fechas y pulsa «Generar Bus».` };
  }

  function claveAlmacen(cooperativaId) {
    const id = String(cooperativaId || '').trim().toUpperCase();
    return id ? PREFIJO_CLAVE + id : null;
  }

  function cargar(almacen, cooperativaId) {
    const clave = claveAlmacen(cooperativaId);
    if (!clave || !almacen) return estadoInicial();
    try {
      const crudo = almacen.getItem(clave);
      return (crudo && sanearEstado(JSON.parse(crudo))) || estadoInicial();
    } catch {
      return estadoInicial();
    }
  }

  function guardar(almacen, cooperativaId, estado) {
    const clave = claveAlmacen(cooperativaId);
    if (!clave) return { ok: false, mensaje: 'No se identificó la cooperativa de la sesión.' };
    try {
      almacen.setItem(clave, JSON.stringify(estado));
      return { ok: true, mensaje: 'Hoja de ruta guardada correctamente.' };
    } catch {
      return { ok: false, mensaje: 'No se pudo guardar en este navegador.' };
    }
  }

  const CoopRotacion = {
    FILAS, rotar, esFechaIso, diasEntre, sumarDias, formatoCorto, esColumnaCompleta,
    validarBuses, estadoInicial, sanearEstado, grupoActivo, sugerirFecha, agregarFecha,
    generar, guardarGrupo, claveAlmacen, cargar, guardar
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CoopRotacion;
  global.CoopRotacion = CoopRotacion;

  /* ------------------------------- Interfaz ------------------------------- */

  function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function montar(doc) {
    const raiz = doc.getElementById('rotacionApp');
    if (!raiz) return;
    if (global.TransportSession) await global.TransportSession.ready;
    const usuario = global.App?.sesion?.() || global.TransportSession?.user || null;
    const cooperativaId = usuario?.cooperativaId;
    let almacen = null;
    try { almacen = global.localStorage; } catch { almacen = null; }

    let estado = cargar(almacen, cooperativaId);

    const el = (id) => doc.getElementById(id);
    const tabla = el('rotacionTabla');
    const unidades = el('rotacionUnidades');
    const aviso = el('rotacionAviso');
    const nombreGrupo = el('rotacionGrupoNombre');
    const formFecha = el('rotacionFormFecha');
    const inputFecha = el('rotacionFecha');
    const formGrupo = el('rotacionFormGrupo');
    const selectGrupo = el('rotacionSelectGrupo');
    const inputNombre = el('rotacionNombreGrupo');
    const inputsBus = [0, 1, 2, 3].map((i) => el(`rotacionBus${i + 1}`));
    let editandoId = null;

    function mostrar(resultado) {
      if (!aviso) return;
      aviso.className = `rotacion-aviso ${resultado.ok ? 'is-ok' : 'is-error'}`;
      aviso.textContent = resultado.mensaje;
      aviso.hidden = false;
    }

    function render() {
      const grupo = grupoActivo(estado);
      if (nombreGrupo) nombreGrupo.textContent = grupo.nombre;
      const cabecera = grupo.fechas.map((f) => `<th scope="col" title="${escapar(f)}">${formatoCorto(f)}</th>`).join('');
      const filas = FILAS.map((fila, i) => {
        const celdas = grupo.fechas.map((f) => {
          const col = grupo.asignaciones[f];
          return esColumnaCompleta(col)
            ? `<td>${escapar(grupo.buses[col[i]])}</td>`
            : '<td class="rotacion-vacia" aria-label="Sin asignar">—</td>';
        }).join('');
        const hora = fila.hora ? `<span class="rotacion-hora">${escapar(fila.hora)}</span>` : '';
        return `<tr data-fila="${fila.id}"><th scope="row"><strong>${escapar(fila.titulo)}</strong>${hora}</th>${celdas}</tr>`;
      }).join('');
      tabla.innerHTML = `<thead><tr><th scope="col">Origen - Destino / Hora</th>${cabecera}</tr></thead><tbody>${filas}</tbody>`;
      unidades.innerHTML = grupo.buses.map((b, i) => `<li>Bus número ${i + 1}: <strong>${escapar(b)}</strong></li>`).join('');
      if (selectGrupo) {
        selectGrupo.innerHTML = estado.grupos.map((g) => `<option value="${escapar(g.id)}"${g.id === grupo.id ? ' selected' : ''}>${escapar(g.nombre)}</option>`).join('');
      }
    }

    function abrirFormGrupo(grupo) {
      editandoId = grupo ? grupo.id : null;
      if (inputNombre) inputNombre.value = grupo ? grupo.nombre : `Grupo ${estado.grupos.length + 1}`;
      inputsBus.forEach((input, i) => { if (input) input.value = grupo ? grupo.buses[i] : ''; });
      if (formGrupo) formGrupo.hidden = false;
      if (formFecha) formFecha.hidden = true;
    }

    el('rotacionBtnFecha')?.addEventListener('click', () => {
      if (inputFecha) inputFecha.value = sugerirFecha(grupoActivo(estado), hoyLocal());
      if (formFecha) formFecha.hidden = false;
      if (formGrupo) formGrupo.hidden = true;
      inputFecha?.focus?.();
    });

    formFecha?.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = agregarFecha(grupoActivo(estado), inputFecha.value);
      mostrar(r);
      if (r.ok) { formFecha.hidden = true; render(); }
    });

    el('rotacionCancelarFecha')?.addEventListener('click', () => { if (formFecha) formFecha.hidden = true; });

    el('rotacionBtnGrupo')?.addEventListener('click', () => abrirFormGrupo(grupoActivo(estado)));
    el('rotacionNuevoGrupo')?.addEventListener('click', () => abrirFormGrupo(null));

    selectGrupo?.addEventListener('change', () => {
      estado.grupoActivo = selectGrupo.value;
      abrirFormGrupo(grupoActivo(estado));
      render();
    });

    formGrupo?.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = guardarGrupo(estado, { id: editandoId, nombre: inputNombre?.value, buses: inputsBus.map((i) => i?.value) });
      mostrar(r);
      if (r.ok) { formGrupo.hidden = true; render(); }
    });

    el('rotacionCancelarGrupo')?.addEventListener('click', () => { if (formGrupo) formGrupo.hidden = true; });

    el('rotacionBtnGenerar')?.addEventListener('click', () => {
      const r = generar(grupoActivo(estado));
      mostrar(r);
      if (r.ok) render();
    });

    el('rotacionBtnGuardar')?.addEventListener('click', () => mostrar(guardar(almacen, cooperativaId, estado)));

    render();
  }

  if (global.document) {
    const iniciar = () => { montar(global.document); };
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
})(typeof window !== 'undefined' ? window : globalThis);
