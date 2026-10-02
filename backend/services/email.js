const nodemailer=require('nodemailer'),db=require('../db');
const {enviar,configurado:whatsappConfigurado}=require('./whatsapp');
const {leer}=require('./canales');
function estadoCanales(){
 const c=leer();return {email:!!(c.email_enabled&&c.smtp_host&&c.smtp_from),whatsapp:whatsappConfigurado()||(c.whatsapp_enabled&&c.whatsapp_mode==='automatico'&&!!process.env.CALLMEBOT_APIKEY)};
}
async function notificar(usuarioId,email,asunto,cuerpo){
 const u=db.prepare('SELECT telefono FROM usuarios WHERE id=?').get(usuarioId);
 if(!u)return;
 const cfg=estadoCanales();
 const emailEstado=email?(cfg.email?'pendiente':'no_configurado'):'sin_destino';
 const whatsappEstado=u.telefono?(cfg.whatsapp?'pendiente':'no_configurado'):'sin_destino';
 const r=db.prepare('INSERT INTO notificaciones(usuario_id,asunto,cuerpo,email_estado,whatsapp_estado) VALUES(?,?,?,?,?)').run(usuarioId,asunto,cuerpo,emailEstado,whatsappEstado);
 return {id:r.lastInsertRowid};
}
let procesando=false;
async function procesarCola(){
 if(procesando||process.env.NOTIFICATIONS_DISABLED==='1')return;
 procesando=true;
 try{
 const rows=db.prepare("SELECT n.*,u.email,u.telefono FROM notificaciones n JOIN usuarios u ON u.id=n.usuario_id WHERE n.email_estado='pendiente' OR n.whatsapp_estado='pendiente' ORDER BY n.id LIMIT 10").all();
 for(const n of rows){
  if(n.email_estado==='pendiente'){
   let estado='aceptado',error=null;
   try{
    if(!estadoCanales().email){estado='no_configurado';}else{
    const c=leer();
    const transporte=nodemailer.createTransport({host:c.smtp_host,port:Number(c.smtp_port||587),secure:c.smtp_secure,auth:c.smtp_user?{user:c.smtp_user,pass:c.smtp_pass}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    const resultado=await transporte.sendMail({from:c.smtp_from,to:n.email,subject:n.asunto,text:n.cuerpo});
    if(!resultado.accepted?.length)throw Error('El servidor de correo no aceptó el destinatario.');
    }
   }catch(e){estado='error';error=e.code||'No se pudo enviar el correo.';}
   db.prepare('UPDATE notificaciones SET email_estado=?,email_error=? WHERE id=?').run(estado,error,n.id);
  }
  if(n.whatsapp_estado==='pendiente'){
   const r=await enviar(n.telefono,n.cuerpo);
   db.prepare('UPDATE notificaciones SET whatsapp_estado=?,whatsapp_error=? WHERE id=?').run(r.estado,r.error||null,n.id);
  }
 }
 }finally{procesando=false;}
}
function iniciarCola(){
 // Any interrupted delivery remains pending and is retried on restart.
 const timer=setInterval(()=>procesarCola().catch(e=>console.error('Cola de avisos:',e.message)),5000);timer.unref();
 procesarCola().catch(e=>console.error('Cola de avisos:',e.message));
 return timer;
}
module.exports={notificar,estadoCanales,procesarCola,iniciarCola};
