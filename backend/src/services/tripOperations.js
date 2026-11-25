const {sql,conectarBD}=require('../config/db');
const rules=require('./tripRules');
const schedule=require('./workerSchedule');
const cc=require('./frequencyControl');
const categories=require('./routeCategories');
const {fail,norm}=rules;
const req=db=>new sql.Request(db);
const code=id=>{if(!/^[A-Z0-9_-]{1,5}$/.test(id||''))throw fail(400,'Hoja de ruta inválida.');return id;};
const localDay = date => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
async function installed(db) {
 const r=await req(db).query("SELECT CASE WHEN COL_LENGTH('dbo.HOJAS_RUTAS','ID_USU_CHO') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','RECORRIDO_JSON') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','SALIDA_PLAN_UTC') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','LLEGADA_PLAN_UTC') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','INICIO_UTC') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','FIN_UTC') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','PARADA_ACTUAL') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','EST_MOV') IS NOT NULL AND OBJECT_ID('dbo.HOJA_EVENTOS','U') IS NOT NULL AND OBJECT_ID('dbo.FRECUENCIA_PARADAS','U') IS NOT NULL THEN 1 ELSE 0 END AS OPERACION_INSTALADA");
 return r.recordset[0]?.OPERACION_INSTALADA===1;
}
async function ready(db) {if(!await installed(db))throw fail(503,'La operación de viajes requiere aplicar manualmente 010_operacion_viajes.sql.');}
function operator(user) {if(!['R004','R006'].includes(user?.rolId))throw fail(403,'Este portal corresponde a choferes y controladores.');}
async function sheets(db,user,id,lock=false) {
 operator(user);const available=await installed(db);
 if(!available&&user.rolId==='R006')return [];
 const assigned=user.rolId==='R006'?'H.ID_USU_CHO':'H.ID_USU_CON';
 return (await req(db).input('actor',sql.VarChar(10),user.id).input('company',sql.VarChar(5),user.cooperativaId).input('sheet',sql.VarChar(5),id?code(id):null).query(`
 SELECT H.*,F.CIU_ORI_FRE,F.CIU_DES_FRE,F.FEC_HOR_INI_FRE,F.FEC_HOR_FIN_FRE,F.EST_RES,F.ID_COP_PER RUTA_COP,
 B.ID_BUS,B.NUM_BUS,B.PLA_BUS,B.EST_BUS,B.ID_COP_PER BUS_COP,C.EST_COP,
 U.NOM_USU CON_NOMBRE,U.APE_USU CON_APELLIDO,U.EST_USU CON_EST,U.ID_ROL_PER CON_ROL,U.ID_COP_PER CON_COP,
 ${available?'D.NOM_USU CHO_NOMBRE,D.APE_USU CHO_APELLIDO,D.EST_USU CHO_EST,D.ID_ROL_PER CHO_ROL,D.ID_COP_PER CHO_COP':'NULL CHO_NOMBRE,NULL CHO_APELLIDO,NULL CHO_EST,NULL CHO_ROL,NULL CHO_COP'}
 FROM dbo.HOJAS_RUTAS H ${lock?'WITH(UPDLOCK,HOLDLOCK)':''}
 JOIN dbo.FRECUENCIAS F ON F.ID_FRE=H.ID_FRE_PER
 JOIN dbo.BUSES B ON B.ID_BUS=COALESCE(H.ID_BUS_REE,H.ID_BUS_PER) JOIN dbo.COOPERATIVAS C ON C.ID_COP=B.ID_COP_PER
 LEFT JOIN dbo.USUARIOS U ON U.ID_USU=H.ID_USU_CON ${available?'LEFT JOIN dbo.USUARIOS D ON D.ID_USU=H.ID_USU_CHO':''}
 WHERE ${assigned}=@actor AND B.ID_COP_PER=@company AND F.ID_COP_PER=@company AND (@sheet IS NULL OR H.ID_HOJ=@sheet)
 ORDER BY H.FEC_PRO_HOJ DESC,H.ID_HOJ DESC`)).recordset;
}
async function sheet(db,user,id,lock=false) {const h=(await sheets(db,user,id,lock))[0];if(!h)throw fail(404,'Viaje no disponible para tu cuenta.');return h;}
async function stops(db,h,available=true) {
 const rows=available&&!h.RECORRIDO_JSON?(await req(db).input('frequency',sql.VarChar(5),h.ID_FRE_PER).query('SELECT ORDEN,NOMBRE,COMERCIAL FROM dbo.FRECUENCIA_PARADAS WHERE ID_FRE=@frequency ORDER BY ORDEN')).recordset:[];
 return rules.itinerary(h,rows);
}
async function seats(db,h) {return (await req(db).input('bus',sql.VarChar(5),h.ID_BUS).query('SELECT A.ID_ASI,A.PIS_ASI,T.NOM_TIP FROM dbo.ASIENTOS_BUS A JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP=A.ID_TIP_PER WHERE A.ID_BUS_PER=@bus ORDER BY A.PIS_ASI,A.ID_ASI')).recordset;}
async function tickets(db,id,lock=false) {return (await req(db).input('sheet',sql.VarChar(5),id).query(`SELECT T.ID_BOL,T.ID_HOJ_PER,T.ID_ASI_PER,T.ORI_TRA_BOL,T.DES_TRA_BOL,T.EST_BOL,T.COD_QR_BOL,T.PRE_FIN_BOL,T.MET_PAG_BOL,T.FEC_COM_BOL,T.ID_USU_CON,U.NOM_USU,U.APE_USU FROM dbo.BOLETOS T ${lock?'WITH(UPDLOCK,HOLDLOCK)':''} LEFT JOIN dbo.USUARIOS U ON U.ID_USU=T.ID_USU_FIN WHERE T.ID_HOJ_PER=@sheet ORDER BY T.ID_ASI_PER,T.ID_BOL`)).recordset;}
async function events(db,id) {return (await req(db).input('sheet',sql.VarChar(5),id).query('SELECT E.*,U.NOM_USU,U.APE_USU FROM dbo.HOJA_EVENTOS E JOIN dbo.USUARIOS U ON U.ID_USU=E.ID_USU WHERE E.ID_HOJ=@sheet ORDER BY E.FECHA_UTC DESC')).recordset;}
function ticketPreparation(sold,places,route) {
 const active=sold.filter(t=>!rules.cancelled(t.EST_BOL));let consistent=true;
 try{const ranges=[];for(const t of active){const range=rules.segment(t,route);if(!places.some(s=>s.ID_ASI===t.ID_ASI_PER)||ranges.some(r=>r.seat===t.ID_ASI_PER&&r.start<range.end&&range.start<r.end))consistent=false;ranges.push({...range,seat:t.ID_ASI_PER});}}catch{consistent=false;}
 return {label:'Boletos y asientos consistentes con el recorrido',ok:consistent};
}
function summary(h) {return {id:h.ID_HOJ,fecha:h.FEC_PRO_HOJ,salida:h.SALIDA_PLAN_UTC||null,llegada:h.LLEGADA_PLAN_UTC||null,inicio:h.INICIO_UTC||null,fin:h.FIN_UTC||null,estado:h.EST_VIA_HOJ,origen:h.CIU_ORI_FRE,destino:h.CIU_DES_FRE,bus:h.NUM_BUS,placa:h.PLA_BUS,chofer:[h.CHO_NOMBRE,h.CHO_APELLIDO].filter(Boolean).join(' ')||null,controlador:[h.CON_NOMBRE,h.CON_APELLIDO].filter(Boolean).join(' ')||null,parada:h.PARADA_ACTUAL??0,movimiento:h.EST_MOV||null};}
async function journal(user) {
 operator(user);const db=await conectarBD(),available=await installed(db),rows=await sheets(db,user);
 const trips=rows.map(summary);const active=trips.filter(h=>['PROGRAMADO','PROGRAMADA','EN CURSO'].includes(norm(h.estado))).sort((a,b)=>(norm(b.estado)==='EN CURSO')-(norm(a.estado)==='EN CURSO')||new Date(a.salida||a.fecha)-new Date(b.salida||b.fecha));
 return {operacionDisponible:available,viajes:active,historial:trips.filter(h=>!active.includes(h)),dependencias:available?[]:['010_operacion_viajes.sql pendiente: asignación de chofer, horarios y eventos.']};
}
async function detail(user,id) {
 const db=await conectarBD(),available=await installed(db),h=await sheet(db,user,id),route=await stops(db,h,available),places=await seats(db,h),sold=await tickets(db,id),log=available?await events(db,id):[];
 let agenda;try{agenda=!['PROGRAMADO','PROGRAMADA'].includes(norm(h.EST_VIA_HOJ))?{label:'Recorrido ya iniciado o cerrado',ok:true}:available?await schedule.work(db,h,{exclude:id}):{label:'Agenda operativa no disponible',ok:false};}catch(e){if(e.status!==409)throw e;agenda={label:e.message,ok:false};}
 const occupants=sold.filter(t=>!rules.cancelled(t.EST_BOL));
 const seatRows=places.map(p=>({...p,estado:occupants.some(t=>t.ID_ASI_PER===p.ID_ASI)?'Comprometido':'Disponible'}));
 const passengers=user.rolId==='R004'?sold.map(t=>{const own=log.filter(e=>e.ID_BOL===t.ID_BOL);return {id:t.ID_BOL,asiento:t.ID_ASI_PER,origen:t.ORI_TRA_BOL,destino:t.DES_TRA_BOL,titular:[t.NOM_USU,t.APE_USU].filter(Boolean).join(' ')||'Sin titular registrado',estado:rules.cancelled(t.EST_BOL)?'No válido':own.some(e=>e.TIPO==='DESCENSO')?'Descendió':own.some(e=>e.TIPO==='ABORDAJE')?'A bordo':norm(t.EST_BOL)==='USADO'?'Usado previamente; abordaje sin registro operativo':'Pendiente de abordar',estadoBoleto:t.EST_BOL};}):[];
 return {viaje:summary(h),operacionDisponible:available,recorrido:route,preparacion:[...rules.preparation(h,places),ticketPreparation(sold,places,route),agenda],asientos:seatRows,ocupacion:{...rules.segmentAvailability(places,sold,route),capacidad:places.length,comprometidos:seatRows.filter(s=>s.estado==='Comprometido').length,disponibles:seatRows.filter(s=>s.estado==='Disponible').length,validados:available?log.filter(e=>e.TIPO==='ABORDAJE').length:null,descensos:available?log.filter(e=>e.TIPO==='DESCENSO').length:null,previstos:occupants.length,aBordo:sold.filter(t=>log.some(e=>e.ID_BOL===t.ID_BOL&&e.TIPO==='ABORDAJE')&&!log.some(e=>e.ID_BOL===t.ID_BOL&&e.TIPO==='DESCENSO')).length},pasajeros:passengers,boletosRegistrados:user.rolId==='R004'?sold.filter(t=>t.ID_USU_CON===user.id).map(t=>({id:t.ID_BOL,fecha:t.FEC_COM_BOL,importe:t.PRE_FIN_BOL,metodo:t.MET_PAG_BOL,estado:t.EST_BOL})):[],eventos:log.filter(e=>user.rolId==='R004'||!e.ID_BOL).map(e=>({tipo:e.TIPO,fecha:e.FECHA_UTC,detalle:e.DETALLE,parada:e.ORDEN,boleto:e.ID_BOL,propio:e.ID_USU===user.id,autor:[e.NOM_USU,e.APE_USU].join(' ')})),venta:{disponible:false,motivo:'Falta una tarifa por tramo y un control de cupos compartido con reservas y ventanilla. No se confirmarán cobros.',cotizacion:null}};
}
async function transaction(work) {const db=await conectarBD();await ready(db);const tx=new sql.Transaction(db);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);try{const result=await work(tx);await tx.commit();return result;}catch(e){await tx.rollback().catch(()=>{});throw e;}}
async function actor(db,user) {
 const r=(await req(db).input('actor',sql.VarChar(10),user.id).query('SELECT U.EST_USU,U.ID_ROL_PER,U.ID_COP_PER,C.EST_COP FROM dbo.USUARIOS U WITH(UPDLOCK,HOLDLOCK) JOIN dbo.COOPERATIVAS C ON C.ID_COP=U.ID_COP_PER WHERE U.ID_USU=@actor')).recordset[0];
 if(!r||r.EST_USU!=='1'||r.EST_COP!=='1'||r.ID_ROL_PER!==user.rolId||r.ID_COP_PER!==user.cooperativaId)throw fail(403,'Tu acceso o tu cooperativa cambió. Inicia sesión nuevamente.');
}
function canAssign(user) {
 if(user.rolId!=='R001'&&!require('../security/permissions').can(user,'rutas'))throw fail(403,'No puedes programar viajes.');
}
async function verifyScheduler(db,user) {
 canAssign(user);
 if(user.rolId==='R001')return require('./accounts').actor(db,user);
 await actor(db,user);
 const access=require('../security/permissions');
 if(!access.can({...user,...await access.context(db,user)},'rutas'))throw fail(403,'Tu permiso de rutas cambió.');
}
async function event(user,id,body) {
 operator(user);const action=body?.tipo;
 const allowed=user.rolId==='R006'?['INICIO','LLEGADA','CONTINUAR','FIN','NOVEDAD']:['ABORDAJE','DESCENSO','NOVEDAD'];
 if(!allowed.includes(action))throw fail(403,'Esta acción no corresponde a tu rol.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.evento||''))throw fail(400,'Identificador de operación inválido.');
 const note=typeof body.detalle==='string'?body.detalle.trim():'';
 if(action==='NOVEDAD'&&(!note||note.length>1000))throw fail(400,'Describe la novedad en un máximo de 1000 caracteres.');
 return transaction(async db=>{
   if(action==='INICIO')await cc.lock(db);
   const initial=await sheet(db,user,id);await schedule.lock(db,[initial.ID_USU_CHO,initial.ID_USU_CON]);
  await actor(db,user);const h=await sheet(db,user,id,true);
  const existing=(await req(db).input('event',sql.UniqueIdentifier,body.evento).query('SELECT ID_HOJ,ID_USU,TIPO,DETALLE,ID_BOL FROM dbo.HOJA_EVENTOS WITH(UPDLOCK,HOLDLOCK) WHERE ID_EVENTO=@event')).recordset[0];
  if(existing){if(existing.ID_HOJ!==id||existing.ID_USU!==user.id||existing.TIPO!==action||(action==='NOVEDAD'&&existing.DETALLE!==note))throw fail(409,'El identificador ya corresponde a otra operación.');if(['ABORDAJE','DESCENSO'].includes(action)){const prior=(await tickets(db,id)).find(t=>t.ID_BOL===existing.ID_BOL);if(!prior||!rules.qrMatches(prior,body.codigo))throw fail(409,'El identificador pertenece a otro boleto.');}return {repetida:true,message:'La operación ya estaba confirmada.'};}
  if(user.rolId==='R006'&&body.vehiculoDetenido!==true)throw fail(400,'Confirma que el vehículo está detenido antes de registrar la operación.');
   if(action==='INICIO'){
    await schedule.work(db,h,{exclude:id});
    if(cc.enabled()){
     const hoy=localDay(new Date());
     const salida=localDay(new Date(h.SALIDA_PLAN_UTC));
     const llegada=localDay(new Date(+new Date(h.LLEGADA_PLAN_UTC)-1));
     await cc.scheduled(db,h.ID_FRE_PER,salida,llegada);
     await cc.scheduled(db,h.ID_FRE_PER,hoy,hoy);
    }
   }
  const route=await stops(db,h);let position=h.PARADA_ACTUAL??0,next=norm(h.EST_VIA_HOJ),ticket=null;
  if(['FINALIZADO','FINALIZADA','CANCELADO','CANCELADA'].includes(next))throw fail(409,'El viaje está cerrado y no admite modificaciones.');
  if(['ABORDAJE','DESCENSO'].includes(action)) {
   const value=rules.qrValue(body.codigo),rows=await tickets(db,id,true);ticket=rows.find(t=>rules.qrMatches(t,value));
   if(!ticket)throw fail(404,'Boleto no encontrado, QR inválido o viaje incorrecto.');
   const history=await events(db,id);rules.boarding(h,route,ticket,action,history.filter(e=>e.ID_BOL===ticket.ID_BOL));
   if(action==='ABORDAJE')await req(db).input('ticket',sql.VarChar(5),ticket.ID_BOL).query("UPDATE dbo.BOLETOS SET EST_BOL='USADO',FEC_USO_BOL=CONVERT(date,GETDATE()) WHERE ID_BOL=@ticket");
  } else if(action!=='NOVEDAD') {
   const places=await seats(db,h),sold=await tickets(db,id);
   const result=rules.transition(h,route,action,[...rules.preparation(h,places),ticketPreparation(sold,places,route)]);position=result.position;next=result.state;
   await req(db).input('sheet',sql.VarChar(5),id).input('state',sql.VarChar(30),next).input('position',sql.Int,position).input('movement',sql.VarChar(10),result.movement).input('route',sql.NVarChar(sql.MAX),JSON.stringify(route)).query(`UPDATE dbo.HOJAS_RUTAS SET EST_VIA_HOJ=@state,PARADA_ACTUAL=@position,EST_MOV=@movement,RECORRIDO_JSON=COALESCE(RECORRIDO_JSON,@route)${action==='INICIO'?',INICIO_UTC=SYSUTCDATETIME()':''}${action==='FIN'?',FIN_UTC=SYSUTCDATETIME()':''} WHERE ID_HOJ=@sheet`);
  }
  await req(db).input('event',sql.UniqueIdentifier,body.evento).input('sheet',sql.VarChar(5),id).input('actor',sql.VarChar(10),user.id).input('type',sql.VarChar(20),action).input('before',sql.VarChar(30),h.EST_VIA_HOJ).input('after',sql.VarChar(30),next).input('position',sql.Int,position).input('ticket',sql.VarChar(5),ticket?.ID_BOL||null).input('detail',sql.NVarChar(1000),note||null).query('INSERT INTO dbo.HOJA_EVENTOS(ID_EVENTO,ID_HOJ,ID_USU,TIPO,EST_ANT,EST_NUEVO,ORDEN,ID_BOL,DETALLE) VALUES(@event,@sheet,@actor,@type,@before,@after,@position,@ticket,@detail)');
  return {message:action==='DESCENSO'?'Descenso registrado. El asiento conserva su tramo contratado.':'Operación confirmada.',estado:next};
 });
}
async function assign(user,body) {
 canAssign(user);
 return transaction(async db=>{
  await cc.lock(db);
  await verifyScheduler(db,user);
  return assignInTransaction(db,user,body);
 });
}
async function assignInTransaction(db,user,body) {
 canAssign(user);
 const {idBus,idFre,idUsuCho,idUsuCon,salida,llegada}=body||{};code(idBus);code(idFre);
 const observation=typeof body.obs==='string'?body.obs.trim():'';if(observation.length>50)throw fail(400,'La observación admite hasta 50 caracteres.');
 if(!/^[A-Z0-9]{5,10}$/.test(idUsuCho||'')||!/^[A-Z0-9]{5,10}$/.test(idUsuCon||''))throw fail(400,'Selecciona chofer y controlador.');
 const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
 const start=new Date(salida),end=new Date(llegada);if(!utc.test(salida||'')||!utc.test(llegada||'')||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||start.toISOString().slice(0,19)!==salida.slice(0,19)||end.toISOString().slice(0,19)!==llegada.slice(0,19))throw fail(400,'Indica salida y llegada previstas completas y coherentes.');
  await schedule.lock(db,[idUsuCho,idUsuCon]);
  const query=req(db).input('bus',sql.VarChar(5),idBus).input('frequency',sql.VarChar(5),idFre).input('driver',sql.VarChar(10),idUsuCho).input('controller',sql.VarChar(10),idUsuCon);
  const h=(await query.query(`SELECT B.ID_BUS,B.EST_BUS,B.ID_COP_PER BUS_COP,F.ID_COP_PER RUTA_COP,C.EST_COP,F.EST_RES,F.FEC_HOR_INI_FRE,F.FEC_HOR_FIN_FRE,F.CIU_ORI_FRE,F.CIU_DES_FRE,F.ID_FRE ID_FRE_PER,
   D.EST_USU CHO_EST,D.ID_ROL_PER CHO_ROL,D.ID_COP_PER CHO_COP,U.EST_USU CON_EST,U.ID_ROL_PER CON_ROL,U.ID_COP_PER CON_COP
   FROM dbo.BUSES B WITH(UPDLOCK,HOLDLOCK) JOIN dbo.COOPERATIVAS C ON C.ID_COP=B.ID_COP_PER
   JOIN dbo.FRECUENCIAS F ON F.ID_FRE=@frequency
   JOIN dbo.USUARIOS D WITH(UPDLOCK,HOLDLOCK) ON D.ID_USU=@driver JOIN dbo.USUARIOS U WITH(UPDLOCK,HOLDLOCK) ON U.ID_USU=@controller WHERE B.ID_BUS=@bus`)).recordset[0];
   if(!h||(user.rolId==='R002'&&h.BUS_COP!==user.cooperativaId))throw fail(404,'Asignación no disponible para tu cooperativa.');
   const day=localDay(start);
   await cc.scheduled(db,idFre,day,localDay(new Date(+end-1)));
   await categories.compatible(db,idFre,idBus);
  const route=await stops(db,h),places=await seats(db,h);
  if(rules.preparation({...h,SALIDA_PLAN_UTC:start,LLEGADA_PLAN_UTC:end,EST_VIA_HOJ:'PROGRAMADO'},places).some(c=>!c.ok))throw fail(409,'Bus, ruta, horario y trabajadores deben estar activos y pertenecer a la misma cooperativa.');
  await schedule.work(db,{...h,ID_USU_CHO:idUsuCho,ID_USU_CON:idUsuCon,SALIDA_PLAN_UTC:start,LLEGADA_PLAN_UTC:end});
  const used=new Set((await req(db).query('SELECT ID_HOJ FROM dbo.HOJAS_RUTAS WITH(UPDLOCK,HOLDLOCK)')).recordset.map(r=>r.ID_HOJ));let id;for(let i=1;i<=9999;i++){const candidate='H'+String(i).padStart(4,'0');if(!used.has(candidate)){id=candidate;break;}}if(!id)throw fail(409,'No hay códigos de hoja disponibles.');
  await req(db).input('id',sql.VarChar(5),id).input('date',sql.Date,day).input('bus',sql.VarChar(5),idBus).input('frequency',sql.VarChar(5),idFre).input('driver',sql.VarChar(10),idUsuCho).input('controller',sql.VarChar(10),idUsuCon).input('start',sql.DateTime2,start).input('end',sql.DateTime2,end).input('route',sql.NVarChar(sql.MAX),JSON.stringify(route)).input('observation',sql.VarChar(50),observation||null).query("INSERT INTO dbo.HOJAS_RUTAS(ID_HOJ,FEC_PRO_HOJ,EST_VIA_HOJ,ID_BUS_PER,ID_FRE_PER,ID_USU_CHO,ID_USU_CON,SALIDA_PLAN_UTC,LLEGADA_PLAN_UTC,PARADA_ACTUAL,EST_MOV,RECORRIDO_JSON,OBS_HOJ) VALUES(@id,@date,'PROGRAMADO',@bus,@frequency,@driver,@controller,@start,@end,0,'DETENIDO',@route,@observation)");
  return {idHoja:id,message:'Viaje programado.'};
}
async function assignmentOptions(user) {
 if(user.rolId!=='R001'&&!require('../security/permissions').can(user,'rutas'))throw fail(403,'No tienes permiso para organizar salidas.');
 const db=await conectarBD();await ready(db);
 const scoped=()=>req(db).input('company',sql.VarChar(5),user.rolId==='R001'?null:user.cooperativaId);
 const buses=(await scoped().query("SELECT B.ID_BUS,B.NUM_BUS,B.PLA_BUS FROM dbo.BUSES B JOIN dbo.COOPERATIVAS C ON C.ID_COP=B.ID_COP_PER WHERE C.EST_COP='1' AND UPPER(B.EST_BUS) IN ('ACTIVO','1') AND (@company IS NULL OR B.ID_COP_PER=@company) ORDER BY B.NUM_BUS")).recordset;
  const frecuencias=(await scoped().query(`SELECT F.ID_FRE,F.CIU_ORI_FRE,F.CIU_DES_FRE FROM dbo.FRECUENCIAS F JOIN dbo.COOPERATIVAS C ON C.ID_COP=F.ID_COP_PER
    WHERE C.EST_COP='1' AND F.EST_RES='1' AND (@company IS NULL OR F.ID_COP_PER=@company)
    ORDER BY F.CIU_ORI_FRE,F.CIU_DES_FRE`)).recordset;
 const personal=(await scoped().query("SELECT U.ID_USU,U.NOM_USU,U.APE_USU,U.ID_ROL_PER FROM dbo.USUARIOS U JOIN dbo.COOPERATIVAS C ON C.ID_COP=U.ID_COP_PER WHERE U.EST_USU='1' AND C.EST_COP='1' AND U.ID_ROL_PER IN ('R004','R006') AND (@company IS NULL OR U.ID_COP_PER=@company) ORDER BY U.NOM_USU,U.APE_USU")).recordset;
  return {buses,frecuencias,personal,lotesDisponibles:categories.enabled()};
}
async function protectOperationalSheet(id) {
 const db=await conectarBD(),available=await installed(db);
 const h=(await req(db).input('sheet',sql.VarChar(5),id).query(`SELECT EST_VIA_HOJ,${available?'ID_USU_CHO,SALIDA_PLAN_UTC':'NULL AS ID_USU_CHO,NULL AS SALIDA_PLAN_UTC'} FROM dbo.HOJAS_RUTAS WHERE ID_HOJ=@sheet`)).recordset[0];
 if(h&&(h.ID_USU_CHO||h.SALIDA_PLAN_UTC||!['PROGRAMADO','PROGRAMADA'].includes(norm(h.EST_VIA_HOJ))))throw fail(409,'No se puede alterar esta salida desde el formulario antiguo. El recorrido operativo conserva sus asignaciones e historial.');
}
module.exports={installed,journal,detail,event,assign,assignInTransaction,sheet,transaction,assignmentOptions,protectOperationalSheet,canAssign,verifyScheduler,stops,localDay};
