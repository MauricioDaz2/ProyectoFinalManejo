const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../frontend/src/js/ecuador_validation');
const R=require('../backend/src/services/companyRegistration');
const company=()=>({NOM_COP:'Empresa',NOM_COM_COP:'Comercial',RUC_COP:'0198765432001',DIR_COP:'Dirección extensa de pruebas sin datos reales',TEL_COP:'0999999999',EST_COP:'1',PROVINCIA_COP:'Azuay',CIUDAD_COP:'Cuenca',COR_INS_COP:'empresa@example.test'});
test('RUC de sociedad: formato de 13 dígitos, ceros iniciales, sin módulo 11 indebido',()=>{
  for(const ruc of ['0198765432001','1765432190001','0199999999001'])assert.equal(V.validate({...company(),RUC_COP:ruc}).RUC_COP,undefined);
  for(const ruc of ['123',' 019876543200X',198765432001])assert.ok(V.validate({...company(),RUC_COP:ruc}).RUC_COP);
  assert.equal(R.validate(company(),true).RUC_COP,'0198765432001');
});
test('cédula ecuatoriana: módulo 10, provincia y distinción de documento extranjero',()=>{
  assert.equal(V.cedula('1710034065'),true);
  for(const value of ['1710034064','9910034065','0000000000','171003406','ABCDEF1234'])assert.equal(V.cedula(value),false);
  const user={modo:'nuevo',tipoDocumento:'extranjero',ID_USU:'PAS12345',NOM_USU:'Prueba',APE_USU:'Local',COR_USU:'cuenta@example.test',TEL_USU:'022345678',password:'Clave-unica-de-prueba'};
  assert.deepEqual(V.validate({...company(),responsable:user}),{});
  assert.ok(V.validate({...company(),responsable:{...user,tipoDocumento:'cedula'}}).ID_USU);
  assert.ok(V.validate({...company(),responsable:{...user,tipoDocumento:'desconocido'}}).ID_USU);
});
test('teléfonos ecuatorianos, correo y límites compatibles con SQL',()=>{
  for(const phone of ['022345678','0998765432','+593 99 876 5432'])assert.equal(V.validate({...company(),TEL_COP:phone}).TEL_COP,undefined);
  for(const phone of ['1234567','0812345678','+1 555 555 5555'])assert.ok(V.validate({...company(),TEL_COP:phone}).TEL_COP);
  assert.equal(V.phone('+593 99 876 5432'),'0998765432');
  assert.ok(V.validate({...company(),NOM_COP:'a'.repeat(121),DIR_COP:'b'.repeat(241)}).DIR_COP);
  assert.ok(V.validate({...company(),COR_INS_COP:'inválido'}).COR_INS_COP);
  assert.ok(V.validate({...company(),SIT_WEB_COP:'javascript:alert(1)'}).SIT_WEB_COP);
});
test('códigos automáticos respetan cinco caracteres y los registros existentes',()=>{
  assert.equal(R.nextCode([{ID_COP:'CP001'},{ID_COP:'CP003'},{ID_COP:'LOJA'}]),'CP002');
  assert.equal(R.nextCode([{ID_COP:'cp001'}]),'CP002');
  assert.throws(()=>R.nextCode(Array.from({length:999},(_,i)=>({ID_COP:`CP${String(i+1).padStart(3,'0')}`}))),e=>e.status===409);
  assert.throws(()=>R.validate({...company(),ID_COP:'CP001'}),e=>e.status===400);
  assert.throws(()=>R.validate({...company(),responsable:{modo:'existente',ID_USU:'FREE1'}},true),e=>e.status===400);
});
