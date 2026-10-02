
let referencia=new Date(),misTurnos=[],seleccionado=null,version=0;
document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;
 UI.el('lista-turnos').addEventListener('click',e=>{const b=e.target.closest('[data-turno]');if(b)abrirSolicitud(Number(b.dataset.turno));});
 UI.el('form-solicitud').addEventListener('submit',enviarSolicitud);await renderizar();
});
function lunesDe(d){const f=new Date(d);f.setDate(f.getDate()-(f.getDay()+6)%7);return f;}
function mover(n){referencia.setDate(referencia.getDate()+n*7);renderizar();}
function irHoy(){referencia=new Date();renderizar();}
async function renderizar(){
 const actual=++version,desde=lunesDe(referencia),hasta=new Date(desde);hasta.setDate(hasta.getDate()+6);
 UI.mensaje('Cargando tus turnos…');
 try{
 const [config,todos]=await Promise.all([obtenerConfig(),API.get('/turnos?desde='+UI.iso(desde)+'&hasta='+UI.iso(hasta))]);
 if(actual!==version)return;
 misTurnos=todos.filter(t=>t.usuario_id===API.usuario().id);
 UI.el('periodo').textContent=UI.fecha(UI.iso(desde))+' – '+UI.fecha(UI.iso(hasta));
 [misTurnos.length,misTurnos.filter(t=>t.tipo==='manana').length,misTurnos.filter(t=>t.tipo==='tarde').length].forEach((n,i)=>UI.el('stat-'+i).textContent=n);
 UI.el('lista-turnos').innerHTML=UI.tabla(['Fecha','Día','Turno','Horario','Estado','Acción'],misTurnos.map(t=>'<tr><td>'+UI.fecha(t.fecha)+'</td><td>'+new Date(t.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long'})+'</td><td>'+UI.pill(t.tipo)+'</td><td>'+UI.esc(horarioDeTurno(config,t.tipo))+'</td><td>'+UI.pill(t.estado)+'</td><td><button class="btn btn-secundario" data-turno="'+Number(t.id)+'">Solicitar cambio</button></td></tr>').join('')||UI.vacio(6,'No tenés turnos asignados esta semana.'));
 UI.mensaje();
 }catch(e){if(actual===version)UI.mensaje(e.message,true);}
}
function abrirSolicitud(id){
 const t=misTurnos.find(t=>t.id===id);if(!t)return;seleccionado=id;
 UI.el('ms-info').textContent='Turno actual: '+UI.tipo(t.tipo)+' del '+UI.fecha(t.fecha);
 UI.el('ms-tipo').value=t.tipo;UI.el('ms-fecha').value=t.fecha;UI.el('ms-motivo').value='';UI.el('error-solicitud').textContent='';UI.el('modal-solicitud').showModal();
}
async function enviarSolicitud(event){
 event.preventDefault();const motivo=UI.el('ms-motivo').value.trim(),fecha=UI.el('ms-fecha').value;
 if(!motivo||!fecha){UI.el('error-solicitud').textContent='Completá la fecha y el motivo.';return;}
 const boton=event.target.querySelector('[type=submit]');boton.disabled=true;
 try{await API.post('/solicitudes',{turno_id:seleccionado,tipo_nuevo:UI.el('ms-tipo').value,fecha_nueva:fecha,motivo});UI.el('modal-solicitud').close();UI.mensaje('Solicitud enviada. Podés consultar su estado en Solicitudes.');}
 catch(e){UI.el('error-solicitud').textContent=e.message;}
 finally{boton.disabled=false;}
}
