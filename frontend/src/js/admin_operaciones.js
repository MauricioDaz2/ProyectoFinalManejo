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

