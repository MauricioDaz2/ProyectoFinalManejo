(() => {
  'use strict';
  const account=document.getElementById('publicAccount');
  const status=document.getElementById('publicSessionStatus');
  const guest=document.querySelectorAll('a[href="../auth/login.html"]');
  let busy=false;
  function render(user) {
    guest.forEach(node=>{node.hidden=!!user;});
    account.hidden=!user;
    const passenger=['R005','R004','R006'].includes(user?.rolId);
    document.querySelector('.header-buy').hidden=!!user && !passenger;
    document.getElementById('publicTicketsLink').hidden=!user || !['R004','R006'].includes(user.rolId);
    if(!user)return;
    document.getElementById('publicUserName').textContent=user.nombre || user.id;
    document.getElementById('publicUserRole').textContent=user.rol || user.rolId;
    const link=document.getElementById('publicPanelLink');
    link.href=user.rolId==='R005'?'../usuario/mis_boletos.html':window.TransportSession.panelFor(user.rolId);
    link.textContent=user.rolId==='R005'?'Mis boletos':['R004','R006'].includes(user.rolId)?'Volver a mi trabajo':'Ir a mi panel';
    window.PersonalProfile?.setSession(user);
  }
  async function refresh() {
    if(busy)return; busy=true;
    try {
      const response=await fetch(`${window.API_BASE_URL}/auth/me`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(response.status===401) { render(null); status.textContent=''; return; }
      const data=await response.json();
      if(!response.ok || !data.usuario || !window.TransportSession.panelFor(data.usuario.rolId))throw new Error();
      render(data.usuario); status.textContent='';
    } catch { render(null); status.textContent='No se pudo comprobar la sesión. Puedes seguir explorando los viajes.'; }
    finally {busy=false;}
  }
  window.addEventListener('pageshow',refresh);
  window.addEventListener('transport:logout',()=>render(null));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  refresh();
})();
