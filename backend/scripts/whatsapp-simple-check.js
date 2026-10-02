// Real API, in-memory data, no provider requests and no production .env.
const assert=require('node:assert/strict'),path=require('node:path');
process.env.DB_PATH=':memory:';
process.env.ENV_FILE=path.join(__dirname,'nonexistent-test.env');
process.env.JWT_SECRET='whatsapp-simple-test-secret';
process.env.NOTIFICATIONS_DISABLED='1';process.env.BACKUPS_DISABLED='1';
for(const key of Object.keys(process.env))if(/^(SMTP_|WHATSAPP_|CALLMEBOT_)/.test(key))delete process.env[key];
const app=require('../server'),db=require('../db');
const server=app.listen(0,'127.0.0.1');
async function main(){
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 let token;
 async function api(method,url,body,status=200,auth=token){
  const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();assert.equal(res.status,status,method+' '+url+' '+JSON.stringify(data));return data;
 }
 token=(await api('POST','/auth/login',{email:'admin@empresa.com',password:'admin123'})).token;
 const user=await api('POST','/auth/usuarios',{nombre:'Ana & Sol',email:'ana@example.test',telefono:'+54 9 11 1234-5678',password:'testpass123'},201);
 const missing=await api('POST','/auth/usuarios',{nombre:'Sin contacto'},201);
 const turno=await api('POST','/turnos',{usuario_id:user.id,fecha:'2030-01-07',tipo:'manana'},201);
 await api('POST','/turnos',{usuario_id:missing.id,fecha:'2030-01-07',tipo:'tarde'},201);
 await api('POST','/turnos/'+turno.id+'/notificar',{},409);
 const settings=await api('PUT','/sistema/canales',{whatsapp_mode:'simple',whatsapp_enabled:true,empresa:'Equipo',plantilla_turno:'Hola {nombre}\n{fecha}\n{horario}\n{turno}\n{empresa}'});
 assert.equal(settings.whatsapp_token,undefined);
 assert.equal(settings.whatsapp_mode,'simple');
 const before=db.prepare('SELECT COUNT(*) n FROM notificaciones').get().n;
 const original=db.prepare('SELECT * FROM turnos WHERE id=?').get(turno.id);
 const msg=await api('POST','/turnos/'+turno.id+'/notificar',{});
 assert.equal(msg.estado,'preparado');
 const url=new URL(msg.url);
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/5491112345678');
 assert.equal(url.searchParams.get('text'),msg.texto);
 assert(msg.texto.includes('Hola Ana & Sol\n'));assert(msg.texto.includes('06:00 a 14:00'));assert(msg.texto.endsWith('Equipo'));
 const batch=await api('POST','/turnos/notificar-todos?desde=2030-01-07&hasta=2030-01-13',{});
 assert.equal(batch.preparados,1);assert.equal(batch.omitidos,1);assert.equal(batch.encolados,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notificaciones').get().n,before);
 assert.deepEqual(db.prepare('SELECT * FROM turnos WHERE id=?').get(turno.id),original);
 const history=db.prepare("SELECT detalle FROM historial WHERE accion='comunicacion'").all();
 assert.equal(history.length,2);assert(history.every(r=>r.detalle.includes('entrega no confirmada')));
 await api('POST','/turnos/notificar-todos?desde=2030-01-07&hasta=2030-03-01',{},400);
 await api('POST','/turnos/notificar-todos?desde=2030-02-31&hasta=2030-03-01',{},400);
 await api('PUT','/sistema/canales',{plantilla_turno:'{secreto}'},400);
 await api('PUT','/sistema/canales',{whatsapp_mode:'invalido'},400);
 const employee=(await api('POST','/auth/login',{email:'ana@example.test',password:'testpass123'})).token;
 await api('POST','/turnos/'+turno.id+'/notificar',{},403,employee);
 await api('POST','/turnos/notificar-todos?desde=2030-01-07&hasta=2030-01-13',{},403,employee);
 await api('PUT','/auth/usuarios/'+user.id,{telefono:'11abc12345678'});
 await api('POST','/turnos/'+turno.id+'/notificar',{},409);
 await api('PUT','/sistema/canales',{whatsapp_enabled:false});
 await api('POST','/turnos/notificar-todos?desde=2030-01-07&hasta=2030-01-13',{},409);
 console.log('PASS simple WhatsApp: real shift data, encoded link, batch omissions, permissions, disabled mode, validation, history and unchanged shifts/queue');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close(()=>db.close()));
