const {test}=require('node:test'),assert=require('node:assert/strict'),plan=require('../frontend/src/js/seat_plan');
test('plantilla de dos pisos conserva coordenadas, obstáculos y disponibilidad',()=>{
 const seats=[{ID_ASI:'A19',FIL_ASI:1,COL_ASI:2,ID_TIP_PER:'TIP03',ESTADO_ASIENTO:'RESERVADO'}];
 const piso={piso:2,celdas:['BANO','ESCALERA','ASIENTO','PASILLO','BLOQUEADO'].map((tipoCelda,col)=>({tipoCelda,col,fila:1}))};
 const draw=s=>plan.button(s,'data-seat',false,false);
 const html=plan.render({pisos:[piso]},2,seats,draw);
 for(const label of ['Baño','Escalera','Accesible','Reservado','disabled','data-seat="A19"'])assert.ok(html.includes(label));
 assert.equal(html.match(/<button/g).length,1);
 assert.match(plan.render(null,2,seats,draw),/sin ubicación/);
});
test('distribuciones 2x2 y 2x1 mantienen el pasillo y los identificadores por piso',()=>{
 for(const tipos of [['NORMAL','NORMAL','PASILLO','VIP','VIP'],['VIP','PASILLO','NORMAL','NORMAL']]){
  const celdas=tipos.map((tipoCelda,col)=>({fila:1,col,tipoCelda}));
  const asientos=celdas.filter(c=>c.tipoCelda!=='PASILLO').map(c=>({FIL_ASI:1,COL_ASI:c.col,ID_ASI:'A'+c.col,NOM_TIP:c.tipoCelda}));
  const plantilla={pisos:[{piso:1,celdas},{piso:2,celdas:[]}]};
  const html=plan.render(plantilla,1,asientos,a=>plan.button(a,'data-seat',true,a.COL_ASI===0));
  assert.equal(html.match(/<button/g).length,asientos.length);
  assert.match(html,/<small>Pasillo<\/small>/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(plan.render(plantilla,2,[],()=>''),/sin ubicación/);
 }
});

test('carrocería compartida, selección y modo consulta', () => {
 const layout = {piso:1, filas:1, columnas:5, celdas:['NORMAL','VIP','PASILLO','DISCAPACIDAD','VACIO'].map((tipoCelda,col) => ({tipoCelda,col,fila:1}))};
 const seats = [0,1,3].map(col => ({ID_ASI:'A'+col, FIL_ASI:1, COL_ASI:col, ETIQUETA:'10'+col, ESTADO_ASIENTO:col===1?'OCUPADO':'LIBRE'}));
 const sale = plan.render({pisos:[layout]},1,seats,(s,cell) => plan.button(s,'data-asiento-venta',s.ESTADO_ASIENTO==='LIBRE',false,cell));
 for (const part of ['bus-mirror-left','bus-wheel-rr','bus-headlights','bus-windshield-curve','cockpit-driver','cockpit-door','row-number-badge','seat-backrest','bus-tail']) {
  assert.ok(sale.includes(part));
  assert.ok(plan.chassis(layout, cell => plan.seatFace('101', cell.tipoCelda, cell.ubicacion)).includes(part));
 }
 assert.match(sale,/vip occupied[^>]*data-asiento-venta="A1"[^>]*disabled/);
 assert.match(sale,/disability libre/);
 assert.doesNotMatch(sale,/data-celda-/);
 const readonly=plan.render({pisos:[layout]},1,seats);
 assert.doesNotMatch(readonly,/<button|data-asiento-venta/);
 assert.match(plan.render({pisos:[layout]},1,[{ID_ASI:'X'}]),/sin ubicación confirmada/);
});
