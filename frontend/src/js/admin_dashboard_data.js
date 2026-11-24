((root) => {
  'use strict';
  const normalize = (value) => String(value ?? '').trim().toUpperCase();
  const scheduled = (row) => ['PROGRAMADA', 'PROGRAMADO'].includes(normalize(row.EST_VIA_HOJ));
  const day = (row) => String(row.FEC_PRO_HOJ || '').slice(0, 10);
  const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  function days(end) {
    return Array.from({ length: 7 }, (_, i) => {
      const value = new Date(`${end}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() - 6 + i);
      return value.toISOString().slice(0, 10);
    });
  }
  function routes(rows) {
    return new Set(rows.map((row) => {
      const origin = normalize(row.CIU_ORI_FRE);
      const destination = normalize(row.CIU_DES_FRE);
      if (!origin || !destination) throw new Error('Ruta incompleta');
      return JSON.stringify([origin, destination]);
    })).size;
  }
  function trips(rows, today) {
    if (rows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(day(row)) || !row.ID_HOJ || !row.EST_VIA_HOJ)) throw new Error('Programación incompleta');
    const current = rows.filter((row) => day(row) === today);
    return {
      scheduled: current.filter(scheduled).length,
      active: current.filter((row) => normalize(row.EST_VIA_HOJ) === 'EN CURSO').length,
      occupancy: current.filter((row) => scheduled(row) || normalize(row.EST_VIA_HOJ) === 'EN CURSO'),
      upcoming: rows.filter((row) => day(row) >= today && scheduled(row)).sort((a, b) => day(a).localeCompare(day(b)) || String(a.ID_HOJ).localeCompare(String(b.ID_HOJ))).slice(0, 5)
    };
  }
  function seats(maps) {
    const counts = { occupied: 0, reserved: 0, free: 0, total: 0 };
    const keys = { OCUPADO: 'occupied', RESERVADO: 'reserved', LIBRE: 'free' };
    for (const rows of maps) {
      if (!Array.isArray(rows) || !rows.length) throw new Error('Sin mapa de asientos');
      const ids = new Set();
      for (const row of rows) {
        const key = keys[normalize(row.ESTADO_ASIENTO)];
        if (!key || !row.ID_ASI || ids.has(String(row.ID_ASI))) throw new Error('Mapa de asientos no válido');
        ids.add(String(row.ID_ASI));
        counts[key]++;
        counts.total++;
      }
    }
    return counts;
  }
  function sales(response, date) {
    const count = response.resumen?.VENDIDOS_HOY;
    if (response.fecha !== date || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Resumen no válido');
    return count;
  }
  function operational(kind, rows) {
    const config = {
      cooperatives: { title: 'Cooperativas', icon: 'building', href: 'cooperativas.html' },
      buses: { title: 'Buses', icon: 'bus', href: 'parada_buses.html' },
      routes: { title: 'Rutas', icon: 'route', href: null },
      staff: { title: 'Personal operativo', icon: 'people', href: 'usuarios.html#oficinistas' }
    };
    const result = { ...config[kind], tone: 'neutral', message: 'No disponible. No se pudo consultar esta información.' };
    if (!Array.isArray(rows)) return result;
    result.tone = 'ok';
    if (kind === 'cooperatives') {
      const active = rows.filter((row) => normalize(row.EST_COP) === '1').length;
      const inactive = rows.filter((row) => normalize(row.EST_COP) === '0').length;
      const unknown = rows.length - active - inactive;
      result.message = rows.length ? `${active} activas · ${inactive} inactivas.${unknown ? ` ${unknown} sin estado reconocido.` : ''}` : 'No hay cooperativas registradas.';
      if (!active || inactive || unknown) result.tone = 'attention';
    } else if (kind === 'buses') {
      result.message = rows.length ? `${rows.length} buses registrados.` : 'No hay buses registrados.';
      if (!rows.length) result.tone = 'attention';
    } else if (kind === 'routes') {
      const total = routes(rows);
      result.message = total ? `${total} rutas registradas.` : 'No hay rutas registradas.';
      if (!total) result.tone = 'attention';
      else if (rows.every((row) => ['0', '1'].includes(normalize(row.EST_RES)))) {
        const active = routes(rows.filter((row) => normalize(row.EST_RES) === '1'));
        result.message += ` ${active} con frecuencias activas.`;
        if (!active) result.tone = 'attention';
      }
    } else if (kind === 'staff') {
      const office = rows.filter((row) => normalize(row.ID_ROL_PER) === 'R003');
      const controllers = rows.filter((row) => normalize(row.ID_ROL_PER) === 'R004');
      const staff = [...office, ...controllers];
      result.message = staff.length ? `${office.length} oficinistas · ${controllers.length} controladores.` : 'No hay personal operativo registrado.';
      if (!office.length || !controllers.length) result.tone = 'attention';
      if (staff.length && staff.every((row) => ['0', '1'].includes(normalize(row.EST_USU)))) {
        const active = staff.filter((row) => normalize(row.EST_USU) === '1').length;
        result.message += ` ${active} activos · ${staff.length - active} inactivos.`;
        if (!office.some((row) => normalize(row.EST_USU) === '1') || !controllers.some((row) => normalize(row.EST_USU) === '1')) result.tone = 'attention';
      }
      if (!controllers.length && office.length) result.href = 'usuarios.html#controladores';
    }
    return result;
  }
  const helpers = { normalize, date, day, days, routes, trips, seats, sales, operational };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else root.DashboardData = helpers;
})(globalThis);
