let reporteActivo='cobertura',versionReporte=0,reporteCargado=null;
document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar(true))return;
 const lunes=new Date();lunes.setDate(lunes.getDate()-(lunes.getDay()+6)%7);
 const domingo=new Date(lunes);domingo.setDate(domingo.getDate()+6);
 UI.el('r-desde').value=UI.iso(lunes);UI.el('r-hasta').value=UI.iso(domingo);
 UI.el('form-periodo').addEventListener('submit',e=>{e.preventDefault();renderizar();});
 await renderizar();
});
function setActivo(tipo){
 if(!['cobertura','empleados','areas','solicitudes'].includes(tipo))return;
 reporteActivo=tipo;
 document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.toggle('activo',b.dataset.tab===tipo);b.setAttribute('aria-pressed',String(b.dataset.tab===tipo));});
 renderizar();
}
function matriz(tipo,datos){
 if(tipo==='solicitudes')return {headers:['Concepto','Valor'],rows:[['Total solicitudes',datos.total],['Pendientes',datos.pendientes],['Aprobadas',datos.aprobadas],['Rechazadas',datos.rechazadas],...Object.entries(datos.porTipo||{}).map(([k,v])=>['Solicitan '+UI.tipo(k),v])]};
 if(tipo==='empleados')return {headers:['Empleado','Correo','Área','Horario','Total','Mañana','Tarde'],rows:datos.map(r=>[r.nombre,r.email||'—',r.area,UI.tipo(r.horario_fijo),r.total,r.manana,r.tarde])};
 return {headers:[tipo==='areas'?'Área':'Fecha','Mañana','Tarde','Total'],rows:datos.map(r=>[tipo==='areas'?r.area:UI.fecha(r.fecha),r.manana,r.tarde,Number(r.manana)+Number(r.tarde)])};
}
async function renderizar(){
 const version=++versionReporte,desde=UI.el('r-desde').value,hasta=UI.el('r-hasta').value,tipo=reporteActivo;
 reporteCargado=null;UI.el('reporte-contenido').innerHTML='';
 if(!desde||!hasta||desde>hasta){UI.mensaje('Elegí un período válido: la fecha inicial debe ser anterior o igual a la final.',true);return;}
 UI.mensaje('Cargando reporte…');
 try{
 const datos=await API.get('/reportes/'+tipo+'?desde='+desde+'&hasta='+hasta);
 if(version!==versionReporte)return;
 const tabla=matriz(tipo,datos);reporteCargado={tipo,desde,hasta,...tabla};
 const total=tipo==='solicitudes'?datos.total:datos.reduce((n,r)=>n+Number(r.total??(Number(r.manana)+Number(r.tarde))),0);
 UI.el('reporte-contenido').innerHTML='<div class="report-summary"><div><strong>'+UI.esc(total)+' '+(tipo==='solicitudes'?'solicitudes':'turnos')+'</strong><small>'+UI.fecha(desde)+' – '+UI.fecha(hasta)+'</small></div><button class="btn" onclick="exportarCSV()">Descargar CSV</button></div>'+UI.tabla(tabla.headers,tabla.rows.map(row=>'<tr>'+row.map(v=>'<td>'+UI.esc(v)+'</td>').join('')+'</tr>').join('')||UI.vacio(tabla.headers.length,'No hay datos en este período.'));
 UI.mensaje();
 }catch(e){if(version===versionReporte)UI.mensaje(e.message,true);}
}
function celdaCSV(valor){
 let texto=String(valor??'');
 if(/^[\s]*[=+@-]/.test(texto))texto="'"+texto;
 return '"'+texto.replace(/"/g,'""')+'"';
}
function exportarCSV(){
 if(!reporteCargado)return;
 const {headers,rows,tipo,desde,hasta}=reporteCargado;
 const csv=[headers,...rows].map(row=>row.map(celdaCSV).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download='reporte-'+tipo+'-'+desde+'-al-'+hasta+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
