// Isolated regression checks: in-memory database and simulated transports only.
const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
process.env.JWT_SECRET='notifications-test-only';
process.env.NOTIFICATIONS_DISABLED='0';
for(const key of Object.keys(process.env)){
 if(/^(SMTP_|WHATSAPP_|CALLMEBOT_)/.test(key))delete process.env[key];
}
const db=require('../db');
const canales=require('../services/canales');
const nodemailer=require('nodemailer');
const originalFetch=global.fetch,originalTransport=nodemailer.createTransport;
let calls=0,fail=false;
global.fetch=async()=>{
 calls++;
 if(fail)throw new Error('Simulated network failure');
 return {ok:true,json:async()=>({messages:[{id:'test-message'}]})};
};
nodemailer.createTransport=()=>({sendMail:async()=>{
 if(fail)throw Object.assign(new Error('Simulated SMTP failure'),{code:'ECONNECTION'});
 return {accepted:['ana@example.test']};
}});
const {notificar,estadoCanales,procesarCola}=require('../services/email');
const row=id=>db.prepare('SELECT * FROM notificaciones WHERE id=?').get(id);
async function main(){
 const id=db.prepare("INSERT INTO usuarios(nombre,email,telefono,password_hash) VALUES(?,?,?,?)")
  .run('Ana','ana@example.test','5491100000000','unused').lastInsertRowid;
 assert.deepEqual(estadoCanales(),{email:false,whatsapp:false});
 let aviso=await notificar(id,'ana@example.test','Turno','Mensaje');
 assert.equal(row(aviso.id).whatsapp_estado,'no_configurado');
 await procesarCola();assert.equal(calls,0);
 canales.guardar({email_enabled:true,smtp_host:'smtp.example.test',smtp_from:'gestor@example.test',
  whatsapp_enabled:true,whatsapp_mode:'automatico',whatsapp_token:'test-only',whatsapp_phone_id:'123',whatsapp_template:'test',whatsapp_version:'v25.0'});
 aviso=await notificar(id,'ana@example.test','Turno','Mensaje');
 assert.equal(row(aviso.id).whatsapp_estado,'pendiente');
 await procesarCola();
 assert.equal(row(aviso.id).email_estado,'aceptado');
 assert.equal(row(aviso.id).whatsapp_estado,'aceptado');
 assert.equal(row(aviso.id).leida,0);
 assert.equal(calls,1);
 await procesarCola();assert.equal(calls,1,'Accepted messages must not be sent again');
 fail=true;
 aviso=await notificar(id,'ana@example.test','Turno','Mensaje');
 await procesarCola();
 assert.equal(row(aviso.id).email_estado,'error');
 assert.equal(row(aviso.id).whatsapp_estado,'error');
 assert.equal(row(aviso.id).email_error,'ECONNECTION');
 const previousCalls=calls;
 canales.guardar({whatsapp_mode:'simple'});
 process.env.CALLMEBOT_APIKEY='test-only';
 assert.equal(estadoCanales().whatsapp,false,'Simple mode must not activate automatic delivery');
 const pending=await notificar(id,null,'Turno','Mensaje');
 assert.equal(row(pending.id).whatsapp_estado,'no_configurado');
 db.prepare("UPDATE notificaciones SET whatsapp_estado='pendiente' WHERE id=?").run(pending.id);
 await procesarCola();assert.equal(calls,previousCalls);
 assert.equal(row(pending.id).whatsapp_estado,'no_configurado');
 console.log('PASS notifications: unconfigured channels, queue delivery, errors, unread state and no duplicate processing');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 global.fetch=originalFetch;nodemailer.createTransport=originalTransport;db.close();
});
