const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fechaLocal = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const nombreTurno = tipo => ({manana:'Mañana',tarde:'Tarde'}[tipo] || tipo);
const fechaCorta = fecha => fecha ? fecha.split('-').reverse().join('/') : 'Misma fecha';
const elemento = id => document.getElementById(id);
document.addEventListener('DOMContentLoaded', async () => {
  try { await API.proteger(); } catch { return; }
  construirMenu();
  elemento('perfil').textContent = API.usuario().nombre+' · '+(API.esAdmin()?'Administrador':'Empleado');
  if (!API.esAdmin()) elemento('titulo-solicitudes').textContent = 'Mis solicitudes pendientes';
  elemento('reintentar').addEventListener('click',cargarResumen);
  await cargarResumen();
});
async function cargarResumen() {
  elemento('estado-resumen').textContent = 'Cargando resumen…';
  elemento('reintentar').hidden = true;
  const hoy = new Date(), siguiente = new Date(hoy);
  siguiente.setDate(siguiente.getDate()+1);
  elemento('fecha-hoy').textContent = hoy.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  try {
    const [config,usuarios,turnosHoy,turnosManana,solicitudes] = await Promise.all([
      obtenerConfig(), API.get('/auth/usuarios'),
      API.get('/turnos?desde='+fechaLocal(hoy)+'&hasta='+fechaLocal(hoy)),
      API.get('/turnos?desde='+fechaLocal(siguiente)+'&hasta='+fechaLocal(siguiente)),
      API.get('/solicitudes')
    ]);
    const pendientes = solicitudes.filter(s=>s.estado==='pendiente');
    elemento('res-empleados').textContent = usuarios.filter(u=>u.activo && u.rol==='empleado').length;
    elemento('res-turnos-hoy').textContent = turnosHoy.length;
    elemento('res-manana').textContent = turnosManana.length;
    elemento('res-pendientes').textContent = pendientes.length;
    elemento('detalle-hoy').textContent = turnosHoy.length+' asignaciones para hoy';
    elemento('tabla-turnos-hoy').innerHTML = turnosHoy.length ? turnosHoy.map(t=>{
      const tipo = t.tipo==='manana'?'manana':'tarde';
      const iniciales = String(t.empleado).split(' ').filter(Boolean).map(p=>p[0]).join('').slice(0,2);
      return '<tr><td><div class="employee"><span class="avatar" aria-hidden="true">'+escapar(iniciales)+'</span><strong>'+escapar(t.empleado)+'</strong></div></td><td><span class="turno-pill '+tipo+'">'+escapar(nombreTurno(t.tipo))+'</span></td><td>'+escapar(horarioDeTurno(config,t.tipo))+'</td><td><span class="etiqueta '+(t.estado==='completado'?'verde':'gris')+'">'+escapar(t.estado)+'</span></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty-agenda">No hay turnos asignados para hoy. Consultá la agenda para organizar la semana.</td></tr>';
    elemento('solicitudes-pendientes').innerHTML = pendientes.length ? pendientes.slice(0,3).map(s=>'<article class="request-item"><h4>'+escapar(s.empleado)+'</h4><div class="request-change">'+escapar(nombreTurno(s.tipo_actual))+' · '+escapar(fechaCorta(s.fecha_actual))+' → '+escapar(nombreTurno(s.tipo_nuevo))+' · '+escapar(fechaCorta(s.fecha_nueva || s.fecha_actual))+'</div><p>'+escapar(s.motivo)+'</p></article>').join('') : '<p class="empty-agenda">Todo al día. No hay solicitudes pendientes.</p>';
    elemento('cobertura-hoy').innerHTML = ['manana','tarde'].map(tipo=>{
      const total = turnosHoy.filter(t=>t.tipo===tipo).length;
      const minimo = config.min[tipo], falta = Math.max(0,minimo-total);
      return '<div class="coverage-card '+(falta?'shortfall':'')+'"><h4>'+nombreTurno(tipo)+'</h4><p>'+escapar(horarioDeTurno(config,tipo))+'</p><strong>'+total+' / '+minimo+'</strong><p class="coverage-state">'+(falta?'Faltan '+falta+' asignaciones para cubrir el mínimo':'Mínimo de cobertura cubierto')+'</p></div>';
    }).join('');
    elemento('estado-resumen').textContent = '';
  } catch(error) {
    elemento('estado-resumen').textContent = 'No se pudo cargar el resumen: '+error.message;
    elemento('detalle-hoy').textContent = 'Datos no disponibles';
    elemento('reintentar').hidden = false;
  }
}
function construirMenu() { UI.menu(); }
