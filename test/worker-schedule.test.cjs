const test=require('node:test'),assert=require('node:assert/strict');
const dbPath=require.resolve('../backend/src/config/db');
let installed=true,work=[],personal=[],held=new Map(),lockOrder=[];
class Request {
 constructor(db){this.db=db;this.p={};}input(k,type,v){this.p[k]=v;return this;}
 async query(q){const p=this.p,result=recordset=>({recordset});
  if(q.includes('AS AGENDA_INSTALADA'))return result([{AGENDA_INSTALADA:installed?1:0}]);
  if(q.includes('AS AGENDA_LOCK')){const before=held.get(p.resource)||Promise.resolve();let release;const after=new Promise(r=>{release=r;});held.set(p.resource,after);await before;this.db.releases.push(release);lockOrder.push(p.resource);return result([{AGENDA_LOCK:0}]);}
  if(q.startsWith('SELECT SALIDA_PLAN_UTC'))return result([{SALIDA_PLAN_UTC:'2026-12-03T12:00:00Z',LLEGADA_PLAN_UTC:'2026-12-03T14:00:00Z'}]);
  if(q.startsWith('SELECT DISTINCT H.ID_HOJ'))return result(q.includes('JOIN dbo.BOLETOS')?personal:work);
  throw Error('Unexpected SQL');
 }
}
require.cache[dbPath]={exports:{sql:{...require('mssql'),Request}}};
const schedule=require('../backend/src/services/workerSchedule');
const assignment={ID_USU_CHO:'DRV01',ID_USU_CON:'CON01',ID_BUS:'BUS01',SALIDA_PLAN_UTC:'2026-12-03T12:00:00Z',LLEGADA_PLAN_UTC:'2026-12-03T14:00:00Z'};
const tx=()=>({releases:[],close(){for(const release of this.releases)release();}});
test('intervalos completos, medianoche y extremos consecutivos',()=>{
 const a=schedule.interval('2026-12-03T23:00:00Z','2026-12-04T02:00:00Z');
 assert.equal(schedule.overlaps(a,schedule.interval('2026-12-04T01:59:00Z','2026-12-04T04:00:00Z')),true);
 assert.equal(schedule.overlaps(a,schedule.interval('2026-12-04T02:00:00Z','2026-12-04T04:00:00Z')),false);
 for(const values of [[null,null],['invalid','2026-01-01'],['2026-01-02','2026-01-01']])assert.throws(()=>schedule.interval(...values),{status:409});
});
test('agenda serializa reserva personal y asignación laboral concurrentes',async()=>{
 for(const first of ['personal','work']){
  work=[];personal=[];held=new Map();const a=tx(),b=tx();
  async function reserve(t){try{await schedule.reserve(t,'DRV01','PERS1','R006');personal.push({...assignment,ID_HOJ:'PERS1'});}finally{t.close();}}
  async function assign(t){try{await schedule.lock(t,['DRV01','CON01']);await schedule.work(t,assignment);work.push({...assignment,ID_HOJ:'WORK1'});}finally{t.close();}}
  const results=await Promise.allSettled(first==='personal'?[reserve(a),assign(b)]:[assign(a),reserve(b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(work.length+personal.length,1);
 }
});
test('bloqueos ordenados, esquema pendiente y viaje en curso vencido',async()=>{
 work=[];personal=[];held=new Map();lockOrder=[];const t=tx();
 await schedule.lock(t,['DRV01','CON01','DRV01']);t.close();assert.deepEqual(lockOrder,['transporte:agenda:CON01','transporte:agenda:DRV01']);
 installed=false;await assert.rejects(schedule.reserve(tx(),'DRV01','PERS1','R006'),{status:503});await schedule.reserve(tx(),'PAS01','PERS1','R005');installed=true;
 work=[{SALIDA_PLAN_UTC:'2020-01-01T12:00:00Z',LLEGADA_PLAN_UTC:'2020-01-01T14:00:00Z',EST_VIA_HOJ:'EN CURSO'}];
 await assert.rejects(schedule.conflicts(tx(),['DRV01'],schedule.interval(new Date(Date.now()+60000),new Date(Date.now()+120000))),{status:409});
});
