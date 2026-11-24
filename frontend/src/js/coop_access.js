(() => {
  'use strict';
  function apply(user) {
    if (user?.rolId !== 'R002') return;
    const allowed = (permission) => user.accesoConfigurado !== true ? permission !== 'trabajadores' : user.principal || user.permisos?.includes(permission);
    for (const permission of ['buses','rutas']) document.body.classList.toggle(`coop-denied-${permission}`, !allowed(permission));
    document.querySelectorAll('[data-coop-permission]').forEach((node) => { node.hidden = !allowed(node.dataset.coopPermission); });
    document.querySelectorAll('a[href]').forEach((link) => {
      const href=link.getAttribute('href');
      const permission=href.includes('personal.html')?'trabajadores':href.includes('personalizar.html')?'personalizacion':href.includes('gestion_buses.html')?'buses':href.includes('resoluciones_ant.html')?'rutas':null;
      if(permission && !link.classList.contains('coop-metric')) { link.hidden=!allowed(permission); link.toggleAttribute('data-access-hidden', !allowed(permission)); }
    });
    for(const [selector,permission] of [['#btnNuevaFrecuencia','rutas'],['#panelFrecuencias','rutas']])document.querySelectorAll(selector).forEach((node)=>{if(!allowed(permission))node.hidden=true;});
  }
  window.CoopAccess={apply};
  window.addEventListener('transport:profile-updated',(e)=>apply(e.detail));
  fetch(`${window.API_BASE_URL}/auth/me`,{cache:'no-store'}).then((r)=>r.json()).then((data)=>apply(data.usuario)).catch(()=>{});
})();
