const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function dom() {
 const nodes=new Map(),events={};
 class Node {
  constructor(){this.children=[];this.events={};this.dataset={};this.value='';this.textContent='';this.hidden=false;this.attributes={};this.classList={toggle(){},add(){},remove(){}};}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
  addEventListener(k,fn){this.events[k]=fn;}querySelector(){return new Node();}querySelectorAll(){return [];}focus(){this.focused=true;}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const tabs=['Empresa','Responsables','Personal'].map(name=>{const n=new Node();n.dataset.companyTab=name;return n;});
 const document={getElementById:get,querySelector:get,querySelectorAll:s=>s==='[data-company-tab]'?tabs:[],createElement:()=>new Node(),createTextNode:text=>({textContent:text})};
 const window={addEventListener:(key,fn)=>{events[key]=fn;},API_BASE_URL:'http://localhost:3000/api'};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/admin_company_accounts.js','utf8'),{window,document});
 return {Node,get,document,window,tabs,events};
}
const user=(id,role)=>({ID_USU:id,ID_COP_PER:'CP003',NOM_USU:id,APE_USU:'Prueba',COR_USU:id+'@example.test',TEL_USU:'0999999999',EST_USU:'1',ID_ROL_PER:role,PRINCIPAL:0,permisos:[],version:'account-version'});
test('ficha presenta datos reales, tres pestañas, acceso inicial y enlace público propio',async()=>{
 const ui=dom(),calls=[];
 const data={cooperativa:{ID_COP:'CP003',NOM_COP:'Nombre recibido de API',CIUDAD_COP:'Ambato',EST_COP:'1',version:'company-version'},usuarios:[user('GEST1','R002'),user('OFI01','R003'),{...user('CON01','R004'),EST_USU:'0'},user('FINAL','R005')],permisos:{dashboard:'Dashboard'},estadosDisponibles:false,registroDisponible:true};
 let edited;
 ui.window.CompanyModule={request:async path=>{calls.push(path);return structuredClone(data);},edit:row=>{edited=row;}};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/admin_company_detail.js','utf8'),{...ui,document:ui.document,window:ui.window,location:{hash:'#cooperativa=CP003'},URLSearchParams,URL,Date,encodeURIComponent});await new Promise(setImmediate);
 assert.deepEqual(calls,['/CP003']);assert.equal(ui.get('detailName').textContent,'Nombre recibido de API');assert.equal(ui.get('detailPublic').href,'../public/cooperativa.html?id=CP003');assert.equal(ui.get('companyCreateAccount').textContent,'Crear acceso principal');assert.equal(ui.get('managerRows').children.length,1);assert.equal(ui.get('workerRows').children.length,2);
 assert.equal(ui.get('companyMigration').hidden,false);assert.equal(ui.get('companyEmpresa').hidden,false);assert.equal(ui.get('companyPersonal').hidden,true);
 ui.get('.company-tabs').events.keydown({key:'End',preventDefault(){}});assert.equal(ui.get('companyPersonal').hidden,false);assert.equal(ui.tabs[2].attributes['aria-selected'],'true');
 ui.get('workerSearch').value='ofi01@example';ui.get('workerSearch').events.input();assert.equal(ui.get('workerRows').children.length,1);assert.match(ui.get('workerRows').children[0].children[0].textContent,/OFI01/);
 ui.get('workerSearch').value='';ui.get('workerRole').value='R004';ui.get('workerRole').events.input();assert.match(ui.get('workerRows').children[0].children[0].textContent,/CON01/);
 ui.get('workerState').value='1';ui.get('workerState').events.input();assert.match(ui.get('workerRows').children[0].children[0].textContent,/No hay cuentas/);
 ui.get('companyEdit').events.click();assert.equal(edited.ID_COP,'CP003');
 assert.deepEqual(ui.get('managerRows').children[0].children.at(-1).children.map(n=>n.textContent),['Editar','Desactivar','Designar principal']);
 ui.get('workerState').value='';ui.get('workerRole').events.input();assert.deepEqual(ui.get('workerRows').children[0].children.at(-1).children.map(n=>n.textContent),['Editar','Reactivar']);
});

test('cambios pendientes: consulta, reversión, descarte, guardado y fallo',()=>{
 const ui=dom(),dialog=ui.get('dialog');let value={name:'Original',permisos:['buses']},busy=false,prompts=0,accept=false;
 ui.window.confirm=()=>{prompts++;return accept;};dialog.close=()=>{dialog.open=false;dialog.events.close();};
 const guard=ui.window.CompanyAccounts.track(dialog,()=>value,()=>busy);
 const warned=()=>{let prevented=false;ui.events.beforeunload({preventDefault(){prevented=true;}});return prevented;};
 assert.equal(warned(),false);guard.start();dialog.open=true;assert.equal(warned(),false);guard.close();assert.equal(prompts,0);
 guard.start();dialog.open=true;value.name='Cambio';assert.equal(warned(),true);value.name='Original';assert.equal(warned(),false);
 value.permisos=[];assert.equal(warned(),true);guard.close();assert.equal(dialog.open,true);assert.equal(prompts,1);
 accept=true;guard.close();assert.equal(dialog.open,false);assert.equal(warned(),false);
 guard.start();dialog.open=true;value.name='Guardado';assert.equal(warned(),true);busy=true;guard.close();assert.equal(dialog.open,true);busy=false;
 assert.equal(warned(),true);guard.clear();guard.close();assert.equal(warned(),false);
});

test('historial legible, ordenado y con identificadores solo como alternativa',async()=>{
 const ui=dom();const principal={...user('MAIN','R002'),PRINCIPAL:1};
 const data={cooperativa:{ID_COP:'CP003',NOM_COP:'Empresa',EST_COP:'1'},usuarios:[principal],permisos:{},estadosDisponibles:true,historialResponsables:[
  {NUEVO:'OLD',ANTERIOR:null,ID_ACTOR:'ADM',FECHA_UTC:'2026-11-15T13:00:00Z'},
  {NUEVO:'MAIN',NOMBRE_NUEVO:'Nombre Completo',ANTERIOR:'OLD',NOMBRE_ANTERIOR:'Persona Anterior',ID_ACTOR:'ADM',NOMBRE_ACTOR:'Administrador General',FECHA_UTC:'2026-11-16T06:11:00Z'}]};
 ui.window.CompanyModule={request:async()=>data};
 vm.runInNewContext(fs.readFileSync('frontend/src/js/admin_company_detail.js','utf8'),{...ui,location:{hash:'#cooperativa=CP003'},URLSearchParams,URL,Date,encodeURIComponent});await new Promise(setImmediate);
 const items=ui.get('companyPrincipalHistory').children[0].children;
 assert.equal(items.length,2);assert.equal(items[0].children[0].textContent,'Nombre Completo fue designado responsable principal');assert.match(items[0].children[1].textContent,/16 de noviembre de 2026/);assert.match(items[0].children[1].textContent,/1:11/);
 assert.equal(items[0].children[2].textContent,'Realizado por: Administrador General');assert.equal(items[0].children[3].textContent,'Responsable anterior: Persona Anterior');assert.equal(items[1].children[3].textContent,'Responsable anterior: ninguno');assert.match(items[1].children[0].textContent,/OLD/);
 assert.deepEqual(ui.get('managerRows').children[0].children.at(-1).children.map(n=>n.textContent),['Editar']);
});
test('tabla abre la ficha por fila y teclado sin botones repetidos',async()=>{
 const ui=dom(),location={hash:''};ui.get('filtrarEstado').value='todos';
 const rows=[{ID_COP:'CP003',NOM_COP:'Empresa local',RUC_COP:'0198765432001',CIUDAD_COP:'Ambato',EST_COP:'1'},{ID_COP:'CP004',NOM_COP:'Otra empresa',RUC_COP:'0298765432001',CIUDAD_COP:'Cuenca',EST_COP:'S'}];
 const html=fs.readFileSync('frontend/src/views/admin/cooperativas.html','utf8');
 vm.runInNewContext(fs.readFileSync('frontend/src/js/admin_cooperativas.js','utf8'),{window:ui.window,document:ui.document,location,fetch:async()=>({ok:true,json:async()=>({success:true,cooperativas:rows,registroDisponible:true,estadosDisponibles:true,permisos:{}})}),setTimeout:()=>0,clearTimeout(){},encodeURIComponent});await new Promise(setImmediate);
 const table=ui.get('tablaCooperativas');assert.equal(table.children.length,2);assert.equal(table.children[0].children.length,6);assert.equal(table.children[0].children[1].children[0].children[1].href,'#cooperativa=CP003');
 table.events.keydown({key:'Enter',preventDefault(){},target:{matches:()=>true,dataset:{company:'CP003'}}});assert.equal(location.hash,'cooperativa=CP003');
 ui.get('buscarCooperativa').events.input({target:{value:'Cuenca'}});assert.equal(table.children.length,1);assert.equal(table.children[0].dataset.company,'CP004');
 assert.equal(ui.get('cooperativasSuspendidas').textContent,1);assert.equal(ui.get('suspendedMetric').hidden,false);
 assert.doesNotMatch(html,/responsableModo|Vincular cuenta existente|Asignar después|Ver detalles/);
 for(const script of ['admin_cooperativas.js','admin_company_detail.js']) {
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const [,id]of fs.readFileSync('frontend/src/js/'+script,'utf8').matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),id);
 }
});
