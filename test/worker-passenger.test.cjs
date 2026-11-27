const test=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');

test('R004, R006 y R005 usan reservas personales con identidad y cupos aislados',async t=>{
 const users=Object.fromEntries([['CON01','R004'],['DRV01','R006'],['PAS01','R005'],['OFI01','R003']].map(([id,role])=>[id,{ID_USU:id,ID_ROL_PER:role,EST_USU:'1',ID_COP_PER:'CP001',EST_COP:'1',NOM_USU:id,APE_USU:'Prueba'}]));
 let state={tickets:[],schema:true,work:[],start:'2026-12-01T12:00:00Z',end:'2026-12-01T14:00:00Z'},queue=Promise.resolve();
 class Transaction {
  async begin(){const previous=queue;queue=new Promise(r=>{this.release=r;});await previous;this.state=structuredClone(state);}
  request(){return new Request(this);}
  async commit(){state=this.state;this.release();}
  async rollback(){this.release();}
 }
 class Request {
  constructor(db){this.db=db;this.p={};}input(k,type,v){this.p[k]=v;return this;}
  async query(query){const q=query.trim(),p=this.p,s=this.db instanceof Transaction?this.db.state:state,result=(recordset=[])=>({recordset});
   if(q.includes('WHERE U.ID_USU = @id'))return result(users[p.id]?[users[p.id]]:[]);
   if(q.includes('AS RESERVAS_DISPONIBLES'))return result([{RESERVAS_DISPONIBLES:s.schema?1:0,TEMPORIZADOR_DISPONIBLE:1,NOMBRE_DISPONIBLE:1}]);
   if(q.includes('AS AGENDA_INSTALADA'))return result([{AGENDA_INSTALADA:s.schema?1:0}]);
   if(q.includes('AS AGENDA_LOCK')){assert.ok(this.db instanceof Transaction);return result([{AGENDA_LOCK:0}]);}
   if(q.startsWith('SELECT SALIDA_PLAN_UTC,LLEGADA_PLAN_UTC'))return result([{SALIDA_PLAN_UTC:s.start,LLEGADA_PLAN_UTC:s.end}]);
   if(q.startsWith('SELECT DISTINCT H.ID_HOJ,H.SALIDA_PLAN_UTC'))return result(s.work);
   if(q.includes('AS TIENE_EXP') || q.startsWith('SELECT TOP 1 ID_BOL FROM BOLETOS'))return result();
   if(q.startsWith('SELECT DATEADD(minute,5'))return result([{deadline:new Date(Date.now()+300000)}]);
   if(q.startsWith('SELECT ID_BOL AS ticket'))return result(s.tickets.filter(b=>b.ID_USU_FIN===p.owner && b.ID_HOJ_PER===p.sheet && b.EST_BOL==='RESERVADO' && !b.COM_PAG_URL).map(b=>({ticket:b.ID_BOL})));
   if(q.startsWith('SELECT PRE_FIN_BOL'))return result(s.tickets.filter(b=>b.ID_BOL===p.id && b.ID_USU_FIN===p.owner && b.ID_ASI_PER===p.seat && b.EST_BOL==='RESERVADO' && !b.COM_PAG_URL));
   if(q.startsWith('SELECT ID_USU,ID_ROL_PER'))return result(['R004','R006'].includes(users[p.doc]?.ID_ROL_PER)?[users[p.doc]]:[]);
   if(q.startsWith('UPDATE dbo.BOLETOS SET NOM_PAS_BOL')){
    Object.assign(s.tickets.find(b=>b.ID_BOL===p.id),{COM_PAG_URL:p.url,CED_PAS_BOL:p.document});
    return {rowsAffected:[1]};
   }
   if(q.startsWith('SELECT C.EST_COP'))return result([{EST_COP:'1'}]);
   if(q.startsWith('SELECT H.ID_HOJ, F.CIU_ORI_FRE'))return result(Object.entries(p).filter(([k])=>k.startsWith('idAsiento')).map(([,id])=>({ID_HOJ:p.idHoja,CIU_ORI_FRE:'Ambato',CIU_DES_FRE:'Quito',ID_ASI:id,PRE_TIP:12,NOM_TIP:'NORMAL'})));
   if(q.startsWith('SELECT ID_BOL FROM dbo.BOLETOS'))return result(s.tickets.filter(b=>b.ID_HOJ_PER===p.sheetOccupied&&Object.entries(p).some(([k,v])=>k.startsWith('occupied')&&v===b.ID_ASI_PER)&&b.EST_BOL!=='CANCELADO'));
   if(q.startsWith('SELECT ID_USU FROM USUARIOS'))return result(users[p.cedula]?[{ID_USU:p.cedula}]:[]);
   if(q.startsWith('INSERT INTO BOLETOS')){assert.ok(this.db instanceof Transaction);s.tickets.push({ID_BOL:p.idBoleto,ID_HOJ_PER:p.idHoja,ID_ASI_PER:p.idAsiento,ID_USU_FIN:p.usuarioId,EST_BOL:p.estadoBoleto,PRE_FIN_BOL:p.precio});return result();}
   if(q.includes('WHERE B.ID_USU_FIN = @cedula'))return result(s.tickets.filter(b=>b.ID_USU_FIN===p.cedula));
   if(q.startsWith('SELECT EST_BOL'))return result(s.tickets.filter(b=>b.ID_BOL===p.idBoleto&&b.ID_USU_FIN===p.cedula));
   if(q.startsWith('UPDATE BOLETOS')){s.tickets.find(b=>b.ID_BOL===p.idBoleto).EST_BOL='CANCELADO';return result();}
   throw Error('Consulta no cubierta: '+q.slice(0,100));
  }
 }
 const pool={request:()=>new Request(pool)},dbPath=require.resolve('../backend/src/config/db');require.cache[dbPath]={exports:{sql:{...require('mssql'),Request,Transaction},conectarBD:async()=>pool}};
 const app=require('../backend/src/server'),{store}=require('../backend/src/security/sessionStore'),tokens=Object.fromEntries(Object.keys(users).map(id=>[id,store.create(id)]));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const call=(path,user,method='GET',body)=>fetch(`http://127.0.0.1:${server.address().port}/api/usuario/reservas${path}`,{method,headers:{Cookie:'transporte_sid='+tokens[user],'X-Transport-Client':'1',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 const purchase=(user,seat)=>({idHoja:'H0001',asientos:[seat]});
 const confirm=(user,ticket,doc=user)=>{
  const form=new FormData();
  form.set('idHoja','H0001');form.set('idBoletos',JSON.stringify([ticket.idBoleto]));form.set('metodoPago','TRANSFERENCIA');
  form.set('pasajeros',JSON.stringify([{asiento:ticket.idAsiento,nombre:'Persona de prueba',documento:'extranjero',cedula:doc,tipo:'ADULTO'}]));
  form.set('comprobante',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'prueba.pdf');
  return call('',user,'POST',form);
 };
 t.after(async()=>{
  for(const b of state.tickets.filter(b=>b.COM_PAG_URL)) await require('node:fs/promises').unlink(require('node:path').join('backend/private_media/comprobantes',require('node:path').basename(b.COM_PAG_URL)));
 });
 for(const [i,user]of ['CON01','DRV01','PAS01'].entries())await t.test(user+': reserva, compra, historial y cancelación propios',async()=>{
  const role=users[user].ID_ROL_PER;
  const response=await call('/bloqueos',user,'POST',purchase(user,'A000'+i));assert.equal(response.status,201,await response.clone().text());
  const ticket=(await response.json()).reservas[0];assert.equal(ticket.estado,'RESERVADO');assert.equal(ticket.precio,12);
  const confirmed=await confirm(user,ticket);assert.equal(confirmed.status,200,await confirmed.clone().text());
  assert.equal(state.tickets.find(b=>b.ID_BOL===ticket.idBoleto).EST_BOL,'RESERVADO');
  const history=await call('/mis-boletos/'+user,user);assert.equal(history.status,200);assert.ok((await history.json()).boletos.every(b=>b.ID_USU_FIN===user));
  const other=user==='CON01'?'DRV01':'CON01';assert.equal((await call('/mis-boletos/'+other,user)).status,403);
  assert.equal((await confirm(other,ticket)).status,409);
  assert.equal((await call('/'+ticket.idBoleto+'/cancelar',other,'PUT',{cedula:other})).status,404);
  assert.equal((await call('/'+ticket.idBoleto+'/cancelar',user,'PUT',{cedula:other})).status,403);
  assert.equal((await call('/'+ticket.idBoleto+'/cancelar',user,'PUT',{cedula:user})).status,200);
  assert.equal(users[user].ID_ROL_PER,role);
 });
 await t.test('dos reservas simultáneas no ocupan el mismo asiento',async()=>{
  const replies=await Promise.all(['CON01','DRV01'].map(user=>call('/bloqueos',user,'POST',purchase(user,'A0099'))));assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);assert.equal(state.tickets.filter(b=>b.ID_ASI_PER==='A0099').length,1);
  const held=state.tickets.find(b=>b.ID_ASI_PER==='A0099');await call('/'+held.ID_BOL+'/cancelar',held.ID_USU_FIN,'PUT',{cedula:held.ID_USU_FIN});
 });
 await t.test('horarios laborales bloquean reservas superpuestas y horarios incompletos',async()=>{
  for(const user of ['CON01','DRV01']) {
   state.work=[{SALIDA_PLAN_UTC:'2026-12-01T11:00:00Z',LLEGADA_PLAN_UTC:'2026-12-01T13:00:00Z'}];
   const hold=await call('/bloqueos',user,'POST',purchase(user,user==='CON01'?'A0087':'A0086'));
   const ticket=(await hold.json()).reservas[0];
   const denied=await confirm(user,ticket);assert.equal(denied.status,409);assert.match((await denied.json()).message,/laboral/);
   state.work[0].LLEGADA_PLAN_UTC=null;assert.equal((await confirm(user,ticket)).status,409);
   state.work=[{SALIDA_PLAN_UTC:'2026-12-01T10:00:00Z',LLEGADA_PLAN_UTC:state.start}];
   assert.equal((await confirm(user,ticket)).status,200);
  }
  state.work=[];state.start=null;
  const ticket=(await (await call('/bloqueos','DRV01','POST',purchase('DRV01','A0088'))).json()).reservas[0];
  assert.equal((await confirm('DRV01',ticket)).status,409);
  assert.equal((await confirm('DRV01',ticket,'GUEST01')).status,200);
  state.start='2026-12-01T12:00:00Z';
 });
 await t.test('el esquema pendiente y otros roles no aparentan una compra correcta',async()=>{
  assert.equal((await call('/bloqueos', 'OFI01','POST',purchase('OFI01','A0098'))).status,403);
  state.schema=false;assert.equal((await call('/bloqueos','DRV01','POST',purchase('DRV01','A0098'))).status,503);assert.ok(!state.tickets.some(b=>b.ID_ASI_PER==='A0098'));
 });
});
