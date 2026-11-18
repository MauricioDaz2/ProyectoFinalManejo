const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(setImmediate);
function launcher(href,answer){
 const nodes=new Map(),calls=[],redirects=[],get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,addEventListener(name,fn){this[name]=fn;}});return nodes.get(id);};
 const context={document:{getElementById:get},location:{...Object.fromEntries(['hostname','port','origin','protocol'].map(k=>[k,new URL(href)[k]])),replace:url=>redirects.push(url)},AbortSignal,console:{warn(){}},fetch:async(url,options)=>{calls.push({url,options});if(answer instanceof Error)throw answer;return {ok:true,json:async()=>answer};}};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/project_start.js','utf8'),context);
 return {get,calls,redirects,setAnswer(value){answer=value;}};
}
const healthy={application:'ProyectoFinalManejo',frontend:'/src/views/public/index.html'};
test('la entrada desde Live Server comprueba Express sin cookies y usa su portada',async()=>{
 const ui=launcher('http://127.0.0.1:5500/frontend/src/index.html',healthy);await tick();
 assert.equal(ui.calls[0].url,'http://localhost:3000/api/health');assert.equal(ui.calls[0].options.credentials,'omit');
 assert.deepEqual(ui.redirects,['http://localhost:3000/src/views/public/index.html']);
 const official=launcher('http://localhost:3000/src/index.html',healthy);await tick();assert.deepEqual(official.redirects,ui.redirects);
});
test('Express apagado o respuesta ajena muestra instrucciones y permite reintentar sin bucle',async()=>{
 for(const answer of [new Error('ECONNREFUSED'),{application:'otro'}, {...healthy,frontend:'https://external.test'}]){
  const ui=launcher('http://127.0.0.1:5500/frontend/src/index.html',answer);await tick();
  assert.equal(ui.redirects.length,0);assert.equal(ui.get('startHelp').hidden,false);assert.match(ui.get('startStatus').textContent,/npm run dev/);assert.equal(ui.get('startRetry').disabled,false);
  ui.setAnswer(healthy);await ui.get('startRetry').click();assert.equal(ui.redirects.length,1);
 }
});
test('ninguna vista Live Server intenta autenticacion ni carga una plantilla privada',async()=>{
 for(const view of ['admin/dashboard.html','cooperativa/dashboard_coop.html','oficinista/ventanilla_boletos.html','controlador/panel.html','usuario/mis_boletos.html','chofer/bienvenida.html','public/index.html']){
  let calls=0;const redirects=[],document={documentElement:{}},window={fetch:async()=>{calls++;}};
  const href='http://127.0.0.1:5500/frontend/src/views/'+view;
  vm.runInNewContext(fs.readFileSync('frontend/src/js/transport_session.js','utf8'),{window,document,URL,location:{href,hostname:'127.0.0.1',protocol:'http:',replace:url=>redirects.push(url)}});
  let ready=false;window.TransportSession.ready.then(()=>{ready=true;});window.fetch('/api/auth/me');await tick();
  assert.equal(calls,0);assert.equal(ready,false);assert.equal(document.documentElement.hidden,true);assert.deepEqual(redirects,['http://127.0.0.1:5500/frontend/src/index.html']);
 }
});
test('npm ofrece inicio sin dependencias nuevas y el antiguo index utiliza el mismo lanzador',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));assert.equal(pkg.scripts.dev,'node --watch backend/src/server.js');assert.equal(pkg.scripts.start,'node backend/src/server.js');
 assert.match(fs.readFileSync('frontend/index.html','utf8'),/url=src\/index.html/);
 const html=fs.readFileSync('frontend/src/index.html','utf8');assert.match(html,/npm run dev/);
 for(const [,reference]of html.matchAll(/(?:src|href)="([^"]+)"/g))if(!reference.startsWith('http'))assert.ok(fs.existsSync(path.resolve('frontend/src',reference)),reference);
});
test('Express sirve entrada, seis vistas y recursos locales sin alterar datos SQL',async()=>{
 const app=require('../backend/src/server');const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));
 const base='http://localhost:'+server.address().port;
 try{
  const health=await fetch(base+'/api/health',{headers:{Origin:'http://127.0.0.1:5500'}});assert.deepEqual(await health.json(),healthy);assert.equal(health.headers.get('access-control-allow-origin'),'http://127.0.0.1:5500');assert.equal(health.headers.get('set-cookie'),null);
  const visited=new Set();
  async function check(route){
   if(visited.has(route))return;visited.add(route);const response=await fetch(base+route);assert.equal(response.status,200,route);const body=await response.text();
   if(route.endsWith('.css')){
    for(const [,ref]of body.matchAll(/url\(['"]?([^'"\s)]+)['"]?\)/g))if(!/^(data:|https?:)/.test(ref))await check(new URL(ref,base+route).pathname);
   }
   if(!route.endsWith('.html')&&route!=='/')return;
   for(const [,ref]of body.matchAll(/(?:src|href)="([^"]+)"/g)){
    if(/^(https?:|#|mailto:|tel:)/.test(ref))continue;
    const documentRoute=route.includes('/components/')?'/src/views/chofer/bienvenida.html':route;
    const url=new URL(ref,base+documentRoute);if(/\.(css|js|png|jpg|jpeg|svg|webp)$/.test(url.pathname))await check(url.pathname);
   }
  }
  for(const route of ['/','/src/index.html','/src/views/public/index.html','/src/views/public/cooperativa.html','/src/views/auth/login.html','/src/views/admin/dashboard.html','/src/views/cooperativa/dashboard_coop.html','/src/views/oficinista/ventanilla_boletos.html','/src/views/controlador/panel.html','/src/views/usuario/catalogo_viajes.html','/src/views/chofer/bienvenida.html','/src/components/portal_operativo.html','/src/components/mi_perfil.html'])await check(route);
  const template=await(await fetch(base+'/src/components/portal_operativo.html')).text();assert.doesNotMatch(template,/Code injected by live-server/);assert.match(template,/id="workGreeting"/);assert.match(template,/id="workHistory"/);
  for(const route of ['/api/auth/me','/api/operacion/jornada','/api/admin/cooperativas','/api/coop/buses'])assert.equal((await fetch(base+route)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
