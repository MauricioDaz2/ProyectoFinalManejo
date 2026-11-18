const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('Mi perfil solo advierte por cambios actuales en un diálogo abierto',async()=>{
 const nodes=new Map(),events={},documentEvents={};let prompts=0,fail=false;
 const user={id:'ADMIN',rolId:'R001',nombre:'Administrador',nombres:'Nombre',apellidos:'Apellido',correo:'admin@example.test',telefono:'0999999999',perfilDisponible:true,passwordDisponible:true};
 const element=()=>({value:'',events:{},children:[],open:false,addEventListener(k,fn){this.events[k]=fn;},querySelector(){return element();},querySelectorAll(){return [];},replaceChildren(){},append(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},focus(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 for(const [id,keys]of [['personalProfileForm',['nombres','apellidos','correo','telefono','passwordActual']],['personalPasswordForm',['actual','nueva','confirmacion']]]) {
  const form=get(id);form.elements=Object.fromEntries(keys.map(k=>[k,element()]));form.reset=()=>keys.forEach(k=>{form.elements[k].value='';});form.reportValidity=()=>true;
 }
 const document={currentScript:{src:'http://localhost/js/mi_perfil.js'},getElementById:get,querySelectorAll:()=>[],addEventListener:(k,fn)=>{documentEvents[k]=fn;},createElement:()=>({content:{}}),body:{append(){}}};
 const window={confirm:()=>{prompts++;return true;},addEventListener:(k,fn)=>{events[k]=fn;},dispatchEvent:e=>events[e.type]?.(e)};
 const fetch=async(url,options={})=>{
  if(String(url).endsWith('mi_perfil.html'))return {ok:true,text:async()=>''};
  if(fail&&options.method==='PUT')return {ok:false,status:500,json:async()=>({message:'Fallo de guardado'})};
  if(options.method==='PUT')Object.assign(user,JSON.parse(options.body));
  return {ok:true,json:async()=>({success:true,usuario:{...user},message:'Guardado'})};
 };
 vm.runInNewContext(fs.readFileSync('frontend/src/js/mi_perfil.js','utf8'),{window,document,fetch,FormData,AbortSignal,URL,Image:class{},localStorage:{setItem(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 await new Promise(setImmediate);
 const dialog=get('personalProfileDialog'),form=get('personalProfileForm');
 const warning=()=>{let blocked=false;events.beforeunload({preventDefault(){blocked=true;}});return blocked;};
 assert.equal(warning(),false);
 const open=async()=>{documentEvents.click({target:{closest:()=>({focus(){}})}});await new Promise(setImmediate);};
 await open();assert.equal(dialog.open,true);assert.equal(warning(),false);
 form.elements.nombres.value='Modificado';assert.equal(warning(),true);
 form.elements.nombres.value=user.nombres;assert.equal(warning(),false);
 dialog.events.cancel({preventDefault(){}});assert.equal(prompts,0);assert.equal(warning(),false);
 await open();form.elements.nombres.value='Sin guardar';fail=true;await form.events.submit({preventDefault(){}});assert.equal(warning(),true);
 fail=false;await form.events.submit({preventDefault(){}});assert.equal(warning(),false);
 get('personalPasswordForm').elements.nueva.value='Pendiente';assert.equal(warning(),true);
 dialog.events.cancel({preventDefault(){}});assert.equal(prompts,1);assert.equal(warning(),false);
 await open();assert.equal(warning(),false);
});
