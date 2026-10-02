let usuarios = [], usuarioEditando = null;
const el = id => document.getElementById(id);
const escapar = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizar = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
document.addEventListener('DOMContentLoaded',async()=>{
  try { await API.proteger(); } catch { return; }
  construirMenu();
  el('btn-nuevo').hidden = !API.esAdmin();
  el('perfil').textContent = API.usuario().nombre+' · '+(API.esAdmin()?'Administrador':'Empleado');
  for (const id of ['buscar','filtro-estado','filtro-horario']) el(id).addEventListener(id==='buscar'?'input':'change',pintar);
  el('tabla-empleados').addEventListener('click',event=>{
    const boton = event.target.closest('[data-accion]');
    if (!boton || !API.esAdmin()) return;
    const id = Number(boton.dataset.id);
    if (boton.dataset.accion==='editar') editar(id);
    else eliminar(id);
  });
  el('form-empleado').addEventListener('submit',event=>guardar(event,false));
  el('form-editar').addEventListener('submit',event=>guardar(event,true));
  await renderizar();
});
function construirMenu() { UI.menu(); }
function mostrarFormulario(forzar) {
  if(!API.esAdmin()) return;
  el('formulario').hidden = forzar===false ? true : !el('formulario').hidden;
  el('error-crear').textContent='';
  if(!el('formulario').hidden) el('form-empleado').elements.nombre.focus();
}
async function renderizar() {
  el('estado-equipo').textContent='Cargando equipo…'; el('reintentar').hidden=true;
  try {
    usuarios=await API.get('/auth/usuarios');
    pintar(); el('estado-equipo').textContent='';
    return true;
  } catch(error) {
    el('estado-equipo').textContent='No se pudo cargar el equipo: '+error.message;
    el('reintentar').hidden=false;
    return false;
  }
}
function pintar() {
  const equipo=usuarios.filter(u=>u.rol==='empleado');
  el('equipo-total').textContent=equipo.length;
  el('equipo-activos').textContent=equipo.filter(u=>u.activo).length;
  el('equipo-fijos').textContent=equipo.filter(u=>u.horario_fijo).length;
  el('equipo-flexibles').textContent=equipo.filter(u=>!u.horario_fijo).length;
  const consulta=normalizar(el('buscar').value.trim()),estado=el('filtro-estado').value,horario=el('filtro-horario').value;
  const visibles=usuarios.filter(u=>
    normalizar([u.nombre,u.email,u.area,u.telefono].join(' ')).includes(consulta) &&
    (!estado || (estado==='activo'?!!u.activo:!u.activo)) &&
    (!horario || (horario==='flexible'?!u.horario_fijo:u.horario_fijo===horario)));
  el('tabla-empleados').innerHTML=visibles.length ? visibles.map(u=>{
    const iniciales=String(u.nombre).split(' ').filter(Boolean).map(p=>p[0]).join('').slice(0,2);
    const tipo=u.horario_fijo==='manana'?'manana':u.horario_fijo==='tarde'?'tarde':'flexible';
    return '<tr><td><div class="employee"><span class="avatar" aria-hidden="true">'+escapar(iniciales)+'</span><div class="employee-name"><strong>'+escapar(u.nombre)+'</strong><small>'+(u.rol==='admin'?'Administrador':'Empleado')+'</small></div></div></td><td>'+escapar(u.email||'Sin correo')+'<small>'+escapar(u.telefono||'Sin teléfono')+'</small></td><td>'+escapar(u.area||'Sin área')+'</td><td><span class="pill '+tipo+'">'+({manana:'Fijo: Mañana',tarde:'Fijo: Tarde',flexible:'Flexible'}[tipo])+'</span></td><td><span class="pill '+(u.activo?'active-status':'inactive-status')+'">'+(u.activo?'Activo':'Inactivo')+'</span></td><td>'+(API.esAdmin()?'<div class="actions"><button class="btn btn-secundario" data-accion="editar" data-id="'+Number(u.id)+'" aria-label="Editar a '+escapar(u.nombre)+'">Editar</button><button class="btn delete-button" data-accion="eliminar" data-id="'+Number(u.id)+'" aria-label="Eliminar a '+escapar(u.nombre)+'">Eliminar</button></div>':'—')+'</td></tr>';
  }).join('') : '<tr><td colspan="6" class="empty-row">'+(usuarios.length?'No hay coincidencias. Probá con otros filtros.':'Todavía no hay integrantes registrados.')+'</td></tr>';
  el('cantidad-resultados').textContent=visibles.length+' de '+usuarios.length+' integrantes · incluye administradores';
}
function editar(id) {
  if(!API.esAdmin())return;
  const u=usuarios.find(u=>u.id===id); if(!u)return;
  usuarioEditando=id;
  const f=el('form-editar').elements;
  for(const campo of ['nombre','email','telefono','area','horario_fijo']) f[campo].value=u[campo]||'';
  f.activo.value=String(u.activo);f.rol.value=u.rol;
  f.password.value=''; el('error-editar').textContent=''; el('modal-editar').showModal();
}
async function guardar(event,editando) {
  event.preventDefault(); if(!API.esAdmin())return;
  const form=event.target,f=form.elements,boton=form.querySelector('[type="submit"]');
  const error=el(editando?'error-editar':'error-crear'); error.textContent='';
  if(!f.nombre.value.trim()) { error.textContent='Ingresá un nombre.'; f.nombre.focus();return; }
  const datos={nombre:f.nombre.value.trim(),email:f.email.value.trim(),telefono:f.telefono.value.trim(),area:f.area.value.trim(),horario_fijo:f.horario_fijo.value};
  if(f.password.value)datos.password=f.password.value;
  if(!editando)datos.rol='empleado';
  else {datos.activo=Number(f.activo.value);datos.rol=f.rol.value;}
  boton.disabled=true;
  try {
    if(editando) await API.put('/auth/usuarios/'+usuarioEditando,datos);
    else await API.post('/auth/usuarios',datos);
    if(editando)el('modal-editar').close();
    else {form.reset();mostrarFormulario(false);}
    if(await renderizar())el('estado-equipo').textContent=editando?'Cambios guardados.':'Empleado agregado.';
  } catch(err) {error.textContent=err.message;}
  finally {boton.disabled=false;}
}
async function eliminar(id) {
  if(!API.esAdmin())return;
  const u=usuarios.find(u=>u.id===id);if(!u)return;
  if(!confirm('¿Eliminar a '+u.nombre+' y todos sus turnos? Esta acción no se puede deshacer.'))return;
  try {await API.del('/auth/usuarios/'+id);if(await renderizar())el('estado-equipo').textContent='Integrante eliminado.';}
  catch(error){el('estado-equipo').textContent=error.message;}
}
