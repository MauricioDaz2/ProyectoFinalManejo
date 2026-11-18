const fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync('frontend/src/js/transport_session.js','utf8');
const tick=()=>new Promise(setImmediate);
function browser(role,view='chofer/bienvenida.html'){
 const events={},docEvents={},calls=[],redirects=[],cache=new Map([['usuario','{"rolId":"R001"}']]);
 let user=role?{id:'worker',rolId:role}:null, fail=false;
 const document={documentElement:{hidden:false},hidden:false,addEventListener:(name,fn)=>{docEvents[name]=fn;}};
 const location={href:'http://localhost:3000/src/views/'+view,hostname:'localhost',replace:url=>redirects.push(url),reload:()=>redirects.push('reload')};
 const window={addEventListener:(name,fn)=>{events[name]=fn;},dispatchEvent(){},fetch:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/logout')){if(!fail)user=null;return {ok:!fail,status:fail?503:200};}
  if(fail)throw Error('offline');
  return {ok:!!user,status:user?200:401,json:async()=>({success:!!user,usuario:user})};
 }};
 vm.runInNewContext(source,{window,document,location,URL,Request,Headers,AbortSignal,Event,localStorage:{setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},sessionStorage:{removeItem(){}}});
 return {window,document,events,docEvents,calls,redirects,cache,setUser:value=>{user=value;},fail:()=>{fail=true;}};
}
test('la cookie verificada abre solo el portal del rol; el cache no autoriza',async()=>{
 for(const [role,path]of Object.entries({R001:'admin/dashboard.html',R002:'cooperativa/dashboard_coop.html',R003:'oficinista/ventanilla_boletos.html',R004:'controlador/panel.html',R005:'usuario/mis_boletos.html',R006:'chofer/bienvenida.html'})){
  const ui=browser(role,path);assert.equal(ui.document.documentElement.hidden,true);await ui.window.TransportSession.ready;
  assert.equal(ui.document.documentElement.hidden,false);assert.equal(ui.redirects.length,0);assert.equal(JSON.parse(ui.cache.get('usuario')).rolId,role);
 }
 const denied=browser('R006','admin/dashboard.html');await denied.window.TransportSession.ready;
 assert.deepEqual(denied.redirects,['../chofer/bienvenida.html']);assert.equal(denied.document.documentElement.hidden,true);
});
test('sin sesion, fallo de red y Atrás tras revocacion no exponen la vista privada',async()=>{
 const guest=browser(null);await guest.window.TransportSession.ready;assert.ok(guest.redirects.includes('../public/index.html?login=1'));assert.equal(guest.cache.has('usuario'),false);
 const ui=browser('R004','controlador/panel.html');await ui.window.TransportSession.ready;ui.events.pagehide();assert.equal(ui.document.documentElement.hidden,true);
 ui.setUser(null);ui.events.pageshow({persisted:true});await tick();assert.equal(ui.document.documentElement.hidden,true);assert.ok(ui.redirects.includes('../public/index.html?login=1'));
 const offline=browser('R006');await offline.window.TransportSession.ready;offline.fail();offline.events.pageshow({persisted:true});await tick();assert.equal(offline.document.documentElement.hidden,true);
});
test('volver desde cache con sesion valida recarga identidad y con otra cuenta no reutiliza datos',async()=>{
 const ui=browser('R006');await ui.window.TransportSession.ready;ui.events.pageshow({persisted:true});await tick();assert.ok(ui.redirects.includes('reload'));
 const other=browser('R006');await other.window.TransportSession.ready;other.setUser({id:'another',rolId:'R006'});other.docEvents.visibilitychange();await tick();assert.equal(other.document.documentElement.hidden,true);assert.deepEqual(other.redirects,['reload']);
});
test('login antiguo descarta retornos externos y conserva el mismo origen',()=>{
 for(const origin of ['http://localhost:3000/src/views','http://127.0.0.1:5500/frontend/src/views']){
  let target;vm.runInNewContext(fs.readFileSync('frontend/src/js/login_redirect.js','utf8'),{URL,location:{href:origin+'/auth/login.html?next=https://evil.test',replace:url=>{target=url;}}});
  assert.equal(target,origin+'/public/index.html?login=1');
 }
 const html=fs.readFileSync('frontend/src/views/auth/login.html','utf8');assert.doesNotMatch(html,/<form/);assert.match(html,/login_redirect.js/);
});
async function modal(role){
 const events={},nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener:(name,fn)=>{events[id+':'+name]=fn;},showModal(){this.open=true;},focus(){},dispatchEvent(){}});return nodes.get(id);};
 const redirects=[],historyCalls=[],location={href:'http://localhost:5500/frontend/src/views/public/index.html?login=1&next=https://evil.test',replace:url=>redirects.push(url)};
 const window={TransportSession:{current:async()=>role?{rolId:role}:null,panelFor:r=>r==='R006'?'../chofer/bienvenida.html':'../public/index.html'}};
 const document={getElementById:get,querySelectorAll:()=>[],body:{classList:{add(){},remove(){}}}};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/login_modal.js','utf8'),{window,document,location,URL,Event,history:{replaceState:(a,b,url)=>historyCalls.push(url)}});await tick();
 return {get,redirects,historyCalls};
}
test('login oficial abre el modal al visitante y no crea bucles ni pierde una sesion valida',async()=>{
 const guest=await modal(null);assert.equal(guest.get('loginDialog').open,true);assert.ok(!new URL(guest.historyCalls[0]).searchParams.has('login'));assert.equal(guest.redirects.length,0);
 const worker=await modal('R006');assert.match(worker.redirects[0],/\/chofer\/bienvenida.html$/);assert.equal(worker.get('loginDialog').open,undefined);
 const passenger=await modal('R005');assert.equal(passenger.redirects.length,0);assert.equal(passenger.get('loginDialog').open,undefined);
});
test('ambos portales viajan a portada y comparten cabecera de pasajero sin otra cuenta',()=>{
 assert.match(fs.readFileSync('frontend/src/components/portal_operativo.html','utf8'),/class="work-passenger" href="..\/public\/index.html"/);
 for(const name of ['catalogo_viajes','seleccion_asientos','mis_boletos']){const html=fs.readFileSync('frontend/src/views/usuario/'+name+'.html','utf8');assert.equal((html.match(/id="workerReturnLink"/g)||[]).length,1);assert.match(html,/class="usuario-brand" href="..\/public\/index.html"/);}
 for(const name of ['worker_passenger','user_viajes','usuario_asientos','user_boletos'])assert.doesNotMatch(fs.readFileSync('frontend/src/js/'+name+'.js','utf8'),/localStorage/);
});
async function passengerHeader(role){
 const nodes=new Map(),events={},get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,dataset:{},textContent:'',href:''});return nodes.get(id);};
 const paths={R004:'../controlador/panel.html',R006:'../chofer/bienvenida.html'};
 const window={TransportSession:{current:async()=>role?{rolId:role,nombre:'Persona autenticada'}:null,panelFor:r=>paths[r]},addEventListener:(k,f)=>{events[k]=f;}};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/worker_passenger.js','utf8'),{window,document:{getElementById:get,querySelectorAll:()=>[get('tickets')],addEventListener(){}},localStorage:{getItem(){throw Error('Cache no autorizado');}}});await tick();return {get,events,paths};
}
test('catalogo y boletos mantienen la misma cuenta y un unico retorno al trabajo',async()=>{
 for(const role of ['R004','R006']){const ui=await passengerHeader(role);assert.equal(ui.get('workerReturnLink').hidden,false);assert.equal(ui.get('workerReturnLink').href,ui.paths[role]);assert.equal(ui.get('logoutButton').dataset.session,'authenticated');assert.equal(ui.get('tickets').hidden,false);ui.events['transport:logout']();assert.equal(ui.get('workerReturnLink').hidden,true);assert.equal(ui.get('logoutButton').dataset.session,'guest');}
 const guest=await passengerHeader(null);assert.equal(guest.get('workerReturnLink').hidden,true);assert.equal(guest.get('tickets').hidden,true);
});
test('el adaptador legado usa la sesion comprobada, incluso sin almacenamiento local',()=>{
 const user={id:'server-user',rolId:'R003'};
 const window={TransportSession:{user},location:{replace(){throw Error('Redireccion inesperada');}}};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/api.js','utf8'),{window,localStorage:{getItem(){throw Error('No autorizado');}}});
 assert.equal(window.App.sesion(),user);assert.equal(window.App.requiereSesion(['R003']),user);
});
