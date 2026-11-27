const test = require('node:test');
const assert = require('node:assert/strict');
const { calendar, plan } = require('../backend/src/services/routeGroups');

test('rotates buses across a week and keeps Ecuador departure times', () => {
    const range = calendar({ desde:'2026-12-01', hasta:'2026-12-07', duracion:90 });
    const buses = [{ID_BUS:'BUS01'}, {ID_BUS:'BUS02'}];
    const frequencies = [{ID_FRE:'FRE01',HORA_SAL_FRE:'22:45'}];
    const crew = { BUS01:{chofer:'CHO01',controlador:'CON01'}, BUS02:{chofer:'CHO02',controlador:'CON02'} };
    const result = plan(range,buses,frequencies,crew);
    assert.equal(result.length,7);
    assert.equal(result[0].salida,'2026-12-02T03:45:00.000Z');
    assert.equal(result[0].llegada,'2026-12-02T05:15:00.000Z');
    assert.notEqual(result[0].idBus,result[1].idBus);
    assert.equal(result[0].idBus,result[2].idBus);
    assert.equal(result[0].idUsuCho,crew[result[0].idBus].chofer);
    const middle = plan(calendar({desde:'2026-12-03',hasta:'2026-12-03',duracion:90}),buses,frequencies,crew);
    assert.deepEqual(middle[0],result[2]);
});

test('rejects invalid range or frequencies without a departure hour', () => {
    assert.throws(() => calendar({desde:'2026-12-01',hasta:'2027-01-01',duracion:90}), {status:422});
    assert.throws(() => plan(calendar({desde:'2026-12-01',hasta:'2026-12-01',duracion:90}),
        [{ID_BUS:'BUS01'}],[{ID_FRE:'FRE01'}],{}), {status:422});
});
