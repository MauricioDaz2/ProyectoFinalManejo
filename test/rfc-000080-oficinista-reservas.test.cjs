process.env.VIP_SURCHARGE_PERCENT = '40';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { once } = require('node:events');

test('RFC-000080: portal del pasajero elimina Efectivo en línea, incluye temporizador de 5 min para transferencia y oculta IDs internos', () => {
  const html = fs.readFileSync('frontend/src/views/usuario/seleccion_asientos.html', 'utf8');
  const jsAsientos = fs.readFileSync('frontend/src/js/usuario_asientos.js', 'utf8');
  const jsBoletos = fs.readFileSync('frontend/src/js/user_boletos.js', 'utf8');

  // 1. No existe la opción de pago en Efectivo en la reserva web del pasajero
  assert.doesNotMatch(html, /<option[^>]+value="EFECTIVO"/i);
  assert.match(html, /<option[^>]+value="TRANSFERENCIA"/i);
  assert.match(html, /<option[^>]+value="DEPOSITO"/i);

  // 2. Elementos del temporizador de 5 minutos para transferencia
  for (const id of ['temporizadorTransferencia', 'relojTransferencia', 'barraProgresoTimer', 'bancoOrigen', 'comprobante']) {
    assert.ok(html.includes(`id="${id}"`), `Falta #${id} en seleccion_asientos.html`);
  }

  // 3. Ocultamiento de IDs internos en las vistas del pasajero
  assert.doesNotMatch(jsAsientos, /Hoja de ruta:\s*\$\{escapeHtml\(viaje\.idHoja\)\}/);
  assert.doesNotMatch(jsBoletos, /Boleto N°:\s*\$\{escapeHtml\(b\.ID_BOL\)\}/);
  assert.doesNotMatch(jsBoletos, /Hoja:\s*\$\{escapeHtml\(b\.ID_HOJ_PER\)\}/);
});

test('RFC-000080: backend rechaza Efectivo en reservas web, retiene asientos por 5 min en Transferencia y libera reservas vencidas', async (t) => {
  const users = {
    PAS01: { ID_USU: 'PAS01', ID_ROL_PER: 'R005', EST_USU: '1', NOM_USU: 'Ana', APE_USU: 'Pérez', COR_USU: '1801234567' },
    OFI01: { ID_USU: 'OFI01', ID_ROL_PER: 'R003', EST_USU: '1', ID_COP_PER: 'CP001', EST_COP: '1', NOM_USU: 'Luis', APE_USU: 'Oficinista' }
  };

  let state = {
    tickets: [],
    expiredNow: false
  };
  let queue = Promise.resolve();

  class Transaction {
    async begin() {
      const prev = queue;
      queue = new Promise((r) => { this.release = r; });
      await prev;
      this.state = structuredClone(state);
    }
    request() { return new Request(this); }
    async commit() { state = this.state; this.release(); }
    async rollback() { this.release(); }
  }

  class Request {
    constructor(db) { this.db = db; this.p = {}; }
    input(k, type, v) { this.p[k] = v; return this; }
    async query(rawQuery) {
      const q = rawQuery.trim();
      const p = this.p;
      const s = this.db instanceof Transaction ? this.db.state : state;
      const result = (recordset = []) => ({ recordset });

      if (q.includes('WHERE U.ID_USU = @id')) return result(users[p.id] ? [users[p.id]] : []);
      if (q.includes('AS RESERVAS_DISPONIBLES')) {
        return result([{ RESERVAS_DISPONIBLES: 1, TEMPORIZADOR_DISPONIBLE: 1, TARIFA_FRECUENCIA_DISPONIBLE: 1 }]);
      }
      if (q.includes('AS TIENE_EXP')) return result([{ TIENE_EXP: 1 }]);
      if (q.includes('AS TIENE_TEMP')) {
        return result([{ TIENE_TEMP: 1, TIENE_BANCO: 1, TIENE_TARIFA_FRE: 1, TIENE_PLANTILLA_BUS: 1, TIENE_ASI_ESPACIAL: 1 }]);
      }
      if (q.startsWith('UPDATE dbo.BOLETOS') && q.includes("SET EST_BOL = 'VENCIDO'") && q.includes('OUTPUT INSERTED.ID_BOL')) {
        const vencidos = [];
        for (const tk of s.tickets) {
          if (['RESERVADO', 'PENDIENTE'].includes(tk.EST_BOL) && tk.MET_PAG_BOL === 'TRANSFERENCIA' && !tk.COM_PAG_URL && s.expiredNow) {
            tk.EST_BOL = 'VENCIDO';
            tk.EST_REV_PAG = 'EXPIRADO';
            vencidos.push({ ID_BOL: tk.ID_BOL, ID_ASI_PER: tk.ID_ASI_PER, ID_HOJ_PER: tk.ID_HOJ_PER });
          }
        }
        return result(vencidos);
      }
      if (q.startsWith('SELECT C.EST_COP')) return result([{ EST_COP: '1' }]);
      if (q.startsWith('SELECT H.ID_HOJ, F.CIU_ORI_FRE')) {
        return result(Object.entries(p).filter(([k]) => k.startsWith('idAsiento')).map(([, id]) => ({
          ID_HOJ: p.idHoja, CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'QUITO',
          ID_ASI: id, ID_TIP_PER: id === 'A0002' ? 'TIP02' : 'TIP01', PRE_TIP: id === 'A0002' ? 3 : 0, NOM_TIP: id === 'A0002' ? 'VIP' : 'NORMAL',
          TAR_BAS_FRE: 7.50, PIS_ASI: 1
        })));
      }
      if (q.startsWith('SELECT ID_BOL FROM dbo.BOLETOS')) {
        return result(s.tickets.filter((b) =>
          b.ID_HOJ_PER === p.sheetOccupied
          && Object.entries(p).some(([k, v]) => k.startsWith('occupied') && v === b.ID_ASI_PER)
          && !['CANCELADO', 'ANULADO', 'INVALIDO', 'VENCIDO'].includes(b.EST_BOL)
        ));
      }
      if (q.startsWith('SELECT ID_USU FROM USUARIOS')) return result(users[p.cedula] ? [{ ID_USU: p.cedula }] : []);
      if (q.startsWith('INSERT INTO BOLETOS')) {
        s.tickets.push({
          ID_BOL: p.idBoleto,
          ORI_TRA_BOL: p.origen,
          DES_TRA_BOL: p.destino,
          TIP_DES_BOL: p.tipoDescuento,
          PRE_FIN_BOL: p.precio,
          MET_PAG_BOL: p.metodoPago,
          COM_PAG_URL: p.comprobanteUrl || null,
          BAN_ORI_BOL: p.bancoOrigen || null,
          EST_BOL: p.estadoBoleto,
          COD_QR_BOL: p.codigoQr,
          ID_HOJ_PER: p.idHoja,
          ID_ASI_PER: p.idAsiento,
          ID_USU_FIN: p.usuarioId,
          FEC_EXP_RES_UTC: p.fecExpUtc || null,
          EST_REV_PAG: p.estRevPag || null
        });
        return result();
      }
      if (q.startsWith('SELECT EST_BOL')) {
        return result(s.tickets.filter((b) => b.ID_BOL === p.idBoleto && b.ID_USU_FIN === p.cedula));
      }
      if (q.startsWith('UPDATE BOLETOS') && q.includes("SET EST_BOL = 'VENCIDO'")) {
        const tk = s.tickets.find((b) => b.ID_BOL === p.idBoleto);
        if (tk) { tk.EST_BOL = 'VENCIDO'; tk.EST_REV_PAG = 'EXPIRADO'; }
        return result();
      }
      if (q.includes('SELECT H.ID_HOJ,H.ID_USU_CON FROM dbo.BOLETOS T')) {
        const tk = s.tickets.find((b) => b.ID_BOL === p.ticket);
        return result(tk ? [{ ID_HOJ: tk.ID_HOJ_PER, ID_USU_CON: 'CON01' }] : []);
      }
      if (q.includes('SELECT H.ID_USU_CON,H.ID_BUS_PER,B.ID_BUS AS BUS_OPERATIVO')) {
        return result([{ ID_USU_CON: 'CON01', ID_BUS_PER: 'B0001', BUS_OPERATIVO: 'B0001' }]);
      }
      if (q.includes("UPPER(LTRIM(RTRIM(ISNULL(BOL.MET_PAG_BOL, '')))) = 'TRANSFERENCIA'")) {
        return result(s.tickets.filter((b) => b.MET_PAG_BOL === 'TRANSFERENCIA' && ['RESERVADO', 'PENDIENTE'].includes(b.EST_BOL)).map((b) => ({
          ...b,
          PIS_ASI: 1,
          NUMERO_ASIENTO: 1,
          NOM_TIP: 'NORMAL',
          NUM_BUS: '88',
          PLA_BUS: 'XBB-1214',
          HORA_SAL_FRE: '09:30',
          TAR_BAS_FRE: 7.5,
          NOM_USU: 'Ana',
          APE_USU: 'Pérez',
          COR_USU: '1801234567'
        })));
      }
      if (q.includes('SELECT ID_BOL, EST_BOL, MET_PAG_BOL, COM_PAG_URL')) {
        const tk = s.tickets.find((b) => b.ID_BOL === p.id);
        return result(tk ? [tk] : []);
      }
      if (q.startsWith('UPDATE dbo.BOLETOS') && q.includes('SET EST_BOL = @estado')) {
        const tk = s.tickets.find((b) => b.ID_BOL === p.id);
        if (tk) {
          tk.EST_BOL = p.estado;
          tk.EST_REV_PAG = p.estRev || tk.EST_REV_PAG;
          tk.FEC_EXP_RES_UTC = null;
        }
        return result();
      }
      if (q.includes('WHERE BOL.ID_BOL = @id')) {
        const tk = s.tickets.find((b) => b.ID_BOL === p.id);
        return result(tk ? [{
          ...tk,
          PIS_ASI: 1,
          NUMERO_ASIENTO: 1,
          NOM_TIP: 'NORMAL',
          NUM_BUS: '88',
          PLA_BUS: 'XBB-1214',
          HORA_SAL_FRE: '09:30',
          TAR_BAS_FRE: 7.5,
          NOM_USU: 'Ana',
          APE_USU: 'Pérez',
          COR_USU: '1801234567'
        }] : []);
      }
      throw new Error('Consulta no cubierta en test RFC-000080: ' + q.slice(0, 120));
    }
  }

  const pool = { request: () => new Request(pool) };
  const dbPath = require.resolve('../backend/src/config/db');
  require.cache[dbPath] = { exports: { sql: { ...require('mssql'), Request, Transaction }, conectarBD: async () => pool } };

  const app = require('../backend/src/server');
  const { store } = require('../backend/src/security/sessionStore');
  const tokens = {
    PAS01: store.create('PAS01'),
    OFI01: store.create('OFI01')
  };

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));

  const api = (path, user, method = 'GET', body = null) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method,
    headers: {
      Cookie: `transporte_sid=${tokens[user]}`,
      'X-Transport-Client': '1',
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  // 1. El pasajero NO puede reservar en EFECTIVO por internet
  const rechazoEfectivo = await api('/usuario/reservas', 'PAS01', 'POST', {
    idHoja: 'H0001',
    cedulaTitular: 'PAS01',
    metodoPago: 'EFECTIVO',
    idAsientos: JSON.stringify(['A0001']),
    pasajeros: JSON.stringify([{ tipo: 'ADULTO' }])
  });
  assert.equal(rechazoEfectivo.status, 400);
  const bodyEfectivo = await rechazoEfectivo.json();
  assert.equal(bodyEfectivo.code, 'EFECTIVO_SOLO_VENTANILLA');

  // 2. Reserva por TRANSFERENCIA inicia temporizador de 5 minutos (300 s) y calcula tarifa desde TAR_BAS_FRE ($7.50) + recargo VIP ($3.00)
  const resTransferencia = await api('/usuario/reservas', 'PAS01', 'POST', {
    idHoja: 'H0001',
    cedulaTitular: 'PAS01',
    metodoPago: 'TRANSFERENCIA',
    idAsientos: JSON.stringify(['A0001', 'A0002']),
    pasajeros: JSON.stringify([{ tipo: 'ADULTO' }, { tipo: 'ADULTO' }])
  });
  assert.equal(resTransferencia.status, 201);
  const dataTrans = await resTransferencia.json();
  assert.equal(dataTrans.requiereComprobante, true);
  assert.equal(dataTrans.segundosRestantes, 300);
  assert.equal(dataTrans.reservas.length, 2);
  assert.equal(dataTrans.reservas[0].precio, 7.50);
  assert.equal(dataTrans.reservas[1].precio, 10.50);

  // 3. El Oficinista consulta la bandeja de transferencias pendientes y aprueba una / rechaza la otra
  const bandejaResp = await api('/oficinista/boletos/pendientes-transferencia', 'OFI01');
  assert.equal(bandejaResp.status, 200);
  const bandeja = await bandejaResp.json();
  assert.equal(bandeja.total, 2);

  const idAprobar = dataTrans.reservas[0].idBoleto;
  const idRechazar = dataTrans.reservas[1].idBoleto;

  const aprobarResp = await api(`/oficinista/boletos/${idAprobar}/revision-transferencia`, 'OFI01', 'PATCH', { accion: 'APROBAR' });
  assert.equal(aprobarResp.status, 200);
  const aprobado = await aprobarResp.json();
  assert.equal(aprobado.boleto.EST_BOL, 'PAGADO');
  assert.equal(aprobado.boleto.EST_REV_PAG, 'APROBADO');

  const rechazarResp = await api(`/oficinista/boletos/${idRechazar}/revision-transferencia`, 'OFI01', 'PATCH', { accion: 'RECHAZAR' });
  assert.equal(rechazarResp.status, 200);
  const rechazado = await rechazarResp.json();
  assert.equal(rechazado.boleto.EST_BOL, 'CANCELADO');
  assert.equal(rechazado.boleto.EST_REV_PAG, 'RECHAZADO');

  // 4. El asiento rechazado (A0002) vuelve a estar libre para una nueva reserva, y al expirar los 5 minutos se libera automáticamente
  const resNueva = await api('/usuario/reservas', 'PAS01', 'POST', {
    idHoja: 'H0001',
    cedulaTitular: 'PAS01',
    metodoPago: 'TRANSFERENCIA',
    idAsientos: JSON.stringify(['A0002']),
    pasajeros: JSON.stringify([{ tipo: 'NINO' }])
  });
  assert.equal(resNueva.status, 201);
  const dataNueva = await resNueva.json();
  assert.equal(dataNueva.reservas[0].precio, 5.25); // 50% de $10.50

  const expResp = await api('/usuario/reservas/expirar', 'PAS01', 'POST', {
    idBoletos: [dataNueva.reservas[0].idBoleto]
  });
  assert.equal(expResp.status, 200);
  assert.equal(state.tickets.find((b) => b.ID_BOL === dataNueva.reservas[0].idBoleto).EST_BOL, 'VENCIDO');
});

test('RFC-000080: vistas de Oficinista (Ventanilla y Validación) calculan tarifa automática, operan bandeja de transferencias y ocultan IDs internos', async () => {
  const ventanillaHtml = fs.readFileSync('frontend/src/views/oficinista/ventanilla_boletos.html', 'utf8');
  const ventanillaJs = fs.readFileSync('frontend/src/js/oficinista_ventanilla.js', 'utf8');
  const validacionHtml = fs.readFileSync('frontend/src/views/oficinista/validacion_reservas.html', 'utf8');
  const validacionJs = fs.readFileSync('frontend/src/js/oficinista_validacion.js', 'utf8');

  // 1. Ocultamiento de columnas de ID interno y presencia de controles nuevos
  assert.doesNotMatch(validacionHtml, /<th>Boleto<\/th>/i);
  assert.ok(validacionHtml.includes('id="bandejaTransferencias"'));
  assert.ok(validacionHtml.includes('id="tablaTransferenciasPendientes"'));
  assert.ok(validacionHtml.includes('id="modalComprobante"'));
  assert.ok(ventanillaHtml.includes('id="tipoTarifaVentanilla"'));

  // 2. Probar cálculo automático de precio y ocultamiento de ID_HOJ en Ventanilla
  const elsVentanilla = new Map();
  const getV = (id) => {
    if (!elsVentanilla.has(id)) {
      elsVentanilla.set(id, {
        value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
        events: {}, classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(k, fn) { this.events[k] = fn; },
        querySelectorAll() { return []; }
      });
    }
    return elsVentanilla.get(id);
  };

  vm.runInNewContext(ventanillaJs, {
    document: { getElementById: getV },
    window: { print() {} },
    App: {
      sesion: () => ({ id: 'OFI01', cooperativaId: 'CP001' }),
      hoyISO: () => '2026-12-01',
      fecha: (v) => v || '',
      fechaLarga: (v) => v || '',
      dinero: (v) => `$${Number(v || 0).toFixed(2)}`,
      numero: String,
      escapar: String,
      insignia: (v) => v,
      patronQR: () => '<svg></svg>',
      aviso() {},
      abrirModal() {},
      cerrarModal() {},
      textoBoton() {},
      restaurarBoton() {},
      async api(route) {
        if (route === '/oficinista/resumen') return { resumen: { BOLETOS_HOY: 1, VENDIDOS_HOY: 1, RESERVADOS_HOY: 0, VALIDADOS_HOY: 0, INGRESOS_HOY: 8, PROMEDIO_BOLETO: 8, HOJAS_HOY: 1 } };
        if (route === '/oficinista/hojas') {
          return {
            hojas: [{
              ID_HOJ: 'H0099', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'GUAYAQUIL',
              NUM_BUS: '42', PLA_BUS: 'TAA-4242', FEC_PRO_HOJ: '2026-12-01',
              HORA_SAL_FRE: '10:15', TAR_BAS_FRE: 8.50, NOM_COP: 'Coop Ambato',
              ASIENTOS_DISPONIBLES: 38, TOTAL_ASIENTOS: 40, ASIENTOS_OCUPADOS: 2, EST_VIA_HOJ: 'PROGRAMADA'
            }]
          };
        }
        if (route === '/oficinista/hojas/H0099/asientos') {
          return {
            hoja: { ID_HOJ: 'H0099', CIU_ORI_FRE: 'AMBATO', CIU_DES_FRE: 'GUAYAQUIL', NUM_BUS: '42', PLA_BUS: 'TAA-4242', HORA_SAL_FRE: '10:15', TAR_BAS_FRE: 8.50 },
            resumen: { disponibles: 2, ocupados: 0, total: 2 },
            pisos: [{
              piso: 1,
              asientos: [
                { ID_ASI: '00001', PIS_ASI: 1, ETIQUETA: '101', NUMERO: 1, NOM_TIP: 'NORMAL', TARIFA_BASE: 8.50, RECARGO_TIP: 0, PRE_TIP: 8.50, PRECIO_AUTOMATICO: 8.50, DISPONIBLE: true },
                { ID_ASI: '00002', PIS_ASI: 1, ETIQUETA: '102', NUMERO: 2, NOM_TIP: 'VIP', TARIFA_BASE: 8.50, RECARGO_TIP: 3.00, PRE_TIP: 11.50, PRECIO_AUTOMATICO: 11.50, DISPONIBLE: true }
              ]
            }],
            asientos: [
              { ID_ASI: '00001', PIS_ASI: 1, ETIQUETA: '101', NUMERO: 1, NOM_TIP: 'NORMAL', TARIFA_BASE: 8.50, RECARGO_TIP: 0, PRE_TIP: 8.50, PRECIO_AUTOMATICO: 8.50, DISPONIBLE: true },
              { ID_ASI: '00002', PIS_ASI: 1, ETIQUETA: '102', NUMERO: 2, NOM_TIP: 'VIP', TARIFA_BASE: 8.50, RECARGO_TIP: 3.00, PRE_TIP: 11.50, PRECIO_AUTOMATICO: 11.50, DISPONIBLE: true }
            ]
          };
        }
        return {};
      }
    }
  });

  await new Promise(setImmediate);
  // La tabla muestra la hora y tarifa base, sin mostrar el código interno H0099 en el texto
  assert.match(getV('tablaHojas').innerHTML, /Salida 10:15 · \$8\.50 base/);
  assert.doesNotMatch(getV('tablaHojas').innerHTML, /H0099 ·/);

  // Seleccionar salida y asiento VIP ('00002')
  await getV('tablaHojas').events.click({ target: { closest: () => ({ dataset: { hoja: 'H0099' } }) } });
  await new Promise(setImmediate);
  assert.doesNotMatch(getV('subtituloAsientos').textContent, /H0099/);

  getV('mapaAsientosVenta').events.click({ target: { closest: () => ({ dataset: { asientoVenta: '00002' } }) } });
  assert.equal(getV('precioBoleto').value, '11.50');
  assert.equal(getV('metodoPago').value, 'EFECTIVO');

  // Cambiar a tarifa tercera edad (50%) recalcula automáticamente a $5.75
  getV('tipoTarifaVentanilla').value = 'TERCERA_EDAD_50';
  getV('tipoTarifaVentanilla').events.change();
  assert.equal(getV('precioBoleto').value, '5.75');
});
