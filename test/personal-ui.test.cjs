const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

async function profileModal(){
  const nodes=new Map(),events={},windowEvents={},calls=[];
  const node=()=>({value:'',textContent:'',dataset:{},hidden:false,disabled:false,children:[],events:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},prepend(item){this.children.unshift(item);},replaceChildren(...items){this.children=items;},addEventListener(name,cb){this.events[name]=cb;},focus(){},reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;},reset(){for(const el of Object.values(this.elements||{}))el.value='';},querySelector(){return get('security');},querySelectorAll(){return [];}});
  const get=(id)=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const user={id:'MAIN1',nombre:'Persona Prueba',nombres:'Persona',apellidos:'Prueba',correo:'persona@example.test',telefono:'0999999999',rolId:'R002',cooperativaId:'CP001',cooperativaNombre:'Empresa',principal:true,nivel:'Responsable principal',permisos:[],perfilDisponible:true,passwordDisponible:true,foto:null};
  const form=get('personalProfileForm');form.elements=Object.fromEntries(['nombres','apellidos','correo','telefono','passwordActual'].map(k=>[k,node()]));
  const password=get('personalPasswordForm');password.elements=Object.fromEntries(['actual','nueva','confirmacion'].map(k=>[k,node()]));
  let confirm=false;
  const window={API_BASE_URL:'http://localhost:3000/api',confirm:()=>confirm,addEventListener(n,cb){windowEvents[n]=cb;},dispatchEvent(event){windowEvents[event.type]?.(event);}};
  const document={currentScript:{src:'http://localhost:5500/frontend/src/js/mi_perfil.js'},body:node(),getElementById:get,createElement:node,querySelectorAll(selector){return selector.includes('#nombreUsuario')?[get('representative')]:[];},addEventListener(n,cb){events[n]=cb;}};
  vm.runInNewContext(fs.readFileSync('frontend/src/js/mi_perfil.js','utf8'),{window,document,URL,Image:class{},FormData,AbortSignal,CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},localStorage:{setItem(){}},fetch:async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('.html'))return {ok:true,text:async()=>'<dialog></dialog>'};
    if(options.method==='PUT'){const body=JSON.parse(options.body);Object.assign(user,{...body,nombre:`${body.nombres} ${body.apellidos}`});}
    return {ok:true,json:async()=>({success:true,usuario:{...user},message:'Guardado'})};
  }});
  await new Promise(setImmediate);
  return {get,events,windowEvents,calls,form,password,user,setConfirm(value){confirm=value;},async open(){events.click({target:{closest:()=>get('representative')}});await new Promise(setImmediate);}};
}

test('Mi perfil abre sin navegar, advierte al cerrar con Escape y guarda datos reales por API',async()=>{
  const ui=await profileModal();await ui.open();assert.equal(ui.get('personalProfileDialog').open,true);
  assert.equal(ui.form.elements.nombres.value,'Persona');
  ui.form.elements.nombres.value='Nuevo';ui.get('personalProfileDialog').events.input();
  let prevented=false;ui.get('personalProfileDialog').events.cancel({preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(ui.get('personalProfileDialog').open,true);
  await ui.form.events.submit({preventDefault(){}});
  assert.equal(ui.get('representative').textContent,'Nuevo Prueba');assert.equal(ui.get('personalProfileSave').disabled,false);
  const save=ui.calls.find(c=>c.options.method==='PUT');assert.equal(save.url,'http://localhost:3000/api/mi-perfil');assert.equal(JSON.parse(save.options.body).nombres,'Nuevo');assert.equal(JSON.parse(save.options.body).ID_COP_PER,undefined);
  ui.get('personalProfileDialog').events.cancel({preventDefault(){}});assert.equal(ui.get('personalProfileDialog').open,false);
});

test('Mi perfil exige contraseña al cambiar correo y no confunde fotografía con logotipo',async()=>{
  const ui=await profileModal();await ui.open();ui.form.elements.correo.value='nuevo@example.test';ui.form.elements.correo.events.input();assert.equal(ui.get('personalEmailPasswordRow').hidden,false);
  assert.equal(ui.user.cooperativaNombre,'Empresa');assert.equal(ui.get('personalPhotoPreview').textContent,'♙');
  ui.password.elements.nueva.value='password-nueva';ui.password.elements.confirmacion.value='otra';
  await ui.password.events.submit({preventDefault(){},currentTarget:ui.password});assert.equal(ui.calls.some(c=>c.url.endsWith('/password')),false);assert.match(ui.get('personalPasswordStatus').textContent,/no coinciden/);
});

test('formularios compartidos y enlaces existen; las cinco familias cargan el mismo componente',()=>{
  for(const [html,js] of [['frontend/src/components/mi_perfil.html','frontend/src/js/mi_perfil.js'],['frontend/src/views/cooperativa/personal.html','frontend/src/js/coop_personal.js']]){
    const content=fs.readFileSync(html,'utf8');const ids=new Set([...content.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
    for(const [,id] of fs.readFileSync(js,'utf8').matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),`${js}: ${id}`);
  }
  for(const role of ['admin','cooperativa','oficinista','controlador','usuario'])for(const file of fs.readdirSync(`frontend/src/views/${role}`).filter(f=>f.endsWith('.html'))){
    const full=`frontend/src/views/${role}/${file}`,html=fs.readFileSync(full,'utf8');assert.equal((html.match(/src="\.\.\/\.\.\/js\/mi_perfil.js"/g)||[]).length,1,full);
    for(const [,reference] of html.matchAll(/(?:src|href)="([^"]+)"/g))if(reference.includes('mi_perfil')||reference.includes('coop_personal')||reference.includes('coop_access'))assert.ok(fs.existsSync(path.resolve(path.dirname(full),reference)),full);
  }
  assert.match(fs.readFileSync('frontend/src/views/cooperativa/dashboard_coop.html','utf8'),/personal.html[^>]+data-coop-permission="trabajadores"/);
});
