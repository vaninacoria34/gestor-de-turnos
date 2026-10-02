// Agenda del equipo: datos reales y fechas locales.
const NOMBRES_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TIPO_NOMBRE = { manana: 'Mañana', tarde: 'Tarde' };
let vista = 'semana', refFecha = new Date(), turnos = [], empleados = [], descansos = [], config;
let solicitud = 0, diasActuales = [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function Utils2Hoy() { return new Date(); }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function lunesDe(fecha) { const d = new Date(fecha); d.setDate(d.getDate() - (d.getDay()+6)%7); return d; }
function sumarDias(d, n) { const f = new Date(d); f.setDate(f.getDate()+n); return f; }
function informar(texto, error = false) { const el = document.getElementById('estado-agenda'); el.textContent = texto; el.className = error ? 'agenda-error' : ''; }

document.addEventListener('DOMContentLoaded', async () => {
  try { await API.proteger(); } catch { return; }
  construirMenu();
  document.getElementById('perfil').textContent = `${API.usuario().nombre } · ${API.esAdmin() ? 'Administrador' : 'Empleado'}`;
  document.getElementById('btn-generar').hidden = !API.esAdmin();
  document.getElementById('btn-asignar').hidden = !API.esAdmin();
  document.getElementById('btn-notificar-todos').hidden = !API.esAdmin();
  document.getElementById('form-asignar').addEventListener('submit',asignar);
  document.getElementById('buscar-empleado').addEventListener('input', pintar);
  document.getElementById('calendario').addEventListener('click', event => {
    const wsp = event.target.closest('[data-wsp]');
    if (wsp && API.esAdmin()) { notificarTurno(Number(wsp.dataset.wsp)); return; }
    const el = event.target.closest('[data-turno]');
    if (!el || !API.esAdmin()) return;
    const t = turnos.find(t => String(t.id) === el.dataset.turno);
    if (t) abrirCambio(t.id, t.tipo, t.fecha);
  });
  document.getElementById('btn-notificar-todos').hidden = !API.esAdmin();
  await renderizar();
});
function construirMenu() { UI.menu(); }
function setVista(v) {
  vista = v;
  for (const [id, value] of [['btn-semana','semana'],['btn-mes','mes']]) {
    const el = document.getElementById(id); el.className = vista===value ? 'btn activo' : 'btn btn-secundario'; el.setAttribute('aria-pressed', String(vista===value));
  }
  renderizar();
}
function mover(dir) {
  if (vista==='semana') refFecha = sumarDias(refFecha, dir*7);
  else refFecha = new Date(refFecha.getFullYear(), refFecha.getMonth()+dir, 1);
  renderizar();
}
function irHoy() { refFecha = new Date(); renderizar(); }
async function renderizar() {
  const version = ++solicitud;
  const desde = vista==='semana' ? lunesDe(refFecha) : new Date(refFecha.getFullYear(),refFecha.getMonth(),1);
  const hasta = vista==='semana' ? sumarDias(desde,6) : new Date(refFecha.getFullYear(),refFecha.getMonth()+1,0);
  informar('Cargando agenda…'); document.getElementById('calendario').setAttribute('aria-busy','true');
  try {
    const resultados = await Promise.all([API.get(`/turnos?desde=${iso(desde)}&hasta=${iso(hasta)}`),API.get('/auth/usuarios'),API.get('/descansos'),obtenerConfig()]);
    if (version !== solicitud) return;
    [turnos, empleados, descansos, config] = resultados;
    diasActuales = []; for (let d = new Date(desde); d <= hasta; d = sumarDias(d,1)) diasActuales.push(d);
    document.getElementById('titulo').textContent = vista==='semana' ? 'Calendario semanal' : 'Calendario mensual';
    const formato = {day:'numeric',month:'short'};
    document.getElementById('periodo').textContent = `${desde.toLocaleDateString('es-AR',formato) } · ${hasta.toLocaleDateString('es-AR',{...formato,year:'numeric'})}`;
    informar(''); pintar();
  } catch(e) { if (version===solicitud) { config = null; informar(e.message, true); document.getElementById('calendario').innerHTML = ''; document.getElementById('agenda-stats').innerHTML = ''; document.getElementById('cobertura').innerHTML = ''; } }
  finally { if (version===solicitud) document.getElementById('calendario').setAttribute('aria-busy','false'); }
}
function esDescanso(e,d) { return descansos.some(r => r.usuario_id===e.id && (r.fecha ? r.fecha===iso(d) : Number(r.dia_semana)===d.getDay())); }
function chip(t) {
  const tipo = t.tipo==='manana' ? 'manana' : 'tarde';
  const body = `<strong>${TIPO_NOMBRE[tipo]}</strong><small>${esc(horarioDeTurno(config,tipo))}</small>`;
  if (!API.esAdmin()) return `<div class="shift ${tipo}">${body}</div>`;
  return `<div class="shift-wrap"><button type="button" class="shift ${tipo}" data-turno="${esc(t.id)}" title="Cambiar turno de ${esc(t.empleado)} · ${esc(t.fecha)}">${body}</button><button type="button" class="accion-wsp" data-wsp="${esc(t.id)}" title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp a ${esc(t.empleado)}">📱</button></div>`;
}
function pintar() {
  if (!config) return;
  const consulta = document.getElementById('buscar-empleado').value.trim().toLocaleLowerCase('es');
  const equipo = empleados.filter(e => ((e.rol==='empleado' && e.activo) || turnos.some(t=>t.usuario_id===e.id)) && e.nombre.toLocaleLowerCase('es').includes(consulta));
  const visibles = turnos.filter(t=>equipo.some(e=>e.id===t.usuario_id));
  const nDescansos = equipo.reduce((n,e)=>n+diasActuales.filter(d=>esDescanso(e,d)).length,0);
  const stats = [[equipo.length,'Empleados'],[visibles.length,'Turnos asignados'],[visibles.filter(t=>t.tipo==='manana').length,'Turnos de mañana'],[visibles.filter(t=>t.tipo==='tarde').length,'Turnos de tarde'],[nDescansos,'Descansos registrados']];
  document.getElementById('agenda-stats').innerHTML = stats.map(([n,label],i)=>`<div class="agenda-stat"><span class="stat-symbol stat-${i}" aria-hidden="true">${['&#9827;','&#9638;','&#9728;','&#9684;','&#9789;'][i]}</span><div><strong>${n}</strong><span>${label}</span></div></div>`).join('');
  const cabecera = diasActuales.map(d=>`<th scope="col" class="${iso(d)===iso(new Date())?'today':''}">${NOMBRES_DIAS[(d.getDay()+6)%7]} ${d.getDate()}<small>${d.toLocaleDateString('es-AR',{month:'short'})}</small></th>`).join('');
  const cont = document.getElementById('calendario'); cont.className = 'roster-scroll';
  cont.innerHTML = equipo.length ? `<table class="roster"><caption class="sr-only">Asignaciones por empleado y día</caption><thead><tr><th scope="col">Empleado</th>${cabecera}</tr></thead><tbody>${equipo.map(e=>`<tr><th scope="row"><div class="employee"><span class="avatar">${esc(e.nombre.split(' ').map(p=>p[0]).join('').slice(0,2))}</span><span>${esc(e.nombre)}<small>${esc(e.area || 'Sin área')}</small></span></div></th>${diasActuales.map(d=>{
    const ts = visibles.filter(t=>t.usuario_id===e.id && t.fecha===iso(d));
    return `<td>${ts.map(chip).join('')}${esDescanso(e,d)?'<div class="shift descanso"><strong>Descanso</strong><small>Registrado</small></div>':!ts.length?'<span class="unassigned">&mdash;<small>Sin asignar</small></span>':''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty-agenda">No hay empleados para mostrar. Revisá la búsqueda o agregá empleados al equipo.</div>';
  document.getElementById('cobertura').innerHTML = `<div class="coverage-heading"><h3>Cobertura de turnos por día</h3><p>Equipo completo · asignados / mínimo requerido</p></div><div class="roster-scroll"><table class="coverage"><thead><tr><th scope="col">Turno</th>${cabecera}</tr></thead><tbody>${['manana','tarde'].map(tipo=>`<tr><th scope="row">${TIPO_NOMBRE[tipo]}</th>${diasActuales.map(d=>{ const n=turnos.filter(t=>t.fecha===iso(d)&&t.tipo===tipo).length; return `<td class="${n<config.min[tipo]?'shortfall':''}">${n} / ${config.min[tipo]}${n<config.min[tipo]?'<small>Falta cobertura</small>':''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---- Avisos por WhatsApp ----
let preparandoWhatsApp = false;
function mostrarMensajes(resultados) {
  const dialogo = document.getElementById('modal-whatsapp');
  document.getElementById('lista-whatsapp').innerHTML = resultados.map(r => {
    const titulo = `<strong>${esc(r.empleado)}</strong><small>${esc(UI.fecha(r.fecha))}</small>`;
    if (r.estado === 'omitido') return `<article class="mensaje-whatsapp">${titulo}<p role="status">${esc(r.error)}</p><a href="empleados.html">Revisar empleado</a></article>`;
    if (r.estado === 'encolado') return `<article class="mensaje-whatsapp">${titulo}<p>Encolado para envío automático. La entrega todavía no está confirmada.</p></article>`;
    return `<article class="mensaje-whatsapp">${titulo}<pre>${esc(r.texto)}</pre><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" data-chat>Abrir WhatsApp</a><p class="estado-chat" aria-live="polite">Mensaje preparado · envío manual pendiente.</p></article>`;
  }).join('') || '<p>No hay turnos en este período.</p>';
  document.getElementById('lista-whatsapp').onclick = event => {
    const enlace = event.target.closest('[data-chat]');
    if (enlace) {
      enlace.textContent = 'Volver a abrir WhatsApp';
      enlace.parentElement.querySelector('.estado-chat').textContent = 'Enlace abierto. Presioná Enviar en WhatsApp; el gestor no confirma la entrega.';
    }
  };
  dialogo.showModal();
}
async function prepararWhatsApp(ruta) {
  if (!API.esAdmin() || preparandoWhatsApp) return;
  preparandoWhatsApp = true;
  const boton = document.getElementById('btn-notificar-todos');
  boton.disabled = true;
  informar('Preparando avisos…');
  try {
    const r = await API.post(ruta, {});
    mostrarMensajes(r.resultados || [r]);
    informar('');
  } catch(e) { informar(e.message, true); }
  finally { preparandoWhatsApp = false; boton.disabled = false; }
}
async function notificarTurno(id) {
  return prepararWhatsApp(`/turnos/${id}/notificar`);
}
async function notificarTodos() {
  if (!API.esAdmin() || preparandoWhatsApp) return;
  const desde = vista === 'semana' ? lunesDe(refFecha) : new Date(refFecha.getFullYear(),refFecha.getMonth(),1);
  const hasta = vista === 'semana' ? sumarDias(desde,6) : new Date(refFecha.getFullYear(),refFecha.getMonth()+1,0);
  if (!turnos.length) { informar('No hay turnos en este período.', true); return; }
  if (!confirm('Se prepararán los avisos de todo el período, incluyendo empleados fuera de la búsqueda. En modo simple los enviás uno por uno; en modo automático se encolan. ¿Continuar?')) return;
  return prepararWhatsApp(`/turnos/notificar-todos?desde=${iso(desde)}&hasta=${iso(hasta)}`);
}

// ---- Cambio de turno (admin) ----
let turnoSeleccionado = null;
function abrirCambio(id, tipo, fecha) {
  turnoSeleccionado = id;
  document.getElementById('mc-tipo').value = tipo;
  document.getElementById('mc-fecha').value = fecha;
  document.getElementById('mc-motivo').value = '';
  document.getElementById('modal-cambio').showModal();
}
async function confirmarCambio() {
  const boton = document.querySelector('#modal-cambio .btn');
  boton.disabled = true;
  try {
    await API.put(`/turnos/${turnoSeleccionado}`, {
      tipo: document.getElementById('mc-tipo').value,
      fecha: document.getElementById('mc-fecha').value,
      motivo: document.getElementById('mc-motivo').value,
    });
    document.getElementById('modal-cambio').close();
    await renderizar();
  } catch(e) { alert(e.message); }
  finally { boton.disabled = false; }
}
async function generar() {
  const boton = document.getElementById('btn-generar');
  boton.disabled = true;
  try {
    const preview=await API.post('/turnos/previsualizar',{lunes:iso(lunesDe(refFecha))});
    const faltantes=preview.avisos.map(a=>UI.fecha(a.fecha)+' '+UI.tipo(a.tipo)+': faltan '+a.faltan).join('\n');
    if(!confirm('Se crearán '+preview.creados+' turnos.\n'+(faltantes?'Cobertura pendiente:\n'+faltantes:'La semana tendrá cobertura mínima.')+'\n¿Confirmar generación?'))return;
    const r = await API.post('/turnos/generar', { lunes: iso(lunesDe(refFecha)) });
    await renderizar();
    informar(`Se generaron ${r.creados} turnos.`);
  } catch(e) { informar(e.message, true); }
  finally { boton.disabled = false; }
}

function abrirAsignacion(){
 const lista=empleados.filter(e=>e.activo&&e.rol==='empleado');
 document.getElementById('as-empleado').innerHTML=lista.map(e=>'<option value="'+Number(e.id)+'">'+esc(e.nombre)+'</option>').join('');
 document.getElementById('as-fecha').value=iso(refFecha);
 document.getElementById('as-error').textContent=lista.length?'':'Primero registrá un empleado activo.';
 document.getElementById('modal-asignar').showModal();
}
async function asignar(event){
 event.preventDefault();const boton=event.target.querySelector('button[type=submit]');boton.disabled=true;
 try{
 await API.post('/turnos',{usuario_id:Number(document.getElementById('as-empleado').value),fecha:document.getElementById('as-fecha').value,tipo:document.getElementById('as-tipo').value,motivo:document.getElementById('as-motivo').value});
 document.getElementById('modal-asignar').close();await renderizar();informar('Turno asignado.');
 }catch(e){document.getElementById('as-error').textContent=e.message;}finally{boton.disabled=false;}
}
async function cancelarTurno(){
 if(!confirm('¿Eliminar este turno? Se cancelarán sus solicitudes asociadas.'))return;
 try{await API.del('/turnos/'+turnoSeleccionado);document.getElementById('modal-cambio').close();await renderizar();informar('Turno eliminado.');}
 catch(e){alert(e.message);}
}
