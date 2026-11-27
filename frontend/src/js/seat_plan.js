const SeatPlan = (() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
    const labels = {PASILLO:'Pasillo', BANO:'Baño', ESCALERA:'Escalera', BLOQUEADO:'Bloqueado'};
    function button(seat, attribute, available, selected) {
        const status = seat.ESTADO_ASIENTO || seat.EST_BOL || 'LIBRE';
        const type = seat.ID_TIP_PER === 'TIP03' ? '♿ Accesible' : seat.NOM_TIP;
        return `<button type="button" class="seat ${available ? 'libre' : 'occupied'}${selected ? ' selected' : ''}" ${attribute}="${escape(seat.ID_ASI)}" aria-pressed="${selected}" ${available ? '' : 'disabled'}>
          <strong>${escape(seat.ETIQUETA || seat.ID_ASI)}</strong><small>${escape(type)} · ${escape(seat.UBI_ASI)}</small><small>${available ? 'Disponible' : escape(status === 'LIBRE' ? 'Sin cupo' : status)}</small></button>`;
    }
    function render(template, floor, seats, drawSeat) {
        const cells = template?.pisos?.find(p => Number(p.piso) === Number(floor))?.celdas;
        const list = items => `<p>Asientos sin ubicación confirmada</p><div class="seat-list">${items.map(drawSeat).join('')}</div>`;
        if (!Array.isArray(cells) || !cells.length) return list(seats);
        const mapped = new Set();
        const columns = 1 + Math.max(...cells.map(c => Number(c.col)));
        const rows = [...new Set(cells.map(c => Number(c.fila)))].sort((a,b) => a-b);
        if (!Number.isInteger(columns) || columns < 1 || columns > 20) return list(seats);
        const grid = rows.map(row => Array.from({length:columns}, (_,col) => {
            const cell = cells.find(c => Number(c.fila) === row && Number(c.col) === col);
            const kind = cell?.tipoCelda || cell?.rol;
            if (!['ASIENTO','NORMAL','VIP','DISCAPACIDAD'].includes(kind)) return `<span>${labels[kind] || 'Bloqueado'}</span>`;
            const matching = seats.filter(s => s.FIL_ASI != null && s.COL_ASI != null && Number(s.FIL_ASI) === row && Number(s.COL_ASI) === col);
            if (matching.length !== 1) return '<span>Sin asignar</span>';
            mapped.add(matching[0]);
            return drawSeat(matching[0]);
        }).join('')).join('');
        const rest = seats.filter(s => !mapped.has(s));
        return `<div class="plan-scroll"><section class="seat-plan" style="--columns:${columns}"><header>Parabrisas frontal · Planta ${Number(floor) === 1 ? 'baja' : 'alta'}</header>
        <div class="plan-front">${Number(floor) === 1 ? 'Cabina del chofer · Puerta de abordaje' : 'Mirador delantero · Acceso escalera'}</div>
        <div class="plan-guide">Ventana izquierda · Pasillo · Ventana derecha</div><div class="plan-grid">${grid}</div></section></div>${rest.length ? list(rest) : ''}`;
    }
    return {render, button};
})();
if (typeof module !== 'undefined') module.exports = SeatPlan;
