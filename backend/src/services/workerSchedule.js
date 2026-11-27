const {sql}=require('../config/db');
const {fail,norm}=require('./tripRules');
const request=db=>new sql.Request(db);
const workers=role=>['R004','R006'].includes(role);
function interval(start,end) {
 const a=start&&new Date(start),b=end&&new Date(end);
 if(!a||!b||!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a)throw fail(409,'No se pueden comprobar los horarios: falta una salida o llegada prevista válida.');
 return {start:a,end:b};
}
function overlaps(a,b) {return a.start<b.end&&b.start<a.end;}
async function ready(db) {
 const r=await request(db).query("SELECT CASE WHEN COL_LENGTH('dbo.HOJAS_RUTAS','ID_USU_CHO') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','SALIDA_PLAN_UTC') IS NOT NULL AND COL_LENGTH('dbo.HOJAS_RUTAS','LLEGADA_PLAN_UTC') IS NOT NULL THEN 1 ELSE 0 END AS AGENDA_INSTALADA, COL_LENGTH('dbo.BOLETOS','NOM_PAS_BOL') AS VIAJEROS, COL_LENGTH('dbo.USUARIOS','CED_USU') AS DOCUMENTOS");
 if(r.recordset[0]?.AGENDA_INSTALADA!==1)throw fail(503,'La validación de horarios requiere las columnas de 010_operacion_viajes.sql.');
 return r.recordset[0];
}
async function lock(db,ids) {
 for(const id of [...new Set(ids.filter(Boolean))].sort()) {
  const r=await request(db).input('resource',sql.NVarChar(255),'transporte:agenda:'+id).query("DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; SELECT @result AS AGENDA_LOCK;");
  if(r.recordset[0]?.AGENDA_LOCK<0||r.recordset[0]?.AGENDA_LOCK===undefined)throw fail(409,'La agenda está siendo actualizada. Inténtalo nuevamente.');
 }
}
function params(db,ids) {
 const r=request(db);const names=[...new Set(ids.filter(Boolean))].map((id,i)=>{r.input('worker'+i,sql.VarChar(10),id);return '@worker'+i;});
 if(!names.length)throw fail(409,'Falta personal para comprobar la agenda.');
 return {r,names:names.join(',')};
}
async function conflicts(db,ids,range,{personal=false,exclude=null,bus=null,schema={}}={}) {
 const {r,names}=params(db,ids);
 let traveler = `B.ID_USU_FIN IN (${names})`;
 if (personal && schema.VIAJEROS) {
  const document = schema.DOCUMENTOS ? `OR B.CED_PAS_BOL IN (SELECT CED_USU FROM USUARIOS WHERE ID_USU IN (${names}))` : '';
  traveler = `(B.CED_PAS_BOL IN (${names}) ${document} OR (B.NOM_PAS_BOL IS NULL AND B.FEC_EXP_RES_UTC IS NULL AND B.ID_USU_FIN IN (${names})))`;
 }
 const result=await r.input('exclude',sql.VarChar(5),exclude).input('busAgenda',sql.VarChar(5),bus).query(`SELECT DISTINCT H.ID_HOJ,H.SALIDA_PLAN_UTC,H.LLEGADA_PLAN_UTC,H.EST_VIA_HOJ
 FROM dbo.HOJAS_RUTAS H ${personal?'JOIN dbo.BOLETOS B ON B.ID_HOJ_PER=H.ID_HOJ':''}
 WHERE UPPER(LTRIM(RTRIM(ISNULL(H.EST_VIA_HOJ,'')))) NOT IN ('FINALIZADO','FINALIZADA','CANCELADO','CANCELADA')
 AND (@exclude IS NULL OR H.ID_HOJ<>@exclude)
 AND ${personal?`${traveler} AND UPPER(LTRIM(RTRIM(ISNULL(B.EST_BOL,'')))) NOT IN ('CANCELADO','ANULADO','INVALIDO','VENCIDO')`:`(H.ID_USU_CHO IN (${names}) OR H.ID_USU_CON IN (${names}) OR COALESCE(H.ID_BUS_REE,H.ID_BUS_PER)=@busAgenda)`}`);
 for(const h of result.recordset) {
  const other=interval(h.SALIDA_PLAN_UTC,h.LLEGADA_PLAN_UTC);
  if(norm(h.EST_VIA_HOJ)==='EN CURSO'&&other.end<=new Date()&&range.end>new Date())throw fail(409,'Un viaje en curso superó su llegada prevista. Revisa su finalización antes de confirmar otro horario.');
  if(overlaps(range,other))throw fail(409,personal?'El trabajador tiene una reserva personal incompatible con este horario.':'El horario coincide con una asignación laboral del trabajador o del bus.');
 }
}
async function reserve(db,id,sheet,role) {
 if(!id)return;
 if(!role)role=(await request(db).input('passenger',sql.VarChar(10),id).query('SELECT ID_ROL_PER FROM dbo.USUARIOS WHERE ID_USU=@passenger')).recordset[0]?.ID_ROL_PER;
 if(!workers(role))return;
 await ready(db);await lock(db,[id]);
 const h=(await request(db).input('personalSheet',sql.VarChar(5),sheet).query('SELECT SALIDA_PLAN_UTC,LLEGADA_PLAN_UTC FROM dbo.HOJAS_RUTAS WHERE ID_HOJ=@personalSheet')).recordset[0];
 if(!h)throw fail(404,'El viaje personal no está disponible.');
 await conflicts(db,[id],interval(h.SALIDA_PLAN_UTC,h.LLEGADA_PLAN_UTC));
}
async function work(db,h,{exclude=null}={}) {
 const schema=await ready(db);const range=interval(h.SALIDA_PLAN_UTC,h.LLEGADA_PLAN_UTC),ids=[h.ID_USU_CHO,h.ID_USU_CON];
 await conflicts(db,ids,range,{exclude,bus:h.ID_BUS});
 await conflicts(db,ids,range,{personal:true,schema});
 return {label:'Sin conflictos laborales ni reservas personales',ok:true};
}
module.exports={interval,overlaps,ready,lock,conflicts,reserve,work,workers};
