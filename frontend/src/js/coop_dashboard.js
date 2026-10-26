(() => {
  'use strict';

  const usuario = App.sesion();
  if (!usuario) return;

  const cooperativa = usuario.cooperativaId;
  const tablaSalidas = document.getElementById('tablaSalidas');
  const statGrid = document.getElementById('statGrid');
  const avisoPanel = document.getElementById('avisoPanel');
  const heroNombre = document.getElementById('heroNombre');
  const heroHojas = document.getElementById('heroHojas');
  const botonActualizar = document.getElementById('btnActualizar');

  function aviso(mensaje, tipo = 'warning') {
    avisoPanel.innerHTML = `<div class="notice ${tipo === 'danger' ? 'danger' : tipo === 'warning' ? 'warning' : ''}">
      <span aria-hidden="true">!</span><span>${App.escapar(mensaje)}</span>
    </div>`;
  }

  function indicadores(resumen) {
    const tarjetas = [
      {
        icono: '▤',
        etiqueta: 'Buses activos',
        valor: App.numero(resumen.BUSES_ACTIVOS),
        pista: `${App.numero(resumen.TOTAL_BUSES)} unidades registradas`
      },
      {
        icono: '▧',
        etiqueta: 'Resoluciones ANT',
        valor: App.numero(resumen.TOTAL_RESOLUCIONES),
        pista: `${App.numero(resumen.FRECUENCIAS_ACTIVAS)} frecuencias activas`
      },
      {
        icono: '⇄',
        etiqueta: 'Hojas de ruta hoy',
        valor: App.numero(resumen.HOJAS_HOY),
        pista: `${App.numero(resumen.RESERVAS_PENDIENTES)} reservas pendientes`
      },
      {
        icono: '▣',
        etiqueta: 'Boletos vendidos hoy',
        valor: App.numero(resumen.BOLETOS_HOY),
        pista: `${App.dinero(resumen.INGRESOS_HOY)} en ingresos`
      },
      {
        icono: '$',
        etiqueta: 'Ingresos del día',
        valor: App.dinero(resumen.INGRESOS_HOY),
        pista: `${App.dinero(resumen.PROMEDIO_BOLETO_HOY)} promedio por boleto`,
        acento: true
      },
      {
        icono: '◉',
        etiqueta: 'Reservas pendientes',
        valor: App.numero(resumen.RESERVAS_PENDIENTES),
        pista: 'Boletos en estado reservado'
      }
    ];

    statGrid.innerHTML = tarjetas.map((tarjeta) => `
      <article class="stat-card ${tarjeta.acento ? 'accent' : ''}">
        <div class="stat-icon" aria-hidden="true">${tarjeta.icono}</div>
        <div class="stat-copy">
          <div class="stat-label">${App.escapar(tarjeta.etiqueta)}</div>
          <div class="stat-value">${App.escapar(tarjeta.valor)}</div>
          <div class="stat-hint">${App.escapar(tarjeta.pista)}</div>
        </div>
      </article>
    `).join('');
  }

  function ocupacion(vendidos, total) {
    const totalNumero = Number(total) || 0;
    const vendidosNumero = Number(vendidos) || 0;
    const porcentaje = totalNumero > 0 ? Math.round((vendidosNumero / totalNumero) * 100) : 0;
    const clase = porcentaje >= 90 ? 'danger' : porcentaje >= 65 ? 'warn' : '';
    return {
      porcentaje,
      html: `
        <div class="cell-main">
          <span>${vendidosNumero} / ${totalNumero} asientos</span>
          <div class="progress ${clase}"><span style="width:${Math.min(porcentaje, 100)}%"></span></div>
        </div>`
    };
  }

  function filaSalida(salida) {
    const datosOcupacion = ocupacion(salida.BOLETOS_VENDIDOS, salida.TOTAL_ASIENTOS);
    return `
      <tr>
        <td class="mono strong">${App.escapar(salida.ID_HOJ)}</td>
        <td>${App.fecha(salida.FEC_PRO_HOJ)}</td>
        <td>
          <div class="cell-route">
            <span>${App.escapar(salida.CIU_ORI_FRE)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>${App.escapar(salida.CIU_DES_FRE)}</span>
          </div>
        </td>
        <td>
          <div class="cell-main">
            <strong>${App.escapar(salida.NUM_BUS)}</strong>
            <span>${App.escapar(salida.PLA_BUS)}</span>
          </div>
        </td>
        <td>${datosOcupacion.html}</td>
        <td>${App.insignia(salida.EST_VIA_HOJ)}</td>
      </tr>`;
  }

  async function cargar() {
    if (!cooperativa) {
      aviso('Tu usuario no tiene una cooperativa asignada. Solicita al administrador que complete tu registro.', 'danger');
      tablaSalidas.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Sin cooperativa asignada</h3><p>No es posible consultar los indicadores.</p></div></td></tr>`;
      return;
    }

    App.textoBoton(botonActualizar, 'Actualizando…');
    try {
      const datos = await App.api('/coop/resumen', { query: { cooperativa } });
      heroNombre.textContent = datos.cooperativa?.NOM_COP || 'Mi cooperativa';
      heroHojas.textContent = App.numero(datos.resumen?.HOJAS_HOY);

      const resumen = datos.resumen || {};
      indicadores(resumen);
      avisoPanel.innerHTML = '';

      const salidas = datos.proximasSalidas || [];
      tablaSalidas.innerHTML = salidas.length > 0
        ? salidas.map(filaSalida).join('')
        : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⇄</div><h3>Sin salidas programadas</h3><p>Crea hojas de ruta desde la gestión de flota para verlas reflejadas aquí.</p></div></td></tr>`;
    } catch (error) {
      aviso(error.message, 'danger');
      statGrid.innerHTML = '';
      tablaSalidas.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">!</div><h3>No se pudo cargar el resumen</h3><p>${App.escapar(error.message)}</p></div></td></tr>`;
    } finally {
      App.restaurarBoton(botonActualizar);
    }
  }

  botonActualizar?.addEventListener('click', cargar);
  cargar();
})();
