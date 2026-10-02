
let solicitudes=[],ocupadas=new Set();
document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;
 UI.el('buscar').addEventListener('input',pintar);
 UI.el('filtro-estado').addEventListener('change',pintar);
 UI.el('lista-solicitudes').addEventListener('click',e=>{const b=e.target.closest('[data-accion]');if(b)resolver(Number(b.dataset.id),b.dataset.accion);});
 await renderizar();
});
async function renderizar(){
 UI.mensaje('Cargando solicitudes…');
 try{solicitudes=await API.get('/solicitudes');pintar();UI.mensaje();return true;}
 catch(e){UI.mensaje(e.message,true);return false;}
}
function pintar(){
 ['pendiente','aprobada','rechazada'].forEach((s,i)=>UI.el('stat-'+i).textContent=solicitudes.filter(x=>x.estado===s).length);
 const query=UI.normalizar(UI.el('buscar').value),estado=UI.el('filtro-estado').value;
 const rows=solicitudes.filter(s=>(!estado||s.estado===estado)&&UI.normalizar(s.empleado+' '+s.motivo).includes(query));
 UI.el('lista-solicitudes').innerHTML=UI.tabla(['Empleado','Turno actual','Solicita','Motivo','Estado','Acciones'],rows.map(s=>
 '<tr><td><strong>'+UI.esc(s.empleado)+'</strong></td><td>'+UI.pill(s.tipo_actual)+'<small>'+UI.fecha(s.fecha_actual)+'</small></td><td>'+UI.pill(s.tipo_nuevo)+'<small>'+UI.fecha(s.fecha_nueva||s.fecha_actual)+'</small></td><td class="detail">'+UI.esc(s.motivo)+'</td><td>'+UI.pill(s.estado)+'</td><td>'+(API.esAdmin()&&s.estado==='pendiente'?'<div class="row-actions"><button class="btn" data-id="'+Number(s.id)+'" data-accion="aprobar" '+(ocupadas.has(s.id)?'disabled':'')+'>Aprobar</button><button class="btn btn-secundario" data-id="'+Number(s.id)+'" data-accion="rechazar" '+(ocupadas.has(s.id)?'disabled':'')+'>Rechazar</button></div>':'—')+'</td></tr>').join('')||UI.vacio(6,'No hay solicitudes que coincidan con los filtros.'));
 UI.el('cantidad').textContent=rows.length+' de '+solicitudes.length+' solicitudes';
}
async function resolver(id,accion){
 if(!API.esAdmin()||ocupadas.has(id)||!['aprobar','rechazar'].includes(accion))return;
 if(!confirm(accion==='aprobar'?'¿Aprobar este cambio? Se actualizará el turno y se notificará al empleado.':'¿Rechazar esta solicitud?'))return;
 ocupadas.add(id);pintar();
 try{await API.put('/solicitudes/'+id+'/'+accion,{});if(await renderizar())UI.mensaje(accion==='aprobar'?'Cambio aprobado.':'Solicitud rechazada.');}
 catch(e){UI.mensaje(e.message,true);}
 finally{ocupadas.delete(id);pintar();}
}
