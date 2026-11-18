const crypto = require('crypto');
function ordered(value) {
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(ordered).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='version').sort().map(k=>[k,ordered(value[k])]));
  return value;
}
const version=value=>crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
function check(value,expected) {
  if(typeof expected!=='string'||expected!==version(value))throw Object.assign(new Error('El registro cambió o falta su versión. Actualiza la ficha antes de guardar.'),{status:409});
}
module.exports={version,check};
