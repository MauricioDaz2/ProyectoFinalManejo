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
