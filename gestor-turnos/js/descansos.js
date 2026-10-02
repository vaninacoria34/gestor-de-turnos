document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;
 UI.el('form-descanso').hidden=!API.esAdmin();
 UI.el('tipo').addEventListener('change',()=>{const puntual=UI.el('tipo').value==='fecha';UI.el('campo-dia').hidden=puntual;UI.el('campo-fecha').hidden=!puntual;UI.el('fecha').required=puntual;});
 UI.el('form-descanso').addEventListener('submit',async event=>{
 event.preventDefault();const boton=event.target.querySelector('button');boton.disabled=true;
 try{const payload={usuario_id:Number(UI.el('empleado').value),motivo:UI.el('motivo').value.trim()};if(UI.el('tipo').value==='fecha')payload.fecha=UI.el('fecha').value;else payload.dia_semana=Number(UI.el('dia').value);
 await API.post('/descansos',payload);await cargar();UI.mensaje('Descanso registrado.');}
 catch(e){UI.mensaje(e.message,true);}finally{boton.disabled=false;}
 });
 UI.el('lista').addEventListener('click',async e=>{const b=e.target.closest('[data-id]');if(!b||!confirm('¿Eliminar este descanso?'))return;b.disabled=true;try{await API.del('/descansos/'+b.dataset.id);await cargar();}catch(e){b.disabled=false;UI.mensaje(e.message,true);}});
 await cargar();
});
async function cargar(){
 UI.mensaje('Cargando descansos…');
 try{
 const [descansos,usuarios]=await Promise.all([API.get('/descansos'),API.esAdmin()?API.get('/auth/usuarios'):Promise.resolve([])]);
 const selected=UI.el('empleado').value;
 UI.el('empleado').innerHTML='<option value="">Seleccioná un empleado</option>'+usuarios.filter(u=>u.rol==='empleado'&&u.activo).map(u=>'<option value="'+Number(u.id)+'">'+UI.esc(u.nombre)+'</option>').join('');UI.el('empleado').value=selected;
 const dias=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
 UI.el('lista').innerHTML=UI.tabla(['Empleado','Descanso','Motivo','Acción'],descansos.map(r=>'<tr><td>'+UI.esc(r.empleado)+'</td><td>'+(r.fecha?UI.fecha(r.fecha):dias[r.dia_semana]+' de cada semana')+'</td><td>'+UI.esc(r.motivo||'—')+'</td><td>'+(API.esAdmin()?'<button class="btn btn-secundario" data-id="'+Number(r.id)+'">Eliminar</button>':'—')+'</td></tr>').join('')||UI.vacio(4,'No hay descansos registrados.'));
 UI.mensaje();
 }catch(e){UI.mensaje(e.message,true);}
}