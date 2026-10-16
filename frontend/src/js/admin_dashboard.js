(() => {
  'use strict';

  const API = 'http://localhost:3000/api/admin';
  const boton = document.getElementById('btnActualizarDashboard');
  const aviso = document.getElementById('estadoDashboard');
  let cargando = false;

  function escribir(id, valor) {
    document.getElementById(id).textContent = valor === null ? '—' : String(valor);
  }

  async function consultar(ruta, clave) {
    const respuesta = await fetch(`${API}/${ruta}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!respuesta.ok) throw new Error('Error al consultar el servidor.');

    const datos = await respuesta.json();
    if (datos.success !== true || !Array.isArray(datos[clave])) {
      throw new Error('La respuesta del servidor no es válida.');
    }
    return datos[clave];
  }

  async function actualizar() {
    if (cargando) return;
    cargando = true;
    boton.disabled = true;
    boton.textContent = 'Actualizando...';
    aviso.classList.remove('is-error');
    aviso.textContent = 'Consultando información en SQL Server...';

    const [cooperativas, usuarios] = await Promise.allSettled([
      consultar('cooperativas', 'cooperativas'),
      consultar('usuarios', 'usuarios')
    ]);

    if (cooperativas.status === 'fulfilled') {
      escribir('metricCooperativas', cooperativas.value.length);
      escribir('metricCooperativasActivas', cooperativas.value.filter((cooperativa) => String(cooperativa.EST_COP).trim() === '1').length);
    } else {
      escribir('metricCooperativas', null);
      escribir('metricCooperativasActivas', null);
    }

    if (usuarios.status === 'fulfilled') {
      escribir('metricOficinistas', usuarios.value.filter((usuario) => String(usuario.ID_ROL_PER).trim() === 'R003').length);
      escribir('metricControladores', usuarios.value.filter((usuario) => String(usuario.ID_ROL_PER).trim() === 'R004').length);
    } else {
      escribir('metricOficinistas', null);
      escribir('metricControladores', null);
    }

    if (cooperativas.status === 'fulfilled' && usuarios.status === 'fulfilled') {
      aviso.textContent = 'Información actualizada con los registros de SQL Server.';
    } else if (cooperativas.status === 'rejected' && usuarios.status === 'rejected') {
      aviso.textContent = 'No se pudieron consultar los datos. Verifica que Node.js y SQL Server estén funcionando.';
      aviso.classList.add('is-error');
    } else {
      aviso.textContent = 'Algunos datos no pudieron cargarse. Verifica el servidor y vuelve a intentar.';
      aviso.classList.add('is-error');
    }

    cargando = false;
    boton.disabled = false;
    boton.textContent = 'Actualizar';
  }

  boton.addEventListener('click', actualizar);
  actualizar();
})();
