const fail=(status,message)=>Object.assign(new Error(message),{status});
const norm=v=>String(v??'').trim().toUpperCase();
const cancelled=v=>['CANCELADO','ANULADO','INVALIDO','VENCIDO'].includes(norm(v));
function itinerary(sheet,configured=[]) {
 let rows;try{rows=sheet.RECORRIDO_JSON?JSON.parse(sheet.RECORRIDO_JSON):configured;}catch{throw fail(409,'El recorrido guardado no es válido.');}
 if(!Array.isArray(rows))throw fail(409,'El recorrido guardado no es válido.');
 if(!rows.length)rows=[{ORDEN:0,NOMBRE:sheet.CIU_ORI_FRE,COMERCIAL:true},{ORDEN:1,NOMBRE:sheet.CIU_DES_FRE,COMERCIAL:true}];
 if(rows.length<2||rows.some((r,i)=>r.ORDEN!==i||!r.NOMBRE)||new Set(rows.map(r=>norm(r.NOMBRE))).size!==rows.length||norm(rows[0].NOMBRE)!==norm(sheet.CIU_ORI_FRE)||norm(rows.at(-1).NOMBRE)!==norm(sheet.CIU_DES_FRE))throw fail(409,'El recorrido configurado es inconsistente. Revisa sus paradas.');
 return rows;
}
function preparation(h,seats) {
 const checks=[['Bus activo',!!h.ID_BUS&&['ACTIVO','1','OPERANDO'].includes(norm(h.EST_BUS))],['Cooperativa y ruta habilitadas',h.EST_COP==='1'&&h.EST_RES==='1'&&h.BUS_COP===h.RUTA_COP],['Horario completo',!!h.SALIDA_PLAN_UTC&&!!h.LLEGADA_PLAN_UTC&&new Date(h.SALIDA_PLAN_UTC)<new Date(h.LLEGADA_PLAN_UTC)],['Chofer activo',h.CHO_ROL==='R006'&&h.CHO_EST==='1'&&h.CHO_COP===h.BUS_COP],['Controlador activo',h.CON_ROL==='R004'&&h.CON_EST==='1'&&h.CON_COP===h.BUS_COP],['Capacidad registrada',seats.length>0],['Hoja programada',['PROGRAMADO','PROGRAMADA'].includes(norm(h.EST_VIA_HOJ))]];
 if(h.FEC_HOR_INI_FRE!==undefined){const start=h.SALIDA_PLAN_UTC&&new Date(h.SALIDA_PLAN_UTC),day=start&&Number.isFinite(+start)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(start):null;const date=v=>v?new Date(v).toISOString().slice(0,10):null;checks.push(['Frecuencia vigente para la salida',!!day&&!!h.FEC_HOR_INI_FRE&&day>=date(h.FEC_HOR_INI_FRE)&&(!h.FEC_HOR_FIN_FRE||day<=date(h.FEC_HOR_FIN_FRE))]);}
 return checks.map(([label,ok])=>({label,ok}));
}
function transition(h,stops,action,checks=[]) {
 const state=norm(h.EST_VIA_HOJ),position=h.PARADA_ACTUAL??0;
 if(action==='INICIO') {
  if(!['PROGRAMADO','PROGRAMADA'].includes(state)||h.INICIO_UTC)throw fail(409,'El viaje ya comenzó o no está programado.');
  if(!checks.length||checks.some(c=>!c.ok))throw fail(409,'Completa las comprobaciones de preparación antes de salir.');
  return {state:'EN CURSO',position:0,movement:'TRANSITO'};
 }
 if(state!=='EN CURSO'||!h.INICIO_UTC)throw fail(409,'El viaje debe estar en curso.');
 if(action==='LLEGADA'&&h.EST_MOV==='TRANSITO'&&position<stops.length-1)return {state,position:position+1,movement:'DETENIDO'};
 if(action==='CONTINUAR'&&h.EST_MOV==='DETENIDO'&&position<stops.length-1)return {state,position,movement:'TRANSITO'};
 if(action==='FIN'&&h.EST_MOV==='DETENIDO'&&position===stops.length-1)return {state:'FINALIZADO',position,movement:'DETENIDO'};
 throw fail(409,'La acción no corresponde a la parada o al estado actual.');
}
function segment(ticket,stops) {
 const start=stops.findIndex(p=>norm(p.NOMBRE)===norm(ticket.ORI_TRA_BOL)),end=stops.findIndex(p=>norm(p.NOMBRE)===norm(ticket.DES_TRA_BOL));
 if(start<0||end<=start)throw fail(409,'El tramo del boleto no coincide con el recorrido.');
 return {start,end};
}
function segmentAvailability(places,tickets,stops) {
 const active=tickets.filter(t=>!cancelled(t.EST_BOL));
 try {
  const ranges=active.map(t=>({...segment(t,stops),seat:t.ID_ASI_PER}));
  if(ranges.some((r,i)=>!places.some(p=>p.ID_ASI===r.seat)||ranges.slice(i+1).some(s=>s.seat===r.seat&&s.start<r.end&&r.start<s.end)))throw fail(409,'Contratos de asientos inconsistentes.');
  return {confiable:places.length>0,tramos:stops.slice(0,-1).map((stop,i)=>{const committed=new Set(ranges.filter(r=>r.start<=i&&r.end>i).map(r=>r.seat));return {origen:stop.NOMBRE,destino:stops[i+1].NOMBRE,orden:i,capacidad:places.length,comprometidos:committed.size,disponibles:places.length-committed.size};})};
 }catch{return {confiable:false,tramos:[]};}
}
function boarding(h,stops,ticket,action,events) {
 if(cancelled(ticket.EST_BOL))throw fail(409,'Boleto cancelado o invalidado.');
 const range=segment(ticket,stops),position=h.PARADA_ACTUAL??0,state=norm(h.EST_VIA_HOJ);
 if(!['PROGRAMADO','PROGRAMADA','EN CURSO'].includes(state)||(state==='EN CURSO'&&h.EST_MOV!=='DETENIDO'))throw fail(409,'La operación requiere que el bus esté detenido en una parada autorizada.');
 if(!stops[position]?.COMERCIAL)throw fail(409,'Esta parada no admite abordajes ni descensos.');
 if(action==='ABORDAJE') {
  if(events.some(e=>e.TIPO==='ABORDAJE')||norm(ticket.EST_BOL)==='USADO')throw fail(409,'El boleto ya fue utilizado.');
  if(!['OK','EMITIDO','PAGADO','CONFIRMADO'].includes(norm(ticket.EST_BOL)))throw fail(409,'El boleto todavía no está confirmado para abordar.');
  if(position!==range.start)throw fail(409,'El boleto no corresponde a la parada actual.');
 }else {
  if(!events.some(e=>e.TIPO==='ABORDAJE')||events.some(e=>e.TIPO==='DESCENSO'))throw fail(409,'No hay un abordaje pendiente de descenso.');
  if(position<=range.start||position>range.end)throw fail(409,'El descenso no corresponde al tramo contratado.');
 }
 return range;
}
function qrValue(value) {
 if(typeof value!=='string'||!value.trim()||value.length>1500)throw fail(400,'Introduce un código de boleto o QR válido.');
 let code=value.trim();
 if(/^https:\/\/api\.qrserver\.com\//.test(code)){try{code=new URL(code).searchParams.get('data')||'';}catch{throw fail(400,'QR inválido.');}}
 return code;
}
function qrMatches(ticket,value) {
 const input=qrValue(value);if(input===ticket.ID_BOL)return true;
 try{return input===qrValue(ticket.COD_QR_BOL);}catch{return false;}
}
module.exports={fail,norm,cancelled,itinerary,preparation,transition,segment,segmentAvailability,boarding,qrValue,qrMatches};
