document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;UI.el('opcion-todos').hidden=!API.esAdmin();
 UI.el('alcance').addEventListener('change',cargar);
 UI.el('leer-todas').addEventListener('click',async()=>{try{await API.put('/notificaciones/leer-todas',{});await cargar();}catch(e){UI.mensaje(e.message,true);}});
 UI.el('lista').addEventListener('click',async e=>{
 const b=e.target.closest('[data-id]');if(!b)return;b.disabled=true;
 try{if(b.dataset.accion==='leer')await API.put('/notificaciones/'+b.dataset.id+'/leer',{});else await API.post('/notificaciones/'+b.dataset.id+'/reintentar',{});await cargar();}
 catch(e){b.disabled=false;UI.mensaje(e.message,true);}
 });await cargar();
});
async function cargar(){
 UI.mensaje('Cargando avisos…');
 try{
 const rows=await API.get('/notificaciones?todos='+UI.el('alcance').value);
 if(API.esAdmin()){const c=await API.get('/notificaciones/canales');UI.el('canales').textContent='Correo: '+(c.email?'configurado':'pendiente de configurar')+' · WhatsApp: '+(c.whatsapp?'configurado':'pendiente de configurar');}
 const estado=s=>({no_configurado:'Sin configurar',sin_destino:'Sin destinatario',pendiente:'En cola',aceptado:'Aceptado',error:'Error'}[s]||s);
 UI.el('lista').innerHTML=UI.tabla(['Aviso','Destinatario','Correo / WhatsApp','Acciones'],rows.map(n=>'<tr><td class="detail"><strong>'+UI.esc(n.asunto)+'</strong><small>'+UI.fecha(n.creado_en)+'</small><p>'+UI.esc(n.cuerpo)+'</p></td><td>'+UI.esc(n.empleado)+'<small>'+(n.leida?'Leído':'Sin leer')+'</small></td><td>'+UI.esc(estado(n.email_estado))+' / '+UI.esc(estado(n.whatsapp_estado))+'<small>'+UI.esc(n.email_error||n.whatsapp_error||'')+'</small></td><td><div class="row-actions">'+(!n.leida&&n.usuario_id===API.usuario().id?'<button class="btn btn-secundario" data-id="'+Number(n.id)+'" data-accion="leer">Leído</button>':'')+(API.esAdmin()&&[n.email_estado,n.whatsapp_estado].some(s=>['error','no_configurado'].includes(s))?'<button class="btn" data-id="'+Number(n.id)+'" data-accion="reintentar">Reintentar envío</button>':'')+'</div></td></tr>').join('')||UI.vacio(4,'No hay avisos.'));
 UI.mensaje();
 }catch(e){UI.mensaje(e.message,true);}
}