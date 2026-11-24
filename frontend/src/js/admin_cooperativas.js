(() => {
  'use strict';

  const API_URL = 'http://localhost:3000/api/admin/cooperativas';

  const estado = {
    cooperativas: [],
    idEnEdicion: null,
    busqueda: '',
    filtro: 'todos',
    cargando: false,
    guardando: false,
    cambiandoEstado: false,
    registroDisponible: false,
    consultaFallida: false,
    inicializado: false
  };

  const $ = (id) => document.getElementById(id);
  const tabla = $('tablaCooperativas');
  const dialogo = $('modalCooperativa');
  const formulario = $('formCooperativa');
  let permissions={},principalForm;
  const pending=window.CompanyAccounts.track(dialogo,recogerDatos,()=>estado.guardando);
  const notificacion = $('notificacionCooperativa');
  let temporizadorNotificacion;

  function normalizar(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function mostrarNotificacion(mensaje, error = false) {
    notificacion.textContent = mensaje;
    notificacion.classList.toggle('is-error', error);
    notificacion.hidden = false;
    clearTimeout(temporizadorNotificacion);
    temporizadorNotificacion = setTimeout(() => { notificacion.hidden = true; }, 5000);
  }

  function actualizarAviso(mensaje, error = false) {
    $('mensajeConexion').textContent = mensaje;
    $('avisoCooperativas').classList.toggle('is-error', error);
  }

  async function solicitar(ruta = '', metodo = 'GET', cuerpo) {
    const opciones = {
      method: metodo,
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    };

    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
      respuesta = await fetch(`${API_URL}${ruta}`, opciones);
    } catch {
      throw new Error('No se pudo conectar al servidor. Verifica que Node.js esté en ejecución.');
    }

    let datos;
    try {
      datos = await respuesta.json();
    } catch {
      throw new Error('El servidor devolvió una respuesta que no se pudo interpretar.');
    }

    if (!respuesta.ok || datos.success !== true) {
      throw Object.assign(new Error(datos.message || `Error al procesar la solicitud (${respuesta.status}).`), { fields:datos.fields,dependencias:datos.dependencias });
    }

    return datos;
  }

  function contarRegistros() {
    if(estado.consultaFallida || !estado.inicializado) { for(const id of ['totalCooperativas','cooperativasActivas','cooperativasInactivas','cooperativasSuspendidas'])$(id).textContent='No disponible'; return; }
    $('totalCooperativas').textContent = estado.cooperativas.length;
    $('cooperativasActivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '1').length;
    $('cooperativasSuspendidas').textContent=estado.cooperativas.filter(c=>c.EST_COP==='S').length;
    $('cooperativasInactivas').textContent = estado.cooperativas.filter((c) => c.EST_COP === '0').length;
  }

  function celda(texto) {
    const td = document.createElement('td');
    td.textContent = texto ?? '';
    return td;
  }

  // RFC-000085: límite de frecuencias destacadas contratadas (sin pasarela de pago en la app).
  function celdaDestacadas(cooperativa) {
    const td = document.createElement('td');
    const form = document.createElement('form');
    form.className = 'featured-limit';
    form.dataset.featured = cooperativa.ID_COP;
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = '50'; input.step = '1'; input.required = true;
    input.value = String(cooperativa.LIM_DES_COP);
    input.setAttribute('aria-label', 'Límite de frecuencias destacadas de ' + (cooperativa.NOM_COM_COP || cooperativa.NOM_COP));
    const usadas = document.createElement('small');
    usadas.textContent = `${Number(cooperativa.DES_USADAS) || 0} en uso`;
    const boton = document.createElement('button');
    boton.type = 'submit'; boton.className = 'coop-button coop-button-secondary'; boton.textContent = 'Guardar';
    form.append(input, boton, usadas);
    return td.appendChild(form) && td;
  }

  async function guardarLimiteDestacadas(form) {
    const input = form.querySelector('input');
    const boton = form.querySelector('button');
    boton.disabled = true;
    try {
      const datos = await solicitar(`/${encodeURIComponent(form.dataset.featured)}/destacadas`, 'PUT', { limite: input.value });
      const cooperativa = estado.cooperativas.find((c) => c.ID_COP === form.dataset.featured);
      if (cooperativa) { cooperativa.LIM_DES_COP = datos.limite; cooperativa.DES_USADAS = datos.usadas; }
      form.querySelector('small').textContent = `${datos.usadas} en uso`;
      mostrarNotificacion(datos.message);
    } catch (error) {
      mostrarNotificacion(error.message, true);
    } finally {
      boton.disabled = false;
    }
  }

  function crearFila(cooperativa) {
    const fila = document.createElement('tr');
    fila.className='company-row';fila.tabIndex=0;fila.dataset.company=cooperativa.ID_COP;fila.setAttribute('aria-label','Abrir ficha de '+(cooperativa.NOM_COM_COP||cooperativa.NOM_COP));
    fila.append(celda(cooperativa.ID_COP));

    const nombre = document.createElement('td');
    const contenidoNombre = document.createElement('div');
    contenidoNombre.className = 'coop-name-cell';
    const inicial = document.createElement('span');
    inicial.className = 'coop-avatar';
    inicial.textContent = cooperativa.NOM_COP.slice(0, 1).toUpperCase();
    const etiquetaNombre = document.createElement('a');
    etiquetaNombre.className='company-name-link';etiquetaNombre.href='#cooperativa='+encodeURIComponent(cooperativa.ID_COP);
    etiquetaNombre.textContent = cooperativa.NOM_COM_COP || cooperativa.NOM_COP;
    contenidoNombre.append(inicial, etiquetaNombre);
    nombre.append(contenidoNombre);
    fila.append(nombre);

    fila.append(celda(cooperativa.RUC_COP));
    fila.append(celda(cooperativa.CIUDAD_COP || 'Sin registrar'));
    fila.append(celda(cooperativa.RESPONSABLE || 'Sin asignar'));

    const estadoCelda = document.createElement('td');
    const insignia = document.createElement('span');
    insignia.className = `coop-badge ${cooperativa.EST_COP === '1' ? 'coop-badge-active' : 'coop-badge-inactive'}`;
    insignia.textContent = ({1:'Activa',0:'Inactiva',S:'Suspendida'})[cooperativa.EST_COP] || 'No disponible';
    estadoCelda.append(insignia);
    fila.append(estadoCelda);
    if (cooperativa.LIM_DES_COP !== undefined && cooperativa.LIM_DES_COP !== null) fila.append(celdaDestacadas(cooperativa));

    return fila;
  }

  function renderizarTabla() {
    contarRegistros();

    const filtradas = estado.cooperativas.filter((cooperativa) => {
      const coincideEstado = estado.filtro === 'todos' || cooperativa.EST_COP === estado.filtro;
      const texto = normalizar(`${cooperativa.ID_COP} ${cooperativa.NOM_COP} ${cooperativa.NOM_COM_COP||''} ${cooperativa.RUC_COP} ${cooperativa.CIUDAD_COP || ''} ${cooperativa.RESPONSABLE || ''}`);
      return coincideEstado && texto.includes(estado.busqueda);
    });

    tabla.replaceChildren(...filtradas.map(crearFila));
    $('estadoVacio').hidden = filtradas.length > 0;

    if (estado.cargando && !estado.inicializado) {
      $('tituloEstadoVacio').textContent = 'Cargando cooperativas';
      $('textoEstadoVacio').textContent = 'Consultando los registros del sistema...';
    } else if (!estado.inicializado) {
      $('tituloEstadoVacio').textContent = 'No se pudieron cargar las cooperativas';
      $('textoEstadoVacio').textContent = 'Revisa la conexión y presiona «Actualizar» para intentar nuevamente.';
    } else if (estado.cooperativas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Todavía no hay cooperativas';
      $('textoEstadoVacio').textContent = 'Utiliza «Nueva cooperativa» para registrar una empresa de transporte.';
    } else if (filtradas.length === 0) {
      $('tituloEstadoVacio').textContent = 'Sin resultados';
      $('textoEstadoVacio').textContent = 'No encontramos registros con esos filtros. Prueba otra búsqueda.';
    }

    $('contadorResultados').textContent = `${filtradas.length} de ${estado.cooperativas.length} cooperativas`;
  }

  async function cargarCooperativas() {
    if (estado.cargando) return false;
    estado.cargando = true;
    $('btnActualizarCooperativas').disabled = true;
    $('btnActualizarCooperativas').textContent = 'Actualizando...';
    actualizarAviso('Consultando las cooperativas registradas...');
    renderizarTabla();

    try {
      const datos = await solicitar();
      if (!Array.isArray(datos.cooperativas)) {
        throw new Error('El servidor no devolvió un listado válido de cooperativas.');
      }
      estado.cooperativas = datos.cooperativas;
      const thDestacadas = document.getElementById('thDestacadas');
      if (thDestacadas) thDestacadas.hidden = !datos.cooperativas.some((c) => c.LIM_DES_COP !== undefined && c.LIM_DES_COP !== null);
      estado.registroDisponible=datos.registroDisponible===true;
      permissions=datos.permisos||{};
      $('suspendedMetric').hidden=!datos.estadosDisponibles; $('suspendedFilter').hidden=!datos.estadosDisponibles;
      estado.consultaFallida=false;
      estado.inicializado = true;
      actualizarAviso('Información sincronizada con SQL Server. Puedes administrar las cooperativas registradas.');
      return true;
    } catch (error) {
      estado.consultaFallida=true;
      actualizarAviso(error.message, true);
      mostrarNotificacion(error.message, true);
      return false;
    } finally {
      estado.cargando = false;
      $('btnActualizarCooperativas').disabled = false;
      $('btnActualizarCooperativas').textContent = 'Actualizar';
      renderizarTabla();
    }
  }

  function abrirFormulario(cooperativa = null) {
    if (estado.guardando || estado.cambiandoEstado) return;
    formulario.reset();
    $('errorFormulario').hidden = true;
    estado.idEnEdicion = cooperativa?.ID_COP || null;
    const editar = Boolean(cooperativa);
    $('tituloModal').textContent = editar ? 'Editar cooperativa' : 'Nueva cooperativa';
    $('btnGuardarCooperativa').textContent = editar ? 'Guardar cambios' : 'Crear cooperativa y responsables';
    $('idCop').value=cooperativa?.ID_COP || 'Se genera al guardar';
    estado.version=cooperativa?.version;
    $('initialPrincipal').replaceChildren();$('initialManagers').replaceChildren();
    if(!editar)principalForm=window.CompanyAccounts.card($('initialPrincipal'),{prefix:'responsable.',principal:true,permissions});
    $('estadoCop').closest('label').hidden=editar;
    formulario.querySelector('[data-step-label="2"]').hidden=editar;
    $('registroAvailability').textContent=estado.registroDisponible?'':'El guardado ampliado requiere aprobar y aplicar la migración 007. Puedes revisar el formulario; no se guardarán cambios.';
    clearErrors(); showStep(0); summary();

    if (editar) {
      for (const [campo, valor] of Object.entries(cooperativa)) {
        const input = formulario.elements.namedItem(campo);
        if (input) input.value = valor ?? '';
      }
    } else {
      $('estadoCop').value = '1';
    }

    pending.start();
    dialogo.showModal();
    $('NOM_COP').focus();
  }

  function cerrarFormulario() {
    if (estado.guardando) return;
    pending.close();
  }

  let step=0;
  const companyFields=['NOM_COP','NOM_COM_COP','RUC_COP','TIP_ORG_COP','EST_COP','PROVINCIA_COP','CIUDAD_COP','DIR_COP','TEL_COP','COR_INS_COP','SIT_WEB_COP'];
  function recogerDatos() {
    const data=Object.fromEntries(companyFields.map(key=>[key,formulario.elements.namedItem(key).value.trim()]));
    if(estado.idEnEdicion)data.version=estado.version;
    else {data.responsable=principalForm.read();data.gestores=[...$('initialManagers').children].map(n=>n.readAccount());}
    return data;
  }
  function clearErrors() {
    formulario.querySelectorAll('[data-field-error]').forEach(node=>{node.textContent='';});
    formulario.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));
  }
  function showStep(value) {
    step=value;
    formulario.querySelectorAll('[data-step]').forEach(node=>{node.hidden=Number(node.dataset.step)!==step;});
    formulario.querySelectorAll('[data-step-label]').forEach(node=>{if(Number(node.dataset.stepLabel)===step)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
    $('companyPrevious').hidden=step===0; $('companyNext').hidden=step===(estado.idEnEdicion?1:2); $('btnGuardarCooperativa').hidden=step!==(estado.idEnEdicion?1:2);
  }
  function fieldErrors(errors,onlyCurrent=false) {
    clearErrors(); let first;
    for(const [key,message] of Object.entries(errors)) {
      const error=formulario.querySelector('[data-field-error="'+key+'"]');
      const section=error?.closest('[data-step]');
      if(!error || (onlyCurrent && Number(section.dataset.step)!==step))continue;
      error.textContent=message; const input=[...formulario.querySelectorAll('[data-field-key]')].find(n=>n.dataset.fieldKey===key)||formulario.elements.namedItem(key) || $(key);
      input?.setAttribute('aria-invalid','true'); first ||= {input,step:Number(section.dataset.step)};
    }
    if(first) {showStep(first.step);first.input?.focus();return false;}return true;
  }
  function summary() {
    const managers=[...$('initialManagers').children];
    managers.forEach((node,i)=>node.querySelectorAll('[data-field-key],[data-field-error]').forEach(n=>{if(n.dataset.fieldKey)n.dataset.fieldKey=n.dataset.fieldKey.replace(/^gestores.\d+/, 'gestores.'+i);if(n.dataset.fieldError)n.dataset.fieldError=n.dataset.fieldError.replace(/^gestores.\d+/, 'gestores.'+i);}));
    $('initialAccountsSummary').replaceChildren();
    if(estado.idEnEdicion)return;
    for(const [index,person]of [principalForm?.read(),...managers.map(n=>n.readAccount())].entries()) {
      if(!person)continue;const p=document.createElement('p');p.textContent=[(person.NOM_USU+' '+person.APE_USU).trim()||'Datos pendientes',person.COR_USU||'Correo pendiente',index?'Gestor adicional':'Principal',index?(person.permisos.map(k=>permissions[k]).join(', ')||'Sin permisos delegados'):'Acceso principal'].join(' · ');$('initialAccountsSummary').append(p);
    }
    $('addInitialManager').disabled=managers.length>=10;
  }
  function validation(data) {
    const errors=window.EcuadorValidation.validate({...data,EST_COP:estado.idEnEdicion?'1':data.EST_COP,responsable:undefined});
    if(!estado.idEnEdicion) {
      const ids=new Set(),emails=new Set();
      for(const [i,p]of [data.responsable,...data.gestores].entries()) {
        const prefix=i?'gestores.'+(i-1):'responsable';
        Object.assign(errors,Object.fromEntries(Object.entries(window.EcuadorValidation.person(p)).map(([k,v])=>[prefix+'.'+k,v])));
        if(ids.has(p.ID_USU.trim().toUpperCase()))errors[prefix+'.ID_USU']='Identificaci\u00f3n repetida.';
        if(emails.has(p.COR_USU.trim().toLowerCase()))errors[prefix+'.COR_USU']='Correo repetido.';
        ids.add(p.ID_USU.trim().toUpperCase());emails.add(p.COR_USU.trim().toLowerCase());
      }
    }return errors;
  }
  $('addInitialManager').addEventListener('click',()=>{if($('initialManagers').children.length>=10)return;const card=window.CompanyAccounts.card($('initialManagers'),{prefix:'gestores.'+$('initialManagers').children.length+'.',permissions,removable:true});summary();card.focus();});
  formulario.addEventListener('input',summary);
  $('companyPrevious').addEventListener('click',()=>{if(!estado.guardando)showStep(Math.max(0,step-1));});
  $('companyNext').addEventListener('click',()=>{if(!estado.guardando && fieldErrors(validation(recogerDatos()),true))showStep(Math.min(2,step+1));});
  function mostrarErrorFormulario(mensaje) {
    $('errorFormulario').textContent = mensaje;
    $('errorFormulario').hidden = false;
  }

  function cambiarGuardando(guardando) {
    estado.guardando = guardando;
    formulario.querySelectorAll('input,select,button').forEach(input=>{input.disabled=guardando;});
    $('estadoCop').disabled=true;
    if(!guardando)$('addInitialManager').disabled=$('initialManagers').children.length>=10;
    $('btnGuardarCooperativa').disabled = guardando;
    $('btnCancelarModal').disabled = guardando;
    $('btnCerrarModal').disabled = guardando;
    $('companyPrevious').disabled=guardando; $('companyNext').disabled=guardando;
    $('btnGuardarCooperativa').textContent = guardando
      ? 'Guardando...'
      : estado.idEnEdicion ? 'Guardar cambios' : 'Crear cooperativa y responsables';
  }

  $('btnNuevaCooperativa').addEventListener('click', () => abrirFormulario());
  $('btnActualizarCooperativas').addEventListener('click', cargarCooperativas);
  $('btnCerrarModal').addEventListener('click', cerrarFormulario);
  $('btnCancelarModal').addEventListener('click', cerrarFormulario);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) cerrarFormulario();
  });
  dialogo.addEventListener('cancel', (evento) => {
    evento.preventDefault();cerrarFormulario();
  });
  dialogo.addEventListener('close', () => { estado.idEnEdicion = null; formulario.reset(); });

  $('buscarCooperativa').addEventListener('input', (evento) => {
    estado.busqueda = normalizar(evento.target.value);
    renderizarTabla();
  });
  $('filtrarEstado').addEventListener('change', (evento) => {
    estado.filtro = evento.target.value;
    renderizarTabla();
  });

  tabla.addEventListener('submit',event=>{const form=event.target.closest('form[data-featured]');if(form){event.preventDefault();guardarLimiteDestacadas(form);}});
  tabla.addEventListener('click',event=>{const row=event.target.closest('[data-company]');if(row&&!event.target.closest('a')&&!event.target.closest('.featured-limit'))location.hash='cooperativa='+encodeURIComponent(row.dataset.company);});
  tabla.addEventListener('keydown',event=>{if(event.target.matches('[data-company]')&&['Enter',' '].includes(event.key)){event.preventDefault();location.hash='cooperativa='+encodeURIComponent(event.target.dataset.company);}});
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (estado.guardando) return;
    if(step<(estado.idEnEdicion?1:2)) { $('companyNext').click(); return; }

    const datos = recogerDatos();
    if(!fieldErrors(validation(datos)))return;
    if(!estado.registroDisponible) {mostrarErrorFormulario('Pendiente de aplicar la migración 007. No se guardaron cambios.');return;}
    $('errorFormulario').hidden = true;
    const idEnEdicion = estado.idEnEdicion;
    cambiarGuardando(true);

    try {
      const respuesta = await solicitar(
        idEnEdicion ? `/${encodeURIComponent(idEnEdicion)}` : '',
        idEnEdicion ? 'PUT' : 'POST',
        datos
      );
      cambiarGuardando(false);
      pending.clear();
      cerrarFormulario();
      const actualizado = await cargarCooperativas();
      if (actualizado) mostrarNotificacion(respuesta.message || 'Cooperativa guardada correctamente.');
      window.dispatchEvent(new CustomEvent('company:saved',{detail:{id:respuesta.cooperativa.ID_COP}}));
    } catch (error) {
      if(error.fields)fieldErrors(error.fields);
      mostrarErrorFormulario(error.message);
      cambiarGuardando(false);
    }
  });

  window.CompanyModule={request:solicitar,reload:cargarCooperativas,notify:mostrarNotificacion,pending,edit:(row,available)=>{estado.registroDisponible=available;abrirFormulario(row);}};
  cargarCooperativas();
})();
