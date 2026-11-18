(() => {
 'use strict';
 const $=id=>document.getElementById(id),api=window.CompanyModule,forms=window.CompanyAccounts;
 const states={'1':'Activa','0':'Inactiva',S:'Suspendida'},roles={R002:'Gestor',R003:'Oficinista',R004:'Controlador',R006:'Chofer'};
 let data,id,tab='Empresa',sequence=0,busy=false,accountForm,accountAction,confirmAction;
 const pending=forms.track($('companyAccountDialog'),()=>accountForm?.read(),()=>busy);
 let acceptedHash=location.hash;
 const text=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const date=value=>value?new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'No registrada';
 const cell=value=>{const td=document.createElement('td');td.textContent=value;return td;};
 function selectTab(value,focus=false) {
  tab=value;document.querySelectorAll('[data-company-tab]').forEach(button=>{const selected=button.dataset.companyTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;$('company'+button.dataset.companyTab).hidden=!selected;if(selected&&focus)button.focus();});
 }
 document.querySelector('.company-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-company-tab]');if(b)selectTab(b.dataset.companyTab);});
 document.querySelector('.company-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['Empresa','Responsables','Personal'],i=tabs.indexOf(tab);selectTab(e.key==='Home'?tabs[0]:e.key==='End'?tabs[2]:tabs[(i+(e.key==='ArrowRight'?1:2))%3],true);});
 function history(target,rows,principal=false) {
  target.replaceChildren();
  if(!data.estadosDisponibles){target.textContent='Historial pendiente de aplicar la migración 008.';return;}
  if(!rows?.length){target.textContent='No hay cambios registrados en el historial.';return;}
  if(!principal){for(const row of rows){const p=document.createElement('p');p.textContent=`${date(row.FECHA_UTC)} · ${states[row.ANTERIOR]} → ${states[row.NUEVO]} · R001 ${row.ID_ACTOR}${row.MOTIVO?' · '+row.MOTIVO:''}`;target.append(p);}return;}
  const list=document.createElement('ol');list.className='company-history';
  for(const row of [...rows].sort((a,b)=>new Date(b.FECHA_UTC)-new Date(a.FECHA_UTC))) {
   const item=document.createElement('li'),title=document.createElement('strong'),time=document.createElement('time'),actor=document.createElement('p'),previous=document.createElement('p');
   title.textContent=(row.NOMBRE_NUEVO||row.NUEVO)+' fue designado responsable principal';
   const instant=new Date(row.FECHA_UTC);
   if(row.FECHA_UTC&&!Number.isNaN(instant.getTime())){time.dateTime=instant.toISOString();time.textContent=instant.toLocaleDateString('es-EC',{timeZone:'America/Guayaquil',day:'numeric',month:'long',year:'numeric'})+' · '+instant.toLocaleTimeString('es-EC',{timeZone:'America/Guayaquil',hour:'numeric',minute:'2-digit',hour12:true});}else time.textContent='Fecha no registrada';
   actor.textContent='Realizado por: '+(row.NOMBRE_ACTOR||row.ID_ACTOR||'Sin registrar');
   previous.textContent='Responsable anterior: '+(row.NOMBRE_ANTERIOR||row.ANTERIOR||'ninguno');
   item.append(title,time,actor,previous);list.append(item);
  }
  target.append(list);
 }
 function render() {
  const c=data.cooperativa;
  $('detailName').textContent=c.NOM_COM_COP||c.NOM_COP;
  $('detailLocation').textContent=[c.ID_COP,c.CIUDAD_COP,c.PROVINCIA_COP].filter(Boolean).join(' · ');
  $('detailState').textContent=(states[c.EST_COP]||'No disponible')+(c.MOT_SUS_COP?' · '+c.MOT_SUS_COP:'');
  $('detailPublic').href='../public/cooperativa.html?id='+encodeURIComponent(c.ID_COP);
  $('detailLogo').hidden=true;$('detailLogo').removeAttribute('src');
  if(data.logo)try{const url=new URL(data.logo,window.API_BASE_URL);if(['http:','https:'].includes(url.protocol)){$('detailLogo').onload=()=>{$('detailLogo').hidden=false;};$('detailLogo').onerror=()=>{$('detailLogo').hidden=true;};$('detailLogo').src=url.href;}}catch{}
  const fields={ID_COP:'Código interno',NOM_COP:'Razón social',NOM_COM_COP:'Nombre comercial',RUC_COP:'RUC',TIP_ORG_COP:'Tipo de organización',PROVINCIA_COP:'Provincia',CIUDAD_COP:'Ciudad',DIR_COP:'Dirección',TEL_COP:'Teléfono institucional',COR_INS_COP:'Correo institucional',SIT_WEB_COP:'Sitio web externo'};
  $('companyData').replaceChildren();
  for(const [key,label]of Object.entries(fields)) {const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=c[key]||'Sin registrar';if(key==='SIT_WEB_COP'&&c[key])try{const url=new URL(c[key]);if(['http:','https:'].includes(url.protocol)){const a=document.createElement('a');a.href=url.href;a.textContent=c[key];a.target='_blank';a.rel='noopener noreferrer';dd.replaceChildren(a);}}catch{}group.append(dt,dd);$('companyData').append(group);}
  for(const [label,value]of [['Estado',states[c.EST_COP]],['Registro',date(c.FEC_REG_COP)],['Último cambio de estado',date(c.EST_CAMBIO_UTC)]]){const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);$('companyData').append(group);}
  $('companyMigration').hidden=data.estadosDisponibles;$('companyMigration').textContent='Suspensión con motivo e historial de sustituciones: pendiente de autorizar y aplicar la migración 008. Activar y desactivar siguen disponibles.';
  history($('companyStateHistory'),data.historialEstados);history($('companyPrincipalHistory'),data.historialResponsables,true);
  directories();selectTab(tab);
 }
 function directories() {
  const principal=data.usuarios.find(u=>u.PRINCIPAL);
  $('principalStatus').textContent=principal?'Principal: '+principal.NOM_USU+' '+principal.APE_USU:'Esta cooperativa todavía no tiene responsable principal. Puedes crear su acceso sin volver a registrar la empresa.';
  $('companyCreateAccount').textContent=principal?'+ Crear gestor adicional':'Crear acceso principal';
  $('companyCreateAccount').disabled=data.cooperativa.EST_COP!=='1';
  for(const type of ['manager','worker']) {
   const manager=type==='manager',target=$(type+'Rows'),term=text($(type+'Search').value),state=$(type+'State').value,role=manager?'':$('workerRole').value;
   const rows=data.usuarios.filter(u=>(manager?u.ID_ROL_PER==='R002':['R003','R004','R006'].includes(u.ID_ROL_PER))&&(!state||u.EST_USU===state)&&(!role||u.ID_ROL_PER===role)&&text(`${u.NOM_USU} ${u.APE_USU} ${u.ID_USU} ${u.COR_USU}`).includes(term));
   target.replaceChildren();
   for(const u of rows) {
    const row=document.createElement('tr'),name=cell(u.NOM_USU+' '+u.APE_USU),ident=document.createElement('small');ident.textContent=u.ID_USU;name.append(ident);
    const contact=cell(u.COR_USU),phone=document.createElement('small');phone.textContent=u.TEL_USU;contact.append(phone);
    const level=cell(manager?(u.PRINCIPAL?'Responsable principal':'Gestor adicional'):roles[u.ID_ROL_PER]);
    if(manager){const p=document.createElement('small');p.textContent=u.PRINCIPAL?'Acceso principal':u.permisos.map(k=>data.permisos[k]||k).join(', ')||'Sin permisos';level.append(p);}
    const status=cell(''),badge=document.createElement('span');badge.className='coop-badge '+(u.EST_USU==='1'?'coop-badge-active':'coop-badge-inactive');badge.textContent=u.EST_USU==='1'?'Activo':'Inactivo';status.append(badge);
    row.append(name,contact,level,status);if(!manager)row.append(cell(date(u.FEC_REG_USU)));
    const actions=document.createElement('td');
    for(const [label,action]of [['Editar','edit'],...(!u.PRINCIPAL?[[u.EST_USU==='1'?'Desactivar':'Reactivar','state']]:[]),...(manager&&!u.PRINCIPAL&&u.EST_USU==='1'?[['Designar principal','principal']]:[])]) {
     const b=document.createElement('button');b.type='button';b.className='coop-button coop-button-secondary';b.textContent=label;b.addEventListener('click',()=>action==='edit'?openAccount(u):confirmAccount(u,action));actions.append(b);
    }
    row.append(actions);target.append(row);
   }
   if(!rows.length){const row=document.createElement('tr'),td=cell('No hay cuentas que coincidan con los filtros.');td.colSpan=manager?5:6;row.append(td);target.append(row);}
  }
 }
 async function load() {
  const selected=new URLSearchParams(location.hash.slice(1)).get('cooperativa');const current=++sequence;
  $('companyList').hidden=!!selected;$('companyDetail').hidden=!selected;
  if(!selected)return;
  id=selected;$('detailContent').hidden=true;$('detailStatus').textContent='Consultando ficha…';
  try {const result=await api.request('/'+encodeURIComponent(id));if(current!==sequence)return;data=result;render();$('detailContent').hidden=false;$('detailStatus').textContent='Información consultada en SQL Server.';}
  catch(error){if(current===sequence)$('detailStatus').textContent=error.message;}
 }
 window.addEventListener('hashchange',()=>{
  const guards=[pending,api.pending];
  if(busy||guards.some(guard=>guard.blocked())||(guards.some(guard=>guard.dirty())&&!window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'))){window.history.replaceState(null,'',location.pathname+location.search+acceptedHash);return;}
  guards.forEach(guard=>{guard.clear();guard.close();});
  acceptedHash=location.hash;tab='Empresa';load();
 });$('detailReload').addEventListener('click',load);
 window.addEventListener('company:saved',e=>{const hash='#cooperativa='+encodeURIComponent(e.detail.id);if(location.hash===hash)load();else location.hash=hash;});
 for(const field of ['managerSearch','managerState','workerSearch','workerRole','workerState'])$(field).addEventListener('input',()=>{if(data)directories();});
 $('companyEdit').addEventListener('click',()=>api.edit(data.cooperativa,data.registroDisponible));
 function lock(dialog,value) {busy=value;dialog.querySelectorAll('button,input,select,textarea').forEach(n=>{n.disabled=value;});}
 function openAccount(user) {
  if(busy)return;const principal=data.usuarios.find(u=>u.PRINCIPAL),initial=!user&&!principal,company=data.cooperativa.ID_COP;
  $('companyAccountFields').replaceChildren();
  accountForm=forms.card($('companyAccountFields'),{principal:initial||!!user?.PRINCIPAL,editing:!!user,values:user||{},permissions:data.permisos,personal:!!user&&user.ID_ROL_PER!=='R002'});
  $('companyAccountTitle').textContent=user?'Editar cuenta':initial?'Crear acceso principal':'Crear gestor adicional';
  $('companyAccountSave').hidden=false;$('companyAccountStatus').textContent='';
  accountAction={company,user,principal:initial,principalActual:principal?.ID_USU||null};pending.start();$('companyAccountDialog').showModal();
 }
 $('companyCreateAccount').addEventListener('click',()=>openAccount());
 $('companyAccountClose').addEventListener('click',()=>pending.close());
 $('companyAccountDialog').addEventListener('cancel',e=>{e.preventDefault();pending.close();});
 $('companyAccountDialog').addEventListener('click',e=>{if(e.target===$('companyAccountDialog'))pending.close();});
 $('companyAccountDialog').addEventListener('close',()=>{$('companyAccountFields').replaceChildren();accountForm=null;});
 $('companyAccountForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!accountForm)return;const a=accountAction,cuenta=accountForm.read(),errors=window.EcuadorValidation.person(cuenta,!a.user);
  const first=forms.errors($('companyAccountFields'),errors);if(Object.keys(errors).length){first?.focus();return;}
  lock($('companyAccountDialog'),true);
  try {
   await api.request('/'+encodeURIComponent(a.company)+'/personal'+(a.user?'/'+encodeURIComponent(a.user.ID_USU):''),a.user?'PUT':'POST',a.user?{cuenta,version:a.user.version}:{cuenta,principal:a.principal,principalActual:a.principalActual});
   pending.clear();lock($('companyAccountDialog'),false);$('companyAccountDialog').close();await load();await api.reload();api.notify('Cuenta guardada correctamente.');
  } catch(error){forms.errors($('companyAccountFields'),error.fields);$('companyAccountStatus').textContent=error.message;lock($('companyAccountDialog'),false);}
 });
 function confirm(title,message,expected,action,state=false,success='Operación completada correctamente.') {
  if(busy)return;confirmAction={action,expected,state,success};$('companyConfirmForm').reset();$('companyConfirmTitle').textContent=title;$('companyConfirmText').textContent=message+' Escribe «'+expected+'» para confirmar.';
  $('companyStateChoice').hidden=!state;$('companyReasonLabel').hidden=true;$('companyReason').required=false;$('companyConfirmStatus').textContent='';
  if(state){$('companyNextState').querySelector('[value="S"]').disabled=!data.estadosDisponibles;$('companyNextState').value=data.cooperativa.EST_COP==='1'?'0':'1';}
  $('companyConfirmDialog').showModal();
 }
 $('companyNextState').addEventListener('change',()=>{$('companyReasonLabel').hidden=$('companyNextState').value!=='S';$('companyReason').required=$('companyNextState').value==='S';});
 $('companyConfirmCancel').addEventListener('click',()=>{if(!busy)$('companyConfirmDialog').close();});
 $('companyConfirmDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('companyState').addEventListener('click',()=>{const c=data.cooperativa;confirm('Gestionar estado','Suspender o desactivar bloquea nuevas operaciones; los boletos anteriores se conservan.',c.ID_COP,()=>api.request('/'+c.ID_COP+'/estado','PATCH',{estado:$('companyNextState').value,motivo:$('companyReason').value,version:c.version,confirmacion:c.ID_COP}),true);});
 $('companyDelete').addEventListener('click',()=>{const c=data.cooperativa;confirm('Eliminar cooperativa','Esta eliminación física es excepcional. Si hay responsables, personal, buses, rutas, imágenes u otros registros asociados, se bloqueará. No hay eliminación en cascada.','ELIMINAR '+c.ID_COP,()=>api.request('/'+c.ID_COP,'DELETE',{version:c.version,confirmacion:'ELIMINAR '+c.ID_COP}));});
 function confirmAccount(user,action) {
  const c=data.cooperativa,principal=data.usuarios.find(u=>u.PRINCIPAL);
  const designation=action==='principal',deactivate=user.EST_USU==='1',name=user.NOM_USU+' '+user.APE_USU;
  confirm(designation?'Sustituir responsable principal':(deactivate?'Desactivar':'Reactivar')+' a '+name,designation?'El principal anterior conservará su cuenta y su historial, y quedará sin permisos delegados hasta que se los asignes.':deactivate?'La cuenta perderá acceso privado, incluidas sus sesiones abiertas.':'La cuenta podrá iniciar sesión nuevamente con sus credenciales y permisos actuales.',user.ID_USU,()=>api.request('/'+c.ID_COP+'/personal/'+user.ID_USU+(designation?'/principal':'/estado'),designation?'POST':'PATCH',{version:user.version,confirmacion:user.ID_USU,...(designation?{principalActual:principal?.ID_USU||null}:{estado:deactivate?'0':'1'})}),false,designation?'Responsable principal actualizado.':deactivate?'Cuenta desactivada. Sus sesiones anteriores quedaron revocadas.':'Cuenta reactivada. Puede volver a iniciar sesión.');
 }
 $('companyConfirmForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;if($('companyConfirmation').value.trim()!==confirmAction.expected){$('companyConfirmStatus').textContent='La confirmación no coincide.';return;}
  if(confirmAction.state&&$('companyNextState').value==='S'&&!$('companyReason').value.trim()){$('companyConfirmStatus').textContent='Escribe el motivo de suspensión.';return;}
  lock($('companyConfirmDialog'),true);
  try {const result=await confirmAction.action();lock($('companyConfirmDialog'),false);$('companyConfirmDialog').close();if(result.eliminada)location.hash='';else await load();await api.reload();api.notify(confirmAction.success);}
  catch(error){$('companyConfirmStatus').textContent=error.message+(error.dependencias?' '+error.dependencias.map(d=>d.tabla+': '+d.total).join(', '):'');lock($('companyConfirmDialog'),false);}
 });
 load();
})();
