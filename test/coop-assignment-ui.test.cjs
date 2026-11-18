const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(setImmediate);
function setup(role='R002') {
 const nodes=new Map(),calls=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',events:{},children:[],hidden:true,open:false,append(n){this.children.push(n);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.events[k]=fn;},reset(){this.resetCalled=true;}});return nodes.get(id);};
 const fetch=async(url,options={})=>{calls.push({url,options});let data;
  if(url.endsWith('/auth/me'))data={usuario:{rolId:role,permisos:['rutas']}};
  else if(url.endsWith('/opciones'))data={buses:[{ID_BUS:'BUS01',NUM_BUS:'07',PLA_BUS:'ABC123'}],frecuencias:[{ID_FRE:'F0001',CIU_ORI_FRE:'Ambato',CIU_DES_FRE:'Quito'}],personal:[{ID_USU:'DRV01',ID_ROL_PER:'R006',NOM_USU:'Chofer',APE_USU:'Prueba'},{ID_USU:'CON01',ID_ROL_PER:'R004',NOM_USU:'Controlador',APE_USU:'Prueba'}]};
  else data={message:'Viaje programado.',idHoja:'H0001'};
  return {ok:true,json:async()=>({success:true,...data})};
 };
 vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_asignacion.js','utf8'),{document:{getElementById:get,createElement:()=>({})},window:{API_BASE_URL:'http://localhost:3000/api'},fetch,Date});
 return {get,calls};
}
test('R002 programa desde frecuencias con ambos trabajadores y horas convertidas de Ecuador a UTC',async()=>{
 const ui=setup();await tick();assert.equal(ui.get('coopAssignment').hidden,false);ui.get('coopAssignment').open=true;await ui.get('coopAssignment').events.toggle();
 assert.equal(ui.get('assignmentDriver').children[1].value,'DRV01');assert.equal(ui.get('assignmentController').children[1].value,'CON01');
 for(const [id,value]of Object.entries({assignmentBus:'BUS01',assignmentRoute:'F0001',assignmentDriver:'DRV01',assignmentController:'CON01',assignmentStart:'2026-12-01T08:00',assignmentEnd:'2026-12-01T11:00'}))ui.get(id).value=value;
 await ui.get('assignmentForm').events.submit({preventDefault(){}});const call=ui.calls.find(c=>c.options.method==='POST'),body=JSON.parse(call.options.body);
 assert.ok(call.url.endsWith('/coop/hojas-ruta'));assert.equal(body.salida,'2026-12-01T13:00:00.000Z');assert.equal(body.llegada,'2026-12-01T16:00:00.000Z');assert.equal(body.idUsuCho,'DRV01');assert.equal(body.idUsuCon,'CON01');assert.equal(body.ID_COP_PER,undefined);assert.equal(ui.get('assignmentForm').resetCalled,true);
});
test('la programación adicional no se muestra para un trabajador',async()=>{
 const ui=setup('R006');await tick();assert.equal(ui.get('coopAssignment').hidden,true);assert.equal(ui.calls.length,1);
});
