const test = require('node:test');
const assert = require('node:assert/strict');
const {passengers, receiptType} = require('../backend/src/services/webCheckout');
const adult = {asiento:'A001', nombre:'Persona de prueba', documento:'extranjero', cedula:'guest01', tipo:'ADULTO'};

test('los viajeros tienen asiento, documento válido, nombre y categoría independientes', () => {
    assert.equal(passengers([adult])[0].cedula, 'GUEST01');
    for (const changes of [{nombre:' '}, {cedula:'x'}, {documento:'cedula',cedula:'0000000000'}, {tipo:'OTRA'}, {asiento:''}]) {
        assert.throws(() => passengers([{...adult, ...changes}]), {status:400});
    }
    assert.throws(() => passengers([adult, {...adult,asiento:'A002'}]), {status:400});
    assert.throws(() => passengers([adult, {...adult,cedula:'GUEST02'}]), {status:400});
    assert.equal(passengers([adult, {...adult, asiento:'A002', cedula:'GUEST02', tipo:'NINO'}]).length, 2);
});

test('el comprobante requiere una firma admitida', () => {
    assert.equal(receiptType(Buffer.from('%PDF-1.4')), 'pdf');
    assert.equal(receiptType(Buffer.from('89504e470d0a1a0a','hex')), 'png');
    assert.throws(() => receiptType(Buffer.from('incorrecto')), {status:400});
});
