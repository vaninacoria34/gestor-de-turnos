const router=require('express').Router(),db=require('../db');
const {autenticar,soloAdmin}=require('../auth');
const {generarSemana,cobertura,previsualizar}=require('../services/generador');
const {fechaValida,validarTurno}=require('../services/validacion');
const {notificar}=require('../services/email');
const {getConfig}=require('../services/config');
const {leer}=require('../services/canales');
const {textoTurno,telefonoWhatsApp}=require('../services/mensajes');

// Prepara un enlace manual o encola el aviso, según el modo configurado.
async function avisarTurno(t,actor){
  const c=leer(),u=db.prepare('SELECT nombre,telefono,activo FROM usuarios WHERE id=?').get(t.usuario_id);
  const resultado={turno_id:t.id,fecha:t.fecha,empleado:u?.nombre||'Empleado no disponible'};
  if(!u?.activo)return {...resultado,estado:'omitido',error:'Empleado inactivo o no disponible.'};
  const numero=telefonoWhatsApp(u.telefono);
  if(!numero)return {...resultado,estado:'omitido',error:'Completá el WhatsApp con código de país en Empleados.'};
  const texto=textoTurno(t,u,getConfig(),c);
  if(c.whatsapp_mode==='simple'){
    db.prepare("INSERT INTO historial(turno_id,usuario_accion_id,accion,detalle) VALUES(?,?,'comunicacion',?)")
      .run(t.id,actor,'Mensaje de WhatsApp preparado para '+u.nombre+' · '+t.fecha+'. Envío manual pendiente; entrega no confirmada.');
    return {...resultado,estado:'preparado',texto,url:'https://wa.me/'+numero+'?text='+encodeURIComponent(texto)};
  }
  if(!require('../services/email').estadoCanales().whatsapp)return {...resultado,estado:'omitido',error:'El envío automático de WhatsApp no está configurado.'};
  await notificar(t.usuario_id,null,'Tu turno asignado',texto);
  return {...resultado,estado:'encolado'};
}
function whatsappActivo(req,res,next){
 if(!leer().whatsapp_enabled)return res.status(409).json({error:'Activá WhatsApp desde Configuración para preparar avisos.'});
 next();
}
router.use(autenticar);
router.get('/',(req,res)=>{
 const {desde,hasta}=req.query;
 if((desde||hasta)&&(!fechaValida(desde)||!fechaValida(hasta)||desde>hasta))return res.status(400).json({error:'Período inválido.'});
 let sql='SELECT t.*,u.nombre AS empleado FROM turnos t JOIN usuarios u ON u.id=t.usuario_id';const args=[];
 if(desde){sql+=' WHERE t.fecha BETWEEN ? AND ?';args.push(desde,hasta);}
 res.json(db.prepare(sql+' ORDER BY t.fecha,t.tipo,u.nombre').all(...args));
});
router.post('/previsualizar',soloAdmin,(req,res)=>{
 try{res.json(previsualizar(req.body.lunes));}catch(e){res.status(400).json({error:e.message});}
});
router.post('/generar',soloAdmin,async(req,res)=>{
 const lunes=req.body.lunes;
 if(!fechaValida(lunes)||new Date(lunes+'T12:00:00').getDay()!==1)return res.status(400).json({error:'Seleccioná un lunes válido.'});
 const detalle=generarSemana(lunes,req.usuario.id);
 for(const id of new Set(detalle.map(t=>t.usuario_id))){
 const u=db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
 await notificar(id,u.email,'Tu horario semanal','Se asignaron tus turnos de la semana '+lunes+'. Consultá Mis turnos en el gestor.');
 }
 res.json({creados:detalle.length,detalle,avisos:cobertura(lunes)});
});
// Enviar por WhatsApp el turno individual (boton del calendario).
router.post('/:id/notificar',soloAdmin,whatsappActivo,async(req,res)=>{
  const t=db.prepare('SELECT * FROM turnos WHERE id=?').get(req.params.id);
  if(!t)return res.status(404).json({error:'Turno no encontrado.'});
  const resultado=await avisarTurno(t,req.usuario.id);
  if(resultado.estado==='omitido')return res.status(409).json({error:resultado.error});
  res.json({ok:true,...resultado});
});
// Notificar todos los turnos del rango visible (semana o mes).
router.post('/notificar-todos',soloAdmin,whatsappActivo,async(req,res)=>{
  const {desde,hasta}=req.query;
  if(!fechaValida(desde)||!fechaValida(hasta)||desde>hasta)return res.status(400).json({error:'Período inválido.'});
  if((new Date(hasta)-new Date(desde))/86400000>31)return res.status(400).json({error:'Elegí un período de hasta 32 días.'});
  const turnos=db.prepare('SELECT * FROM turnos WHERE fecha BETWEEN ? AND ? ORDER BY fecha,tipo').all(desde,hasta);
  const resultados=[];
  for(const t of turnos)resultados.push(await avisarTurno(t,req.usuario.id));
  res.json({ok:true,resultados,preparados:resultados.filter(r=>r.estado==='preparado').length,encolados:resultados.filter(r=>r.estado==='encolado').length,omitidos:resultados.filter(r=>r.estado==='omitido').length});
});
router.post('/',soloAdmin,async(req,res)=>{
 const {usuario_id,fecha,tipo,motivo}=req.body||{};
 const error=validarTurno(usuario_id,fecha,tipo);if(error)return res.status(409).json({error});
 const id=db.transaction(()=>{
 const info=db.prepare("INSERT INTO turnos(usuario_id,fecha,tipo,origen,motivo) VALUES(?,?,?,'manual',?)").run(usuario_id,fecha,tipo,String(motivo||'Asignación manual'));
 db.prepare("INSERT INTO historial(turno_id,usuario_accion_id,accion,detalle) VALUES(?,?,'crear',?)").run(info.lastInsertRowid,req.usuario.id,'Turno '+tipo+' del '+fecha);
 return info.lastInsertRowid;
 })();
 const u=db.prepare('SELECT email FROM usuarios WHERE id=?').get(usuario_id);
 await notificar(usuario_id,u.email,'Nuevo turno asignado','Turno '+tipo+' del '+fecha+'.');
 res.status(201).json({id});
});
router.put('/:id',soloAdmin,async(req,res)=>{
 const t=db.prepare('SELECT * FROM turnos WHERE id=?').get(req.params.id);if(!t)return res.status(404).json({error:'Turno no encontrado.'});
 const tipo=req.body.tipo??t.tipo,fecha=req.body.fecha??t.fecha;
 const error=validarTurno(t.usuario_id,fecha,tipo,t.id);if(error)return res.status(409).json({error});
 db.transaction(()=>{
 db.prepare("UPDATE turnos SET tipo=?,fecha=?,estado='cambiado',origen='cambio',motivo=? WHERE id=?").run(tipo,fecha,req.body.motivo??t.motivo,t.id);
 db.prepare("INSERT INTO historial(turno_id,usuario_accion_id,accion,detalle) VALUES(?,?,'cambio',?)").run(t.id,req.usuario.id,'Turno modificado: '+tipo+' del '+fecha);
 })();
 const u=db.prepare('SELECT email FROM usuarios WHERE id=?').get(t.usuario_id);
 await notificar(t.usuario_id,u.email,'Tu turno fue modificado','Nuevo turno: '+tipo+' del '+fecha+'.');
 res.json({ok:true});
});
router.delete('/:id',soloAdmin,async(req,res)=>{
 const t=db.prepare('SELECT * FROM turnos WHERE id=?').get(req.params.id);if(!t)return res.status(404).json({error:'Turno no encontrado.'});
 db.transaction(()=>{
 db.prepare('DELETE FROM solicitudes WHERE turno_id=?').run(t.id);
 db.prepare('DELETE FROM turnos WHERE id=?').run(t.id);
 db.prepare("INSERT INTO historial(turno_id,usuario_accion_id,accion,detalle) VALUES(?,?,'eliminar',?)").run(t.id,req.usuario.id,'Turno eliminado: '+t.tipo+' del '+t.fecha);
 })();
 const u=db.prepare('SELECT email FROM usuarios WHERE id=?').get(t.usuario_id);
 await notificar(t.usuario_id,u.email,'Turno cancelado','Se canceló tu turno '+t.tipo+' del '+t.fecha+'.');
 res.json({ok:true});
});
module.exports=router;
