const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../backend/src/services/tripRules');
const base={CIU_ORI_FRE:'Ambato',CIU_DES_FRE:'Quito',EST_VIA_HOJ:'PROGRAMADO',ID_BUS:'BUS01',EST_BUS:'ACTIVO',EST_COP:'1',EST_RES:'1',BUS_COP:'CP001',RUTA_COP:'CP001',SALIDA_PLAN_UTC:'2026-12-01T12:00:00Z',LLEGADA_PLAN_UTC:'2026-12-01T14:00:00Z',CHO_ROL:'R006',CHO_EST:'1',CHO_COP:'CP001',CON_ROL:'R004',CON_EST:'1',CON_COP:'CP001'};
test('preparación requiere trabajadores, horario y capacidad; no exige vender todo',()=>{
 assert.ok(rules.preparation(base,[{ID_ASI:'A0001'}]).every(c=>c.ok));
 for(const patch of [{CON_EST:'0'},{CHO_ROL:'R004'},{CON_COP:'CP002'},{BUS_COP:'CP002'},{SALIDA_PLAN_UTC:null},{EST_BUS:'TALLER'}])assert.ok(rules.preparation({...base,...patch},[{}]).some(c=>!c.ok));
 assert.ok(rules.preparation(base,[]).some(c=>!c.ok));
 assert.ok(rules.preparation({...base,FEC_HOR_INI_FRE:'2027-01-01'},[{}]).some(c=>!c.ok));
 assert.ok(rules.preparation({...base,FEC_HOR_INI_FRE:'2026-01-01',FEC_HOR_FIN_FRE:'2026-11-30'},[{}]).some(c=>!c.ok));
});
test('viaje directo y paradas comerciales respetan transiciones y orden',()=>{
 const direct=rules.itinerary(base);assert.equal(direct.length,2);
 const stops=rules.itinerary(base,[{ORDEN:0,NOMBRE:'Ambato',COMERCIAL:true},{ORDEN:1,NOMBRE:'Latacunga',COMERCIAL:true},{ORDEN:2,NOMBRE:'Quito',COMERCIAL:true}]);
 let h={...base};const apply=action=>{const result=rules.transition(h,stops,action,rules.preparation(h,[{}]));h={...h,EST_VIA_HOJ:result.state,PARADA_ACTUAL:result.position,EST_MOV:result.movement,INICIO_UTC:h.INICIO_UTC||new Date()};};
 assert.throws(()=>apply('FIN'));apply('INICIO');assert.throws(()=>apply('INICIO'));assert.throws(()=>apply('FIN'));
 apply('LLEGADA');assert.equal(h.PARADA_ACTUAL,1);assert.throws(()=>apply('LLEGADA'));assert.throws(()=>apply('FIN'));apply('CONTINUAR');apply('LLEGADA');assert.equal(h.PARADA_ACTUAL,2);apply('FIN');assert.throws(()=>apply('CONTINUAR'));
 assert.throws(()=>rules.itinerary(base,[{ORDEN:1,NOMBRE:'Ambato'},{ORDEN:3,NOMBRE:'Quito'}]));
});
test('QR conserva formatos registrados; solo boletos confirmados abordan en su parada',()=>{
 const stops=rules.itinerary(base),token='reserva:'+Buffer.from(JSON.stringify({boleto:'B0001'})).toString('base64url');
 const ticket={ID_BOL:'B0001',COD_QR_BOL:token,EST_BOL:'PAGADO',ORI_TRA_BOL:'Ambato',DES_TRA_BOL:'Quito'};
 assert.ok(rules.qrMatches(ticket,token));assert.ok(rules.qrMatches(ticket,'B0001'));assert.equal(rules.qrMatches(ticket,token+'forjado'),false);
 assert.ok(rules.qrMatches({...ticket,COD_QR_BOL:'https://api.qrserver.com/v1/create-qr-code/?data=Boleto%3AB0001%7CHoja%3AH0001'},'Boleto:B0001|Hoja:H0001'));
 assert.ok(rules.qrMatches({...ticket,COD_QR_BOL:'QR-20261116-AABB'},'QR-20261116-AABB'));
 rules.boarding(base,stops,ticket,'ABORDAJE',[]);
 for(const state of ['RESERVADO','CANCELADO','USADO'])assert.throws(()=>rules.boarding(base,stops,{...ticket,EST_BOL:state},'ABORDAJE',[]));
 assert.throws(()=>rules.boarding(base,stops,ticket,'ABORDAJE',[{TIPO:'ABORDAJE'}]));
 assert.throws(()=>rules.boarding({...base,EST_VIA_HOJ:'EN CURSO',EST_MOV:'TRANSITO'},stops,ticket,'ABORDAJE',[]));
 rules.boarding({...base,EST_VIA_HOJ:'EN CURSO',EST_MOV:'DETENIDO',PARADA_ACTUAL:1},stops,ticket,'DESCENSO',[{TIPO:'ABORDAJE'}]);
 assert.throws(()=>rules.boarding({...base,PARADA_ACTUAL:1},stops,ticket,'DESCENSO',[]));
});
test('ocupación contractual por tramos permite límites consecutivos y detecta duplicados',()=>{
 const route=[{NOMBRE:'Ambato'},{NOMBRE:'Latacunga'},{NOMBRE:'Quito'}],seats=[{ID_ASI:'A0001'},{ID_ASI:'A0002'}];
 const a={ID_ASI_PER:'A0001',ORI_TRA_BOL:'Ambato',DES_TRA_BOL:'Latacunga',EST_BOL:'PAGADO'},b={...a,ORI_TRA_BOL:'Latacunga',DES_TRA_BOL:'Quito'};
 let data=rules.segmentAvailability(seats,[a,b],route);assert.equal(data.confiable,true);assert.deepEqual(data.tramos.map(t=>t.disponibles),[1,1]);
 data=rules.segmentAvailability(seats,[a,{...b,ORI_TRA_BOL:'Ambato'}],route);assert.equal(data.confiable,false);assert.equal(data.tramos.length,0);
 assert.equal(rules.segmentAvailability(seats,[{...a,DES_TRA_BOL:'No existe'}],route).confiable,false);
 assert.deepEqual(rules.segmentAvailability(seats,[{...a,EST_BOL:'CANCELADO'}],route).tramos.map(t=>t.disponibles),[2,2]);
});
