// Lógica de administración del módulo logístico operativo (Dev 2).
// Consume los endpoints de /api/admin/rutas y /api/admin/parada.

const API = 'http://localhost:3000/api';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const escapeHtml = (valor) => String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const usuarioActual = () => {
    try {
        return JSON.parse(localStorage.getItem('usuario')) || {};
    } catch {
        return {};
    }
};

let toastTimer = null;
const mostrarToast = (mensaje, esError = false) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = mensaje;
    toast.classList.toggle('error', esError);
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
};

const abrirModal = (id) => document.getElementById(id)?.classList.add('open');
const cerrarModal = (id) => document.getElementById(id)?.classList.remove('open');

const etiquetaFrecuencia = (f) =>
    `${f.CIU_ORI_FRE} → ${f.CIU_DES_FRE} (${f.FEC_HOR_INI_FRE || 'sin fecha'})`;

const etiquetaBus = (b) =>
    `${b.NUM_BUS} - ${b.NUM_BUS} [${b.EST_BUS || 's/estado'}]`;

// ---------------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------------
const cargarFlota = async () => {
    const respuesta = await fetch(`${API}/admin/parada/flota`);
    const data = await respuesta.json();
    if (!data.success) throw new Error(data.message || 'No se pudo cargar la flota.');

    const select = document.getElementById('hojaBus');
    select.innerHTML = '<option value="">Seleccione un bus...</option>' +
        data.buses.map((b) => `<option value="${escapeHtml(b.ID_BUS)}">${escapeHtml(etiquetaBus(b))}</option>`).join('');
};

const cargarFrecuencias = async () => {
    const respuesta = await fetch(`${API}/admin/rutas/frecuencias`);
    const data = await respuesta.json();
    if (!data.success) throw new Error(data.message || 'No se pudieron cargar las frecuencias.');

    const opciones = '<option value="">Seleccione una frecuencia...</option>' +
        data.frecuencias.map((f) => `<option value="${escapeHtml(f.ID_FRE)}">${escapeHtml(etiquetaFrecuencia(f))}</option>`).join('');

    const selectHoja = document.getElementById('hojaFrecuencia');
    const selectVincular = document.getElementById('frecuenciaSelect');
    if (selectHoja) selectHoja.innerHTML = opciones;
    if (selectVincular) selectVincular.innerHTML = opciones;
};

const cargarHojas = async () => {
    const tbody = document.getElementById('tablaHojas');
    try {
        const respuesta = await fetch(`${API}/admin/rutas/hojas`);
        const data = await respuesta.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar las hojas de ruta.');
        renderHojas(data.hojas);
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No se pudieron cargar las hojas de ruta.</td></tr>';
        mostrarToast(error.message, true);
    }
};

const renderHojas = (hojas) => {
    const tbody = document.getElementById('tablaHojas');

    if (!hojas || hojas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay hojas de ruta registradas.</td></tr>';
        return;
    }

    tbody.innerHTML = hojas.map((h) => `
        <tr>
            <td>${escapeHtml(h.ID_HOJ)}</td>
            <td>${escapeHtml(h.FEC_PRO_HOJ)}</td>
            <td>${escapeHtml(h.CIU_ORI_FRE)} → ${escapeHtml(h.CIU_DES_FRE)}</td>
            <td><span class="badge badge-bus">${escapeHtml(h.NUM_BUS_PER)} · ${escapeHtml(h.PLA_BUS_PER)}</span></td>
            <td>${h.ID_BUS_REE
                ? `<span class="badge badge-ree">${escapeHtml(h.NUM_BUS_REE)} · ${escapeHtml(h.PLA_BUS_REE)}</span>`
                : '<span class="badge badge-sin">Sin reemplazo</span>'}</td>
            <td><span class="badge badge-estado">${escapeHtml(h.EST_VIA_HO || 'S/E')}</span></td>
            <td>${escapeHtml(h.NOM_COP)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" data-vincular="${escapeHtml(h.ID_HOJ)}">Vincular frecuencia</button>
            </td>
        </tr>
    `).join('');
};

// ---------------------------------------------------------------------------
// Flota de Unidades (vista Parada/Flota)
// ---------------------------------------------------------------------------
const etiquetaEstado = (estado) => {
    const mapa = { OPERANDO: 'Operando', PARADA: 'Operando', TALLER: 'En taller' };
    return mapa[estado] || (estado || 'S/E');
};

const claseEstado = (estado) => `badge badge-${(estado || 'sin').toLowerCase()}`;

const cargarFlotaCompleta = async () => {
    const tbody = document.getElementById('tablaFlota');
    try {
        const respuesta = await fetch(`${API}/admin/parada/flota`);
        const data = await respuesta.json();
        if (!data.success) throw new Error(data.message || 'No se pudo cargar la flota.');
        renderFlota(data.buses);
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty">No se pudo cargar la flota.</td></tr>';
        mostrarToast(error.message, true);
    }
};

const renderFlota = (buses) => {
    const tbody = document.getElementById('tablaFlota');
    if (!tbody) return;

    if (!buses || buses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay unidades registradas.</td></tr>';
        return;
    }

    tbody.innerHTML = buses.map((b) => `
        <tr>
            <td>${escapeHtml(b.ID_BUS)}</td>
            <td>${escapeHtml(b.NUM_BUS)}</td>
            <td>${escapeHtml(b.PLA_BUS)}</td>
            <td>${escapeHtml(b.NUM_PIS)}</td>
            <td>${escapeHtml(b.ANIO_BUS)}</td>
            <td><span class="${claseEstado(b.EST_BUS)}">${escapeHtml(etiquetaEstado(b.EST_BUS))}</span></td>
            <td>${escapeHtml(b.TOTAL_ASIENTOS)}</td>
            <td>${escapeHtml(b.NOM_COP)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" data-asientos="${escapeHtml(b.ID_BUS)}">Ver asientos</button>
            </td>
        </tr>
    `).join('');
};

// ---------------------------------------------------------------------------
// Buses en Parada (retén de contingencia)
// ---------------------------------------------------------------------------
const cargarParada = async () => {
    const tbody = document.getElementById('tablaParada');
    try {
        const respuesta = await fetch(`${API}/admin/parada/flota?estado=PARADA`);
        const data = await respuesta.json();
        if (!data.success) throw new Error(data.message || 'No se pudo cargar los buses en parada.');
        renderParada(data.buses);
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">No se pudieron cargar los buses en parada.</td></tr>';
        mostrarToast(error.message, true);
    }
};

const renderParada = (buses) => {
    const tbody = document.getElementById('tablaParada');
    if (!tbody) return;

    if (!buses || buses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay buses en parada.</td></tr>';
        return;
    }

    tbody.innerHTML = buses.map((b) => `
        <tr>
            <td>${escapeHtml(b.ID_BUS)}</td>
            <td>${escapeHtml(b.NUM_BUS)}</td>
            <td>${escapeHtml(b.PLA_BUS)}</td>
            <td><span class="${claseEstado(b.EST_BUS)}">${escapeHtml(etiquetaEstado(b.EST_BUS))}</span></td>
            <td>${escapeHtml(b.NOM_COP)}</td>
            <td>
                <button class="btn btn-primary btn-sm" data-asignar="${escapeHtml(b.ID_BUS)}">Asignar reemplazo</button>
            </td>
        </tr>
    `).join('');
};

// ---------------------------------------------------------------------------
// Asignación de bus de reemplazo
// ---------------------------------------------------------------------------
let busParaReemplazo = null;

const cargarHojasParaAsignar = async () => {
    const select = document.getElementById('hojaSelect');
    if (!select) return;

    const respuesta = await fetch(`${API}/admin/rutas/hojas`);
    const data = await respuesta.json();
    if (!data.success) throw new Error(data.message || 'No se pudieron cargar las hojas de ruta.');

    select.innerHTML = '<option value="">Seleccione una hoja de ruta...</option>' +
        data.hojas.map((h) => `<option value="${escapeHtml(h.ID_HOJ)}">${escapeHtml(h.ID_HOJ)} · ${escapeHtml(h.CIU_ORI_FRE)} → ${escapeHtml(h.CIU_DES_FRE)}</option>`).join('');
};

const abrirModalAsignar = async (idBus) => {
    busParaReemplazo = idBus;
    document.getElementById('busAsignarLabel').textContent = idBus;
    document.getElementById('errorAsignar').textContent = '';
    try {
        await cargarHojasParaAsignar();
        abrirModal('modalAsignar');
    } catch (error) {
        console.error(error);
        mostrarToast(error.message, true);
    }
};

const asignarBusReemplazo = async () => {
    const errorBox = document.getElementById('errorAsignar');
    errorBox.textContent = '';

    const idHoja = document.getElementById('hojaSelect').value;
    if (!idHoja) {
        errorBox.textContent = 'Seleccione la hoja de ruta a cubrir.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/admin/parada/asignar/${idHoja}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idBusRee: busParaReemplazo })
        });
        const data = await respuesta.json();

        if (!respuesta.ok || !data.success) {
            errorBox.textContent = data.message || 'No se pudo asignar el bus de reemplazo.';
            return;
        }

        cerrarModal('modalAsignar');
        mostrarToast(data.message);
        cargarParada();
    } catch (error) {
        console.error(error);
        errorBox.textContent = 'No se pudo conectar con el servidor.';
    }
};

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
const crearHoja = async () => {
    const errorBox = document.getElementById('errorHoja');
    errorBox.textContent = '';

    const fecPro = document.getElementById('hojaFecha').value;
    const idBus = document.getElementById('hojaBus').value;
    const idFre = document.getElementById('hojaFrecuencia').value;
    const obs = document.getElementById('hojaObs').value.trim();

    if (!fecPro || !idBus || !idFre) {
        errorBox.textContent = 'Complete fecha, bus y frecuencia.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/admin/rutas/hojas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecPro, idBus, idFre, obs, usuarioId: usuarioActual().ID })
        });
        const data = await respuesta.json();

        if (!respuesta.ok || !data.success) {
            errorBox.textContent = data.message || 'No se pudo crear la hoja de ruta.';
            return;
        }

        cerrarModal('modalHoja');
        document.getElementById('hojaFecha').value = '';
        document.getElementById('hojaBus').value = '';
        document.getElementById('hojaFrecuencia').value = '';
        document.getElementById('hojaObs').value = '';
        mostrarToast(data.message);
        cargarHojas();
    } catch (error) {
        console.error(error);
        errorBox.textContent = 'No se pudo conectar con el servidor.';
    }
};

let hojaParaFrecuencia = null;
const abrirModalFrecuencia = (idHoja) => {
    hojaParaFrecuencia = idHoja;
    document.getElementById('hojaSeleccionada').textContent = idHoja;
    document.getElementById('frecuenciaSelect').value = '';
    document.getElementById('errorFrecuencia').textContent = '';
    abrirModal('modalFrecuencia');
};

const asignarFrecuencia = async () => {
    const errorBox = document.getElementById('errorFrecuencia');
    errorBox.textContent = '';

    const idFre = document.getElementById('frecuenciaSelect').value;
    if (!idFre) {
        errorBox.textContent = 'Seleccione una frecuencia.';
        return;
    }

    try {
        const respuesta = await fetch(`${API}/admin/rutas/hojas/${hojaParaFrecuencia}/frecuencia`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idFre })
        });
        const data = await respuesta.json();

        if (!respuesta.ok || !data.success) {
            errorBox.textContent = data.message || 'No se pudo vincular la frecuencia.';
            return;
        }

        cerrarModal('modalFrecuencia');
        mostrarToast(data.message);
        cargarFrecuencias();
    } catch (error) {
        console.error(error);
        errorBox.textContent = 'No se pudo conectar con el servidor.';
    }
};

// ---------------------------------------------------------------------------
// Inicialización de la vista de Hojas de Ruta
// ---------------------------------------------------------------------------
const inicializarHojasRuta = async () => {
    const usuario = usuarioActual();
    const nombreEl = document.getElementById('nombreUsuario');
    if (nombreEl && usuario.nombre) nombreEl.textContent = usuario.nombre;

    document.getElementById('btnSalir')?.addEventListener('click', () => {
        localStorage.removeItem('usuario');
        window.location.href = '../auth/login.html';
    });

    document.getElementById('btnNuevaHoja')?.addEventListener('click', () => abrirModal('modalHoja'));
    document.getElementById('btnGuardarHoja')?.addEventListener('click', crearHoja);
    document.getElementById('btnGuardarFrecuencia')?.addEventListener('click', asignarFrecuencia);

    document.querySelectorAll('[data-cerrar]').forEach((btn) => {
        btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrar));
    });

    document.getElementById('tablaHojas')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-vincular]');
        if (btn) abrirModalFrecuencia(btn.dataset.vincular);
    });

    document.getElementById('buscar')?.addEventListener('input', () => {
        const texto = document.getElementById('buscar').value;
        document.querySelectorAll('#tablaHojas tr').forEach((fila) => {
            fila.style.display = fila.textContent.toLowerCase().includes(texto) ? '' : 'none';
        });
    });

    try {
        await Promise.all([cargarFlota(), cargarFrecuencias()]);
    } catch (error) {
        mostrarToast(error.message, true);
    }
    cargarHojas();
};

document.addEventListener('DOMContentLoaded', () => {
    // Solo se inicializa si la vista de hojas de ruta está presente en el DOM.
    if (document.getElementById('tablaHojas')) {
        inicializarHojasRuta();
    }
});



