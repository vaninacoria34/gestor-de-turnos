const PLANTILLA_TURNO='Hola {nombre} 👋\n\nTu turno asignado es:\n\n📅 {fecha}\n🕐 {horario}\n📍 Turno {turno}\n\nSi tenés algún inconveniente con este turno podés avisarnos respondiendo este mensaje.\n\n{empresa}';
function telefonoWhatsApp(valor){
 const original=String(valor||'').trim();
 if(!/^[+\d\s().-]+$/.test(original))return null;
 const numero=original.replace(/\D/g,'');
 return /^[1-9]\d{9,14}$/.test(numero)?numero:null;
}
function textoTurno(turno,empleado,config,canales){
 const horario=config.horarios[turno.tipo+'_inicio']+' a '+config.horarios[turno.tipo+'_fin'];
 const valores={nombre:empleado.nombre,fecha:new Date(turno.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),horario,turno:turno.tipo==='manana'?'mañana':'tarde',empresa:canales.empresa};
 return canales.plantilla_turno.replace(/\{(nombre|fecha|horario|turno|empresa)\}/g,(_,clave)=>valores[clave]);
}
module.exports={PLANTILLA_TURNO,telefonoWhatsApp,textoTurno};
