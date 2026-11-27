(() => {
  'use strict';
  function apply(user) {
    if (!['R002', 'R003'].includes(user?.rolId)) return;
    const isOficinista = user.rolId === 'R003';
    if (isOficinista && document.body.hasAttribute('data-coop-operaciones')) return;
    const allowed = (permission) => {
      if (isOficinista) return ['rutas', 'salidas', 'ventanilla'].includes(permission);
      if (permission === 'ventanilla') {
        return user.accesoConfigurado !== true
          ? true
          : Boolean(user.principal || user.permisos?.some((p) => ['ventanilla', 'salidas', 'rutas'].includes(p)));
      }
      return user.accesoConfigurado !== true ? permission !== 'trabajadores' : Boolean(user.principal || user.permisos?.includes(permission));
    };
    for (const permission of ['buses','rutas','ventanilla']) document.body.classList.toggle(`coop-denied-${permission}`, !allowed(permission));
    document.querySelectorAll('[data-coop-permission]').forEach((node) => { node.hidden = !allowed(node.dataset.coopPermission); });
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (isOficinista && href.includes('dashboard_coop.html')) {
        link.hidden = true;
        link.toggleAttribute('data-access-hidden', true);
        return;
      }
      const permission = href.includes('personal.html') ? 'trabajadores'
        : href.includes('personalizar.html') ? 'personalizacion'
        : href.includes('gestion_buses.html') ? 'buses'
        : href.includes('resoluciones_ant.html') ? 'rutas'
        : (href.includes('ventanilla_boletos.html') || href.includes('validacion_reservas.html')) ? 'ventanilla'
        : null;
      if (permission && !link.classList.contains('coop-metric')) {
        link.hidden = !allowed(permission);
        link.toggleAttribute('data-access-hidden', !allowed(permission));
      }
    });
    for(const [selector,permission] of [['#btnNuevaFrecuencia','rutas'],['#panelFrecuencias','rutas']])document.querySelectorAll(selector).forEach((node)=>{if(!allowed(permission))node.hidden=true;});
  }
  window.CoopAccess={apply};
  window.addEventListener('transport:profile-updated',(e)=>apply(e.detail));
  fetch(`${window.API_BASE_URL}/auth/me`,{cache:'no-store'}).then((r)=>r.json()).then((data)=>apply(data.usuario)).catch(()=>{});
})();
