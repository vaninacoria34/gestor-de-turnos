
let eventos=[];
const etiquetas={crear:'Creación',cambio:'Cambio',eliminar:'Eliminación',generar:'Generación automática',cambio_reglas:'Reglas',ausencia:'Ausencia'};
document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;
 UI.el('buscar').addEventListener('input',pintar);UI.el('filtro-accion').addEventListener('change',pintar);await renderizar();
});
async function renderizar(){
 UI.mensaje('Cargando historial…');
 try{eventos=await API.get('/historial');pintar();UI.mensaje();}catch(e){UI.mensaje(e.message,true);}
}
function pintar(){
 const query=UI.normalizar(UI.el('buscar').value),accion=UI.el('filtro-accion').value;
 const rows=eventos.filter(e=>(!accion||e.accion===accion)&&UI.normalizar([e.detalle,e.empleado,e.autor].join(' ')).includes(query));
 UI.el('lista-historial').innerHTML=UI.tabla(['Fecha','Acción','Detalle','Hecho por'],rows.map(e=>'<tr><td>'+UI.fecha(e.fecha)+'<small>'+UI.esc(String(e.fecha||'').slice(11,19))+'</small></td><td><span class="status-pill '+(e.accion==='eliminar'?'danger':'neutral')+'">'+UI.esc(etiquetas[e.accion]||e.accion)+'</span></td><td class="detail">'+UI.esc(e.detalle)+(e.empleado?'<small>'+UI.esc(e.empleado)+'</small>':'')+'</td><td>'+UI.esc(e.autor||'Sistema')+'</td></tr>').join('')||UI.vacio(4,'No hay movimientos que coincidan con los filtros.'));
 UI.el('cantidad').textContent=rows.length+' de '+eventos.length+' movimientos cargados';
}
