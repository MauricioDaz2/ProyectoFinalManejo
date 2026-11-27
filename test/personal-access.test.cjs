const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const sharp = require('sharp');

test('personal, permisos y perfiles: flujo HTTP con persistencia aislada', async (t) => {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('Prueba-segura-2026', 12);
  const row = (id,role,company=null) => ({ ID_USU:id,NOM_USU:'Cuenta',APE_USU:'Prueba',COR_USU:`${id.toLowerCase()}@example.test`,TEL_USU:'0999999999',EST_USU:'1',ID_ROL_PER:role,ID_COP_PER:company,CON_USU:hash });
  let state = { installed:true, registration:true, statesInstalled:true, width:255, users:{ADMIN:row('ADMIN','R001'),OTHER:row('OTHER','R002','CP002'),FINAL:row('FINAL','R005')}, companies:{CP002:{ID_COP:'CP002',NOM_COP:'Otra empresa',EST_COP:'1'}}, principals:{CP002:'OTHER'}, permissions:{}, photos:{} };
  const safe = (u,s) => Object.fromEntries(Object.entries({...u,PRINCIPAL:s.principals[u.ID_COP_PER]===u.ID_USU?1:0}).filter(([k])=>k!=='CON_USU'));
  let rollbackCount=0,failPermission=false;
  class Transaction {
    async begin(){this.state=structuredClone(state);}
    async commit(){state=this.state;}
    async rollback(){rollbackCount++;}
    request(){return new Request(this);}
  }
  class Request {
    constructor(db){this.db=db;this.p={};}
    input(key,type,value){this.p[key]=value;return this;}
    async query(query){
      const p=this.p,s=this.db instanceof Transaction?this.db.state:state, users=Object.values(s.users), result=(recordset=[])=>({recordset});
      if(query.includes('AS RESERVAS_DISPONIBLES'))return result([{RESERVAS_DISPONIBLES:1,NOMBRE_DISPONIBLE:1,TEMPORIZADOR_DISPONIBLE:1}]);
      if(query==='SELECT ID_ROL FROM dbo.ROLES WHERE ID_ROL=@role')return result([{ID_ROL:p.role}]);
      if(query.includes('AS ESTADOS_INSTALADOS'))return result([{ESTADOS_INSTALADOS:s.statesInstalled?1:0}]);
      if(query.includes('AS HISTORIAL_INSTALADO'))return result([{HISTORIAL_INSTALADO:s.statesInstalled?1:0}]);
      if(query.includes('END AS INSTALADO'))return result([{INSTALADO:0}]);
      if(query.startsWith('UPDATE dbo.COOPERATIVAS SET EST_COP=@state')){s.companies[p.id].EST_COP=p.state;if(s.statesInstalled){s.companies[p.id].MOT_SUS_COP=p.reason;s.companies[p.id].EST_CAMBIO_UTC='2026-11-15T12:00:00Z';}return result();}
      if(query.startsWith('UPDATE dbo.COOPERATIVAS SET NOM_COP=')){for(const [k,v]of Object.entries(p))if(k!=='id'&&k!=='EST_COP')s.companies[p.id][k]=v;return result();}
      if(query.startsWith('INSERT INTO dbo.COOPERATIVA_ESTADO_HISTORIAL'))return result();
      if(query.startsWith('SELECT ID_USU FROM dbo.USUARIOS WHERE ID_COP_PER='))return result(users.filter(u=>u.ID_COP_PER===p.company&&['R002','R003','R004','R006'].includes(u.ID_ROL_PER)).map(u=>({ID_USU:u.ID_USU})));
      if(query.startsWith('SELECT DISTINCT SCHEMA_NAME'))return result([{ESQUEMA:'dbo',TABLA:'USUARIOS',COLUMNA:'ID_COP_PER'},{ESQUEMA:'dbo',TABLA:'BUSES',COLUMNA:'ID_COP_PER'}]);
      if(query.startsWith('SELECT COUNT_BIG(*)'))return result([{TOTAL:query.includes('[USUARIOS]')?users.filter(u=>u.ID_COP_PER===p.company).length:(s.dependencies?.[p.company]||0)}]);
      if(query.startsWith('DELETE FROM dbo.COOPERATIVAS')){delete s.companies[p.id];return result();}
      if(query.includes('SELECT C.EST_COP FROM dbo.COOPERATIVAS'))return result(s.companies.CP003?.EST_COP==='1'?[{EST_COP:'1'}]:[]);
      if(query.includes('WHERE B.ID_USU_FIN = @cedula'))return result([{ID_BOL:'OLD01',ID_USU_FIN:p.cedula}]);
      if(query.startsWith('SELECT C.* FROM dbo.COOPERATIVAS'))return result(s.companies[p.id]?[s.companies[p.id]]:[]);
      if(query.startsWith('SELECT ANTERIOR,NUEVO'))return {recordsets:[[],[]]};
      if(query.startsWith('SELECT ID_USU FROM dbo.COOPERATIVA_RESPONSABLES WITH'))return result(s.principals[p.company]?[{ID_USU:s.principals[p.company]}]:[]);
      if(query.includes('AS REGISTRO_INSTALADO'))return result([{REGISTRO_INSTALADO:s.registration?1:0}]);
      if(query==='SELECT ID_COP,RUC_COP FROM dbo.COOPERATIVAS WITH (UPDLOCK,HOLDLOCK)')return result(Object.values(s.companies));
      if(query.includes('AS PERSONAL_INSTALADO'))return result([{PERSONAL_INSTALADO:s.installed?1:0}]);
      if(query.includes('AS PASSWORD_LENGTH'))return result([{PASSWORD_LENGTH:s.width}]);
      if(query.includes('WHERE U.COR_USU = @correo'))return result(users.filter(u=>u.COR_USU===p.correo).map(u=>({...u,ID_ROL:u.ID_ROL_PER,NOM_ROL:u.ID_ROL_PER})));
      if(query.includes('WHERE U.ID_USU = @id'))return result(s.users[p.id]?[{...s.users[p.id],EST_COP:s.companies[s.users[p.id].ID_COP_PER]?.EST_COP,NOM_COP:s.companies[s.users[p.id].ID_COP_PER]?.NOM_COP}]:[]);
      if(query.includes('SELECT ID_USU FROM dbo.COOPERATIVA_RESPONSABLES WHERE'))return result(s.principals[p.company]===p.user?[{ID_USU:p.user}]:[]);
      if(query.startsWith('SELECT PERMISO FROM'))return result((s.permissions[p.user]||[]).map(PERMISO=>({PERMISO})));
      if(query.includes('WHERE ID_USU=@actor'))return result(s.users[p.actor]?[s.users[p.actor]]:[]);
      if(query.includes("U.ID_COP_PER IS NULL AND NOT EXISTS"))return result(users.filter(u=>(!p.target||u.ID_USU===p.target)&&u.ID_ROL_PER==='R002'&&u.EST_USU==='1'&&!u.ID_COP_PER&&!Object.values(s.principals).includes(u.ID_USU)).map(u=>safe(u,s)));
      if(query.startsWith('UPDATE dbo.USUARIOS SET ID_COP_PER=')){s.users[p.target].ID_COP_PER=p.company;s.permissions[p.target]=[];s.principals[p.company]=p.target;return result();}
      if(query.includes('WHERE U.ID_USU=@target'))return result(s.users[p.target]?[safe(s.users[p.target],s)]:[]);
      if(query.startsWith('SELECT ID_COP FROM dbo.COOPERATIVAS'))return result(s.companies[p.company]?.EST_COP==='1'?[s.companies[p.company]]:[]);
      if(query.includes('SELECT TOP (1) ID_COP, RUC_COP'))return result(Object.values(s.companies).filter(c=>c.ID_COP===p.id||c.RUC_COP===p.ruc));
      if(query.startsWith('INSERT INTO dbo.COOPERATIVAS (ID_COP,NOM_COP')){assert.ok(this.db instanceof Transaction);const {id,...data}=p;s.companies[id]={ID_COP:id,...data};return result();}
      if(query.includes('INSERT INTO dbo.COOPERATIVAS')){const c={ID_COP:p.id,NOM_COP:p.nombre,RUC_COP:p.ruc,DIR_COP:p.direccion,TEL_COP:p.telefono,LOG_URL_COP:p.logo,EST_COP:p.estado};s.companies[p.id]=c;return result([c]);}
      if(query.includes('AND (@editing=0 OR ID_USU<>@id)'))return result(users.filter(u=>(u.ID_USU===p.id||u.COR_USU.trim().toLowerCase()===p.email)&&(!p.editing||u.ID_USU!==p.id)));
      if(query.includes('COR_USU)))=@email AND ID_USU<>@user'))return result(users.filter(u=>u.ID_USU!==p.user&&u.COR_USU.toLowerCase()===p.email));
      if(query.startsWith('INSERT INTO dbo.USUARIOS')){assert.ok(this.db instanceof Transaction);assert.match(p.hash,/^\$2b\$12\$/);s.users[p.id]={ID_USU:p.id,NOM_USU:p.name,APE_USU:p.last,COR_USU:p.email,TEL_USU:p.phone,EST_USU:p.state,ID_ROL_PER:p.role,ID_COP_PER:p.company,CON_USU:p.hash};return result();}
      if(query.startsWith('UPDATE dbo.USUARIOS SET NOM_USU=')){const id=p.id||p.user;Object.assign(s.users[id],{NOM_USU:p.name,APE_USU:p.last,COR_USU:p.email,TEL_USU:p.phone},p.id?{EST_USU:p.state,ID_ROL_PER:p.role,ID_COP_PER:p.company}:{});return result();}
      if(query.startsWith('UPDATE dbo.USUARIOS SET EST_USU=')){s.users[p.target].EST_USU=p.state;return result();}
      if(query.startsWith('UPDATE dbo.USUARIOS SET CON_USU=')){s.users[p.user].CON_USU=p.hash;return result();}
      if(query.startsWith('DELETE FROM dbo.USUARIO_PERMISOS')){s.permissions[p.target]=[];return result();}
      if(query.startsWith('INSERT INTO dbo.USUARIO_PERMISOS')){if(failPermission)throw Object.assign(new Error('Fallo de permiso simulado'),{number:50000});(s.permissions[p.target]??=[]).push(p.permission);return result();}
      if(query.startsWith('IF NOT EXISTS (SELECT 1 FROM dbo.COOPERATIVA_RESPONSABLES')){if(!s.principals[p.company])s.principals[p.company]=p.target;return result();}
      if(query.startsWith('IF EXISTS (SELECT 1 FROM dbo.COOPERATIVA_RESPONSABLES')){s.principals[p.company]=p.target;return result();}
      if(query.includes("WHERE U.ID_ROL_PER IN ('R002','R003','R004','R006')"))return result(users.filter(u=>['R002','R003','R004','R006'].includes(u.ID_ROL_PER)&&(!p.company||u.ID_COP_PER===p.company)).map(u=>safe(u,s)));
      if(query.startsWith('SELECT P.ID_USU,P.PERMISO'))return result(Object.entries(s.permissions).flatMap(([ID_USU,list])=>!p.company||s.users[ID_USU].ID_COP_PER===p.company?list.map(PERMISO=>({ID_USU,PERMISO})):[]));
      if(query.startsWith('SELECT NOM_USU,APE_USU,COR_USU,TEL_USU'))return result([safe(s.users[p.user],s)]);
      if(query.startsWith('SELECT CON_USU,COR_USU'))return result(s.users[p.user]?.EST_USU==='1'?[s.users[p.user]]:[]);
      if(query.startsWith('SELECT VERSION FROM dbo.USUARIO_FOTOGRAFIAS'))return result(s.photos[p.user]?[{VERSION:s.photos[p.user].VERSION}]:[]);
      if(query.startsWith('SELECT CONTENIDO,MIME'))return result(s.photos[p.user]?[{...s.photos[p.user],CONTENIDO:Buffer.from(s.photos[p.user].CONTENIDO)}]:[]);
      if(query.startsWith('IF EXISTS (SELECT 1 FROM dbo.USUARIO_FOTOGRAFIAS')){s.photos[p.user]={CONTENIDO:p.content,MIME:p.mime,VERSION:crypto.randomUUID()};return result();}
      if(query.includes(' AS OWNER'))return result([{OWNER:'CP002'}]);
      if(query.includes('SELECT B.ID_BUS')||query.includes('SELECT B.*,')||query.includes('FROM dbo.BUSES B')){assert.equal(p.cooperativa,'CP001');return result();}
      if(query.includes('SELECT H.ID_USU_CON,H.ID_BUS_PER')){assert.equal(p.company,'CP001');return result(p.sheet==='OWN01'?[{ID_USU_CON:'CON01',ID_BUS_PER:'BUS01'}]:[]);}
      if(query.includes('SELECT H.ID_HOJ,H.ID_USU_CON'))return result();
      if(query.includes('SELECT ID_ASI FROM dbo.ASIENTOS_BUS'))return result(p.seat==='ASI01'?[{ID_ASI:p.seat}]:[]);
      if(query.includes('FROM HOJAS_RUTAS H')){assert.equal(p.company,'CP001');assert.equal(p.idCon,'CON01');return result();}
      throw new Error('Consulta no cubierta: '+query.slice(0,110));
    }
  }
  const pool={request:()=>new Request(pool)};
  const dbPath=require.resolve('../backend/src/config/db');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{sql:{...require('mssql'),Request,Transaction},conectarBD:async()=>pool}};
  const app=require('../backend/src/server'), {store}=require('../backend/src/security/sessionStore');
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const cookies={ADMIN:`transporte_sid=${store.create('ADMIN')}`,OTHER:`transporte_sid=${store.create('OTHER')}`,FINAL:`transporte_sid=${store.create('FINAL')}`};
  const request=async(path,{user='ADMIN',method='GET',body,cookie}={})=>fetch(base+path,{method,headers:{'X-Transport-Client':'1',...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie||cookies[user]?{Cookie:cookie||cookies[user]}:{})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
  const account=(id,role,extras={})=>({ID_USU:id,NOM_USU:'Cuenta',APE_USU:'Prueba',COR_USU:`${id.toLowerCase()}@example.test`,TEL_USU:'0999999999',EST_USU:'1',ID_ROL_PER:role,password:'Prueba-segura-2026',...extras});
  const principalAccount=(id,extras={})=>{const value=account(id,'R002',extras);delete value.EST_USU;delete value.ID_ROL_PER;return {...value,tipoDocumento:'extranjero'};};
  async function login(id,password='Prueba-segura-2026') {const r=await request('/auth/login',{user:null,method:'POST',body:{correo:state.users[id].COR_USU,password}});assert.equal(r.status,200,await r.clone().text());cookies[id]=r.headers.get('set-cookie').split(';')[0];return (await r.json()).usuario;}
  await t.test('A: R001 registra cooperativa y primera cuenta principal con hash',async()=>{
    const company=await request('/admin/cooperativas',{method:'POST',body:{NOM_COP:'Empresa prueba',RUC_COP:'1234567890001',DIR_COP:'Direccion prueba',TEL_COP:'0999999999',EST_COP:'1',PROVINCIA_COP:'Tungurahua',CIUDAD_COP:'Ambato',COR_INS_COP:'info@example.test',responsable:principalAccount('MAIN1')}});assert.equal(company.status,201,await company.clone().text());
    assert.equal(state.principals.CP001,'MAIN1');assert.match(state.users.MAIN1.CON_USU,/^\$2b\$12\$/);assert.equal((await company.json()).cooperativa.CON_USU,undefined);await login('MAIN1');
  });
  await t.test('B/C: principal crea gestor; permisos se comprueban en cada petición',async()=>{
    let r=await request('/coop/personal',{user:'MAIN1',method:'POST',body:account('GEST1','R002',{permisos:['dashboard','buses','trabajadores']})});assert.equal(r.status,201,await r.clone().text());await login('GEST1');
    assert.equal((await request('/coop/buses',{user:'GEST1'})).status,200);
    for(const path of ['/coop/resoluciones','/coop/frecuencias','/coop/resumen','/coop/perfil','/coop/hojas-ruta'])assert.equal((await request(path,{user:'GEST1'})).status,403,path);
    const edit=account('GEST1','R002',{permisos:['dashboard','trabajadores']});delete edit.password;
    assert.equal((await request('/coop/personal/GEST1',{user:'MAIN1',method:'PUT',body:edit})).status,200);
    assert.equal((await request('/coop/buses',{user:'GEST1'})).status,403);
  });
  await t.test('D: gestor autorizado crea R003, R004 y R006 con contraseña segura',async()=>{
    for(const [id,role] of [['OFI01','R003'],['CON01','R004'],['DRV01','R006']]){const r=await request('/coop/personal',{user:'GEST1',method:'POST',body:account(id,role)});assert.equal(r.status,201,await r.clone().text());assert.equal((await login(id)).rolId,role);}
    assert.equal((await request('/controlador/hojas/CON01',{user:'CON01'})).status,200);
  });
  await t.test('R004 y R006 cierran sesión y no adquieren permisos administrativos',async()=>{
    for(const user of ['CON01','DRV01']) {
      for(const path of ['/admin/usuarios','/coop/personal','/oficinista/hojas'])assert.equal((await request(path,{user})).status,403);
      if(user==='DRV01')assert.equal((await request('/controlador/hojas/DRV01',{user})).status,403);
      const cookie=cookies[user];assert.equal((await request('/auth/logout',{user,method:'POST',body:{}})).status,200);
      assert.equal((await request('/auth/me',{cookie})).status,401);await login(user);
    }
  });
  await t.test('registro ampliado: principal obligatorio, varios gestores y rollback completo',async()=>{
    const company={NOM_COP:'Empresa de prueba con nombre extenso',NOM_COM_COP:'Comercial de prueba',RUC_COP:'0198765432001',DIR_COP:'Direccion de mas de veinte caracteres',TEL_COP:'+593 99 999 9999',EST_COP:'1',PROVINCIA_COP:'Azuay',CIUDAD_COP:'Cuenca',COR_INS_COP:'empresa@example.test',responsable:principalAccount('MAIN2'),gestores:[principalAccount('EXTRA',{permisos:['dashboard']}),principalAccount('EXTRB',{permisos:['buses']})]};
    const baseCount=Object.keys(state.companies).length;
    let r=await request('/admin/cooperativas',{method:'POST',body:{...company,responsable:undefined}});assert.equal(r.status,400);
    r=await request('/admin/cooperativas',{method:'POST',body:{...company,RUC_COP:'123'}});assert.equal(r.status,400);assert.ok((await r.json()).fields.RUC_COP);
    r=await request('/admin/cooperativas',{method:'POST',body:{...company,RUC_COP:'1234567890001'}});assert.equal(r.status,409);
    r=await request('/admin/cooperativas',{method:'POST',body:{...company,gestores:[company.gestores[0],principalAccount('EXTRB',{COR_USU:state.users.MAIN1.COR_USU})]}});assert.equal(r.status,409);assert.equal(Object.keys(state.companies).length,baseCount);assert.equal(state.users.MAIN2,undefined);assert.equal(state.users.EXTRA,undefined);
    failPermission=true;r=await request('/admin/cooperativas',{method:'POST',body:company});assert.equal(r.status,500);assert.equal(state.users.MAIN2,undefined);assert.equal(Object.keys(state.companies).length,baseCount);failPermission=false;
    r=await request('/admin/cooperativas',{method:'POST',body:company});assert.equal(r.status,201,await r.clone().text());assert.equal((await r.json()).cooperativa.ID_COP,'CP003');assert.equal(state.principals.CP003,'MAIN2');assert.deepEqual(state.permissions.EXTRA,['dashboard']);assert.deepEqual(state.permissions.EXTRB,['buses']);assert.equal(state.companies.CP003.RUC_COP,'0198765432001');
    for(const id of ['MAIN2','EXTRA','EXTRB']){const user=await login(id);assert.equal(user.cooperativaId,'CP003');assert.equal((await (await request('/auth/me',{user:id})).json()).usuario.principal,id==='MAIN2');}
    assert.equal((await request('/coop/personal',{user:'EXTRA'})).status,403);
    assert.equal((await request('/coop/personal/MAIN1',{user:'MAIN2'})).status,404);
    r=await request('/admin/cooperativas',{method:'POST',body:company});assert.equal(r.status,409);
    r=await request('/admin/cooperativas',{method:'POST',body:{...company,RUC_COP:'0298765432001',responsable:{modo:'existente',ID_USU:'OTHER'}}});assert.equal(r.status,400);
    state.registration=false;r=await request('/admin/cooperativas',{method:'POST',body:{...company,RUC_COP:'0398765432001'}});assert.equal(r.status,503);state.registration=true;
    assert.equal((await request('/admin/cooperativas',{user:'MAIN1',method:'POST',body:company})).status,403);
  });
  await t.test('ficha: empresa real, personal propio, edición y conflictos simultáneos',async()=>{
    const detail=async id=>{const r=await request('/admin/cooperativas/'+id);assert.equal(r.status,200,await r.clone().text());return r.json();};
    let data=await detail('CP001');assert.equal(data.cooperativa.ID_COP,'CP001');assert.ok(data.usuarios.some(u=>u.ID_USU==='OFI01'));assert.ok(data.usuarios.some(u=>u.ID_USU==='GEST1'));assert.ok(data.usuarios.every(u=>u.ID_COP_PER==='CP001'&&u.ID_ROL_PER!=='R005'));
    assert.ok((await detail('CP002')).usuarios.every(u=>u.ID_COP_PER==='CP002'));
    for(const who of ['MAIN1','OFI01','CON01','FINAL'])assert.equal((await request('/admin/cooperativas/CP001',{user:who})).status,403);
    const company={...data.cooperativa};delete company.ID_COP;delete company.LOG_URL_COP;
    company.NOM_COP='Empresa editada';let r=await request('/admin/cooperativas/CP001',{method:'PUT',body:company});assert.equal(r.status,200,await r.clone().text());assert.equal(state.principals.CP001,'MAIN1');
    r=await request('/admin/cooperativas/CP001',{method:'PUT',body:company});assert.equal(r.status,409);
    data=await detail('CP001');const worker=data.usuarios.find(u=>u.ID_USU==='OFI01');const person=principalAccount('OFI01');delete person.password;person.NOM_USU='Editado';
    r=await request('/admin/cooperativas/CP001/personal/OFI01',{method:'PUT',body:{version:worker.version,cuenta:person}});assert.equal(r.status,200,await r.clone().text());assert.equal(state.users.OFI01.ID_ROL_PER,'R003');
    assert.equal((await request('/admin/cooperativas/CP002/personal/OFI01',{method:'PUT',body:{version:worker.version,cuenta:person}})).status,404);
    assert.equal((await request('/admin/cooperativas/CP001/personal/OFI01',{method:'PUT',body:{version:worker.version,cuenta:person}})).status,409);
  });
  await t.test('R001 desactiva y reactiva gestor, oficinista y controlador con sesiones revocadas',async()=>{
    for(const id of ['GEST1','OFI01','CON01','DRV01']) {
      let data=await (await request('/admin/cooperativas/CP001')).json(),person=data.usuarios.find(u=>u.ID_USU===id);
      const body={version:person.version,estado:'0',confirmacion:id},oldCookie=cookies[id];
      assert.equal((await request('/admin/cooperativas/CP001/personal/'+id+'/estado',{user:'OTHER',method:'PATCH',body})).status,403);
      assert.equal((await request('/admin/cooperativas/CP002/personal/'+id+'/estado',{method:'PATCH',body})).status,404);
      assert.equal((await request('/admin/cooperativas/CP001/personal/'+id+'/estado',{method:'PATCH',body:{...body,estado:'S'}})).status,400);
      let r=await request('/admin/cooperativas/CP001/personal/'+id+'/estado',{method:'PATCH',body});assert.equal(r.status,200,await r.clone().text());assert.equal(state.users[id].EST_USU,'0');
      assert.equal((await request('/auth/me',{cookie:oldCookie})).status,401);
      assert.equal((await request('/auth/login',{user:null,method:'POST',body:{correo:state.users[id].COR_USU,password:'Prueba-segura-2026'}})).status,403);
      data=await (await request('/admin/cooperativas/CP001')).json();person=data.usuarios.find(u=>u.ID_USU===id);assert.equal(person.EST_USU,'0');
      r=await request('/admin/cooperativas/CP001/personal/'+id+'/estado',{method:'PATCH',body:{version:person.version,estado:'1',confirmacion:id}});assert.equal(r.status,200);assert.equal(state.users[id].EST_USU,'1');
      assert.equal((await request('/auth/me',{cookie:oldCookie})).status,401);await login(id);assert.equal((await request('/auth/me',{user:id})).status,200);
    }
  });
  await t.test('acceso principal antiguo sin volver a registrar; un único principal y sustitución explícita',async()=>{
    state.companies.CP005={ID_COP:'CP005',NOM_COP:'Registro antiguo',EST_COP:'1'};
    const companyBefore=structuredClone(state.companies.CP005);
    let r=await request('/admin/cooperativas/CP005/personal',{method:'POST',body:{principal:true,principalActual:null,cuenta:principalAccount('OLDPR')}});assert.equal(r.status,201,await r.clone().text());assert.deepEqual(state.companies.CP005,companyBefore);assert.equal(state.principals.CP005,'OLDPR');await login('OLDPR');
    r=await request('/admin/cooperativas/CP005/personal',{method:'POST',body:{principal:true,principalActual:null,cuenta:principalAccount('BADPR')}});assert.equal(r.status,409);assert.equal(state.users.BADPR,undefined);
    r=await request('/admin/cooperativas/CP005/personal',{method:'POST',body:{principal:false,principalActual:'OLDPR',cuenta:principalAccount('OLDGE',{permisos:['dashboard']})}});assert.equal(r.status,201);
    let data=await (await request('/admin/cooperativas/CP005')).json(),target=data.usuarios.find(u=>u.ID_USU==='OLDGE');
    state.statesInstalled=false;r=await request('/admin/cooperativas/CP005/personal/OLDGE/principal',{method:'POST',body:{version:target.version,principalActual:'OLDPR',confirmacion:'OLDGE'}});assert.equal(r.status,503);assert.equal(state.principals.CP005,'OLDPR');state.statesInstalled=true;
    r=await request('/admin/cooperativas/CP005/personal/OLDGE/principal',{method:'POST',body:{version:target.version,principalActual:'OLDPR',confirmacion:'OLDGE'}});assert.equal(r.status,200);assert.equal(state.principals.CP005,'OLDGE');assert.ok(state.users.OLDPR);assert.deepEqual(state.permissions.OLDPR,[]);
    data=await (await request('/admin/cooperativas/CP005')).json();target=data.usuarios.find(u=>u.ID_USU==='OLDGE');
    assert.equal((await request('/admin/cooperativas/CP005/personal/OLDGE/estado',{method:'PATCH',body:{version:target.version,estado:'0',confirmacion:'OLDGE'}})).status,409);
  });
  await t.test('suspensión, reactivación, revocación de sesión y boletos históricos intactos',async()=>{
    let data=await (await request('/admin/cooperativas/CP003')).json();
    const change={estado:'S',motivo:'Revisión administrativa de prueba aislada',version:data.cooperativa.version,confirmacion:'CP003'};
    state.statesInstalled=false;assert.equal((await request('/admin/cooperativas/CP003/estado',{method:'PATCH',body:change})).status,503);assert.equal(state.companies.CP003.EST_COP,'1');state.statesInstalled=true;
    assert.equal((await request('/admin/cooperativas/CP003/estado',{method:'PATCH',body:{...change,motivo:''}})).status,400);
    assert.equal((await request('/admin/cooperativas/CP003/estado',{method:'PATCH',body:change})).status,200);assert.equal(state.companies.CP003.EST_COP,'S');assert.equal((await request('/auth/me',{user:'MAIN2'})).status,401);
    const reserve={idHoja:'SHEET',asientos:['ASI01']};
    assert.equal((await request('/usuario/reservas/bloqueos',{user:'FINAL',method:'POST',body:reserve})).status,409);
    const historic=await request('/usuario/reservas/mis-boletos/FINAL',{user:'FINAL'});assert.equal(historic.status,200);assert.equal((await historic.json()).boletos[0].ID_BOL,'OLD01');assert.equal((await request('/usuario/reservas/mis-boletos/OTHER',{user:'FINAL'})).status,403);
    data=await (await request('/admin/cooperativas/CP003')).json();assert.equal(data.cooperativa.MOT_SUS_COP,change.motivo);
    assert.equal((await request('/admin/cooperativas/CP003/estado',{method:'PATCH',body:{estado:'1',version:data.cooperativa.version,confirmacion:'CP003'}})).status,200);assert.equal((await request('/auth/me',{user:'MAIN2'})).status,401);await login('MAIN2');assert.equal((await request('/auth/me',{user:'MAIN2'})).status,200);
  });
  await t.test('eliminación física exige confirmación y rechaza dependencias sin cascadas',async()=>{
    let data=await (await request('/admin/cooperativas/CP001')).json();const body={version:data.cooperativa.version,confirmacion:'ELIMINAR CP001'};
    assert.equal((await request('/admin/cooperativas/CP001',{method:'DELETE',body:{...body,confirmacion:'CP001'}})).status,400);
    let r=await request('/admin/cooperativas/CP001',{method:'DELETE',body});assert.equal(r.status,409);assert.ok((await r.json()).dependencias.some(d=>d.tabla==='USUARIOS'));assert.ok(state.companies.CP001);
    state.companies.CP006={ID_COP:'CP006',NOM_COP:'Vacía de prueba',EST_COP:'0'};state.dependencies={CP006:1};data=await (await request('/admin/cooperativas/CP006')).json();
    r=await request('/admin/cooperativas/CP006',{method:'DELETE',body:{version:data.cooperativa.version,confirmacion:'ELIMINAR CP006'}});assert.equal(r.status,409);assert.ok(state.companies.CP006);
    state.dependencies.CP006=0;r=await request('/admin/cooperativas/CP006',{method:'DELETE',body:{version:data.cooperativa.version,confirmacion:'ELIMINAR CP006'}});assert.equal(r.status,200);assert.equal(state.companies.CP006,undefined);
  });
  await t.test('E/G: aislamiento, suplantación y elevación de privilegios',async()=>{
    assert.ok((await (await request('/coop/personal',{user:'MAIN1'})).json()).usuarios.every(u=>u.ID_COP_PER==='CP001'));
    const invalid=[account('BAD01','R002'),account('BAD02','R001'),account('BAD03','R003',{ID_COP_PER:'CP002'}),account('BAD04','R003',{permisos:['buses']})];
    for(const body of invalid)assert.ok([400,403].includes((await request('/coop/personal',{user:'GEST1',method:'POST',body})).status));
    const self=account('GEST1','R002',{permisos:['personalizacion']});delete self.password;
    assert.equal((await request('/coop/personal/GEST1',{user:'GEST1',method:'PUT',body:self})).status,403);
    assert.equal((await request('/coop/personal/OTHER',{user:'MAIN1',method:'PATCH',body:{EST_USU:'0'}})).status,404);
    assert.equal((await request('/coop/personal/OTHER/estado',{user:'MAIN1',method:'PATCH',body:{EST_USU:'0'}})).status,404);
    assert.equal((await request('/coop/personal/OTHER',{user:'MAIN1'})).status,404);
    const foreign=account('OTHER','R002');delete foreign.password;
    assert.equal((await request('/coop/personal/OTHER',{user:'MAIN1',method:'PUT',body:foreign})).status,404);
    for(const current of ['MAIN1','OTHER']) {const list=(await (await request('/coop/personal',{user:current})).json()).usuarios;assert.ok(list.every(u=>u.ID_COP_PER===state.users[current].ID_COP_PER&&u.ID_ROL_PER!=='R005'));}
    for(const user of ['OFI01','CON01','FINAL']){assert.equal((await request('/coop/personal',{user})).status,403);assert.equal((await request('/admin/usuarios',{user})).status,403);}
    assert.equal((await request('/controlador/hojas/OTHER',{user:'CON01'})).status,403);
    assert.equal((await request('/controlador/asientos/ALIEN',{user:'CON01'})).status,404);
    assert.equal((await request('/oficinista/hojas/ALIEN/asientos',{user:'OFI01'})).status,404);
    assert.equal((await request('/oficinista/hojas?cooperativa=CP002',{user:'OFI01'})).status,403);
    assert.equal((await request('/controlador/vender',{user:'CON01',method:'POST',body:{idUsuCon:'OTHER'}})).status,403);
    assert.equal((await request('/oficinista/boletos/ventanilla',{user:'OFI01',method:'POST',body:{ID_USU_OFI:'OTHER'}})).status,403);
    assert.ok(!state.users.BAD01&&!state.users.BAD02&&!state.users.BAD03&&!state.users.BAD04);
  });
  await t.test('duplicados y principal protegido; solo R001 puede transferir',async()=>{
    assert.equal((await request('/coop/personal',{user:'MAIN1',method:'POST',body:account('OFI01','R003')})).status,409);
    assert.equal((await request('/coop/personal',{user:'MAIN1',method:'POST',body:account('DUP01','R003',{COR_USU:'OFI01@example.test'})})).status,409);
    assert.equal((await request('/admin/usuarios/MAIN1/estado',{method:'PATCH',body:{EST_USU:'0'}})).status,409);
    assert.equal((await request('/admin/usuarios/GEST1/responsable-principal',{user:'GEST1',method:'POST',body:{}})).status,403);
    assert.equal((await request('/admin/usuarios/GEST1/responsable-principal',{method:'POST',body:{}})).status,200);
    assert.equal((await (await request('/auth/me',{user:'MAIN1'})).json()).usuario.principal,false);
    assert.equal((await (await request('/auth/me',{user:'GEST1'})).json()).usuario.principal,true);
    assert.equal((await request('/admin/usuarios/MAIN1/responsable-principal',{method:'POST',body:{}})).status,200);
  });
  await t.test('F: perfiles de cinco roles, fotografías originales y datos persistidos',async()=>{
    for(const id of ['ADMIN','MAIN1','OFI01','CON01','FINAL']){
      let profile=(await (await request('/mi-perfil',{user:id})).json()).usuario;
      if(id==='FINAL')assert.equal(profile.cooperativaId,null);
      let r=await request('/mi-perfil',{user:id,method:'PUT',body:{nombres:'Actualizado',apellidos:'Prueba',correo:profile.correo,telefono:'0987654321'}});assert.equal(r.status,200,await r.clone().text());
      const image=await sharp({create:{width:5,height:8,channels:3,background:'#601070'}}).png().toBuffer();const form=new FormData();form.append('foto',new Blob([image],{type:'image/png'}),'prueba.png');
      r=await request('/mi-perfil/foto',{user:id,method:'POST',body:form});assert.equal(r.status,200,await r.clone().text());const photo=(await r.json()).usuario.foto;assert.match(photo,/^\/api\/mi-perfil\/foto\?v=/);
      r=await request('/mi-perfil/foto',{user:id});assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await r.arrayBuffer()),image);
      await login(id);profile=(await (await request('/mi-perfil',{user:id})).json()).usuario;assert.equal(profile.nombre,'Actualizado Prueba');assert.equal(profile.foto,photo);assert.equal(profile.CON_USU,undefined);
      assert.equal((await request('/mi-perfil',{user:id,method:'PUT',body:{nombres:'Ataque',ID_ROL_PER:'R001'}})).status,400);
    }
    const invalid=new FormData();invalid.append('foto',new Blob(['<script>bad</script>'],{type:'image/png'}),'bad.png');assert.equal((await request('/mi-perfil/foto',{user:'FINAL',method:'POST',body:invalid})).status,400);
    assert.equal((await request('/mi-perfil/foto',{user:null})).status,401);
  });
  await t.test('correo y contraseña requieren confirmación y revocan las otras sesiones',async()=>{
    const oldCookie=cookies.FINAL;const body={nombres:'Actualizado',apellidos:'Prueba',correo:'nuevo@example.test',telefono:'0987654321'};
    assert.equal((await request('/mi-perfil',{user:'FINAL',method:'PUT',body})).status,400);
    body.passwordActual='Prueba-segura-2026';let r=await request('/mi-perfil',{user:'FINAL',method:'PUT',body});assert.equal(r.status,200);cookies.FINAL=r.headers.get('set-cookie').split(';')[0];assert.equal((await request('/auth/me',{cookie:oldCookie})).status,401);
    r=await request('/mi-perfil/password',{user:'FINAL',method:'PUT',body:{actual:'incorrecta',nueva:'Nueva-segura-2026'}});assert.equal(r.status,400);
    r=await request('/mi-perfil/password',{user:'FINAL',method:'PUT',body:{actual:'Prueba-segura-2026',nueva:'Nueva-segura-2026'}});assert.equal(r.status,200);await login('FINAL','Nueva-segura-2026');
    assert.ok(await bcrypt.compare('Nueva-segura-2026',state.users.FINAL.CON_USU));
  });
  await t.test('desactivación y migraciones pendientes bloquean escrituras sin aparentar éxito',async()=>{
    assert.equal((await request('/coop/personal/OFI01/estado',{user:'MAIN1',method:'PATCH',body:{EST_USU:'0'}})).status,200);assert.equal((await request('/auth/me',{user:'OFI01'})).status,401);
    state.width=20;assert.equal((await request('/coop/personal',{user:'MAIN1',method:'POST',body:account('WAIT1','R003')})).status,503);assert.equal(state.users.WAIT1,undefined);state.width=255;
    state.installed=false;assert.equal((await request('/mi-perfil',{user:'FINAL',method:'PUT',body:{nombres:'Esperando',apellidos:'Prueba',correo:'nuevo@example.test',telefono:'0987654321'}})).status,503);assert.equal(state.users.FINAL.NOM_USU,'Actualizado');assert.ok(rollbackCount>0);
  });
});
