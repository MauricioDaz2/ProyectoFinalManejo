const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const tick=()=>new Promise(setImmediate);
function setup(role,{actualRole=role,empty=false,missing=false,cameraFailure=false,company='CP001',published,templateText,missingNode}={}) {
 const nodes=new Map(),all=[],listeners={},calls=[],template=fs.readFileSync('frontend/src/components/portal_operativo.html','utf8');
 class Node {
  constructor(){this.children=[];this.events={};this.dataset={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.attributes={};this.classes=new Set();this.classList={remove:k=>this.classes.delete(k),toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
  append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}removeAttribute(k){delete this.attributes[k];}addEventListener(k,fn){this.events[k]=fn;}focus(){this.focused=true;}scrollIntoView(){}
 }
 for(const tag of template.matchAll(/<\w+\b[^>]*>/g)){
  const n=new Node();for(const [,key,value]of tag[0].matchAll(/\b(id|data-[\w-]+)="([^"]*)"/g)){if(key==='id')nodes.set(value,n);else n.dataset[key.slice(5)]=value;}
  for(const key of ['controller','driver'])if(tag[0].includes('data-'+key))n.dataset[key]='';
  all.push(n);
 }
 nodes.set('workRoot',new Node());const get=id=>{assert.ok(nodes.has(id),'ID existe: '+id);return nodes.get(id);};
 const changes={},document={body:{dataset:{workerRole:role}},currentScript:{src:'http://localhost:3000/src/js/chofer_bienvenida.js'},hidden:false,documentElement:{style:{removeProperty:k=>{delete changes[k];},setProperty:(k,v)=>{changes[k]=v;}}},getElementById:id=>id===missingNode?null:get(id),createElement:()=>new Node(),querySelectorAll:selector=>all.filter(n=>Object.hasOwn(n.dataset,selector.slice(6,-1))),addEventListener:(key,fn)=>{listeners[key]=fn;}};
 const window={API_BASE_URL:'http://localhost:3000/api',confirm:()=>true,isSecureContext:true,TransportSession:{panelFor:r=>'panel-'+r},addEventListener:(key,fn)=>{(listeners[key]??=[]).push(fn);}};
 const navigator={onLine:true,mediaDevices:{}},location={replace:url=>{location.redirect=url;}};
 const trip={id:'H0001',estado:'PROGRAMADO',origen:'Ambato',destino:'Quito',bus:'01',placa:'ABC123',chofer:'Chofer API',controlador:'Controlador API',parada:0,movimiento:'DETENIDO',salida:'2026-12-01T12:00:00Z'};
 const detail={viaje:trip,operacionDisponible:!missing,recorrido:[{ORDEN:0,NOMBRE:'Ambato',COMERCIAL:true},{ORDEN:1,NOMBRE:'Quito',COMERCIAL:true}],preparacion:[{label:'Bus activo',ok:true}],pasajeros:role==='R004'?[{id:'B0001',titular:'Titular API',asiento:'A0001',origen:'Ambato',destino:'Quito',estado:'Pendiente de abordar',estadoBoleto:'PAGADO'}]:[],ocupacion:{capacidad:1,comprometidos:1,disponibles:0,aBordo:0},asientos:[{ID_ASI:'A0001',estado:'Comprometido'}],eventos:[],venta:{disponible:false,motivo:'Falta tarifa del recorrido.'}};
 const fetch=async(url,options={})=>{
  calls.push({url:String(url),...options});if(String(url).endsWith('portal_operativo.html'))return {ok:true,text:async()=>templateText??template};
  let data;if(url.endsWith('/auth/me'))data={usuario:{rolId:actualRole,nombre:'Nombre del usuario',cooperativaId:company}};
  else if(url.includes('/public/cooperativas/'))data=published||{cooperativa:{ID_COP:company,NOM_COP:'Empresa publicada',LOG_URL_COP:'/api/imagen/logo'},contenido:{portada:'/api/imagen/portada',principal:'#602080',secundario:'#a03070'}};
  else if(url.endsWith('/jornada'))data={viajes:empty?[]:[trip],historial:[],dependencias:missing?['010 pendiente']:[]};
  else if(url.endsWith('/eventos')){const body=JSON.parse(options.body);if(body.tipo==='INICIO'){trip.estado='EN CURSO';trip.movimiento='TRANSITO';}if(body.tipo==='LLEGADA'){trip.movimiento='DETENIDO';trip.parada++;}if(body.tipo==='FIN')trip.estado='FINALIZADO';data={message:'Operación confirmada.'};}
  else if(url.endsWith('/H0001'))data=detail;else throw Error('URL inesperada '+url);
  return {ok:true,status:200,json:async()=>({success:true,...structuredClone(data)})};
 };
 let decode,cameraStops=0;
 class Scanner {async start(a,b,callback){if(cameraFailure)throw Error('Permission denied');decode=callback;}async stop(){cameraStops++;}async clear(){}}
 vm.runInNewContext(fs.readFileSync('frontend/src/js/chofer_bienvenida.js','utf8'),{document,window,navigator,location,fetch,URL,AbortSignal,crypto,Intl,Date,Html5Qrcode:Scanner,setInterval:()=>1,clearInterval(){}});
 return {get,all,calls,changes,navigator,window,location,listeners,decode:text=>decode(text),cameraStops:()=>cameraStops};
}
test('chofer carga identidad publicada y opera su viaje sin controles de controlador',async()=>{
 const ui=setup('R006');await tick();assert.equal(ui.get('workRole').textContent,'Portal del Chofer');assert.equal(ui.get('workCompany').textContent,'Empresa publicada');assert.equal(ui.get('workUser').textContent,'Nombre del usuario');assert.equal(ui.changes['--work-primary'],'#602080');assert.match(ui.get('workLogo').src,/\/api\/imagen\/logo$/);
 assert.ok(ui.all.filter(n=>Object.hasOwn(n.dataset,'controller')).every(n=>n.hidden));
 const start=ui.all.find(n=>n.dataset.action==='INICIO');assert.equal(start.disabled,false);await start.events.click();await tick();const sent=ui.calls.find(c=>c.method==='POST');assert.equal(JSON.parse(sent.body).tipo,'INICIO');assert.match(JSON.parse(sent.body).evento,/^[0-9a-f-]{36}$/);assert.equal(start.disabled,true);
 ui.navigator.onLine=false;ui.listeners.offline[0]();await ui.get('workRefresh').events.click();assert.match(ui.get('workStatus').textContent,/Sin conexión/);assert.equal(ui.get('workTripDetails').hidden,false);
});
test('controlador valida por cámara y por código manual usando el mismo endpoint',async()=>{
 const ui=setup('R004');await tick();assert.equal(ui.get('workPassengers').children.length,1);assert.ok(ui.all.filter(n=>Object.hasOwn(n.dataset,'driver')).every(n=>n.hidden));
 await ui.get('workCamera').events.click();await ui.decode('QR-REGISTRADO');await tick();assert.equal(ui.cameraStops(),1);assert.equal(JSON.parse(ui.calls.find(c=>c.method==='POST').body).codigo,'QR-REGISTRADO');
 ui.get('workCode').value='B0001';ui.get('workValidate').events.submit({preventDefault(){}});await tick();assert.equal(JSON.parse(ui.calls.filter(c=>c.method==='POST').at(-1).body).codigo,'B0001');
});
test('cámara denegada muestra alternativa manual y ausencia de migración deshabilita inicio',async()=>{
 const ui=setup('R004',{cameraFailure:true});await tick();await ui.get('workCamera').events.click();assert.match(ui.get('workCameraStatus').textContent,/permiso|manualmente/);assert.equal(ui.get('workCamera').disabled,false);
 const blocked=setup('R006',{missing:true});await tick();assert.equal(blocked.get('workDependencies').hidden,false);assert.equal(blocked.all.find(n=>n.dataset.action==='INICIO').disabled,true);
 const empty=setup('R006',{empty:true});await tick();assert.equal(empty.get('workEmpty').hidden,false);assert.equal(empty.get('workTripDetails').hidden,true);
});
test('una cuenta de otro rol se redirige sin consultar viajes privados',async()=>{
 const ui=setup('R006',{actualRole:'R005'});await tick();assert.equal(ui.location.redirect,'panel-R005');assert.ok(!ui.calls.some(c=>c.url.includes('/operacion/')));
});
test('agenda, menú Más y acciones contextuales siguen el estado del viaje',async()=>{
 const ui=setup('R006');await tick();
 ui.get('workMenu').events.click();assert.equal(ui.get('workMenu').getAttribute('aria-expanded'),'true');assert.ok(ui.get('workNav').classes.has('is-expanded'));
 assert.match(ui.get('workAgenda').children[1].children[0].textContent,/Ambato/);
 const action=name=>ui.all.find(n=>n.dataset.action===name);assert.equal(action('LLEGADA').disabled,true);assert.equal(action('FIN').disabled,true);
 await action('INICIO').events.click();await tick();assert.equal(action('INICIO').hidden,true);assert.equal(action('LLEGADA').disabled,false);assert.equal(action('CONTINUAR').disabled,true);
 assert.equal(JSON.parse(ui.calls.find(c=>c.method==='POST').body).vehiculoDetenido,true);
 await action('LLEGADA').events.click();await tick();assert.equal(action('FIN').disabled,false);assert.equal(action('CONTINUAR').disabled,true);
 await action('FIN').events.click();await tick();assert.equal(action('FIN').disabled,true);assert.equal(ui.get('workNextStop').textContent,'Recorrido cerrado');
 ui.get('workReport').events.click();assert.equal(ui.get('workTitle').textContent,'Mis operaciones');assert.equal(ui.get('workNoteText').focused,true);
});

test('cada identidad publicada mantiene contraste y no acepta datos de otra cooperativa',async()=>{
 for(const [company,principal,secundario,on]of [['CP001','#602080','#ffffff','#fff'],['CP002','#f5f5f5','#14804a','#000']]){
  const ui=setup('R006',{company,published:{cooperativa:{ID_COP:company,NOM_COP:'Empresa '+company,LOG_URL_COP:'/api/'+company+'/logo'},contenido:{principal,secundario,portada:'/api/'+company+'/cover'}}});await tick();
  assert.equal(ui.changes['--work-primary'],principal);assert.equal(ui.changes['--work-on-primary'],on);assert.match(ui.get('workLogo').src,new RegExp(company));assert.match(ui.get('workCover').src,new RegExp(company));
  for(const tab of ui.all.filter(n=>n.dataset.section)){
   tab.events.click();assert.equal(tab.getAttribute('aria-current'),'page');assert.equal(ui.all.filter(n=>n.getAttribute('aria-current')==='page').length,1);assert.equal(ui.changes['--work-primary'],principal);
  }
 }
 for(const published of [{cooperativa:{ID_COP:'CP999',NOM_COP:'No corresponde'},contenido:{principal:'#ffffff'}},{cooperativa:{ID_COP:'CP001'},contenido:{}}]){
  const ui=setup('R004',{published});await tick();assert.equal(Object.keys(ui.changes).length,0);assert.equal(ui.get('workLogo').hidden,true);assert.equal(ui.get('workCover').hidden,true);assert.notEqual(ui.get('workCompany').textContent,'No corresponde');
 }
});
test('estados de navegacion y recursos mantienen contraste, foco y ajuste responsive',()=>{
 const css=fs.readFileSync('frontend/src/assets/chofer_bienvenida.css','utf8');
 assert.match(css,/\.work-nav button\[aria-current="page"\]\{background:var\(--work-primary\);color:var\(--work-on-primary\)/);
 assert.doesNotMatch(css,/#ecad16/);assert.match(css,/\.work-nav button:focus-visible/);assert.match(css,/\.work-nav button:disabled/);assert.match(css,/object-fit:contain/);assert.match(css,/object-fit:cover/);
 for(const width of [600,1024,1400])assert.ok(css.includes('min-width:'+width+'px'));
});

test('plantilla alterada por Live Server o incompleta informa su causa antes de usar textContent',async()=>{
 const injected=setup('R006',{templateText:'<header><!-- Code injected by live-server --></header>'});await tick();assert.match(injected.get('workStatus').textContent,/Live Server modific/);assert.ok(!injected.calls.some(c=>c.url.endsWith('/auth/me')));
 const incomplete=setup('R006',{missingNode:'workGreeting'});await tick();assert.match(incomplete.get('workStatus').textContent,/incompleta: falta workGreeting/);assert.doesNotMatch(incomplete.get('workStatus').textContent,/Cannot set/);
});
