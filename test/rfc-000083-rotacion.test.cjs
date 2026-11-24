const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../frontend/src/js/coop_rotacion.js');

const tick = () => new Promise(setImmediate);
const nombres = (g, f) => g.asignaciones[f].map((i) => g.buses[i]);

test('tabla inicial coincide con la hoja de ruta solicitada', () => {
  const g = R.grupoActivo(R.estadoInicial());
  assert.deepEqual(g.fechas.map(R.formatoCorto), ['25/11', '26/11', '27/11', '28/11']);
  const fila = (i) => g.fechas.map((f) => nombres(g, f)[i]);
  assert.deepEqual(fila(0), ['01', '04', '03', '02']);
  assert.deepEqual(fila(1), ['02', '01', '04', '03']);
  assert.deepEqual(fila(2), ['03', '02', '01', '04']);
  assert.deepEqual(fila(3), ['04', '03', '02', '01']);
});

test('rotar sigue Parada 2 -> Ambato-Quito -> Quito-Ambato -> Parada 1 -> Parada 2', () => {
  assert.deepEqual(R.rotar([0, 1, 2, 3], 1), [3, 0, 1, 2]);
  assert.deepEqual(R.rotar([0, 1, 2, 3], 4), [0, 1, 2, 3]);
  assert.deepEqual(R.rotar([0, 1, 2, 3], -1), [1, 2, 3, 0]);
});

test('agregar 29/11 y generar produce 01, 02, 03, 04 sin tocar fechas previas', () => {
  const g = R.grupoActivo(R.estadoInicial());
  const antes = JSON.stringify(g.asignaciones);
  assert.equal(R.sugerirFecha(g, '2000-01-01'), '2026-11-29');
  assert.equal(R.agregarFecha(g, '2026-11-29').ok, true);
  assert.equal(R.generar(g).ok, true);
  assert.deepEqual(nombres(g, '2026-11-29'), ['01', '02', '03', '04']);
  const previas = Object.fromEntries(Object.entries(g.asignaciones).filter(([f]) => f !== '2026-11-29'));
  assert.equal(JSON.stringify(previas), antes);
});

test('fechas omitidas avanzan un paso por dia calendario y cada bus aparece una vez', () => {
  const g = R.grupoActivo(R.estadoInicial());
  R.agregarFecha(g, '2026-12-01');
  R.agregarFecha(g, '2027-01-02');
  R.generar(g);
  // 28/11 -> 01/12 son 3 dias: rotar [1,2,3,0] tres pasos.
  assert.deepEqual(g.asignaciones['2026-12-01'], R.rotar([1, 2, 3, 0], 3));
  assert.deepEqual(g.asignaciones['2027-01-02'], R.rotar(g.asignaciones['2026-12-01'], 32));
  for (const f of g.fechas) assert.equal(new Set(g.asignaciones[f]).size, 4);
});

test('fecha duplicada, invalida o sin fechas vacias muestran mensajes claros', () => {
  const g = R.grupoActivo(R.estadoInicial());
  assert.match(R.agregarFecha(g, '2026-11-25').mensaje, /ya existe/);
  assert.equal(R.agregarFecha(g, '2026-02-30').ok, false);
  assert.match(R.generar(g).mensaje, /No hay fechas vacías/);
});

test('grupos validan 4 buses distintos, conservan ceros iniciales e inician en orden de registro', () => {
  const s = R.estadoInicial();
  assert.match(R.guardarGrupo(s, { nombre: 'B', buses: ['05', '06', '', '08'] }).mensaje, /incompleto/);
  assert.match(R.guardarGrupo(s, { nombre: 'B', buses: ['05', '06', '05', '08'] }).mensaje, /distintos/);
  assert.equal(R.guardarGrupo(s, { nombre: 'Grupo 2', buses: ['05', '06', '07', '08'] }).ok, true);
  const g2 = R.grupoActivo(s);
  assert.equal(g2.id, 'G2');
  assert.deepEqual(g2.buses, ['05', '06', '07', '08']);
  assert.match(R.generar(g2).mensaje, /Agrega al menos una fecha/);
  R.agregarFecha(g2, '2026-12-05');
  R.agregarFecha(g2, '2026-12-06');
  R.generar(g2);
  assert.deepEqual(nombres(g2, '2026-12-05'), ['05', '06', '07', '08']);
  assert.deepEqual(nombres(g2, '2026-12-06'), ['08', '05', '06', '07']);
  assert.equal(s.grupos[0].fechas.length, 4, 'el grupo 1 conserva su propia hoja');
});

test('persistencia aislada por cooperativa y tolerante a datos corruptos', () => {
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
  const s = R.estadoInicial();
  R.agregarFecha(R.grupoActivo(s), '2026-11-29');
  R.generar(R.grupoActivo(s));
  assert.equal(R.guardar(almacen, 'cp001', s).ok, true);
  assert.ok(datos.has('coop_rotacion_v1_CP001'));
  assert.equal(R.grupoActivo(R.cargar(almacen, 'CP001')).fechas.length, 5);
  assert.equal(R.grupoActivo(R.cargar(almacen, 'CP002')).fechas.length, 4);
  assert.equal(R.guardar(almacen, '', s).ok, false);
  datos.set('coop_rotacion_v1_CP003', '{malo');
  assert.equal(R.grupoActivo(R.cargar(almacen, 'CP003')).fechas.length, 4);
});

function montarUI(almacen, cooperativaId = 'CP001') {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', textContent: '', innerHTML: '', hidden: true, className: '', events: {},
      addEventListener(k, fn) { this.events[k] = fn; }, focus() {}
    });
    return nodes.get(id);
  };
  get('rotacionApp');
  const window = {
    document: { readyState: 'complete', getElementById: (id) => (id === 'rotacionApp' || nodes.has(id) || id.startsWith('rotacion') ? get(id) : null) },
    localStorage: almacen,
    App: { sesion: () => ({ rolId: 'R002', cooperativaId }) }
  };
  vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_rotacion.js', 'utf8'), { window, Date, JSON, Set, Map, Math, String, Number, Object, Array });
  return get;
}

test('UI: agregar 29/11, generar, guardar y recargar conserva la columna', async () => {
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
  let get = montarUI(almacen);
  await tick();
  assert.match(get('rotacionTabla').innerHTML, /<strong>Ambato - Quito<\/strong><span class="rotacion-hora">7:00 am<\/span>/);
  assert.match(get('rotacionUnidades').innerHTML, /Bus número 4: <strong>04<\/strong>/);

  get('rotacionBtnFecha').events.click();
  assert.equal(get('rotacionFecha').value, '2026-11-29');
  get('rotacionFormFecha').events.submit({ preventDefault() {} });
  assert.match(get('rotacionTabla').innerHTML, /29\/11/);
  get('rotacionBtnGenerar').events.click();
  get('rotacionBtnGuardar').events.click();
  assert.match(get('rotacionAviso').textContent, /guardada/);

  get = montarUI(almacen);
  await tick();
  const html = get('rotacionTabla').innerHTML;
  const fila = (id) => html.split(`data-fila="${id}"`)[1].split('</tr>')[0];
  assert.ok(fila('AQ').endsWith('<td>01</td>'));
  assert.ok(fila('QA').endsWith('<td>02</td>'));
  assert.ok(fila('P1').endsWith('<td>03</td>'));
  assert.ok(fila('P2').endsWith('<td>04</td>'));

  const otra = montarUI(almacen, 'CP002');
  await tick();
  assert.doesNotMatch(otra('rotacionTabla').innerHTML, /29\/11/);
});

test('UI: fecha duplicada muestra error visible', async () => {
  const get = montarUI({ getItem: () => null, setItem() {} });
  await tick();
  get('rotacionBtnFecha').events.click();
  get('rotacionFecha').value = '2026-11-26';
  get('rotacionFormFecha').events.submit({ preventDefault() {} });
  assert.equal(get('rotacionAviso').hidden, false);
  assert.match(get('rotacionAviso').className, /is-error/);
});

test('la vista de cooperativa incluye la pestaña y el módulo', () => {
  const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
  assert.match(html, /id="tabRotacion"[^>]*>\s*Hoja de ruta y frecuencias/);
  assert.match(html, /id="panelRotacion"[^>]*hidden/);
  assert.match(html, /coop_rotacion\.js/);
  for (const id of ['rotacionBtnFecha', 'rotacionBtnGrupo', 'rotacionBtnGenerar', 'rotacionBtnGuardar']) assert.match(html, new RegExp(`id="${id}"`));
  const css = fs.readFileSync('frontend/src/assets/panel_pages.css', 'utf8');
  assert.match(css, /\.rotacion-wrap\s*{[^}]*overflow-x:\s*auto/);
});
