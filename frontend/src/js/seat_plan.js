const SeatPlan = (() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
    const models = {
        MARCO_POLO_1P: 'Marco Polo Estándar (2x2)',
        EJECUTIVO_2X1: 'Ejecutivo VIP (2x1)',
        MARCO_POLO_2P: 'Marco Polo Doble Piso',
        DESDE_CERO: 'Personalizada',
        PERSONALIZADA: 'Personalizada'
    };

    const seatKinds = new Set(['NORMAL', 'VIP', 'DISCAPACIDAD', 'ASIENTO']);
    const specialLabels = {
        PASILLO: ['🚶', 'Pasillo'], BANO: ['🚻', 'Baño WC'],
        ESCALERA: ['🪜', 'Escalera'], VACIO: ['🚫', 'Bloqueado']
    };
    function special(kind) {
        const [icon, label] = Object.hasOwn(specialLabels, kind) ? specialLabels[kind] : specialLabels.VACIO;
        return `<span class="cell-special-icon" aria-hidden="true">${icon}</span><small>${label}</small>`;
    }
    function seatFace(label, kind, location) {
        const sub = kind === 'DISCAPACIDAD' ? '♿ Discap.' : kind === 'VIP' ? '⭐ VIP/Cama'
            : location === 'VENTANA' ? '🪟 Ventana' : location === 'PASILLO' ? '🚶 Pasillo' : 'Normal';
        return `<span class="seat-backrest" aria-hidden="true"></span>
            <strong class="seat-number">${escape(label)}</strong><small class="seat-sub">${sub}</small>`;
    }
    function faceClass(kind) {
        if (kind === 'VIP') return 'vip';
        if (kind === 'DISCAPACIDAD') return 'disability';
        if (seatKinds.has(kind)) return '';
        return Object.hasOwn(specialLabels, kind) ? 'cell-' + kind.toLowerCase() : 'cell-vacio';
    }
    function button(seat, attribute, available, selected, cell = {}) {
        const kind = ({TIP01:'NORMAL', TIP02:'VIP', TIP03:'DISCAPACIDAD'})[seat.ID_TIP_PER]
            || cell.tipoCelda || String(seat.NOM_TIP || 'NORMAL').toUpperCase();
        const location = seat.UBI_ASI || cell.ubicacion;
        const label = seat.ETIQUETA || seat.ID_ASI;
        const status = String(seat.ESTADO_ASIENTO || seat.EST_BOL || '').toUpperCase();
        let state = 'libre', stateLabel = 'Disponible';
        if (!available) {
            if (['RESERVADO', 'PENDIENTE'].includes(status)) { state = 'reservado'; stateLabel = 'Reservado'; }
            else if (['OCUPADO','EMITIDO','PAGADO','USADO','CONFIRMADO','OK'].includes(status)) { state = 'occupied'; stateLabel = 'Ocupado'; }
            else { state = 'unavailable'; stateLabel = 'No seleccionable'; }
        }
        const type = kind === 'DISCAPACIDAD' ? 'Accesible' : seat.NOM_TIP || kind;
        const title = escape([label, type, location, stateLabel].filter(Boolean).join(' · '));
        const content = seatFace(label, kind, location);
        const classes = `seat template-cell ${faceClass(kind)} ${state}${selected ? ' selected' : ''}`;
        if (!attribute) return `<span class="${classes}" title="${title}">${content}<small class="seat-state">${stateLabel}</small></span>`;
        return `<button type="button" class="${classes}" ${attribute}="${escape(seat.ID_ASI)}" aria-pressed="${selected}" title="${title}" ${available ? '' : 'disabled'}>
            ${content}<small class="seat-state" data-state-label="${stateLabel}">${selected ? '✓ Seleccionado' : stateLabel}</small></button>`;
    }
    function columnsFor(floor) {
        const cells = floor?.celdas;
        if (!Array.isArray(cells) || !cells.length || !cells.every(c => c && c.col != null && Number.isInteger(Number(c.col)) && Number(c.col) >= 0 &&
            Number.isInteger(Number(c.fila)) && Number(c.fila) > 0 && Number(c.fila) <= 100)) return 0;
        const columns = cells.reduce((width, cell) => Math.max(width, Number(cell.col) + 1), Number(floor.columnas) || 0);
        return Number.isInteger(columns) && columns <= 20 ? columns : 0;
    }
    function chassis(floor, drawCell, columns = columnsFor(floor)) {
        if (!columns) return '';
        const numPiso = Number(floor.piso);
        const rows = new Map(floor.celdas.map(cell => [Number(cell.fila) + '-' + Number(cell.col), cell]));
        const totalFilas = Math.max(...floor.celdas.map(c => Number(c.fila)), Math.min(100, Number(floor.filas) || 0));
        const headers = columns === 5 ? ['🪟 Ventana Izq.', '🚶 Pasillo Izq.', '⇅ Corredor', '🚶 Pasillo Der.', '🪟 Ventana Der.']
            : Array.from({length:columns}, (_, col) => 'Col. ' + (col + 1));
        const rowMarkup = Array.from({length:totalFilas}, (_, index) => {
            const row = index + 1;
            const cells = Array.from({length:columns}, (_, col) => {
                const cell = rows.get(row + '-' + col);
                return cell ? drawCell(cell) : '<span aria-hidden="true"></span>';
            });
            return `<div class="bus-chassis-row"><span class="row-number-badge" title="Fila ${row}">F${row}</span>${cells.join('')}</div>`;
        }).join('');
        return `
      <div class="plan-scroll"><div class="bus-chassis-wrapper" style="--plan-columns:${columns}">
        <div class="bus-chassis" data-floor-box="${numPiso}">
          <div class="bus-mirror bus-mirror-left" aria-hidden="true"></div>
          <div class="bus-mirror bus-mirror-right" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-fl" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-fr" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-rl" aria-hidden="true"></div>
          <div class="bus-wheel bus-wheel-rr" aria-hidden="true"></div>

          <div class="bus-nose">
            <div class="bus-headlights"><span class="headlight"></span><span class="bus-grille">══════</span><span class="headlight"></span></div>
            <div class="bus-windshield-curve">PARABRISAS FRONTAL · ${numPiso === 1 ? 'PLANTA BAJA' : 'PLANTA ALTA PANORÁMICA'}</div>
            <div class="bus-cockpit">
              <div class="cockpit-driver">
                <span class="steering-wheel">🛞</span>
                <div>
                  <strong>Cabina del Chofer</strong>
                  <small>${numPiso === 1 ? 'Volante y panel de instrumentos' : 'Mirador delantero superior'}</small>
                </div>
              </div>
              <div class="cockpit-door">
                <span>🚪</span>
                <div>
                  <strong>${numPiso === 1 ? 'Puerta de Abordaje' : 'Acceso Escalera'}</strong>
                  <small>Gradas de ingreso</small>
                </div>
              </div>
            </div>
          </div>

          <div class="bus-cabin-body">
            <div class="bus-columns-guide">
              <span class="col-row-tag">Fila</span>
              ${headers.map(label => `<span>${label}</span>`).join('')}
            </div>

            <div class="bus-rows-container">
              ${rowMarkup}
            </div>
          </div>

          <div class="bus-tail">
            <span>🚨 Salida de emergencia posterior · Motor trasero · ${totalFilas} filas configuradas</span>
            <div class="bus-taillights"><span class="taillight"></span><span class="taillight"></span></div>
          </div>
        </div>
      </div></div>`;
    }

    function render(template, floor, seats, drawSeat = seat => button(seat, null, seat.DISPONIBLE ?? seat.ESTADO_ASIENTO === 'LIBRE', false), model) {
        const layout = template?.pisos?.find(p => Number(p.piso) === Number(floor));
        const columns = columnsFor(layout);
        const name = model || template?.modelo;
        const caption = name ? `<p class="plan-model">Modelo de carrocería · <strong>${escape(Object.hasOwn(models, name) ? models[name] : name)}</strong></p>` : '';
        const list = items => `<p>Asientos sin ubicación confirmada</p><div class="seat-list">${items.map(seat => drawSeat(seat)).join('')}</div>`;
        if (!columns) return caption + list(seats);
        const located = new Set();
        const body = chassis(layout, cell => {
            const kind = cell.tipoCelda || cell.rol;
            if (!seatKinds.has(kind)) return `<span class="seat template-cell ${faceClass(kind)}">${special(kind)}</span>`;
            const matches = seats.filter(s => s.FIL_ASI != null && s.COL_ASI != null &&
                Number(s.FIL_ASI) === Number(cell.fila) && Number(s.COL_ASI) === Number(cell.col));
            if (matches.length !== 1) return '<span class="seat template-cell cell-vacio">Sin asignar</span>';
            located.add(matches[0]);
            return drawSeat(matches[0], cell);
        }, columns);
        const extra = seats.filter(s => !located.has(s));
        return caption + body + (extra.length ? list(extra) : '');
    }
    return {models, chassis, seatFace, faceClass, special, render, button};
})();
if (typeof module !== 'undefined') module.exports = SeatPlan;
