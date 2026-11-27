const {test}=require('node:test'),assert=require('node:assert/strict'),plan=require('../frontend/src/js/seat_plan');
test('plantilla de dos pisos conserva coordenadas, obstáculos y disponibilidad',()=>{
 const seats=[{ID_ASI:'A19',FIL_ASI:1,COL_ASI:2,ID_TIP_PER:'TIP03',ESTADO_ASIENTO:'RESERVADO'}];
 const piso={piso:2,celdas:['BANO','ESCALERA','ASIENTO','PASILLO','BLOQUEADO'].map((tipoCelda,col)=>({tipoCelda,col,fila:1}))};
 const draw=s=>plan.button(s,'data-seat',false,false);
 const html=plan.render({pisos:[piso]},2,seats,draw);
 for(const label of ['Baño','Escalera','Accesible','RESERVADO','disabled','data-seat="A19"'])assert.ok(html.includes(label));
 assert.equal(html.match(/<button/g).length,1);
 assert.match(plan.render(null,2,seats,draw),/sin ubicación/);
});