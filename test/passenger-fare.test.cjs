const {test}=require('node:test'),assert=require('node:assert/strict'),{quote,confirmQuote}=require('../backend/src/services/passengerFare');
test('tarifa por frecuencia, asiento y categoría',()=>{
 for(const [seat,cat,total] of [['TIP01','ADULTO',10],['TIP02','NORMAL',12.5],['TIP03','ADULTO',10],['TIP01','NINO',5],['TIP02','ADULTO_MAYOR',6.25],['TIP03','DISCAPACIDAD',5]])assert.equal(quote(10,seat,cat,25).total,total);
 assert.equal(quote(10.01,'TIP01','NINO').total,5.01);
 for(const args of [[null,'TIP01'],[0,'TIP01'],[10,'TIP99'],[10,'TIP01','inventada'],[10,'TIP02','ADULTO',-1]])assert.throws(()=>quote(...args));
 assert.throws(()=>confirmQuote(1,10));assert.doesNotThrow(()=>confirmQuote(10,10));
});