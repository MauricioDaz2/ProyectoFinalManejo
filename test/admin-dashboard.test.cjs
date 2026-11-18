const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../frontend/src/js/admin_dashboard_data.js');

test('rutas cuenta pares únicos, conserva la dirección y normaliza espacios', () => {
  assert.equal(D.routes([
    { CIU_ORI_FRE: ' Quito ', CIU_DES_FRE: 'Ambato' },
    { CIU_ORI_FRE: 'QUITO', CIU_DES_FRE: 'AMBATO' },
    { CIU_ORI_FRE: 'Ambato', CIU_DES_FRE: 'Quito' }
  ]), 2);
  assert.equal(D.routes([]), 0);
  assert.throws(() => D.routes([{ CIU_ORI_FRE: 'Quito' }]));
});

test('próximos viajes excluye cancelados y pasados, y ordena la programación', () => {
  const row = (id, date, state) => ({ ID_HOJ: id, FEC_PRO_HOJ: date, EST_VIA_HOJ: state });
  const data = D.trips([
    row('H5', '2026-11-16', 'PROGRAMADA'), row('H4', '2026-11-14', 'CANCELADO'),
    row('H3', '2026-11-13', 'PROGRAMADO'), row('H2', '2026-11-14', 'EN CURSO'),
    row('H1', '2026-11-14', 'PROGRAMADO')
  ], '2026-11-14');
  assert.deepEqual(data.upcoming.map((r) => r.ID_HOJ), ['H1', 'H5']);
  assert.equal(data.scheduled, 1);
  assert.equal(data.active, 1);
  assert.deepEqual(data.occupancy.map((r) => r.ID_HOJ), ['H2', 'H1']);
  assert.throws(() => D.trips([{ ID_HOJ: 'H1' }], '2026-11-14'));
});

test('ocupación cuenta por viaje y separa reservas, libres y ocupados', () => {
  const result = D.seats([
    [{ ID_ASI: 'A1', ESTADO_ASIENTO: 'OCUPADO' }, { ID_ASI: 'A2', ESTADO_ASIENTO: 'RESERVADO' }],
    [{ ID_ASI: 'A1', ESTADO_ASIENTO: 'LIBRE' }, { ID_ASI: 'A2', ESTADO_ASIENTO: 'LIBRE' }]
  ]);
  assert.deepEqual(result, { occupied: 1, reserved: 1, free: 2, total: 4 });
});

test('ocupación rechaza mapas vacíos, duplicados o estados desconocidos', () => {
  assert.throws(() => D.seats([[]]));
  assert.throws(() => D.seats([[{ ID_ASI: 'A1', ESTADO_ASIENTO: 'DESCONOCIDO' }]]));
  assert.throws(() => D.seats([[{ ID_ASI: 'A1', ESTADO_ASIENTO: 'LIBRE' }, { ID_ASI: 'A1', ESTADO_ASIENTO: 'LIBRE' }]]));
});

test('ventas exige fecha exacta y conteo válido; cero es un resultado válido', () => {
  const response = (value) => ({ fecha: '2026-11-14', resumen: { VENDIDOS_HOY: value } });
  assert.equal(D.sales(response(0), '2026-11-14'), 0);
  assert.equal(D.sales(response(5), '2026-11-14'), 5);
  for (const value of [null, undefined, '3', -1, 2.5, NaN]) assert.throws(() => D.sales(response(value), '2026-11-14'));
  assert.throws(() => D.sales(response(3), '2026-11-13'));
});

test('serie de siete días cruza año sin depender de la zona horaria del equipo', () => {
  assert.deepEqual(D.days('2027-01-03'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('próximas salidas se limita a cinco registros ordenados', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ ID_HOJ: `H${8-i}`, FEC_PRO_HOJ: `2026-11-${22-i}`, EST_VIA_HOJ: 'PROGRAMADO' }));
  const upcoming = D.trips(rows, '2026-11-14').upcoming;
  assert.equal(upcoming.length, 5);
  assert.deepEqual(upcoming.map(D.day), ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
});

test('estado operativo distingue errores, listas vacías e inactividad registrada', () => {
  for (const kind of ['cooperatives', 'buses', 'routes', 'staff']) {
    assert.match(D.operational(kind, null).message, /No disponible/);
    assert.doesNotMatch(D.operational(kind, null).message, /No hay/);
    assert.match(D.operational(kind, []).message, /No hay/);
    assert.equal(D.operational(kind, []).tone, 'attention');
  }
  const coops = D.operational('cooperatives', [{ EST_COP: '1' }, { EST_COP: '0' }, { EST_COP: null }]);
  assert.match(coops.message, /1 activas · 1 inactivas/);
  assert.match(coops.message, /1 sin estado reconocido/);
  const routes = D.operational('routes', [{ CIU_ORI_FRE: 'A', CIU_DES_FRE: 'B', EST_RES: '0' }]);
  assert.match(routes.message, /0 con frecuencias activas/);
  assert.equal(routes.tone, 'attention');
});

test('personal operativo informa conteos y detecta falta de roles activos', () => {
  const staff = D.operational('staff', [{ ID_ROL_PER: 'R003', EST_USU: '1' }, { ID_ROL_PER: 'R004', EST_USU: '0' }, { ID_ROL_PER: 'R001', EST_USU: '1' }]);
  assert.match(staff.message, /1 oficinistas · 1 controladores/);
  assert.match(staff.message, /1 activos · 1 inactivos/);
  assert.equal(staff.tone, 'attention');
});
