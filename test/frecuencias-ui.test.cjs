const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('formulario de frecuencia filtra por jerarquía y guarda puntos y cupos, no texto libre', async () => {
    const html = fs.readFileSync('frontend/src/views/cooperativa/resoluciones_ant.html', 'utf8');
    const elements = new Map();
    const get = id => {
        assert.ok(html.includes(`id="${id}"`), `Falta ${id} en el HTML`);
        if (!elements.has(id)) {
            const field = {};
            elements.set(id, {
                value: '', events: {}, classList: { toggle() {} }, closest: () => field,
                addEventListener(name, fn) { this.events[name] = fn; },
                replaceChildren(...options) { this.options = options; },
                reset() {}
            });
        }
        return elements.get(id);
    };
    const points = [
        { ID_PRO:'01', NOM_PRO:'Uno', ID_CAN:'0101', NOM_CAN:'Centro', ID_PAR:'010101', NOM_PAR:'Norte', ID_PUN:1, NOM_PUN:'Parada 1' },
        { ID_PRO:'01', NOM_PRO:'Uno', ID_CAN:'0101', NOM_CAN:'Centro', ID_PAR:'010101', NOM_PAR:'Norte', ID_PUN:2, NOM_PUN:'Parada 2' },
        { ID_PRO:'02', NOM_PRO:'Dos', ID_CAN:'0201', NOM_CAN:'Oeste', ID_PAR:'020101', NOM_PAR:'Sur', ID_PUN:3, NOM_PUN:'Parada 3' }
    ];
    const calls = [];
    const notices = [];
    const usuario = { cooperativaId:'CTC01', accesoConfigurado:false };
    vm.runInNewContext(fs.readFileSync('frontend/src/js/coop_resoluciones.js', 'utf8'), {
        document: { getElementById:get, querySelectorAll:() => [] }, URL,
        window: { location:{ href:'http://localhost:3000/src/views/cooperativa/resoluciones_ant.html' }, history:{ replaceState() {} } },
        Option: function (label,value) { this.label=label; this.value=value; },
        App: {
            sesion:() => usuario, hoyISO:() => '2026-12-01', fecha:v => v, fechaInput:v => v || '',
            escapar:String, numero:String, aviso:m => notices.push(m), abrirModal() {}, cerrarModal() {},
            textoBoton() {}, restaurarBoton() {}, debounce:fn => fn,
            async api(route, options = {}) {
                if (route === '/auth/me') return { usuario };
                if (route === '/coop/resoluciones') return { controlFrecuencias:true,
                    resoluciones:[{ID_RES:'RTC01',FEC_EMI_RES:'2026-01-01',FEC_INI_VIG_RES:'2026-01-01',EST_VIGENCIA:'VIGENTE'}] };
                if (route === '/coop/catalogo-territorial') return { puntos:points };
                if (options.method === 'POST') calls.push({ route, body:options.body });
                return { controlFrecuencias:true, frecuencias:[] };
            }
        }
    });
    await new Promise(setImmediate);
    get('btnNuevaFrecuencia').events.click();
    await new Promise(setImmediate);
    const change = (id,value) => { get(id).value=value; get(id).events.change(); };
    const options = id => Array.from(get(id).options, o => o.value);
    assert.equal(get('configFrecuencia').hidden,false);
    assert.equal(get('origenFrecuencia').disabled,true);
    change('origenProvincia','01');
    assert.deepEqual(options('origenCanton'),['','0101']);
    change('origenCanton','0101');
    change('origenParroquia','010101');
    assert.deepEqual(options('origenPunto'),['','1','2']);
    change('origenPunto','1');
    change('origenProvincia','02');
    assert.equal(get('origenPunto').value,'');
    change('origenCanton','0201');
    change('origenParroquia','020101');
    change('origenPunto','3');
    change('destinoProvincia','01');
    change('destinoCanton','0101');
    change('destinoParroquia','010101');
    change('destinoPunto','2');
    assert.equal(get('catalogoFrecuenciaEstado').textContent,'Trayecto interprovincial.');
    get('resolucionFrecuencia').value='RTC01';
    const submit = () => get('formFrecuencia').events.submit({ preventDefault() {} });
    await submit();
    assert.match(notices.at(-1), /al menos un cupo/);
    assert.equal(calls.length,0);
    get('cupoUnidadesFrecuencia').value='2';
    await submit();
    assert.equal(calls[0].route,'/coop/frecuencias');
    assert.equal(calls[0].body.ID_PUN_ORI,3);
    assert.equal(calls[0].body.ID_PUN_DES,2);
    assert.equal(calls[0].body.MAX_UNIDADES,'2');
    assert.equal(calls[0].body.CIU_ORI_FRE,undefined);
});
