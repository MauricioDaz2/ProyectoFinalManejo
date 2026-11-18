(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const api = window.API_BASE_URL;
  const fields = ['nombre', 'descripcion', 'mision', 'telefono', 'direccion', 'correo', 'principal', 'secundario'];
  const labels = { logo: 'Logotipo', portada: 'Portada', galeria: 'Fotografía' };
  let revision = 0, images = [], chosen = { logo: null, portada: null, galeria: [] }, available = false, busy = false, dirty = false, authenticated = false;
  const files = {}, previews = {};
  const message = (text, fail = false) => { $('editorStatus').textContent = text; $('editorStatus').classList.toggle('error', fail); };
  function state() {
    for (const id of ['saveDraft', 'previewProfile', 'publishProfile']) $(id).disabled = !available || busy;
    $('reloadProfile').disabled = busy;
    $('editorFields').disabled = busy || !authenticated;
    document.querySelectorAll('[data-send]').forEach((button) => { button.disabled = !available || busy || !files[button.dataset.send]; });
  }
  function changed() { dirty = true; $('saveState').textContent = 'Cambios sin guardar'; }
  async function request(path, method = 'GET', body) {
    const form = body instanceof FormData;
    const response = await fetch(`${api}/coop/perfil${path}`, { method, headers: form ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'No se pudo completar la operación.'), { status: response.status, code: data.code });
    return data;
  }
  const imageUrl = (id) => `${api}/coop/perfil/imagenes/${encodeURIComponent(id)}`;
  function imageElement(id) { const img = new Image(); img.src = imageUrl(id); img.alt = ''; img.loading = 'lazy'; return img; }
  function renderImages() {
    $('selectedImages').replaceChildren();
    for (const [id, type] of [[chosen.logo, 'logo'], [chosen.portada, 'portada'], ...chosen.galeria.map((id) => [id, 'galeria'])]) {
      if (!id) continue;
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.mediaType = type;
      button.append(imageElement(id), document.createTextNode(`${labels[type]} · Quitar ×`));
      button.addEventListener('click', () => { if (type === 'galeria') chosen.galeria = chosen.galeria.filter((item) => item !== id); else chosen[type] = null; changed(); renderImages(); });
      $('selectedImages').append(button);
    }
    if (!$('selectedImages').children.length) $('selectedImages').textContent = 'Sin imágenes elegidas. Se usarán los espacios neutros o el logotipo administrativo existente.';
    $('imageLibrary').replaceChildren();
    for (const image of images) {
      const card = document.createElement('article'); card.className = 'library-image';
      card.dataset.mediaType = image.TIPO;
      const info = document.createElement('p'); info.textContent = `${labels[image.TIPO]} · ${image.ANCHO} × ${image.ALTO} px`;
      const use = document.createElement('button'); use.type = 'button'; use.textContent = 'Usar en el borrador';
      use.addEventListener('click', () => {
        const id = image.ID_IMG.toLowerCase();
        if (image.TIPO === 'galeria') {
          if (!chosen.galeria.includes(id)) {
            if (chosen.galeria.length >= 6) return message('La galería admite hasta seis fotografías.', true);
            chosen.galeria.push(id);
          }
        } else chosen[image.TIPO] = id;
        changed(); renderImages();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-image'; remove.textContent = 'Eliminar archivo';
      remove.addEventListener('click', () => task(async () => {
        if ([chosen.logo, chosen.portada, ...chosen.galeria].includes(image.ID_IMG.toLowerCase())) throw new Error('Quita la imagen del borrador y guarda antes de eliminar su archivo.');
        const result = await request(`/imagenes/${image.ID_IMG}`, 'DELETE');
        images = images.filter((row) => row.ID_IMG !== image.ID_IMG); renderImages(); message(result.message);
      }));
      card.append(imageElement(image.ID_IMG), info, use, remove); $('imageLibrary').append(card);
    }
    if (!images.length) $('imageLibrary').textContent = available ? 'Aún no has subido imágenes.' : 'Disponible después de instalar la migración.';
  }
  function content() {
    return { ...Object.fromEntries(fields.map((key) => [key, $(key).value])), ...chosen, servicios: $('servicios').value.split('\n').map((line) => line.trim()).filter(Boolean) };
  }
  async function task(action) {
    if (busy) return;
    busy = true; state();
    try { await action(); }
    catch (err) {
      document.documentElement.classList.add('admin-authorized');
      message(err.message || 'No se pudo conectar con el servidor.', true);
      if (err.status === 401) window.location.replace('../auth/login.html');
      if (err.code === 'MIGRATION_REQUIRED') { available = false; $('persistenceNotice').hidden = false; $('persistenceNotice').textContent = err.message; }
    } finally { busy = false; state(); }
  }
  async function load() {
    available = false;
    authenticated = false;
    const session = await App.api('/auth/me');
    const user = session.usuario;
    if (user?.rolId !== 'R002' || !user.cooperativaActiva || !user.cooperativaId) { window.location.replace('../auth/login.html'); return; }
    authenticated = true;
    document.documentElement.classList.add('admin-authorized');
    $('editorCompany').textContent = user.cooperativaNombre;
    $('editorUser').textContent = user.nombre;
    $('publishedPage').href = `../public/cooperativa.html?${new URLSearchParams({ id: user.cooperativaId })}`;
    $('publishedPage').hidden = false;
    $('nombre').value = user.cooperativaNombre || '';
    const data = await request('');
    available = true; revision = data.revision; images = data.imagenes;
    const value = data.contenido;
    for (const key of fields) $(key).value = value[key];
    $('servicios').value = value.servicios.join('\n');
    chosen = { logo: value.logo, portada: value.portada, galeria: [...value.galeria] };
    for (const type of Object.keys(labels)) {
      delete files[type];
      if (previews[type]) URL.revokeObjectURL(previews[type]);
      delete previews[type];
      document.querySelector(`[data-upload="${type}"]`).value = '';
      $('preview-' + type).textContent = 'Sin archivo seleccionado';
    }
    for (const key of ['principal', 'secundario']) $(`${key}Value`).textContent = $(key).value;
    dirty = false; $('saveState').textContent = revision ? `Borrador guardado · revisión ${revision}` : 'Todavía no hay un borrador guardado';
    $('persistenceNotice').hidden = true; renderImages(); message(data.publicado ? 'Tu página tiene una versión publicada. Puedes preparar cambios en privado.' : 'Prepara tu primera publicación. Los cambios se mantendrán privados hasta publicar.');
  }
  async function save(publish) {
    if (!available) throw new Error('El guardado requiere instalar la migración SQL.');
    if (Object.keys(files).length) throw new Error('Hay imágenes seleccionadas sin subir. Súbelas a la biblioteca privada o cancela su selección antes de guardar.');
    const data = await request(publish ? '/publicar' : '/borrador', publish ? 'POST' : 'PUT', { contenido: content(), revision });
    revision = data.revision; dirty = false; $('saveState').textContent = `${publish ? 'Publicado' : 'Borrador guardado'} · revisión ${revision}`;
    message(data.message);
  }
  $('profileForm').addEventListener('submit', (event) => event.preventDefault());
  $('profileForm').addEventListener('input', changed);
  for (const key of ['principal', 'secundario']) $(key).addEventListener('input', () => { $(`${key}Value`).textContent = $(key).value; });
  for (const input of document.querySelectorAll('[data-upload]')) input.addEventListener('change', () => {
    const type = input.dataset.upload; const file = input.files[0];
    if (previews[type]) URL.revokeObjectURL(previews[type]);
    delete files[type]; $('preview-' + type).textContent = 'Sin archivo seleccionado';
    if (file) {
      if (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { input.value = ''; message('Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.', true); state(); return; }
      files[type] = file; previews[type] = URL.createObjectURL(file);
      const img = new Image(); img.alt = 'Vista previa del archivo seleccionado'; img.src = previews[type]; $('preview-' + type).replaceChildren(img);
      message(available ? 'Vista previa local. Sube la imagen para usarla en el borrador.' : 'Vista previa local. No se ha guardado: falta instalar la migración.');
    }
    state();
  });
  for (const button of document.querySelectorAll('[data-send]')) button.addEventListener('click', () => task(async () => {
    const type = button.dataset.send;
    if (!available || !files[type]) return;
    const data = new FormData(); data.append('imagen', files[type]);
    const result = await request(`/imagenes/${type}`, 'POST', data);
    images.unshift(result.imagen);
    if (type === 'galeria') { if (chosen.galeria.length < 6) chosen.galeria.push(result.imagen.ID_IMG); }
    else chosen[type] = result.imagen.ID_IMG;
    delete files[type]; document.querySelector(`[data-upload="${type}"]`).value = '';
    changed(); renderImages(); message(result.message);
  }));
  $('saveDraft').addEventListener('click', () => { if ($('profileForm').reportValidity()) task(() => save(false)); });
  $('publishProfile').addEventListener('click', () => { if ($('profileForm').reportValidity()) task(() => save(true)); });
  $('previewProfile').addEventListener('click', () => {
    if (!$('profileForm').reportValidity()) return;
    task(async () => { await save(false); $('previewFrame').src = `../public/cooperativa.html?preview=1&v=${revision}`; $('previewSection').hidden = false; $('previewSection').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
  $('closePreview').addEventListener('click', () => { $('previewSection').hidden = true; $('previewFrame').removeAttribute('src'); });
  $('reloadProfile').addEventListener('click', () => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos y recargar?')) task(load); });
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('transport:logout', () => { dirty = false; $('previewFrame').removeAttribute('src'); });
  function closeMenu() { document.body.classList.remove('coop-menu-open'); $('editorBackdrop').hidden = true; $('editorMenu').setAttribute('aria-expanded', 'false'); }
  $('editorMenu').addEventListener('click', () => { const open = document.body.classList.toggle('coop-menu-open'); $('editorBackdrop').hidden = !open; $('editorMenu').setAttribute('aria-expanded', String(open)); });
  $('editorBackdrop').addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  task(load);
})();
