((root) => {
    'use strict';
    const normalized = (value) => String(value ?? '').trim().toUpperCase();
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    function number(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Indicador no válido');
        return value;
    }
    function frequencies(rows) {
        const active = rows.filter((row) => normalized(row.EST_RES) === '1');
        const routes = new Map();
        for (const row of active) {
            if (!row.CIU_ORI_FRE || !row.CIU_DES_FRE) throw new Error('Ruta incompleta');
            routes.set(JSON.stringify([normalized(row.CIU_ORI_FRE), normalized(row.CIU_DES_FRE)]), { origin: row.CIU_ORI_FRE, destination: row.CIU_DES_FRE });
        }
        return { count: active.length, routes: [...routes.values()] };
    }
    function trips(rows, day) {
        if (rows.some((row) => !row.ID_HOJ || !/^\d{4}-\d{2}-\d{2}/.test(String(row.FEC_PRO_HOJ)) || !row.EST_VIA_HOJ)) throw new Error('Programación incompleta');
        const active = rows.filter((row) => ['PROGRAMADA', 'PROGRAMADO', 'EN CURSO'].includes(normalized(row.EST_VIA_HOJ)));
        return {
            today: active.filter((row) => String(row.FEC_PRO_HOJ).slice(0, 10) === day).length,
            upcoming: active.filter((row) => String(row.FEC_PRO_HOJ).slice(0, 10) >= day).sort((a, b) => String(a.FEC_PRO_HOJ).localeCompare(String(b.FEC_PRO_HOJ)) || String(a.ID_HOJ).localeCompare(String(b.ID_HOJ))).slice(0, 5)
        };
    }
    const data = { normalized, today, number, frequencies, trips };
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
    else root.CoopDashboardData = data;
})(globalThis);
