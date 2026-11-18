(() => {
 'use strict';
 const $=id=>document.getElementById(id);let loading=false,loaded=false;
 async function request(path,body){const r=await fetch(window.API_BASE_URL+path,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok||!data.success)throw Error(data.message||'No se pudo consultar la programación.');return data;}
 function options(id,rows,value,label){const select=$(id);select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=rows.length?'Selecciona una opción':'No hay registros disponibles';select.append(first);for(const row of rows){const option=document.createElement('option');option.value=row[value];option.textContent=label(row);select.append(option);}}
 async function load(){if(loading||loaded||!$('coopAssignment').open)return;loading=true;$('assignmentSubmit').disabled=true;
  try{const data=await request('/operacion/asignaciones/opciones');options('assignmentBus',data.buses,'ID_BUS',r=>r.NUM_BUS+' · '+r.PLA_BUS);options('assignmentRoute',data.frecuencias,'ID_FRE',r=>r.CIU_ORI_FRE+' → '+r.CIU_DES_FRE);for(const [id,role]of [['assignmentDriver','R006'],['assignmentController','R004']])options(id,data.personal.filter(p=>p.ID_ROL_PER===role),'ID_USU',r=>r.NOM_USU+' '+r.APE_USU);loaded=true;$('assignmentStatus').textContent='Horarios en Ecuador continental (UTC−5).';}
  catch(e){$('assignmentStatus').textContent=e.message;}finally{loading=false;$('assignmentSubmit').disabled=!loaded;}
 }
 $('coopAssignment').addEventListener('toggle',load);
 $('assignmentForm').addEventListener('submit',async e=>{e.preventDefault();if(loading||!loaded)return;loading=true;$('assignmentSubmit').disabled=true;
  try{const body={idBus:$('assignmentBus').value,idFre:$('assignmentRoute').value,idUsuCho:$('assignmentDriver').value,idUsuCon:$('assignmentController').value,salida:new Date($('assignmentStart').value+':00-05:00').toISOString(),llegada:new Date($('assignmentEnd').value+':00-05:00').toISOString()};const data=await request('/coop/hojas-ruta',body);$('assignmentStatus').textContent=data.message+' Código: '+data.idHoja;$('assignmentForm').reset();}
  catch(e){$('assignmentStatus').textContent=e.message;}finally{loading=false;$('assignmentSubmit').disabled=false;}
 });
 request('/auth/me').then(({usuario})=>{$('coopAssignment').hidden=usuario.rolId!=='R002'||!(usuario.principal||usuario.permisos?.includes('rutas'));}).catch(()=>{});
})();
