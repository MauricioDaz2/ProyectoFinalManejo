(() => {
 'use strict';
 const fields=[['ID_USU','Identificación',10,'text'],['NOM_USU','Nombres',15,'text'],['APE_USU','Apellidos',15,'text'],['COR_USU','Correo de acceso',40,'email'],['TEL_USU','Teléfono',20,'tel'],['password','Contraseña inicial propia',72,'password']];
 function card(parent,{prefix='',principal=false,editing=false,values={},permissions={},removable=false,personal=false}={}) {
  const box=document.createElement('fieldset');box.className='company-account-card';
  const legend=document.createElement('legend');legend.textContent=personal?'Datos del trabajador':principal?'Responsable principal R002':'Gestor adicional R002';box.append(legend);
  const grid=document.createElement('div');grid.className='coop-form-grid';box.append(grid);
  const label=document.createElement('label');label.className='coop-form-field';label.textContent='Tipo de documento';
  const type=document.createElement('select');type.innerHTML='<option value="cedula">Cédula ecuatoriana</option><option value="extranjero">Documento extranjero</option>';label.append(type);label.hidden=editing;grid.append(label);
  const inputs={};
  for(const [key,title,max,inputType] of fields) {
   if(editing&&key==='password')continue;
   const row=document.createElement('label');row.className='coop-form-field';row.textContent=title+' *';
   const input=document.createElement('input');input.type=inputType;input.maxLength=max;input.value=values[key]||'';input.dataset.fieldKey=prefix+key;input.autocomplete=inputType==='password'?'new-password':'off';input.readOnly=editing&&key==='ID_USU';
   const error=document.createElement('small');error.className='company-field-error';error.dataset.fieldError=prefix+key;
   row.append(input,error);grid.append(row);inputs[key]=input;
  }
  const permissionsBox=document.createElement('div');permissionsBox.className='company-permissions';box.append(permissionsBox);
  if(!principal&&!personal)for(const [key,title]of Object.entries(permissions)) {
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=!!values.permisos?.includes(key);label.append(input,document.createTextNode(title));permissionsBox.append(label);
  }
  const permissionError=document.createElement('small');permissionError.className='company-field-error';permissionError.dataset.fieldError=prefix+'permisos';box.append(permissionError);
  if(principal){const help=document.createElement('p');help.className='company-help';help.textContent='Acceso principal a esta cooperativa. Solo R001 puede sustituir esta designación.';box.append(help);}
  if(!editing){const help=document.createElement('p');help.className='company-help';help.textContent='Clave individual de al menos 8 caracteres. Entrégala de forma privada; podrá cambiarse desde Mi perfil.';box.append(help);}
  if(removable){const remove=document.createElement('button');remove.type='button';remove.className='coop-button coop-button-secondary';remove.textContent='Retirar gestor';remove.addEventListener('click',()=>{box.remove();parent.dispatchEvent(new Event('input',{bubbles:true}));});box.append(remove);}
  parent.append(box);
  const read=()=>({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])),tipoDocumento:type.value,...(!principal&&!personal?{permisos:[...permissionsBox.querySelectorAll('input:checked')].map(i=>i.value)}:{})});
  box.readAccount=read;
  return {box,read,focus:()=>inputs.ID_USU.focus()};
 }
 function errors(root,messages) {
  root.querySelectorAll('[data-field-error]').forEach(n=>{n.textContent='';});root.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  let first;
  for(const [key,message]of Object.entries(messages||{})) {
   const node=[...root.querySelectorAll('[data-field-error]')].find(n=>n.dataset.fieldError===key);
   if(node)node.textContent=message;
   const input=[...root.querySelectorAll('[data-field-key]')].find(n=>n.dataset.fieldKey===key);
   if(input){input.setAttribute('aria-invalid','true');first ||= input;}
  }
  return first;
 }
 function track(dialog,read,isBusy=()=>false) {
  let original=null;
  const dirty=()=>dialog.open&&original!==null&&JSON.stringify(read())!==original;
  const clear=()=>{original=null;};
  const discard=()=>!isBusy()&&(!dirty()||window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'));
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  dialog.addEventListener('close',clear);
  return {dirty,clear,discard,blocked:()=>dialog.open&&isBusy(),start:()=>{original=JSON.stringify(read());},close:()=>{if(discard()){clear();dialog.close();}}};
 }
 window.CompanyAccounts={card,errors,track};
})();
