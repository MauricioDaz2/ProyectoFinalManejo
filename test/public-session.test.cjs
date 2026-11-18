const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function home(role,{failure=false,expired=false}={}) {
  const nodes=new Map(),events={},calls=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',href:''});return nodes.get(id);};
  const panels={R001:'../admin/dashboard.html',R002:'../cooperativa/dashboard_coop.html',R003:'../oficinista/ventanilla_boletos.html',R004:'../controlador/panel.html',R005:'../public/index.html',R006:'../chofer/bienvenida.html'};
  const window={API_BASE_URL:'http://localhost:3000/api',TransportSession:{panelFor:r=>panels[r]},addEventListener:(n,f)=>{events[n]=f;}};
  const context={window,document:{getElementById:get,querySelector:get,querySelectorAll:()=>[get('login1'),get('login2')],addEventListener(){}},AbortSignal,fetch:async url=>{calls.push(url);if(failure)throw Error();return {ok:!expired&&!!role,status:expired||!role?401:200,json:async()=>({success:true,usuario:{id:'TEST1',rolId:role,nombre:'Prueba local'}})};},localStorage:{getItem(){throw Error('No confiar en localStorage');}}};
  vm.runInNewContext(fs.readFileSync('frontend/src/js/public_session.js','utf8'),context);await new Promise(setImmediate);
  return {get,events,calls,panels};
}
test('portada comprueba el servidor y dirige cada rol a su navegación',async()=>{
  for(const role of ['R001','R002','R003','R004','R005','R006']) {
    const ui=await home(role);assert.deepEqual(ui.calls,['http://localhost:3000/api/auth/me']);assert.equal(ui.get('publicAccount').hidden,false);assert.equal(ui.get('login1').hidden,true);assert.equal(ui.get('login2').hidden,true);
    assert.equal(ui.get('publicPanelLink').href,role==='R005'?'../usuario/mis_boletos.html':ui.panels[role]);assert.equal(ui.get('.header-buy').hidden,!['R005','R004','R006'].includes(role));
    assert.equal(ui.get('publicPanelLink').textContent,role==='R005'?'Mis boletos':['R004','R006'].includes(role)?'Volver a mi trabajo':'Ir a mi panel');
  }
});
test('visitante, sesión vencida y cierre de sesión restauran las acciones públicas',async()=>{
  for(const ui of [await home(null),await home('R002',{expired:true})]){assert.equal(ui.get('publicAccount').hidden,true);assert.equal(ui.get('login1').hidden,false);assert.equal(ui.get('.header-buy').hidden,false);}
  const ui=await home('R002');ui.events['transport:logout']();assert.equal(ui.get('publicAccount').hidden,true);assert.equal(ui.get('login1').hidden,false);
});
test('fallo de consulta se informa sin atribuir una sesión a datos locales',async()=>{
  const ui=await home('R002',{failure:true});assert.match(ui.get('publicSessionStatus').textContent,/No se pudo comprobar/);assert.equal(ui.get('publicPanelLink').href,'');
});
test('las cinco pantallas R002 cargan exactamente el mismo menú y mantienen sus módulos',()=>{
  for(const file of ['dashboard_coop.html','personalizar.html','personal.html','gestion_buses.html','resoluciones_ant.html']) {
    const html=fs.readFileSync(`frontend/src/views/cooperativa/${file}`,'utf8');
    assert.equal((html.match(/src="..\/..\/js\/coop_navigation.js"/g)||[]).length,1,file);
    assert.equal((html.match(/src="..\/..\/js\/coop_access.js"/g)||[]).length,1,file);
    assert.match(html,/<body class="coop-dashboard/);
    assert.match(html,/<aside[^>]*><\/aside>/);
  }
  const script=fs.readFileSync('frontend/src/js/coop_navigation.js','utf8');
  for(const href of ['dashboard_coop.html','dashboard_coop.html#mi-cooperativa','gestion_buses.html','resoluciones_ant.html#frecuencias','resoluciones_ant.html','dashboard_coop.html#salidas','personal.html','personalizar.html','../public/index.html'])assert.ok(script.includes(href));
  assert.match(script,/data-coop-permission/);assert.match(script,/Transporte<br>Cooperativas/);
});
