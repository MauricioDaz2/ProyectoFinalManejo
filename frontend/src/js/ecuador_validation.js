(function(root, factory) {
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api; else root.EcuadorValidation=api;
})(typeof globalThis==='object'?globalThis:this,function() {
  'use strict';
  const clean=value=>typeof value==='string'?value.trim():'';
  function cedula(value) {
    if(!/^\d{10}$/.test(value))return false;
    const province=Number(value.slice(0,2));
    if(!((province>=1 && province<=24)||province===30) || Number(value[2])>=6)return false;
    const sum=[...value.slice(0,9)].reduce((total,digit,i)=>{let n=Number(digit)*(i%2?1:2);return total+(n>9?n-9:n);},0);
    return (10-sum%10)%10===Number(value[9]);
  }
  function phone(value) { return clean(value).replace(/[\s()-]/g,'').replace(/^\+593/,'0'); }
  function validate(data) {
    const errors={};
    const lengths={NOM_COP:120,NOM_COM_COP:120,TIP_ORG_COP:50,PROVINCIA_COP:60,CIUDAD_COP:80,DIR_COP:240,COR_INS_COP:120,SIT_WEB_COP:500};
    const required=['NOM_COP','RUC_COP','PROVINCIA_COP','CIUDAD_COP','DIR_COP','TEL_COP','COR_INS_COP'];
    for(const key of required)if(!clean(data[key]))errors[key]='Este campo es obligatorio.';
    for(const [key,max] of Object.entries(lengths))if(clean(data[key]).length>max)errors[key]=`Máximo ${max} caracteres.`;
    if(!/^\d{13}$/.test(clean(data.RUC_COP)))errors.RUC_COP='Ingresa exactamente 13 dígitos; conserva los ceros iniciales.';
    if(!/^(09\d{8}|0[2-7]\d{7})$/.test(phone(data.TEL_COP)))errors.TEL_COP='Usa un fijo de 9 dígitos o un celular 09 de 10 dígitos; también se admite +593.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(data.COR_INS_COP)))errors.COR_INS_COP='Ingresa un correo institucional válido.';
    if(!['0','1'].includes(data.EST_COP))errors.EST_COP='Selecciona un estado válido.';
    if(clean(data.SIT_WEB_COP))try { if(!['https:','http:'].includes(new URL(data.SIT_WEB_COP).protocol))throw Error(); }catch {errors.SIT_WEB_COP='Usa una dirección http:// o https:// válida.';}
    const r=data.responsable;
    if(r?.modo==='nuevo')Object.assign(errors,person(r));
    if(r?.modo==='existente'&&!/^[a-z0-9]{5,10}$/i.test(clean(r.ID_USU)))errors.existingId='Selecciona una cuenta R002 elegible.';
    if(r && !['nuevo','existente','despues'].includes(r.modo))errors.responsableModo='Selecciona una opción válida.';
    if(r && r.modo!=='despues' && data.EST_COP!=='1')errors.EST_COP='Activa la cooperativa para asignar un responsable; también puedes asignarlo después.';
    return errors;
  }
  function person(r, creating=true) {
    const errors={};
      if(r.tipoDocumento==='cedula' ? !cedula(clean(r.ID_USU)) : r.tipoDocumento!=='extranjero'||!/^[a-z0-9]{5,10}$/i.test(clean(r.ID_USU)))errors.ID_USU=r.tipoDocumento==='cedula'?'La cédula ecuatoriana no supera la validación local.':'Documento extranjero: entre 5 y 10 letras o números.';
      for(const key of ['NOM_USU','APE_USU'])if(!clean(r[key])||clean(r[key]).length>15)errors[key]='Obligatorio; máximo 15 caracteres según la base actual.';
      if(clean(r.COR_USU).length>40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(r.COR_USU)))errors.COR_USU='Correo de acceso válido, máximo 40 caracteres.';
      if(!/^(09\d{8}|0[2-7]\d{7})$/.test(phone(r.TEL_USU)))errors.TEL_USU='Ingresa un teléfono fijo o móvil ecuatoriano válido.';
      if(creating && (typeof r.password!=='string'||r.password.length<8||new TextEncoder().encode(r.password).length>72))errors.password='Usa una clave inicial propia de 8 caracteres como mínimo y hasta 72 bytes.';
    if(!creating)delete errors.ID_USU;
    return errors;
  }
  return {clean,cedula,phone,validate,person};
});
