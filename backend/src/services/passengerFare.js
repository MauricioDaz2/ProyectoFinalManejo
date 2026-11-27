const eligible = new Set(['NINO','MENOR_50','MENOR_EDAD','ADULTO_MAYOR','TERCERA_EDAD','TERCERA_EDAD_50','DISCAPACIDAD','DISCAPACIDAD_50']);
function invalid(message) { throw Object.assign(new Error(message), {status:422}); }
function quote(base, seatType, category='ADULTO', vipPercent=Number(process.env.VIP_SURCHARGE_PERCENT || 0)) {
    const cents = Math.round(Number(base)*100);
    if (!Number.isSafeInteger(cents) || cents <= 0) invalid('La frecuencia no tiene tarifa base válida.');
    if (!['TIP01','TIP02','TIP03'].includes(seatType)) invalid('Tipo de asiento sin tarifa configurada.');
    if (!['ADULTO','NORMAL'].includes(category) && !eligible.has(category)) invalid('Categoría de pasajero no válida.');
    if (!Number.isInteger(vipPercent) || vipPercent < 0 || vipPercent > 100) invalid('Recargo VIP no válido.');
    const extra = seatType === 'TIP02' ? Math.round(cents * vipPercent / 100) : 0;
    const total = Math.round((cents+extra)*(eligible.has(category)?0.5:1));
    return {base:cents/100, surcharge:extra/100, discount:(cents+extra-total)/100, total:total/100};
}
function confirmQuote(expected, total) {
    if (expected != null && Number(expected) !== total) throw Object.assign(new Error('La tarifa actual es $'+total.toFixed(2)+'. Actualiza la selección y confirma el nuevo precio.'),{status:409});
}
module.exports={quote,confirmQuote};
