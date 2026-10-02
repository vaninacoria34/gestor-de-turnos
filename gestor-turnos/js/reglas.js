
const CAMPOS=['horario_manana_inicio','horario_manana_fin','min_manana','max_manana','horario_tarde_inicio','horario_tarde_fin','min_tarde','max_tarde','min_domingos_mes','rotar_domingos'];
document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar(true))return;
 UI.el('form-reglas').addEventListener('submit',guardar);
 UI.el('lista-fijos').addEventListener('change',async event=>{
 const select=event.target.closest('[data-id]');if(!select)return;select.disabled=true;
 try{await API.put('/auth/usuarios/'+select.dataset.id,{horario_fijo:select.value});select.dataset.previous=select.value;UI.mensaje('Horario actualizado.');}
 catch(e){select.value=select.dataset.previous;UI.mensaje(e.message,true);}finally{select.disabled=false;}
 });await cargar();
});
async function cargar(){
 UI.mensaje('Cargando configuración…');UI.el('guardar-reglas').disabled=true;
 try{
 const [reglas,usuarios]=await Promise.all([API.get('/reglas'),API.get('/auth/usuarios')]);
 const valores=Object.fromEntries(reglas.map(r=>[r.clave,r.valor])),f=UI.el('form-reglas').elements;
 for(const campo of CAMPOS){if(f[campo].type==='checkbox')f[campo].checked=valores[campo]==='1';else f[campo].value=valores[campo]??'';}
 const empleados=usuarios.filter(u=>u.rol==='empleado');
 UI.el('lista-fijos').innerHTML=UI.tabla(['Empleado','Horario fijo'],empleados.map(u=>'<tr><td><strong>'+UI.esc(u.nombre)+'</strong><small>'+UI.esc(u.email||'Sin correo')+'</small></td><td><select data-id="'+Number(u.id)+'" data-previous="'+UI.esc(u.horario_fijo||'')+'" aria-label="Horario de '+UI.esc(u.nombre)+'"><option value="">Flexible</option><option value="manana" '+(u.horario_fijo==='manana'?'selected':'')+'>Mañana (fijo)</option><option value="tarde" '+(u.horario_fijo==='tarde'?'selected':'')+'>Tarde (fijo)</option></select></td></tr>').join('')||UI.vacio(2,'No hay empleados registrados.'));
 UI.el('guardar-reglas').disabled=false;UI.mensaje();
 }catch(e){UI.mensaje(e.message,true);}
}
async function guardar(event){
 event.preventDefault();const f=event.target.elements,payload={};
 for(const campo of CAMPOS)payload[campo]=f[campo].type==='checkbox'?(f[campo].checked?'1':'0'):f[campo].value;
 for(const tipo of ['manana','tarde'])if(payload['max_'+tipo]!==''&&Number(payload['max_'+tipo])<Number(payload['min_'+tipo])){UI.mensaje('El máximo de '+UI.tipo(tipo)+' no puede ser menor al mínimo.',true);return;}
 UI.el('guardar-reglas').disabled=true;
 try{await API.put('/reglas',payload);UI.mensaje('Configuración guardada. Se aplicará a la próxima generación de turnos.');}
 catch(e){UI.mensaje(e.message,true);}finally{UI.el('guardar-reglas').disabled=false;}
}
