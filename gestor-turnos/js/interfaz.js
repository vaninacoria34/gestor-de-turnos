// Componentes compartidos por las pantallas del gestor.
const UI = {
  el: id => document.getElementById(id),
  esc: value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  tipo: value => ({manana:'Mañana',tarde:'Tarde'}[value] || value || 'Flexible'),
  iso: d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
  fecha: value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—',
  normalizar: value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
  mensaje(texto='',error=false) {
    const nodo=this.el('estado-pagina'); if(!nodo)return;
    nodo.textContent=texto; nodo.classList.toggle('error',error);
  },
  menu() {
    const pagina=location.pathname.split('/').pop() || 'index.html';
    const base=location.pathname.includes('/pages/')?'':'pages/';
    const links=[[base?'index.html':'../index.html','▦','Resumen'],[base+'calendario.html','▤','Calendario'],[base+'mis-turnos.html','◷','Mis turnos'],[base+'empleados.html','♧','Empleados'],[base+'solicitudes.html','▱',API.esAdmin()?'Solicitudes':'Mis solicitudes']];
    links.push([base+'descansos.html','☾','Descansos'],[base+'notificaciones.html','♧','Notificaciones']);
    if(API.esAdmin()) links.push([base+'reportes.html','▥','Reportes'],[base+'reglas.html','⚙','Reglas de negocio'],[base+'historial.html','↺','Historial']);
    if(API.esAdmin())links.push([base+'configuracion.html','⚙','Configuración']);
    links.push([base+'cuenta.html','⚙','Mi cuenta']);
    this.el('menu').innerHTML=links.map(([href,icon,label])=>'<a href="'+href+'" '+(href.split('/').pop()===pagina?'class="activo" aria-current="page"':'')+'><span aria-hidden="true">'+icon+'</span>'+label+'</a>').join('')+'<a href="#" onclick="cerrarSesion();return false"><span aria-hidden="true">↪</span>Cerrar sesión</a>';
    if(this.el('perfil'))this.el('perfil').textContent=API.usuario().nombre+' · '+(API.esAdmin()?'Administrador':'Empleado');
  },
  async iniciar(admin=false) {
    try {await API.proteger();}catch{return false;}
    if(admin && !API.esAdmin()){location.replace('mis-turnos.html');return false;}
    this.menu();return true;
  },
  tabla(headers,rows) {
    return '<div class="table-scroll"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+this.esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
  },
  vacio(columnas,texto='No hay datos para mostrar.') {return '<tr><td class="empty-cell" colspan="'+columnas+'">'+this.esc(texto)+'</td></tr>';},
  pill(estado) {
    const clase={pendiente:'pending',aprobada:'success',rechazada:'danger',completado:'success',manana:'manana',tarde:'tarde'}[estado] || 'neutral';
    return '<span class="status-pill '+clase+'">'+this.esc(this.tipo(estado))+'</span>';
  }
};
