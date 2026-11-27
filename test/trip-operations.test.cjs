const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {once}=require('node:events');
test('portales: flujo HTTP operativo con transacciones aisladas',async t=>{
 const users={DRV01:{ID_USU:'DRV01',ID_ROL_PER:'R006'},CON01:{ID_USU:'CON01',ID_ROL_PER:'R004'},ADMIN:{ID_USU:'ADMIN',ID_ROL_PER:'R001'},MAN01:{ID_USU:'MAN01',ID_ROL_PER:'R002'},MAN02:{ID_USU:'MAN02',ID_ROL_PER:'R002'},ALT01:{ID_USU:'ALT01',ID_ROL_PER:'R006'}};
 for(const u of Object.values(users))Object.assign(u,{ID_COP_PER:'CP001',EST_USU:'1',EST_COP:'1',NOM_USU:u.ID_USU,APE_USU:'Prueba',COR_USU:u.ID_USU+'@example.test'});
 users.MAN02.ID_COP_PER='CP002';users.ALT01.ID_COP_PER='CP002';
 let state={installed:true,users,sheets:{H0001:{ID_HOJ:'H0001',ID_USU_CHO:'DRV01',ID_USU_CON:'CON01',ID_BUS:'BUS01',ID_BUS_PER:'BUS01',ID_FRE_PER:'F0001',NUM_BUS:'01',PLA_BUS:'ABC123',CIU_ORI_FRE:'Ambato',CIU_DES_FRE:'Quito',EST_VIA_HOJ:'PROGRAMADO',EST_BUS:'ACTIVO',EST_COP:'1',EST_RES:'1',BUS_COP:'CP001',RUTA_COP:'CP001',CHO_ROL:'R006',CHO_EST:'1',CHO_COP:'CP001',CON_ROL:'R004',CON_EST:'1',CON_COP:'CP001',SALIDA_PLAN_UTC:'2026-12-01T12:00:00Z',LLEGADA_PLAN_UTC:'2026-12-01T14:00:00Z',PARADA_ACTUAL:0,EST_MOV:'DETENIDO'}},tickets:[{ID_BOL:'B0001',ID_HOJ_PER:'H0001',ID_ASI_PER:'A0001',EST_BOL:'PAGADO',COD_QR_BOL:'QR-TEST-ONE',ORI_TRA_BOL:'Ambato',DES_TRA_BOL:'Quito'}],events:[]};
 state.sheets.H0002={...state.sheets.H0001,ID_HOJ:'H0002',ID_USU_CHO:'OTHER',ID_USU_CON:'OTHER',ID_BUS_PER:'BUS02',ID_BUS:'BUS02',BUS_COP:'CP002',RUTA_COP:'CP002'};
 const layout={pisos:[{piso:2,filas:2,celdas:[{fila:1,col:2,tipoCelda:'ESCALERA'},{fila:2,col:4,tipoCelda:'ASIENTO'}]}]};
 state.sales={};
 state.expenses={};
 let queue=Promise.resolve();
 class Transaction {async begin(){const before=queue;queue=new Promise(r=>{this.release=r;});await before;this.data=structuredClone(state);}async commit(){state=this.data;this.release();}async rollback(){this.release();}}
 class Request {
  constructor(db){this.db=db;this.p={};}input(k,type,v){this.p[k]=v;return this;}
  async query(q){const s=this.db instanceof Transaction?this.db.data:state,p=this.p,result=(recordset=[])=>({recordset});
   if(q.includes('AS OPERACION_INSTALADA'))return result([{OPERACION_INSTALADA:s.installed?1:0}]);
   if(q.includes('AS AGENDA_INSTALADA'))return result([{AGENDA_INSTALADA:s.installed?1:0}]);
   if(q.includes('AS AGENDA_LOCK')){assert.ok(this.db instanceof Transaction);return result([{AGENDA_LOCK:0}]);}
   if(q.startsWith('SELECT DISTINCT H.ID_HOJ,H.SALIDA_PLAN_UTC')){const ids=Object.entries(p).filter(([k])=>k.startsWith('worker')).map(([,v])=>v);return result(Object.values(s.sheets).filter(h=>h.ID_HOJ!==p.exclude&&!['FINALIZADO','CANCELADO'].includes(h.EST_VIA_HOJ)&&(q.includes('JOIN dbo.BOLETOS')?s.tickets.some(b=>b.ID_HOJ_PER===h.ID_HOJ&&ids.includes(b.ID_USU_FIN)&&b.EST_BOL!=='CANCELADO'):ids.includes(h.ID_USU_CHO)||ids.includes(h.ID_USU_CON)||h.ID_BUS_PER===p.busAgenda)));}
   if(q.includes('AS PERSONAL_INSTALADO'))return result([{PERSONAL_INSTALADO:1}]);
   if(q.startsWith('SELECT ID_USU FROM dbo.COOPERATIVA_RESPONSABLES'))return result([{ID_USU:p.user}]);
   if(q.includes('WHERE U.ID_USU = @id'))return result(s.users[p.id]?[s.users[p.id]]:[]);
   if(q.includes('WHERE U.ID_USU=@actor')||q.includes('WHERE ID_USU=@actor'))return result(s.users[p.actor]?[s.users[p.actor]]:[]);
   if(q.startsWith('SELECT B.ID_BUS,B.EST_BUS')){const d=s.users[p.driver],c=s.users[p.controller];return result(p.bus==='BUS01'&&p.frequency==='F0001'&&d&&c?[{...s.sheets.H0001,CHO_EST:d.EST_USU,CHO_ROL:d.ID_ROL_PER,CHO_COP:d.ID_COP_PER,CON_EST:c.EST_USU,CON_ROL:c.ID_ROL_PER,CON_COP:c.ID_COP_PER}]:[]);}
   if(q.startsWith('SELECT H.ID_HOJ FROM dbo.HOJAS_RUTAS'))return result(Object.values(s.sheets).filter(h=>!['FINALIZADO','CANCELADO'].includes(h.EST_VIA_HOJ)&&(h.ID_BUS_PER===p.bus||h.ID_USU_CHO===p.driver||h.ID_USU_CON===p.controller)&&(!h.SALIDA_PLAN_UTC||!h.LLEGADA_PLAN_UTC||new Date(h.SALIDA_PLAN_UTC)<p.end&&new Date(h.LLEGADA_PLAN_UTC)>p.start)));
   if(q.startsWith('SELECT ID_HOJ FROM dbo.HOJAS_RUTAS'))return result(Object.values(s.sheets).map(h=>({ID_HOJ:h.ID_HOJ})));
   if(q.startsWith('INSERT INTO dbo.HOJAS_RUTAS')){s.sheets[p.id]={...s.sheets.H0001,ID_HOJ:p.id,ID_BUS_PER:p.bus,ID_USU_CHO:p.driver,ID_USU_CON:p.controller,EST_VIA_HOJ:'PROGRAMADO',SALIDA_PLAN_UTC:p.start,LLEGADA_PLAN_UTC:p.end,RECORRIDO_JSON:p.route};return result();}
   if(q.includes('SELECT H.*,F.CIU_ORI_FRE'))return result(Object.values(s.sheets).filter(h=>h[q.includes('WHERE H.ID_USU_CHO')?'ID_USU_CHO':'ID_USU_CON']===p.actor&&h.BUS_COP===p.company&&h.RUTA_COP===p.company&&(!p.sheet||h.ID_HOJ===p.sheet)));
   if(q.startsWith('SELECT ORDEN,NOMBRE'))return result();
   if(q.includes("COL_LENGTH('dbo.BUSES','PLANTILLA_JSON')"))return result([{plantilla:1,coordenadas:1}]);
   if(q.includes('SELECT F.TAR_BAS_FRE,')){
    assert.match(q,/B.ID_BUS=COALESCE\(H.ID_BUS_REE,H.ID_BUS_PER\)/);
    assert.match(q,/A.ID_BUS_PER=COALESCE\(H.ID_BUS_REE,H.ID_BUS_PER\)/);
    return {recordsets:[[{TAR_BAS_FRE:7.25,PLANTILLA_JSON:JSON.stringify(layout)}],[
     {ID_ASI:'A0002',PIS_ASI:2,FIL_ASI:2,COL_ASI:4,libre:!s.tickets.some(b=>b.ID_ASI_PER==='A0002')}
    ]]};
   }
   if(q.includes('SELECT V.ID_BOL boleto'))return result(s.sales[p.token]?[s.sales[p.token]]:[]);
   if(q.includes('INSERT dbo.HOJA_VENTAS_BORDO')){
    s.sales[p.token]={boleto:p.ticket,vuelto:p.change,precio:p.price,asiento:p.seat,hoja:p.hoja,actor:p.actor,efectivo:p.cash};
    s.tickets.push({ID_HOJ_PER:p.hoja,ID_ASI_PER:p.seat,PRE_FIN_BOL:p.price,EST_BOL:'PAGADO'});
    return result([{boleto:p.ticket}]);
   }
   if(q.includes('INSERT dbo.HOJA_GASTOS')){
    s.expenses[p.token]??={ID_GAS:p.token,ID_HOJ:p.hoja,CATEGORIA:p.category,MONTO:p.amount,DETALLE:p.description};
    return result([{ID_GAS:p.token}]);
   }
   if(q.includes('AS vendidos')){
    const tickets=s.tickets.filter(b=>b.ID_HOJ_PER===p.hoja);
    const expenses=Object.values(s.expenses).filter(g=>g.ID_HOJ===p.hoja);
    return {recordsets:[[{vendidos:tickets.length,abordados:tickets.filter(b=>b.EST_BOL==='USADO').length,
     ingresos:tickets.reduce((total,b)=>total+(b.PRE_FIN_BOL??0),0),gastos:expenses.reduce((total,g)=>total+g.MONTO,0)}],expenses]};
   }
   if(q.startsWith('SELECT A.ID_ASI'))return result([{ID_ASI:'A0001',PIS_ASI:1}]);
   if(q.startsWith('SELECT T.ID_BOL'))return result(s.tickets.filter(b=>b.ID_HOJ_PER===p.sheet));
   if(q.startsWith('SELECT E.*'))return result(s.events.filter(e=>e.ID_HOJ===p.sheet).map(e=>({...e,NOM_USU:e.ID_USU,APE_USU:'Prueba'})));
   if(q.startsWith('SELECT ID_HOJ,ID_USU,TIPO'))return result(s.events.filter(e=>e.ID_EVENTO===p.event));
   if(q.startsWith('UPDATE dbo.HOJAS_RUTAS SET')){const h=s.sheets[p.sheet];Object.assign(h,{EST_VIA_HOJ:p.state,PARADA_ACTUAL:p.position,EST_MOV:p.movement,RECORRIDO_JSON:p.route});if(q.includes('INICIO_UTC=SYS'))h.INICIO_UTC=new Date();if(q.includes('FIN_UTC=SYS'))h.FIN_UTC=new Date();return result();}
   if(q.startsWith('UPDATE dbo.BOLETOS SET')){s.tickets.find(b=>b.ID_BOL===p.ticket).EST_BOL='USADO';return result();}
   if(q.startsWith('INSERT INTO dbo.HOJA_EVENTOS')){s.events.push({ID_EVENTO:p.event,ID_HOJ:p.sheet,ID_USU:p.actor,TIPO:p.type,ID_BOL:p.ticket,DETALLE:p.detail,ORDEN:p.position,FECHA_UTC:new Date()});return result();}
   throw Error('Consulta no cubierta: '+q.slice(0,100));
  }
 }
 const pool={request:()=>new Request(pool)},dbPath=require.resolve('../backend/src/config/db');require.cache[dbPath]={exports:{sql:{...require('mssql'),Request,Transaction},conectarBD:async()=>pool}};
 const app=require('../backend/src/server'),{store}=require('../backend/src/security/sessionStore');const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port+'/api';
 const tokens=Object.fromEntries(Object.keys(users).map(id=>[id,store.create(id)]));
 const call=(path,user='DRV01',body)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Transport-Client':'1',...(user?{Cookie:'transporte_sid='+tokens[user]}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const event=(tipo,user='DRV01',extra={})=>call('/operacion/hojas/H0001/eventos',user,{tipo,evento:crypto.randomUUID(),vehiculoDetenido:true,...extra});
 await t.test('consultas propias, roles ajenos y migración ausente',async()=>{
  assert.equal((await call('/operacion/jornada',null)).status,401);assert.equal((await call('/operacion/jornada','ADMIN')).status,403);
  const journal=await (await call('/operacion/jornada')).json();assert.equal(journal.viajes.length,1);assert.equal(journal.viajes[0].id,'H0001');assert.equal((await call('/operacion/hojas/H0002')).status,404);
  const driver=await (await call('/operacion/hojas/H0001')).json();assert.equal(driver.pasajeros.length,0);assert.equal(driver.venta.disponible,false);
  const con=await (await call('/operacion/hojas/H0001','CON01')).json();assert.equal(con.pasajeros.length,1);assert.equal(con.pasajeros[0].estado,'Pendiente de abordar');
  state.installed=false;assert.equal((await event('INICIO')).status,503);state.installed=true;
  state.users.DRV01.EST_USU='0';assert.equal((await call('/operacion/jornada')).status,401);state.users.DRV01.EST_USU='1';tokens.DRV01=store.create('DRV01');
 });
 await t.test('QR, abordaje simultáneo e idempotencia',async()=>{
  assert.equal((await event('INICIO','CON01')).status,403);assert.equal((await event('ABORDAJE','DRV01',{codigo:'B0001'})).status,403);
  assert.equal((await event('ABORDAJE','CON01',{codigo:'QR-FORJADO'})).status,404);
  const id=crypto.randomUUID(),a={tipo:'ABORDAJE',evento:id,codigo:'QR-TEST-ONE'};
  const b={tipo:'ABORDAJE',evento:crypto.randomUUID(),codigo:'B0001'};
  const responses=await Promise.all([call('/operacion/hojas/H0001/eventos','CON01',a),call('/operacion/hojas/H0001/eventos','CON01',b)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call('/operacion/hojas/H0001/eventos','CON01',responses[0].status===200?a:b)).status,200);assert.equal(state.events.filter(e=>e.TIPO==='ABORDAJE').length,1);assert.equal(state.tickets[0].EST_BOL,'USADO');
  assert.equal((await event('DESCENSO','CON01',{codigo:'B0001'})).status,409);
 });
 await t.test('inicio único, llegada, descenso sin liberar cupo, finalización e historial',async()=>{
  assert.equal((await event('FIN')).status,409);state.sheets.H0001.CON_EST='0';assert.equal((await event('INICIO')).status,409);state.sheets.H0001.CON_EST='1';
  assert.equal((await event('INICIO','DRV01',{vehiculoDetenido:false})).status,400);
  const simultaneous=await Promise.all([event('INICIO'),event('INICIO')]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);assert.equal((await event('FIN')).status,409);
  assert.equal((await event('LLEGADA')).status,200);assert.equal((await event('DESCENSO','CON01',{codigo:'B0001'})).status,200);assert.equal((await event('DESCENSO','CON01',{codigo:'B0001'})).status,409);
  const info=await (await call('/operacion/hojas/H0001','CON01')).json();assert.equal(info.ocupacion.disponibles,0);assert.equal(info.ocupacion.aBordo,0);assert.equal(info.pasajeros[0].estado,'Descendió');
  assert.equal((await event('FIN')).status,200);assert.equal((await event('NOVEDAD','DRV01',{detalle:'No debe cambiar un viaje cerrado'})).status,409);
  const history=await (await call('/operacion/jornada')).json();assert.equal(history.historial.length,1);assert.ok(history.historial[0].inicio&&history.historial[0].fin);
  assert.equal((await call('/operacion/hojas/H0001/venta','CON01',{precio:0})).status,400);
 });
 await t.test('asignación con permisos, misma empresa y horarios no superpuestos',async()=>{
  const body={idBus:'BUS01',idFre:'F0001',idUsuCho:'DRV01',idUsuCon:'CON01',salida:'2026-12-02T12:00:00Z',llegada:'2026-12-02T14:00:00Z'};
  const assign=(user,extra={})=>call('/operacion/asignaciones',user,{...body,...extra});
  state.sheets.H0002.ID_BUS_PER='BUS02';
  assert.equal((await assign('DRV01')).status,403);assert.equal((await assign('CON01')).status,403);assert.equal((await assign('MAN02')).status,404);
  assert.equal((await assign('ADMIN',{idUsuCho:'ALT01'})).status,409);assert.equal((await assign('ADMIN',{idUsuCho:'CON01'})).status,409);
  state.users.CON01.EST_USU='0';assert.equal((await assign('ADMIN')).status,409);state.users.CON01.EST_USU='1';
  assert.equal((await assign('ADMIN',{llegada:body.salida})).status,400);
  state.sheets.PERS1={...state.sheets.H0002,ID_HOJ:'PERS1',SALIDA_PLAN_UTC:body.salida,LLEGADA_PLAN_UTC:body.llegada};
  state.tickets.push({ID_HOJ_PER:'PERS1',ID_USU_FIN:'DRV01',EST_BOL:'PAGADO'});
  assert.equal((await assign('MAN01')).status,409);state.sheets.PERS1.SALIDA_PLAN_UTC=null;assert.equal((await assign('ADMIN')).status,409);
  state.tickets.pop();delete state.sheets.PERS1;
  const a=await assign('MAN01');assert.equal(a.status,200,await a.clone().text());
  assert.equal((await assign('ADMIN')).status,409);
  const next=await assign('ADMIN',{salida:body.llegada,llegada:'2026-12-02T16:00:00Z'});assert.equal(next.status,200,await next.clone().text());
 });
 await t.test('venta a bordo usa la plantilla del bus operativo y el reporte descuenta combustible',async()=>{
  state.sheets.H0001.EST_VIA_HOJ='EN CURSO';
  state.sheets.H0001.PARADA_ACTUAL=0;
  state.sheets.H0001.ID_BUS_REE='BUS03';
  state.tickets[0].PRE_FIN_BOL=5;
  const quoteResponse=await call('/operacion/venta','CON01');
  assert.equal(quoteResponse.status,200,await quoteResponse.clone().text());
  const quote=await quoteResponse.json();
  assert.equal(quote.id,'H0001');
  assert.equal(quote.precio,7.25);
  assert.deepEqual(quote.plantilla,layout);
  assert.equal(quote.asientos[0].libre,true);
  const path='/operacion/hojas/H0001';
  const sale={asiento:'A0002',destino:quote.destinos[0].ORDEN,efectivo:'10.00',operacion:crypto.randomUUID()};
  const sold=await call(path+'/venta','CON01',sale);
  assert.equal(sold.status,200,await sold.clone().text());
  const receipt=await sold.json();
  assert.equal(receipt.vuelto,2.75);
  assert.deepEqual(await (await call(path+'/venta','CON01',sale)).json(),receipt);
  assert.equal((await call(path+'/venta','CON01',{...sale,operacion:crypto.randomUUID()})).status,409);
  const fuel=await call(path+'/gastos','CON01',{operacion:crypto.randomUUID(),categoria:'COMBUSTIBLE',monto:'3.10'});
  assert.equal(fuel.status,200,await fuel.clone().text());
  const report=await (await call(path+'/finanzas','CON01')).json();
  assert.deepEqual([report.vendidos,report.abordados,report.ingresos,report.gastos,report.saldo],[2,1,12.25,3.1,9.15]);
 });
});
