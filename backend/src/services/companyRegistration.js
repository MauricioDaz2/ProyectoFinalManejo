const { sql, conectarBD } = require('../config/db');
const accounts = require('./accounts');
const access = require('../security/permissions');
const validation = require('../../../frontend/src/js/ecuador_validation');
const records=require('./recordVersion');
const columns={NOM_COP:120,RUC_COP:13,DIR_COP:240,TEL_COP:20,NOM_COM_COP:120,TIP_ORG_COP:50,PROVINCIA_COP:60,CIUDAD_COP:80,COR_INS_COP:120,SIT_WEB_COP:500};
const request=db=>typeof db.request==='function'?db.request():new sql.Request(db);
async function installed(db) {
  const result=await request(db).query("SELECT CASE WHEN COL_LENGTH('dbo.COOPERATIVAS','NOM_COP')>=120 AND COL_LENGTH('dbo.COOPERATIVAS','DIR_COP')>=240 AND COL_LENGTH('dbo.COOPERATIVAS','TEL_COP')>=20 AND COL_LENGTH('dbo.COOPERATIVAS','NOM_COM_COP')>=120 AND COL_LENGTH('dbo.COOPERATIVAS','TIP_ORG_COP')>=50 AND COL_LENGTH('dbo.COOPERATIVAS','PROVINCIA_COP')>=60 AND COL_LENGTH('dbo.COOPERATIVAS','CIUDAD_COP')>=80 AND COL_LENGTH('dbo.COOPERATIVAS','COR_INS_COP')>=120 AND COL_LENGTH('dbo.COOPERATIVAS','SIT_WEB_COP')>=500 AND COLUMNPROPERTY(OBJECT_ID('dbo.COOPERATIVAS'),'LOG_URL_COP','AllowsNull')=1 AND EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.COOPERATIVAS') AND name='UX_COOPERATIVAS_RUC' AND is_unique=1) THEN 1 ELSE 0 END AS REGISTRO_INSTALADO");
  return result.recordset[0]?.REGISTRO_INSTALADO===1;
}
function nextCode(rows) {
  const used=new Set(rows.map(r=>r.ID_COP.trim().toUpperCase()));
  for(let i=1;i<=999;i++){const id=`CP${String(i).padStart(3,'0')}`;if(!used.has(id))return id;}
  throw access.failure(409,'Se agotaron los códigos CP001–CP999. Se requiere revisar el formato de códigos.');
}
function validate(body, editing=false) {
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>![...Object.keys(columns),'EST_COP','responsable','gestores','version'].includes(k)))throw access.failure(400,'La solicitud contiene campos no permitidos.');
  if(editing && (body.responsable || body.gestores))throw access.failure(400,'Administra el responsable desde la acción correspondiente de la tabla.');
  const errors=validation.validate({...body,EST_COP:editing?'1':body.EST_COP,responsable:undefined});
  if(!editing) {
    if(body.EST_COP!=='1')errors.EST_COP='Una empresa nueva comienza activa con un principal activo.';
    if(!body.responsable || (body.responsable.modo && body.responsable.modo!=='nuevo'))errors.responsable='Registra exactamente un responsable principal.';
    if(body.responsable)Object.assign(errors,Object.fromEntries(Object.entries(person(body.responsable)).map(([k,v])=>['responsable.'+k,v])));
    if(body.gestores!==undefined && (!Array.isArray(body.gestores)||body.gestores.length>10))errors.gestores='Puedes registrar hasta diez gestores adicionales por operación.';
    const ids=new Set(),emails=new Set();
    for(const [i,p]of [body.responsable,...(Array.isArray(body.gestores)?body.gestores:[])].entries()) {
      const prefix=i?'gestores.'+(i-1):'responsable';
      if(!p){errors[prefix+'.ID_USU']='Completa los datos de la cuenta.';continue;}
      Object.assign(errors,Object.fromEntries(Object.entries(person(p)).map(([k,v])=>[prefix+'.'+k,v])));
      const id=validation.clean(p.ID_USU).toUpperCase(),email=validation.clean(p.COR_USU).toLowerCase();
      if(ids.has(id))errors[prefix+'.ID_USU']='Identificación repetida entre las cuentas.';
      if(emails.has(email))errors[prefix+'.COR_USU']='Correo repetido entre las cuentas.';
      ids.add(id);emails.add(email);
    }
  }
  if(Object.keys(errors).length)throw Object.assign(access.failure(400,'Revisa los campos señalados.'),{fields:errors});
  return Object.fromEntries(Object.keys(columns).map(key=>[key,key==='TEL_COP'?validation.phone(body[key]):validation.clean(body[key]) || null]));
}
function person(value,creating=true) {
  if(!value || typeof value!=='object' || Array.isArray(value))return {ID_USU:'Datos personales inválidos.'};
  const allowed=['modo','tipoDocumento','ID_USU','NOM_USU','APE_USU','COR_USU','TEL_USU','password','permisos'];
  const errors=validation.person(value,creating);
  if(Object.keys(value).some(k=>!allowed.includes(k)))errors.ID_USU='La cuenta contiene campos no autorizados.';
  if(value.permisos!==undefined && (!Array.isArray(value.permisos)||value.permisos.some(p=>!Object.hasOwn(access.catalog,p))||new Set(value.permisos).size!==value.permisos.length))errors.permisos='Selecciona únicamente permisos delegables.';
  return errors;
}
function accountBody(value,company) {
  return {ID_USU:value.ID_USU,NOM_USU:value.NOM_USU,APE_USU:value.APE_USU,COR_USU:value.COR_USU,TEL_USU:validation.phone(value.TEL_USU),password:value.password,EST_USU:'1',ID_ROL_PER:'R002',ID_COP_PER:company,permisos:value.permisos||[]};
}
async function save(user,body,id=null) {
  if(user.rolId!=='R001')throw access.failure(403,'Solo el administrador puede registrar cooperativas.');
  const data=validate(body,!!id);
  if(id&&!/^[A-Z0-9_-]{1,5}$/.test(id))throw access.failure(400,'Código inválido.');
  const pool=await conectarBD();
  if(!await installed(pool))throw access.failure(503,'El registro ampliado requiere aprobar y aplicar 007_registro_cooperativas.sql. No se guardó ningún cambio.');
  const result=await accounts.transaction(async db=> {
    await accounts.actor(db,user);
    const rows=(await request(db).query('SELECT ID_COP,RUC_COP FROM dbo.COOPERATIVAS WITH (UPDLOCK,HOLDLOCK)')).recordset;
    if(id && !rows.some(row=>row.ID_COP===id))throw access.failure(404,'Cooperativa no encontrada.');
    if(rows.some(row=>row.RUC_COP===data.RUC_COP && row.ID_COP!==id))throw Object.assign(access.failure(409,'Ya existe una cooperativa con ese RUC.'),{fields:{RUC_COP:'Este RUC ya está registrado.'}});
    const code=id || nextCode(rows);
    if(id) {const current=(await request(db).input('id',sql.VarChar(5),id).query('SELECT C.* FROM dbo.COOPERATIVAS C WITH (UPDLOCK,HOLDLOCK) WHERE C.ID_COP=@id')).recordset[0];records.check(current,body.version);if(body.EST_COP!==current.EST_COP)throw access.failure(400,'Utiliza Gestionar estado para cambiar el estado de la empresa.');}
    const q=request(db).input('id',sql.VarChar(5),code).input('EST_COP',sql.Char(1),body.EST_COP);
    for(const [key,length]of Object.entries(columns))q.input(key,sql.VarChar(length),data[key]);
    const keys=[...Object.keys(columns),...(!id?['EST_COP']:[])];
    await q.query(id?`UPDATE dbo.COOPERATIVAS SET ${keys.map(k=>`${k}=@${k}`).join(',')} WHERE ID_COP=@id`:`INSERT INTO dbo.COOPERATIVAS (ID_COP,${keys.join(',')},LOG_URL_COP) VALUES (@id,${keys.map(k=>`@${k}`).join(',')},NULL)`);
    if(!id) {
      const people=[body.responsable,...(body.gestores||[])];
      for(const [index,person]of people.entries()) {
        try { await accounts.save(user,accountBody(person,code),null,db,{autoPrincipal:index===0}); }
        catch(error) { if(error.status===409 || [2601,2627].includes(error.number)) {error.status=409;const prefix=index?'gestores.'+(index-1):'responsable';error.fields={[prefix+'.ID_USU']:'Identificación o correo ya registrados.',[prefix+'.COR_USU']:'Identificación o correo ya registrados.'};}throw error; }
      }
    }
    return {ID_COP:code,...data,EST_COP:body.EST_COP};
  });
  return result;
}
module.exports={installed,nextCode,validate,save,person,accountBody,columns};
