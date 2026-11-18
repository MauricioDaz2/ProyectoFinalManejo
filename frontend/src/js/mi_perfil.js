(() => {
  'use strict';
  const source = document.currentScript.src;
  const api = window.API_BASE_URL || 'http://localhost:3000/api';
  const roles = { R001:'Administrador', R002:'Gestor de cooperativa', R003:'Oficinista', R004:'Controlador', R005:'Pasajero' };
  let user, dialog, form, busy = false, dirty = false, file, localPhoto, opener;
  const $ = (id) => document.getElementById(id);
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${api}${path}`, { method, cache:'no-store', headers:body instanceof FormData ? {} : {'Content-Type':'application/json'}, ...(body === undefined ? {} : { body:body instanceof FormData ? body : JSON.stringify(body) }), signal:AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'No se pudo completar la operación.'), { status:response.status });
    return data;
  }
  function photo(target, url) {
    target.replaceChildren();
    if (!url) { target.textContent = '♙'; return; }
    const image = new Image(); image.alt = 'Fotografía personal'; image.src = url.startsWith('blob:') ? url : new URL(url, api).href;
    image.addEventListener('error', () => { target.textContent = '♙'; }); target.append(image);
  }
  function sync(value) {
    user = value;
    localStorage.setItem('usuario', JSON.stringify(value));
    const targets = document.querySelectorAll('#nombreUsuario, #representative, #editorUser, #nombreControlador, #catalogSessionLabel, [data-personal-user]');
    targets.forEach((target) => {
      target.dataset.profileTrigger = ''; target.setAttribute('role','button'); target.tabIndex = 0; target.setAttribute('aria-label',`Mi perfil: ${value.nombre}`);
      target.textContent = value.nombre;
      if (value.foto) { const image = new Image(); image.className = 'personal-header-photo'; image.alt = ''; image.src = new URL(value.foto, api).href; image.onerror = () => image.remove(); target.prepend(image); }
    });
    document.querySelectorAll('.coop-account .coop-avatar').forEach((target) => { target.dataset.profileTrigger = ''; target.tabIndex = 0; target.setAttribute('role','button'); target.setAttribute('aria-label','Abrir Mi perfil'); photo(target, value.foto); });
    document.querySelectorAll('button[data-personal-user]').forEach((b) => { b.hidden = false; });
    window.dispatchEvent(new CustomEvent('transport:profile-updated', { detail:value }));
  }
  function status(message, error = false) { $('personalProfileStatus').textContent = message; $('personalProfileStatus').className = error ? 'profile-error' : 'profile-success'; }
  function updateDirty() {
    dirty = !!file || ['nombres','apellidos','correo','telefono'].some((key) => form.elements[key].value !== (user[key] || '')) || !!form.elements.passwordActual.value || ['actual','nueva','confirmacion'].some((key) => $('personalPasswordForm').elements[key].value);
  }
  function state(value) {
    busy = value;
    dialog.querySelectorAll('button, input').forEach((element) => { element.disabled = value; });
    if (!value && !user.perfilDisponible) $('personalProfileSave').disabled = true;
  }
  function fill() {
    for (const key of ['nombres','apellidos','correo','telefono']) form.elements[key].value = user[key] || '';
    form.elements.passwordActual.value = ''; $('personalEmailPasswordRow').hidden = true;
    dialog.querySelector('.personal-profile-security').hidden = !user.passwordDisponible;
    $('personalPhotoFile').value = ''; file = null;
    if (localPhoto) URL.revokeObjectURL(localPhoto); localPhoto = null;
    photo($('personalPhotoPreview'), user.foto);
    const pairs = [['Identificación',user.id],['Rol',roles[user.rolId] || user.rolId]];
    if (user.rolId === 'R002') pairs.push(['Nivel',user.nivel || 'Pendiente de designación']);
    if (['R002','R003','R004'].includes(user.rolId)) pairs.push(['Cooperativa',user.cooperativaNombre || user.cooperativaId || 'Sin asignar']);
    $('personalAccountDetails').replaceChildren();
    pairs.forEach(([label,value]) => { const dt=document.createElement('dt'), dd=document.createElement('dd'); dt.textContent=label; dd.textContent=value; $('personalAccountDetails').append(dt,dd); });
    updateDirty(); status(user.perfilDisponible ? '' : 'El guardado requiere instalar la migración 005.'); state(false);
  }
  function close() {
    if (busy || (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?'))) return;
    dirty = false; form.reset(); $('personalPasswordForm').reset(); file = null;
    if (localPhoto) URL.revokeObjectURL(localPhoto); localPhoto = null;
    dialog.close(); opener?.focus();
  }
  async function open(target) {
    if (!dialog || dialog.open) return;
    opener = target; fill(); dialog.showModal();
    state(true); status('Consultando tu cuenta…');
    try { sync((await request('/mi-perfil')).usuario); fill(); } catch (e) { status(e.message,true); } finally { state(false); }
  }
  async function initialize() {
    try { user = (await request('/mi-perfil')).usuario; } catch { return; }
    const response = await fetch(new URL('../components/mi_perfil.html', source));
    if (!response.ok) return;
    const template = document.createElement('template'); template.innerHTML = await response.text(); document.body.append(template.content);
    dialog = $('personalProfileDialog'); form = $('personalProfileForm'); sync(user);
    document.addEventListener('click', (e) => { const trigger=e.target.closest('[data-profile-trigger]'); if(trigger) open(trigger); });
    document.addEventListener('keydown', (e) => { if (['Enter',' '].includes(e.key) && e.target.matches('[data-profile-trigger]') && e.target.tagName!=='BUTTON') {e.preventDefault();open(e.target);} });
    dialog.addEventListener('cancel',(e)=>{e.preventDefault();close();});
    dialog.querySelectorAll('[data-profile-close]').forEach((b)=>b.addEventListener('click',close));
    dialog.addEventListener('input',updateDirty);
    form.elements.correo.addEventListener('input',()=>{$('personalEmailPasswordRow').hidden=form.elements.correo.value.trim().toLowerCase()===user.correo.trim().toLowerCase();});
    $('personalPhotoFile').addEventListener('change',()=>{
      file=$('personalPhotoFile').files[0];
      if (localPhoto) URL.revokeObjectURL(localPhoto); localPhoto=null;
      if(file && (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)){file=null;$('personalPhotoFile').value='';status('Usa JPG, PNG o WebP de hasta 8 MB.',true);}
      if(file){localPhoto=URL.createObjectURL(file);photo($('personalPhotoPreview'),localPhoto);} else photo($('personalPhotoPreview'),user.foto);
    });
    form.addEventListener('submit',async(e)=>{
      e.preventDefault();if(busy||!form.reportValidity())return;
      state(true);let saved=false;
      const body=Object.fromEntries(['nombres','apellidos','correo','telefono','passwordActual'].map((key)=>[key,form.elements[key].value]));
      try{
        const result=await request('/mi-perfil','PUT',body);sync(result.usuario);saved=true;
        if(file){const data=new FormData();data.append('foto',file);sync((await request('/mi-perfil/foto','POST',data)).usuario);}
        fill();status(result.message);
      }catch(error){status((saved?'Los datos personales se guardaron; la fotografía sigue pendiente. ':'')+error.message,true);}
      finally{state(false);form.elements.passwordActual.value='';}
    });
    $('personalPasswordForm').addEventListener('submit',async(e)=>{
      e.preventDefault();const f=e.currentTarget;if(busy||!f.reportValidity())return;
      const message=$('personalPasswordStatus');
      if(f.elements.nueva.value!==f.elements.confirmacion.value){message.textContent='Las contraseñas no coinciden.';return;}
      state(true);
      try{const data=await request('/mi-perfil/password','PUT',{actual:f.elements.actual.value,nueva:f.elements.nueva.value});f.reset();updateDirty();message.textContent=data.message;}
      catch(error){message.textContent=error.message;}finally{state(false);}
    });
    window.addEventListener('beforeunload',(e)=>{if(dirty){e.preventDefault();e.returnValue='';}});
    window.addEventListener('transport:logout',()=>{dirty=false;dialog.close();form.reset();$('personalPasswordForm').reset();});
    window.addEventListener('transport:profile-updated', (e) => { if(e.detail!==user) sync(e.detail); });
    window.PersonalProfile = { setSession(value) { if(value.id===user.id) sync({...user,...value}); } };
  }
  initialize().catch(()=>{});
})();
