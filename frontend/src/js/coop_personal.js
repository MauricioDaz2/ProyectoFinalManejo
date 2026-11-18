(() => {
  'use strict';
  const $ = (id) => document.getElementById(id), form = $('staffForm'), dialog = $('staffDialog');
  const roles = { R002:'Gestor', R003:'Oficinista', R004:'Controlador', R006:'Chofer' };
  let user, rows = [], permissions = {}, editing = null, busy = false, dirty = false, canSave = false;
  const editable = (row) => row.ID_USU !== user.id && !row.PRINCIPAL && (user.principal || row.ID_ROL_PER !== 'R002');
  function render() {
    const term = $('staffSearch').value.trim().toLowerCase();
    const visible = rows.filter((r) => (!term || `${r.NOM_USU} ${r.APE_USU} ${r.COR_USU} ${r.ID_USU}`.toLowerCase().includes(term)) && (!$('staffRole').value || r.ID_ROL_PER === $('staffRole').value) && (!$('staffState').value || r.EST_USU === $('staffState').value));
    $('staffRows').replaceChildren();
    for (const row of visible) {
      const tr=document.createElement('tr');
      for (const value of [`${row.NOM_USU} ${row.APE_USU}`,row.COR_USU, row.PRINCIPAL?'Responsable principal':roles[row.ID_ROL_PER]+(row.ID_ROL_PER==='R002'?' adicional':''),row.EST_USU==='1'?'Activo':'Inactivo']) { const td=document.createElement('td');td.textContent=value;tr.append(td); }
      const td=document.createElement('td');
      for (const [label,action] of [['Detalle','detail'],...(editable(row)?[['Editar','edit'],[row.EST_USU==='1'?'Desactivar':'Activar','state']]:[])]) { const b=document.createElement('button');b.textContent=label;b.type='button';b.dataset.action=action;b.dataset.id=row.ID_USU;b.disabled=busy;td.append(b); }
      tr.append(td);$('staffRows').append(tr);
    }
    if(!visible.length)$('staffRows').innerHTML='<tr><td colspan="5">No hay cuentas que coincidan con los filtros.</td></tr>';
    const principal=rows.find((r)=>r.PRINCIPAL);
    $('staffPrincipal').textContent=principal?`Responsable principal: ${principal.NOM_USU} ${principal.APE_USU}`:'El administrador general debe designar al responsable principal.';
  }
  function permissionFields() { $('staffPermissions').hidden=form.elements.ID_ROL_PER.value!=='R002'; }
  function open(row, readonly=false) {
    editing=row?.ID_USU||null;form.reset();canSave=!readonly;
    for (const key of ['ID_USU','NOM_USU','APE_USU','COR_USU','TEL_USU','ID_ROL_PER','EST_USU']) if(row)form.elements[key].value=row[key]||'';
    $('staffAssignedCompany').value=user.cooperativaNombre||user.cooperativaId;
    form.querySelectorAll('input,select').forEach((el)=>{el.disabled=readonly;});
    form.elements.ID_USU.readOnly=!!row;$('staffManagerOption').disabled=!user.principal;
    $('staffPasswordLabel').hidden=!!row;form.elements.password.required=!row&&!readonly;
    $('staffPermissionChoices').replaceChildren();
    for(const [key,title] of Object.entries(permissions)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=!!row?.permisos?.includes(key);input.disabled=readonly||!user.principal;label.append(input,document.createTextNode(title));$('staffPermissionChoices').append(label);}
    $('staffSave').hidden=readonly;$('staffDialogTitle').textContent=readonly?'Detalle de la cuenta':row?'Editar cuenta':'Registrar trabajador';$('staffFormStatus').textContent='';permissionFields();dirty=false;dialog.showModal();
  }
  function close(){if(busy||(dirty&&!window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')))return;dirty=false;form.reset();dialog.close();}
  async function load(){
    $('staffNew').disabled=true;
    try{
      user=(await App.api('/auth/me')).usuario;
      if(user.rolId!=='R002'){window.location.replace('../auth/login.html');return;}
      document.documentElement.classList.add('admin-authorized');$('representative').textContent=user.nombre;$('staffCompany').textContent=user.cooperativaNombre||'Mi cooperativa';
      const data=await App.api('/coop/personal');rows=data.usuarios;permissions=data.permisosDisponibles;render();$('staffNew').disabled=false;$('staffStatus').textContent='Cuentas de tu cooperativa actualizadas.';
    }catch(e){$('staffStatus').textContent=e.message;$('staffStatus').className='staff-error';$('staffRows').innerHTML='<tr><td colspan="5">No disponible.</td></tr>';}
  }
  $('staffNew').addEventListener('click',()=>open());$('staffReload').addEventListener('click',load);
  for(const id of ['staffSearch','staffRole','staffState'])$(id).addEventListener('input',render);
  form.addEventListener('input',()=>{dirty=true;});form.elements.ID_ROL_PER.addEventListener('change',permissionFields);
  dialog.addEventListener('cancel',(e)=>{e.preventDefault();close();});dialog.querySelectorAll('[data-staff-close]').forEach((b)=>b.addEventListener('click',close));
  $('staffRows').addEventListener('click',async(e)=>{
    const button=e.target.closest('button[data-action]');if(!button||busy)return;
    const row=rows.find((r)=>r.ID_USU===button.dataset.id);if(!row)return;
    if(button.dataset.action!=='state'){open(row,button.dataset.action==='detail');return;}
    if(!window.confirm(`${row.EST_USU==='1'?'Desactivar':'Activar'} la cuenta de ${row.NOM_USU} ${row.APE_USU}?`))return;
    busy=true;render();try{await App.api(`/coop/personal/${encodeURIComponent(row.ID_USU)}/estado`,{method:'PATCH',body:{EST_USU:row.EST_USU==='1'?'0':'1'}});await load();}catch(error){$('staffStatus').textContent=error.message;}finally{busy=false;render();}
  });
  form.addEventListener('submit',async(e)=>{
    e.preventDefault();if(busy||!canSave||!form.reportValidity())return;
    const body=Object.fromEntries(['ID_USU','NOM_USU','APE_USU','COR_USU','TEL_USU','ID_ROL_PER','EST_USU'].map((k)=>[k,form.elements[k].value.trim()]));
    if(!editing)body.password=form.elements.password.value;
    if(body.ID_ROL_PER==='R002')body.permisos=Array.from($('staffPermissionChoices').querySelectorAll('input:checked'),(i)=>i.value);
    busy=true;$('staffSave').disabled=true;
    try{await App.api('/coop/personal'+(editing?`/${encodeURIComponent(editing)}`:''),{method:editing?'PUT':'POST',body});dirty=false;dialog.close();form.reset();await load();}
    catch(error){$('staffFormStatus').textContent=error.message;}finally{busy=false;$('staffSave').disabled=false;}
  });
  window.addEventListener('beforeunload',(e)=>{if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('transport:logout',()=>{dirty=false;form.reset();dialog.close();});
  load();
})();
