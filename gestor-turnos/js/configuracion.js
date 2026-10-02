document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar(true))return;
 UI.el('whatsapp-mode').addEventListener('change',actualizarModo);
 UI.el('plantilla-turno').addEventListener('input',previsualizarPlantilla);
 UI.el('form-canales').elements.empresa.addEventListener('input',previsualizarPlantilla);
 UI.el('form-canales').addEventListener('submit',async event=>{
 event.preventDefault();const payload={},boton=UI.el('guardar-canales');boton.disabled=true;
 for(const f of event.target.elements)if(f.name)payload[f.name]=f.type==='checkbox'?f.checked:f.value;
 try{await API.put('/sistema/canales',payload);await cargar();UI.mensaje('Configuración guardada. Los próximos avisos usarán estos canales.');}
 catch(e){UI.mensaje(e.message,true);}finally{boton.disabled=false;}
 });
 UI.el('crear-respaldo').addEventListener('click',async event=>{
 event.target.disabled=true;try{const r=await API.post('/sistema/respaldo',{});await cargar();UI.mensaje('Respaldo creado: '+r.nombre);}catch(e){UI.mensaje(e.message,true);}finally{event.target.disabled=false;}
 });await cargar();
});
async function cargar(){
 UI.mensaje('Cargando configuración…');
 try{
 const [s,c]=await Promise.all([API.get('/sistema'),API.get('/sistema/canales')]);
 const f=UI.el('form-canales').elements;
 for(const [k,v] of Object.entries(c))if(f[k]){if(f[k].type==='checkbox')f[k].checked=v;else f[k].value=v;}
 for(const k of ['smtp_pass','whatsapp_token']){f[k].value='';f[k].placeholder=c[k+'_guardado']?'Guardado; dejá vacío para conservar':'Sin configurar';}
 UI.el('red').innerHTML=s.direcciones.map(url=>'<p><a href="'+UI.esc(url)+'" target="_blank" rel="noopener">'+UI.esc(url)+'</a></p>').join('')||'<p>No se detectó una dirección de red. Verificá la conexión Wi-Fi o Ethernet.</p>';
 UI.el('respaldos').innerHTML=UI.tabla(['Archivo','Tamaño'],s.respaldos.slice(0,15).map(r=>'<tr><td>'+UI.esc(r.nombre)+'</td><td>'+Math.ceil(r.bytes/1024)+' KB</td></tr>').join('')||UI.vacio(2,'Todavía no hay respaldos.'));
 actualizarModo();previsualizarPlantilla();
 UI.el('guardar-canales').disabled=false;UI.mensaje();
 }catch(e){UI.mensaje(e.message,true);}
}
function actualizarModo(){
 const simple=UI.el('whatsapp-mode').value==='simple';
 UI.el('conexion-whatsapp').hidden=simple;
 UI.el('ayuda-whatsapp').textContent=simple
  ?'El calendario prepara el mensaje. Abrís el chat y presionás Enviar en WhatsApp. No necesitás una cuenta de Meta ni tokens.'
  :'Los avisos se encolan en el servidor usando la integración existente. Requiere configurar el proveedor; las respuestas aún no ingresan al gestor.';
}
function previsualizarPlantilla(){
 const valores={nombre:'Caro',fecha:'lunes, 5 de octubre de 2026',horario:'08:00 a 12:00',turno:'mañana',empresa:UI.el('form-canales').elements.empresa.value||'Mi empresa'};
 UI.el('vista-previa-turno').textContent=UI.el('plantilla-turno').value.replace(/\{(nombre|fecha|horario|turno|empresa)\}/g,(_,k)=>valores[k]);
}
