(() => {
 'use strict';
 const $=id=>document.getElementById(id),role=document.body.dataset.workerRole,api=window.API_BASE_URL,source=document.currentScript.src;
 let user,journal,detail,busy=false,selected='',scanner,readSequence=0,loaded=false,synced=false,disposed=false;
 const pending=new Map(),date=v=>v?new Date(v).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'No registrado';
 const status=message=>{$('workStatus').textContent=message;};
 const element=(tag,text)=>{const e=document.createElement(tag);e.textContent=text??'';return e;};
 const normalized=v=>String(v||'').trim().toUpperCase();
 function connection(){if(!loaded)return;$('workConnection').textContent=!navigator.onLine?'Sin conexión':synced?'Actualizado':'Sin verificar';$('workConnection').parentElement?.parentElement?.setAttribute('data-stale',String(!synced||!navigator.onLine));if(!synced||!navigator.onLine){$('workBoarded').textContent='Sin confirmar';$('workOccupied').textContent='Sin confirmar';}}
 function cell(label,value){const td=element('td',value);td.setAttribute('data-label',label);return td;}
 function agenda(){
  $('workAgenda').replaceChildren();let day;
  const scheduled=(journal.viajes||[]).filter(h=>['PROGRAMADO','PROGRAMADA'].includes(normalized(h.estado))),now=Date.now(),past=scheduled.filter(h=>h.salida&&new Date(h.salida)<now);
  const trips=scheduled.filter(h=>!past.includes(h)).sort((a,b)=>new Date(a.salida||a.fecha)-new Date(b.salida||b.fecha));
  $('workAgendaNotice').textContent=past.length?`${past.length} salida(s) siguen programadas con una hora de salida ya pasada. Revísalas en Mi jornada.`:'';
  for(const h of trips){const next=h.salida?new Date(h.salida).toLocaleDateString('es-EC',{timeZone:'America/Guayaquil',weekday:'long',year:'numeric',month:'long',day:'numeric'}):h.fecha?String(h.fecha).slice(0,10):'Fecha pendiente';if(day!==next){day=next;const heading=element('h3',day);heading.className='agenda-day';$('workAgenda').append(heading);}const card=element('article');card.className='agenda-trip';card.append(element('h3',h.origen+' → '+h.destino),element('p','Salida: '+date(h.salida)),element('p','Llegada: '+date(h.llegada)),element('p','Unidad: '+(h.bus||'No registrada')),element('p',(role==='R006'?'Controlador: ':'Chofer: ')+(role==='R006'?h.controlador||'Sin asignar':h.chofer||'Sin asignar')),element('p',h.estado));const button=element('button','Consultar viaje');button.type='button';button.addEventListener('click',()=>{selected=h.id;$('workTrip').value=selected;show('jornada');loadTrip();});card.append(button);$('workAgenda').append(card);}
  if(!trips.length)$('workAgenda').append(element('p','No tienes próximos recorridos programados.'));
 }
 async function request(path,body) {
  if(!navigator.onLine)throw new Error('Sin conexión. Las operaciones requieren verificación del servidor.');
  const response=await fetch(api+path,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(response.status===401){location.replace('../public/index.html?login=1');throw new Error('La sesión ha caducado.');}
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'No se pudo completar la operación.');return data;
 }
 function show(name) {
  document.querySelectorAll('[data-panel]').forEach(n=>{n.hidden=n.dataset.panel!==name;});document.querySelectorAll('[data-section]').forEach(n=>{if(n.dataset.section===name)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  $('workTitle').textContent=({jornada:'Mi jornada',agenda:'Mi agenda',pasajeros:'Pasajeros',validar:'Validar boleto',venta:'Venta a bordo',finanzas:'Reporte financiero',ocupacion:'Ocupación',operaciones:'Mis operaciones',historial:'Historial'})[name];if(name!=='validar')stopCamera();
  if(name==='venta')loadSale();
  if(name==='finanzas')loadFinance();
  $('workNav').classList.remove('is-expanded');$('workMenu').setAttribute('aria-expanded','false');
 }
 let quote, seat, financeTrip, sendingSale=false, sendingExpense=false;
 const saleForm=()=>$('workSaleFields');
 const expenseForm=()=>$('workExpenseFields');
 const usd=value=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(value);
 const tokens=new Map();
 function payload(path,fields){
  const key=JSON.stringify([path,fields]);
  if(!tokens.has(key))tokens.set(key,crypto.randomUUID());
  return {key,body:{...fields,operacion:tokens.get(key)}};
 }
 function showChange(){
  const difference=Math.round(Number($('workCash').value)*100)-Math.round(Number(quote?.precio)*100);
  $('workChange').textContent=!$('workCash').value||!quote?.disponible?'':difference<0?'Efectivo insuficiente':`Vuelto: ${usd(difference/100)}`;
 }
 async function loadSale(){
  saleForm().disabled=true;quote=null;seat=null;
  $('workSaleSeats').replaceChildren();$('workSaleReason').textContent='Consultando viaje en curso?';
  try{
   quote=await request('/api/operacion/venta');
   $('workSaleOrigin').value=quote.origen||'';
   $('workSaleDestination').replaceChildren(...quote.destinos.map(p=>{
    const option=element('option',p.NOMBRE);option.value=p.ORDEN;return option;
   }));
   $('workTotal').value=quote.precio==null?'':usd(quote.precio);
   let floor, grid, number=0;
   for(const a of quote.asientos){
    if(a.PIS_ASI!==floor){
     floor=a.PIS_ASI;grid=element('div');grid.className='work-seat-grid';
     $('workSaleSeats').append(element('p',`Piso ${floor}`),grid);
    }
    const button=element('button',`${++number} ? ${a.libre?'Libre':'Ocupado'}`);
    button.type='button';button.disabled=!a.libre;button.dataset.free=String(a.libre);
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
     for(const item of $('workSaleSeats').querySelectorAll('button'))item.setAttribute('aria-pressed',String(item===button));
     seat=a.ID_ASI;
    });
    grid.append(button);
   }
   $('workSaleReason').textContent=quote.disponible?`Viaje ${quote.id}. Selecciona un asiento libre.`:'La parada actual o la tarifa no permite vender.';
   saleForm().disabled=!quote.disponible;showChange();
  }catch(e){$('workSaleReason').textContent=e.message;}
 }
 async function submitSale(e){
  e.preventDefault();
  if(sendingSale||!quote?.disponible)return;
  if(!seat){$('workSaleReason').textContent='Selecciona un asiento libre.';return;}
  const path=`/api/operacion/hojas/${quote.id}/venta`;
  const {key,body}=payload(path,{asiento:seat,destino:Number($('workSaleDestination').value),efectivo:$('workCash').value});
  sendingSale=true;saleForm().disabled=true;
  try{
   const sale=await request(path,body);tokens.delete(key);$('workCash').value='';
   await loadSale();$('workSaleReason').textContent=`Boleto ${sale.boleto} confirmado. Vuelto: ${usd(sale.vuelto)}.`;
  }catch(e){saleForm().disabled=false;$('workSaleReason').textContent=e.message;}
  finally{sendingSale=false;}
 }
 async function loadFinance(){
  expenseForm().disabled=true;financeTrip=null;
  $('workFinanceStatus').textContent='Consultando viaje?';
  $('workFinanceTotals').textContent='';$('workExpenses').replaceChildren();
  try{
   const trips=await request('/api/operacion/jornada');
   const current=trips.viajes.find(h=>normalized(h.estado)==='EN CURSO');
   const h=current||[...trips.viajes,...trips.historial].find(h=>h.id===selected);
   if(!h)throw new Error('Selecciona un viaje para consultar su reporte.');
   const data=await request(`/api/operacion/hojas/${h.id}/finanzas`);
   financeTrip=current?.id;$('workFinanceStatus').textContent=`Viaje ${h.id} ? ${h.origen} ? ${h.destino}`;
   $('workFinanceTotals').textContent=`Vendidos: ${data.vendidos} ? Abordados: ${data.abordados} ? Ingresos: ${usd(data.ingresos)} ? Gastos: ${usd(data.gastos)} ? Saldo: ${usd(data.saldo)}`;
   for(const g of data.registros)$('workExpenses').append(element('li',`${g.CATEGORIA} ? ${usd(g.MONTO)}${g.DETALLE?' ? '+g.DETALLE:''}`));
   expenseForm().disabled=!financeTrip;
  }catch(e){$('workFinanceStatus').textContent=e.message;}
 }
 async function submitExpense(e){
  e.preventDefault();if(!financeTrip||sendingExpense)return;
  const path=`/api/operacion/hojas/${financeTrip}/gastos`;
  const {key,body}=payload(path,Object.fromEntries(new FormData(e.currentTarget)));
  sendingExpense=true;expenseForm().disabled=true;
  try{await request(path,body);tokens.delete(key);e.target.reset();await loadFinance();}
  catch(error){expenseForm().disabled=false;$('workFinanceStatus').textContent=error.message;}
  finally{sendingExpense=false;}
 }
 function clear() {
  detail=null;$('workTripDetails').hidden=true;$('workEmpty').hidden=false;
  for(const id of ['workPassengers','workEvents','workSeats','tripChecks','tripStops','workRecordedTickets','workSegments'])$(id).replaceChildren();
  $('workCapacity').textContent='Selecciona un viaje.';$('workSaleReason').textContent='Selecciona un viaje. No hay una cotización confirmada.';
  $('workBoarded').textContent='No disponible';$('workOccupied').textContent='No disponible';
  $('workPassengerSummary').textContent='Selecciona un viaje para consultar sus pasajeros.';
  for(const id of ['workNoteSubmit','workValidateSubmit','workCamera'])$(id).disabled=true;
 }
 function render(data) {
  detail=data;const h=data.viaje;$('workEmpty').hidden=true;$('workTripDetails').hidden=false;
  $('tripRoute').textContent=h.origen+' → '+h.destino;$('tripInfo').textContent=h.estado+' · '+(h.movimiento||'Preparación de abordaje');$('tripData').replaceChildren();
  for(const [name,value]of [['Salida',date(h.salida)],['Llegada prevista',date(h.llegada)],['Unidad',`${h.bus||'Sin asignar'}${h.placa?' · '+h.placa:''}`],[role==='R006'?'Controlador asignado':'Chofer asignado',role==='R006'?h.controlador||'Sin asignar':h.chofer||'Sin asignar']]){const d=element('div');d.append(element('dt',name),element('dd',value));$('tripData').append(d);}
  const state=normalized(h.estado),started=state==='EN CURSO',programmed=['PROGRAMADO','PROGRAMADA'].includes(state),closed=!started&&!programmed,stage=['FINALIZADO','FINALIZADA'].includes(state)?3:started?h.movimiento==='DETENIDO'?2:1:programmed?0:-1;
  $('tripProgress').replaceChildren(...['Preparación','En ruta','Parada','Finalizado'].map((label,i)=>{const li=element('li',label);li.className=i===stage?'is-current':i<stage?'is-past':'';if(i===stage)li.setAttribute('aria-current','step');return li;}));
  $('tripChecks').replaceChildren(...data.preparacion.filter(c=>programmed||c.label!=='Hoja programada').map(c=>{const item=element('li',c.label);item.className=c.ok?'is-ok':'is-pending';return item;}));
  $('workBoarded').textContent=data.operacionDisponible&&Number.isInteger(data.ocupacion.validados)?data.ocupacion.validados:'No disponible';$('workOccupied').textContent=data.ocupacion.confiable===false?'No disponible':data.ocupacion.comprometidos+' / '+data.ocupacion.capacidad;
  $('workNextStop').textContent=closed?'Recorrido cerrado':data.recorrido[h.parada+1]?.NOMBRE||'Destino alcanzado';
  $('workCurrentStop').textContent=(h.movimiento==='TRANSITO'?'Última parada: ':'Parada actual: ')+(data.recorrido[h.parada]?.NOMBRE||'No registrada')+' · Inicio real: '+date(h.inicio)+(h.fin?' · Fin: '+date(h.fin):'');
  $('workActionHint').textContent=closed?'Recorrido cerrado. Consulta el historial de tus operaciones.':programmed?'Completa la preparación para iniciar.':h.movimiento==='TRANSITO'?'Registra la llegada únicamente al detenerte en la siguiente parada.':'El vehículo está registrado en parada. Continúa o finaliza según el recorrido.';
  const canBoard=data.operacionDisponible&&!closed&&(!started||h.movimiento==='DETENIDO')&&data.recorrido[h.parada]?.COMERCIAL&&synced&&navigator.onLine&&!busy;
  $('workReport').disabled=closed;$('workNoteText').disabled=closed;$('workNoteSubmit').disabled=closed||!data.operacionDisponible||busy||!navigator.onLine;
  $('workValidateSubmit').disabled=!canBoard;$('workCamera').disabled=!canBoard||!!scanner;if(!canBoard&&scanner)stopCamera();
  $('tripStops').replaceChildren(...data.recorrido.map((p,i)=>{const item=element('li',p.NOMBRE+(p.COMERCIAL?'':' · Sin intercambio comercial'));item.className=i===h.parada?'is-current':i<h.parada?'is-past':'';return item;}));
  document.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action,last=h.parada===data.recorrido.length-1;b.hidden=role!=='R006'||(a==='INICIO'&&!programmed);b.disabled=!data.operacionDisponible||!synced||!navigator.onLine||busy||(a==='INICIO'?!programmed||data.preparacion.some(c=>!c.ok):!started||(a==='LLEGADA'?h.movimiento!=='TRANSITO':a==='CONTINUAR'?h.movimiento!=='DETENIDO'||last:h.movimiento!=='DETENIDO'||!last));});
  $('workPassengers').replaceChildren();
  const count=value=>synced&&navigator.onLine&&Number.isInteger(value)?value:'No disponible';
  $('workPassengerSummary').textContent=`Boletos previstos: ${count(data.ocupacion.previstos)} · Validados: ${count(data.ocupacion.validados)} · A bordo registrados: ${count(data.operacionDisponible?data.ocupacion.aBordo:null)} · Descensos: ${count(data.ocupacion.descensos)}`;
  for(const p of data.pasajeros){const row=element('tr'),actions=cell('Acción');row.append(cell('Boleto / titular',p.id+' · Titular: '+p.titular),cell('Asiento',p.asiento),cell('Tramo',p.origen+' → '+p.destino),cell('Estado',p.estado+' · '+p.estadoBoleto));
   for(const [label,type]of p.estado==='A bordo'?[['Registrar descenso','DESCENSO']]:p.estado==='Pendiente de abordar'?[['Validar abordaje','ABORDAJE']]:[]){const b=element('button',label);b.type='button';const from=data.recorrido.findIndex(s=>normalized(s.NOMBRE)===normalized(p.origen)),to=data.recorrido.findIndex(s=>normalized(s.NOMBRE)===normalized(p.destino));b.disabled=!canBoard||(type==='ABORDAJE'?h.parada!==from:h.parada<=from||h.parada>to);b.addEventListener('click',()=>perform(type,{codigo:p.id}));actions.append(b);}row.append(actions);$('workPassengers').append(row);}
  if(!data.pasajeros.length){const row=element('tr'),td=element('td','No hay boletos registrados para este viaje.');td.colSpan=5;row.append(td);$('workPassengers').append(row);}
  $('workCapacity').textContent=(synced&&navigator.onLine?'':'Consulta anterior, sin confirmar. ')+`Capacidad: ${data.ocupacion.capacidad} · Comprometidos: ${data.ocupacion.confiable===false?'No disponible':data.ocupacion.comprometidos} · Disponibles: ${data.ocupacion.confiable===false?'No disponible':data.ocupacion.disponibles} · A bordo registrados: ${data.operacionDisponible?data.ocupacion.aBordo:'No disponible'}`;
  $('workSeats').replaceChildren(...data.asientos.map(s=>{const el=element('div',s.ID_ASI+' · '+s.estado);el.className=s.estado==='Disponible'?'seat-free':'seat-used';return el;}));
  $('workSegments').replaceChildren(...(data.ocupacion.tramos||[]).map(t=>{const tr=element('tr');tr.append(cell('Tramo',t.origen+' → '+t.destino),cell('Capacidad',t.capacidad),cell('Comprometidos',t.comprometidos),cell('Libres en el tramo',synced&&navigator.onLine?t.disponibles:'Sin confirmar'));return tr;}));
  if(!data.ocupacion.tramos?.length){const tr=element('tr'),td=element('td','No disponible: no se pudo calcular una ocupación por tramos confiable.');td.colSpan=4;tr.append(td);$('workSegments').append(tr);}
  $('workEvents').replaceChildren(...data.eventos.filter(e=>e.propio).map(e=>{const li=element('li');li.append(element('strong',e.tipo+(e.boleto?' · '+e.boleto:'')),element('p',date(e.fecha)),element('p',data.recorrido[e.parada]?.NOMBRE||''),element('p',e.detalle||''));return li;}));
  $('workRecordedTickets').replaceChildren(...(data.boletosRegistrados||[]).map(t=>{const row=element('tr');const values=[t.id,t.fecha?String(t.fecha).slice(0,10):'No registrada',t.importe!==null&&Number.isFinite(Number(t.importe))?new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(t.importe):'No disponible',t.metodo,t.estado];values.forEach((v,i)=>row.append(cell(['Boleto','Fecha','Importe registrado','Método','Estado'][i],v)));return row;}));
  if(!data.boletosRegistrados?.length){const row=element('tr'),td=element('td','No hay boletos asociados a tu cuenta en este viaje.');td.colSpan=5;row.append(td);$('workRecordedTickets').append(row);}
  $('workOperationsEmpty').textContent=data.eventos.some(e=>e.propio)?'':'Todavía no tienes eventos confirmados en este viaje.';

  connection();
 }
 async function loadTrip() {
  const id=selected,version=++readSequence;if(detail?.viaje.id!==id)clear();if(!id)return;
  try{const data=await request('/operacion/hojas/'+encodeURIComponent(id));if(version!==readSequence||disposed)return;synced=true;render(data);$('workUpdated').textContent='Última consulta: '+new Date().toLocaleTimeString('es-EC',{timeZone:'America/Guayaquil'});status('Información consultada en el servidor.');}catch(e){if(version===readSequence){synced=false;connection();status(e.message+' Los datos visibles pueden estar desactualizados.');}}
 }
 async function refresh() {
  if(busy)return;if(!navigator.onLine){status('Sin conexión. Los datos visibles pueden estar desactualizados.');return;}try{journal=await request('/operacion/jornada');$('workDependencies').hidden=!journal.dependencias.length;$('workDependencies').textContent=journal.dependencias.join(' ');
   if(disposed)return;synced=true;connection();agenda();const all=[...journal.viajes,...journal.historial];if(!all.some(h=>h.id===selected))selected=journal.viajes[0]?.id||'';
   const placeholder=element('option',all.length?'Selecciona un viaje':'No tienes viajes asignados');placeholder.value='';$('workTrip').replaceChildren(placeholder,...all.map(h=>{const o=element('option',`${h.id} · ${h.origen} → ${h.destino} · ${h.estado}`);o.value=h.id;return o;}));$('workTrip').value=selected;$('workHistory').replaceChildren();
   for(const h of journal.historial){const tr=element('tr'),scheduled=h.salida?date(h.salida):h.fecha?String(h.fecha).slice(0,10)+' · Hora no registrada':'Fecha no registrada';[scheduled+' · '+h.origen+' → '+h.destino,h.bus,date(h.inicio),date(h.fin),h.estado].forEach((text,i)=>tr.append(cell(['Fecha / ruta','Bus','Inicio','Finalización','Estado'][i],text)));const td=cell('Detalle'),b=element('button','Consultar');b.type='button';b.addEventListener('click',()=>{selected=h.id;$('workTrip').value=selected;show('operaciones');loadTrip();});td.append(b);tr.append(td);$('workHistory').append(tr);}
   if(!journal.historial.length){const tr=element('tr'),td=element('td','No hay viajes anteriores registrados.');td.colSpan=6;tr.append(td);$('workHistory').append(tr);}await loadTrip();
  }catch(e){synced=false;connection();status(e.message+' Los datos visibles pueden estar desactualizados.');}
 }
 async function perform(type,extra={}) {
  if(busy)return;if(!selected||!detail?.operacionDisponible){status('Selecciona un viaje con operación disponible.');return;}
  if(role==='R006'){if(!window.confirm('Confirma que el vehículo está detenido y que deseas registrar esta operación.'))return;extra={...extra,vehiculoDetenido:true};}
  else if(type==='DESCENSO'&&!window.confirm('¿Confirmar el descenso sin liberar el tramo contratado?'))return;
  const key=JSON.stringify([selected,type,extra]);if(!pending.has(key))pending.set(key,crypto.randomUUID());busy=true;$('workTrip').disabled=true;status('Confirmando operación…');
  try{const result=await request('/operacion/hojas/'+encodeURIComponent(selected)+'/eventos',{tipo:type,evento:pending.get(key),...extra});pending.delete(key);if(type==='NOVEDAD')$('workNoteText').value='';await loadTrip();status(result.message);}
  catch(e){synced=false;connection();status(e.message+' Si hubo un corte de conexión, reintenta la misma acción para comprobar su resultado.');}
  finally{busy=false;$('workTrip').disabled=false;if(detail)render(detail);}
 }
 async function stopCamera(){if(!scanner)return;const current=scanner;scanner=null;try{await current.stop();await current.clear();}catch{}$('workCamera').disabled=false;$('workCameraStop').hidden=true;}
 async function camera(){if(!selected){status('Selecciona un viaje antes de escanear.');return;}
  if(!window.isSecureContext||!navigator.mediaDevices){$('workCameraStatus').textContent='La cámara requiere HTTPS o localhost y permiso del navegador. Puedes introducir el código manualmente.';return;}
  if(typeof Html5Qrcode==='undefined'){$('workCameraStatus').textContent='No se pudo cargar el escáner. Introduce el código manualmente.';return;}
  $('workCamera').disabled=true;const current=new Html5Qrcode('reader');scanner=current;try{await current.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},async text=>{if(scanner!==current)return;await stopCamera();$('workCode').value=text;await perform('ABORDAJE',{codigo:text});});if(scanner!==current){try{await current.stop();await current.clear();}catch{}return;}$('workCameraStop').hidden=false;$('workCameraStatus').textContent='Cámara activa. Enfoca el QR.';}catch{if(scanner===current){$('workCameraStatus').textContent='No se pudo activar la cámara. Revisa el permiso o introduce el código manualmente.';await stopCamera();}}
 }
 async function identity(){
  const style=document.documentElement.style;
  for(const suffix of ['primary','secondary','on-primary','on-secondary','primary-ink','secondary-ink'])style.removeProperty('--work-'+suffix);
  for(const id of ['workLogo','workCover']){$(id).hidden=true;$(id).removeAttribute('src');}
  $('workCompany').textContent=user.cooperativaNombre||'Cooperativa';
  if(!user.cooperativaId)return;
  try{
   const data=await request('/public/cooperativas/'+encodeURIComponent(user.cooperativaId)),content=data.contenido||{};
   if(data.cooperativa?.ID_COP!==user.cooperativaId)return;
   $('workCompany').textContent=data.cooperativa.NOM_COP||user.cooperativaNombre||'Cooperativa';
   for(const [id,url]of [['workLogo',data.cooperativa.LOG_URL_COP],['workCover',content.portada]])if(url){const parsed=new URL(url,api);if(['http:','https:'].includes(parsed.protocol)){$(id).src=parsed.href;$(id).hidden=false;$(id).onerror=()=>{$(id).hidden=true;};}}
   for(const [key,suffix]of [['principal','primary'],['secundario','secondary']])if(/^#[a-f0-9]{6}$/i.test(content[key]||'')){
    const color=content[key],rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),light=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,white=1.05/(light+.05)>=4.5;
    style.setProperty('--work-'+suffix,color);style.setProperty('--work-on-'+suffix,white?'#fff':'#000');style.setProperty('--work-'+suffix+'-ink',1.05/(light+.05)>=5.5?color:'#101d43');
   }
  }catch{}
 }
 async function initialize(){
  if(window.TransportSession?.ready && !await window.TransportSession.ready)return;
  const template=await fetch(new URL('../components/portal_operativo.html',source),{cache:'no-store'});
  if(!template.ok)throw new Error('No se pudo cargar portal_operativo.html. Abre el proyecto desde Express.');
  const markup=await template.text();
  if(markup.includes('Code injected by live-server'))throw new Error('Live Server modificó la plantilla del portal. Abre frontend/src/index.html para acceder mediante Express.');
  $('workRoot').innerHTML=markup;
  for(const id of ['workRole','workUser','workCompany','workGreeting','workDate','workStatus','workTrip','workHistory']){
   if(!document.getElementById(id))throw new Error(`La plantilla portal_operativo.html está incompleta: falta ${id}. Recarga desde el servidor Express.`);
  }
  user=(await request('/auth/me')).usuario;if(user.rolId!==role){location.replace(window.TransportSession.panelFor(user.rolId)||'../public/index.html?login=1');return;}
  $('workRole').textContent=role==='R006'?'Portal del Chofer':'Portal del Controlador';$('workUser').textContent=user.nombre;$('workCompany').textContent=user.cooperativaNombre||'Cooperativa';$('workGreeting').textContent='Bienvenido, '+user.nombre;
  $('workDate').textContent=new Date().toLocaleDateString('es-EC',{timeZone:'America/Guayaquil',weekday:'long',day:'numeric',month:'long'});
  document.querySelectorAll('[data-controller]').forEach(n=>{n.hidden=role!=='R004';});document.querySelectorAll('[data-driver]').forEach(n=>{n.hidden=role!=='R006';});document.querySelectorAll('[data-section]').forEach(n=>n.addEventListener('click',()=>show(n.dataset.section)));document.querySelectorAll('[data-action]').forEach(n=>n.addEventListener('click',()=>perform(n.dataset.action)));
  $('workMenu').addEventListener('click',()=>{const expanded=$('workMenu').getAttribute('aria-expanded')!=='true';$('workMenu').setAttribute('aria-expanded',String(expanded));$('workNav').classList.toggle('is-expanded',expanded);});
  $('workChecklist').addEventListener('click',()=>{$('tripPreparation').scrollIntoView({block:'center',behavior:'smooth'});$('tripPreparation').focus();});$('workReport').addEventListener('click',()=>{show('operaciones');$('workNoteText').focus();});
  $('workTrip').addEventListener('change',()=>{selected=$('workTrip').value;stopCamera();loadTrip();});$('workRefresh').addEventListener('click',refresh);$('workValidate').addEventListener('submit',e=>{e.preventDefault();perform('ABORDAJE',{codigo:$('workCode').value});});$('workNote').addEventListener('submit',e=>{e.preventDefault();perform('NOVEDAD',{detalle:$('workNoteText').value});});$('workSale').addEventListener('submit',submitSale);$('workExpense').addEventListener('submit',submitExpense);$('workCash').addEventListener('input',showChange);$('workCamera').addEventListener('click',camera);$('workCameraStop').addEventListener('click',stopCamera);loaded=true;await identity();await refresh();
 }
 window.addEventListener('offline',()=>{synced=false;if(loaded){connection();if(detail)render(detail);status('Sin conexión. Datos desactualizados: consulta únicamente. No se confirmarán ventas ni validaciones.');}stopCamera();});window.addEventListener('online',()=>{if(loaded)refresh();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(loaded)refresh();});window.addEventListener('pagehide',stopCamera);window.addEventListener('transport:logout',()=>{disposed=true;readSequence++;stopCamera();if(loaded)clear();pending.clear();});
 const timer=setInterval(()=>{if(loaded&&!document.hidden&&!busy&&navigator.onLine)refresh();},30000);
 window.addEventListener('transport:logout',()=>{clearInterval(timer);});
 initialize().catch(e=>{if($('workStatus'))status(e.message);else $('workRoot').textContent=e.message;});
})();
