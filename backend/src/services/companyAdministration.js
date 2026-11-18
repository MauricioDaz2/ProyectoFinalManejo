const {sql,conectarBD}=require('../config/db');
const accounts=require('./accounts');
const registration=require('./companyRegistration');
const access=require('../security/permissions');
const records=require('./recordVersion');
const profiles=require('../repositories/cooperativaProfileRepository');
const {store}=require('../security/sessionStore');
const request=db=>db.request?db.request():new sql.Request(db);
const fail=access.failure;
function code(id) {if(!/^[A-Z0-9_-]{1,5}$/.test(id||''))throw fail(400,'Código de cooperativa inválido.');return id;}
async function capabilities(db) {
 const r=await request(db).query("SELECT CASE WHEN COL_LENGTH('dbo.COOPERATIVAS','MOT_SUS_COP') IS NOT NULL AND COL_LENGTH('dbo.COOPERATIVAS','EST_CAMBIO_UTC') IS NOT NULL AND OBJECT_ID('dbo.COOPERATIVA_ESTADO_HISTORIAL','U') IS NOT NULL AND OBJECT_ID('dbo.TR_RESPONSABLE_HISTORIAL','TR') IS NOT NULL AND OBJECT_ID('dbo.COOPERATIVA_RESPONSABLE_HISTORIAL','U') IS NOT NULL THEN 1 ELSE 0 END AS ESTADOS_INSTALADOS");
 return r.recordset[0]?.ESTADOS_INSTALADOS===1;
}
async function company(db,id,lock=false) {
 const row=(await request(db).input('id',sql.VarChar(5),code(id)).query(`SELECT C.* FROM dbo.COOPERATIVAS C ${lock?'WITH (UPDLOCK,HOLDLOCK)':''} WHERE C.ID_COP=@id`)).recordset[0];
 if(!row)throw fail(404,'Cooperativa no encontrada.');return row;
}
function admin(user) {if(user?.rolId!=='R001')throw fail(403,'Esta operación corresponde al administrador general.');}
async function detail(user,id) {
 admin(user);const db=await conectarBD(),row=await company(db,id);
 const people=(await accounts.list(user,db,id)).map(u=>({...u,version:records.version(u)}));
 const states=await capabilities(db);
 let logo=row.LOG_URL_COP;
 const published=await profiles.published(db,id,true);
 if(published?.logo)logo=`/api/admin/cooperativas/${encodeURIComponent(id)}/imagenes/${published.logo}`;
 const history=states?(await request(db).input('company',sql.VarChar(5),id).query(`SELECT ANTERIOR,NUEVO,ID_ACTOR,FECHA_UTC,MOTIVO FROM dbo.COOPERATIVA_ESTADO_HISTORIAL WHERE ID_COP=@company ORDER BY FECHA_UTC DESC,ID DESC;
  SELECT H.ANTERIOR,H.NUEVO,H.ID_ACTOR,H.FECHA_UTC,
   NULLIF(LTRIM(RTRIM(CONCAT(N.NOM_USU,' ',N.APE_USU))),'') AS NOMBRE_NUEVO,
   NULLIF(LTRIM(RTRIM(CONCAT(A.NOM_USU,' ',A.APE_USU))),'') AS NOMBRE_ANTERIOR,
   NULLIF(LTRIM(RTRIM(CONCAT(U.NOM_USU,' ',U.APE_USU))),'') AS NOMBRE_ACTOR
  FROM dbo.COOPERATIVA_RESPONSABLE_HISTORIAL H
  LEFT JOIN dbo.USUARIOS N ON N.ID_USU=H.NUEVO
  LEFT JOIN dbo.USUARIOS A ON A.ID_USU=H.ANTERIOR
  LEFT JOIN dbo.USUARIOS U ON U.ID_USU=H.ID_ACTOR
  WHERE H.ID_COP=@company ORDER BY H.FECHA_UTC DESC,H.ID DESC`)).recordsets:[[],[]];
 return {cooperativa:{...row,version:records.version(row)},logo,usuarios:people,permisos:access.catalog,estadosDisponibles:states,registroDisponible:await registration.installed(db),historialEstados:history[0],historialResponsables:history[1]};
}
async function scoped(user,id,work) {
 admin(user);return accounts.transaction(async db=>{await accounts.actor(db,user);const row=await company(db,id,true);return work(db,row);});
}
async function changeState(user,id,body) {
 if(!body||Object.keys(body).some(k=>!['estado','motivo','version','confirmacion'].includes(k))||!['0','1','S'].includes(body.estado)||body.confirmacion!==id)throw fail(400,'Confirma el código de la cooperativa y selecciona un estado válido.');
 const reason=typeof body.motivo==='string'?body.motivo.trim():'';
 if(reason.length>500||(body.estado==='S'&&!reason))throw fail(400,'La suspensión necesita un motivo de hasta 500 caracteres.');
 const result=await scoped(user,id,async(db,row)=>{
  records.check(row,body.version);const extended=await capabilities(db);
  if(body.estado==='S'&&!extended)throw fail(503,'La suspensión requiere aprobar y aplicar 008_estados_historial_cooperativas.sql.');
  if(row.EST_COP===body.estado)throw fail(409,'La cooperativa ya tiene ese estado.');
  const r=request(db).input('id',sql.VarChar(5),id).input('state',sql.Char(1),body.estado);
  if(extended)r.input('reason',sql.NVarChar(500),body.estado==='S'?reason:null);
  await r.query(`UPDATE dbo.COOPERATIVAS SET EST_COP=@state${extended?',MOT_SUS_COP=@reason,EST_CAMBIO_UTC=SYSUTCDATETIME()':''} WHERE ID_COP=@id`);
  if(extended)await request(db).input('company',sql.VarChar(5),id).input('before',sql.Char(1),row.EST_COP).input('after',sql.Char(1),body.estado).input('reason',sql.NVarChar(500),reason||null).input('actor',sql.VarChar(10),user.id).query('INSERT INTO dbo.COOPERATIVA_ESTADO_HISTORIAL(ID_COP,ANTERIOR,NUEVO,MOTIVO,ID_ACTOR) VALUES(@company,@before,@after,@reason,@actor)');
  const members=body.estado!=='1'?(await request(db).input('company',sql.VarChar(5),id).query("SELECT ID_USU FROM dbo.USUARIOS WHERE ID_COP_PER=@company AND ID_ROL_PER IN ('R002','R003','R004','R006')")).recordset:[];
  return {estado:body.estado,members};
 });
 for(const member of result.members)store.revokeUser(member.ID_USU);
 return {estado:result.estado};
}
const quoted=name=>'['+name.replace(/]/g,']]')+']';
async function dependencies(db,id) {
 const cols=(await request(db).query("SELECT DISTINCT SCHEMA_NAME(T.schema_id) AS ESQUEMA,T.name AS TABLA,C.name AS COLUMNA FROM sys.tables T JOIN sys.columns C ON C.object_id=T.object_id WHERE T.object_id<>OBJECT_ID('dbo.COOPERATIVAS') AND (C.name IN ('ID_COP','ID_COP_PER') OR EXISTS(SELECT 1 FROM sys.foreign_key_columns F WHERE F.parent_object_id=C.object_id AND F.parent_column_id=C.column_id AND F.referenced_object_id=OBJECT_ID('dbo.COOPERATIVAS'))) ORDER BY ESQUEMA,TABLA,COLUMNA")).recordset;
 const found=[];
 for(const col of cols) {
  const r=await request(db).input('company',sql.VarChar(5),id).query(`SELECT COUNT_BIG(*) AS TOTAL FROM ${quoted(col.ESQUEMA)}.${quoted(col.TABLA)} WITH (HOLDLOCK) WHERE ${quoted(col.COLUMNA)}=@company`);
  if(Number(r.recordset[0].TOTAL)>0)found.push({tabla:col.TABLA,total:Number(r.recordset[0].TOTAL)});
 }
 return found;
}
async function remove(user,id,body) {
 if(!body||Object.keys(body).some(k=>!['confirmacion','version'].includes(k))||body.confirmacion!==`ELIMINAR ${id}`)throw fail(400,`Escribe ELIMINAR ${id} para confirmar la eliminación física.`);
 return scoped(user,id,async(db,row)=>{
  records.check(row,body.version);
  const related=await dependencies(db,id);
  if(related.length)throw Object.assign(fail(409,'La cooperativa tiene registros asociados. Desactívala para conservar su información e historial.'),{dependencias:related});
  await request(db).input('id',sql.VarChar(5),id).query('DELETE FROM dbo.COOPERATIVAS WHERE ID_COP=@id');
  return {eliminada:true};
 });
}
async function peopleChange(user,id,action,target,body) {
 const result=await scoped(user,id,async(db,row)=>{
  const people=await accounts.list(user,db,id),principal=people.find(u=>u.PRINCIPAL);
  if(action==='create') {
   if(!body||Object.keys(body).some(k=>!['cuenta','principal','principalActual'].includes(k))||typeof body.principal!=='boolean')throw fail(400,'Datos de cuenta inválidos.');
   if((principal?.ID_USU||null)!==body.principalActual)throw fail(409,'La designación cambió. Actualiza la ficha.');
   if(body.principal?!!principal:!principal)throw fail(409,principal?'Ya existe un principal; utiliza Sustituir principal.':'Crea primero el acceso principal.');
   const errors=registration.person(body.cuenta);
   if(Object.keys(errors).length)throw Object.assign(fail(400,'Revisa los datos personales.'),{fields:errors});
   return accounts.save(user,registration.accountBody(body.cuenta,id),null,db,{autoPrincipal:body.principal});
  }
  const current=people.find(u=>u.ID_USU===target);
  if(!current)throw fail(404,'Cuenta no disponible en esta cooperativa.');
  records.check(current,body?.version);
  if(action==='principal') {
   if(body.confirmacion!==target||body.principalActual!==(principal?.ID_USU||null))throw fail(409,'Confirma al nuevo principal y actualiza la designación actual.');
   if(row.EST_COP!=='1')throw fail(409,'Reactiva la cooperativa antes de sustituir al responsable.');
   return accounts.designate(user,target,db);
  }
  if(action==='state') {
   if(body.confirmacion!==target)throw fail(400,'Confirma la cuenta que cambiará de estado.');
   if(body.estado==='1'&&row.EST_COP!=='1')throw fail(409,'Reactiva la cooperativa antes de reactivar sus cuentas.');
   return accounts.state(user,target,body.estado,db);
  }
  if(action!=='edit'||!body.cuenta)throw fail(400,'Operación no válida.');
  const errors=registration.person(body.cuenta,false);
  if(Object.keys(errors).length)throw Object.assign(fail(400,'Revisa los datos personales.'),{fields:errors});
  if(body.cuenta.ID_USU!==target)throw fail(400,'No se puede modificar la identificación.');
  const data={...registration.accountBody(body.cuenta,id),ID_ROL_PER:current.ID_ROL_PER,EST_USU:current.EST_USU};
  delete data.password;if(current.ID_ROL_PER!=='R002'||current.PRINCIPAL)delete data.permisos;
  return accounts.save(user,data,target,db,{autoPrincipal:false});
 });
 if(action==='state'&&body.estado==='0')store.revokeUser(target);
 return result;
}
module.exports={capabilities,company,detail,changeState,remove,peopleChange,dependencies};
