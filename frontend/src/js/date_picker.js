(() => {
  'use strict';

  if (typeof document === 'undefined' || !document.body) return;

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const ICONO_CALENDARIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  const pad = (n) => String(n).padStart(2, '0');

  function hoyEcuador() {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
    return {
      year: Number(mapa.year),
      month: Number(mapa.month) - 1,
      day: Number(mapa.day),
      hour: Number(mapa.hour) % 24,
      minute: Number(mapa.minute)
    };
  }

  function parseValor(input) {
    const raw = String(input.value || '').trim();
    const conHora = input.type === 'datetime-local';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
      hour: conHora ? Number(match[4] ?? 8) : 0,
      minute: conHora ? Number(match[5] ?? 0) : 0
    };
  }

  function formatearValor(input, data) {
    const fecha = `${data.year}-${pad(data.month + 1)}-${pad(data.day)}`;
    if (input.type === 'datetime-local') {
      return `${fecha}T${pad(data.hour)}:${pad(data.minute)}`;
    }
    return fecha;
  }

  function emitirCambios(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let popover = null;
  let activo = null;
  let vista = { year: 2026, month: 0 };
  let horaTemp = { hour: 8, minute: 0 };

  function asegurarPopover() {
    if (popover) return popover;
    popover = document.createElement('div');
    popover.className = 'cal-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Selector de fecha');
    popover.hidden = true;
    document.body.appendChild(popover);

    popover.addEventListener('mousedown', (e) => {
      if (!e.target.closest('select')) e.preventDefault();
    });
    return popover;
  }

  function posicionar() {
    if (!popover || popover.hidden || !activo) return;
    const anchor = activo.closest('.date-input-wrap') || activo;
    const rect = anchor.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - rect.bottom;
    const top = espacioAbajo >= popRect.height + 12 || espacioAbajo >= rect.top
      ? Math.min(rect.bottom + 6, window.innerHeight - popRect.height - 10)
      : Math.max(10, rect.top - popRect.height - 6);
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - popRect.width - 10));
    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
  }

  function cerrar() {
    if (!popover) return;
    popover.hidden = true;
    activo = null;
  }

  function renderCalendario() {
    if (!popover || !activo) return;
    const conHora = activo.type === 'datetime-local';
    const actual = parseValor(activo);
    const hoy = hoyEcuador();
    const primerDia = new Date(vista.year, vista.month, 1);
    const offsetInicio = (primerDia.getDay() + 6) % 7;
    const diasMes = new Date(vista.year, vista.month + 1, 0).getDate();

    const celdas = [];
    for (let i = 0; i < offsetInicio; i += 1) {
      celdas.push('<span class="cal-empty" aria-hidden="true"></span>');
    }
    for (let d = 1; d <= diasMes; d += 1) {
      const esHoy = vista.year === hoy.year && vista.month === hoy.month && d === hoy.day;
      const esSel = actual && vista.year === actual.year && vista.month === actual.month && d === actual.day;
      const clases = ['cal-day'];
      if (esHoy) clases.push('is-today');
      if (esSel) clases.push('is-selected');
      celdas.push(`<button type="button" class="${clases.join(' ')}" data-day="${d}" aria-pressed="${esSel ? 'true' : 'false'}">${d}</button>`);
    }

    const horasOpt = Array.from({ length: 24 }, (_, h) =>
      `<option value="${h}" ${h === horaTemp.hour ? 'selected' : ''}>${pad(h)}</option>`
    ).join('');
    const minutosBase = Array.from({ length: 12 }, (_, idx) => idx * 5);
    if (!minutosBase.includes(horaTemp.minute)) minutosBase.push(horaTemp.minute);
    minutosBase.sort((a, b) => a - b);
    const minsOpt = minutosBase.map((m) =>
      `<option value="${m}" ${m === horaTemp.minute ? 'selected' : ''}>${pad(m)}</option>`
    ).join('');

    const bloqueHora = conHora ? `
      <div class="cal-time">
        <span>Hora (Ecuador)</span>
        <div class="cal-time-selects">
          <select id="calHour" aria-label="Hora">${horasOpt}</select>
          <strong>:</strong>
          <select id="calMinute" aria-label="Minutos">${minsOpt}</select>
        </div>
      </div>` : '';

    popover.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Mes anterior">‹</button>
        <strong class="cal-title">${MESES[vista.month]} ${vista.year}</strong>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-weekdays">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${celdas.join('')}</div>
      ${bloqueHora}
      <div class="cal-foot">
        <button type="button" class="cal-action" data-action="today">Hoy</button>
        <div class="cal-foot-right">
          ${!activo.required ? '<button type="button" class="cal-action" data-action="clear">Limpiar</button>' : ''}
          ${conHora ? '<button type="button" class="cal-action cal-action-primary" data-action="done">Aplicar</button>' : ''}
        </div>
      </div>`;

    popover.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.nav);
        const siguiente = new Date(vista.year, vista.month + delta, 1);
        vista = { year: siguiente.getFullYear(), month: siguiente.getMonth() };
        renderCalendario();
        posicionar();
      });
    });

    popover.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dia = Number(btn.dataset.day);
        activo.value = formatearValor(activo, {
          year: vista.year,
          month: vista.month,
          day: dia,
          hour: horaTemp.hour,
          minute: horaTemp.minute
        });
        emitirCambios(activo);
        if (conHora) {
          renderCalendario();
        } else {
          cerrar();
        }
      });
    });

    const selHora = popover.querySelector('#calHour');
    const selMin = popover.querySelector('#calMinute');
    const actualizarHora = () => {
      horaTemp = { hour: Number(selHora.value), minute: Number(selMin.value) };
      const base = parseValor(activo) || { year: vista.year, month: vista.month, day: hoy.day };
      activo.value = formatearValor(activo, { ...base, ...horaTemp });
      emitirCambios(activo);
    };
    selHora?.addEventListener('change', actualizarHora);
    selMin?.addEventListener('change', actualizarHora);

    popover.querySelector('[data-action="today"]')?.addEventListener('click', () => {
      const h = hoyEcuador();
      vista = { year: h.year, month: h.month };
      const hora = conHora ? horaTemp : { hour: 0, minute: 0 };
      activo.value = formatearValor(activo, { year: h.year, month: h.month, day: h.day, ...hora });
      emitirCambios(activo);
      if (conHora) renderCalendario();
      else cerrar();
    });

    popover.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      activo.value = '';
      emitirCambios(activo);
      cerrar();
    });

    popover.querySelector('[data-action="done"]')?.addEventListener('click', cerrar);
  }

  function abrirPara(input) {
    if (!input || input.disabled) return;
    asegurarPopover();
    activo = input;
    const actual = parseValor(input);
    const hoy = hoyEcuador();
    vista = actual ? { year: actual.year, month: actual.month } : { year: hoy.year, month: hoy.month };
    horaTemp = actual
      ? { hour: actual.hour, minute: actual.minute }
      : { hour: (hoy.hour + 1) % 24, minute: 0 };
    renderCalendario();
    popover.hidden = false;
    posicionar();
  }

  function mejorarInput(input) {
    if (!input || input.dataset.calEnhanced === '1') return;
    input.dataset.calEnhanced = '1';

    const wrap = document.createElement('div');
    wrap.className = 'date-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-picker-trigger';
    btn.setAttribute('aria-label', 'Elegir en calendario');
    btn.title = 'Elegir en calendario';
    btn.innerHTML = ICONO_CALENDARIO;
    wrap.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activo === input && popover && !popover.hidden) cerrar();
      else abrirPara(input);
    });

    input.addEventListener('click', () => {
      abrirPara(input);
    });
  }

  function inicializar(raiz = document) {
    raiz.querySelectorAll('input[data-calendar-picker], input[type="date"], input[type="datetime-local"]').forEach(mejorarInput);
  }

  document.addEventListener('click', (e) => {
    if (!popover || popover.hidden) return;
    if (popover.contains(e.target)) return;
    if (activo && (activo === e.target || activo.closest('.date-input-wrap')?.contains(e.target))) return;
    cerrar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });

  window.addEventListener('resize', posicionar);
  window.addEventListener('scroll', posicionar, true);

  window.CalendarPicker = { init: inicializar, open: abrirPara, close: cerrar };
  inicializar();
})();
