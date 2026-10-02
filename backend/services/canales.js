const db=require('../db'),crypto=require('crypto');
db.exec('CREATE TABLE IF NOT EXISTS ajustes_app(clave TEXT PRIMARY KEY,valor TEXT NOT NULL)');
const secretos=['smtp_pass','whatsapp_token'];
const {PLANTILLA_TURNO}=require('./mensajes');
const campos=['empresa','email_enabled','smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass','smtp_from','whatsapp_enabled','whatsapp_token','whatsapp_phone_id','whatsapp_template','whatsapp_language','whatsapp_version'];
const key=()=>crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
campos.push('whatsapp_mode','plantilla_turno');
function completar(c){
 return {whatsapp_mode:(c.whatsapp_enabled||process.env.CALLMEBOT_APIKEY)?'automatico':'simple',plantilla_turno:PLANTILLA_TURNO,...c};
}
function leer(){
 const row=db.prepare("SELECT valor FROM ajustes_app WHERE clave='canales'").get();
 if(row){
  const [iv,tag,data]=row.valor.split('.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));
  return completar(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8')));
 }
 return completar({empresa:'Mi empresa',email_enabled:!!process.env.SMTP_HOST,smtp_host:process.env.SMTP_HOST||'',smtp_port:process.env.SMTP_PORT||'587',smtp_secure:process.env.SMTP_SECURE==='true',smtp_user:process.env.SMTP_USER||'',smtp_pass:process.env.SMTP_PASS||'',smtp_from:process.env.SMTP_FROM||'',whatsapp_enabled:!!process.env.WHATSAPP_TOKEN,whatsapp_token:process.env.WHATSAPP_TOKEN||'',whatsapp_phone_id:process.env.WHATSAPP_PHONE_ID||'',whatsapp_template:process.env.WHATSAPP_TEMPLATE||'',whatsapp_language:process.env.WHATSAPP_LANGUAGE||'es_AR',whatsapp_version:process.env.WHATSAPP_API_VERSION||''});
}
function publico(){
 const c=leer();for(const k of secretos){c[k+'_guardado']=!!c[k];delete c[k];}return c;
}
function guardar(datos){
 const c=leer();
 for(const k of campos){
  if(datos[k]===undefined)continue;
  if(secretos.includes(k)&&datos[k]==='')continue;
  if(['email_enabled','smtp_secure','whatsapp_enabled'].includes(k)){if(typeof datos[k]!=='boolean')throw Error('Estado inválido.');c[k]=datos[k];}
  else {if(typeof datos[k]!=='string'||datos[k].length>2000)throw Error('Valor inválido.');c[k]=datos[k].trim();}
 }
 if(!c.empresa)throw Error('Indicá el nombre de la empresa.');
 if(c.email_enabled&&(!c.smtp_host||!c.smtp_from||!Number.isInteger(Number(c.smtp_port))||Number(c.smtp_port)<1||Number(c.smtp_port)>65535))throw Error('Completá el servidor, puerto y remitente de correo.');
 if(!['simple','automatico'].includes(c.whatsapp_mode))throw Error('Modo de WhatsApp inválido.');
 if(!c.plantilla_turno||/\{[^{}]*\}/.test(c.plantilla_turno.replace(/\{(nombre|fecha|horario|turno|empresa)\}/g,'')))throw Error('Usá las variables disponibles en la plantilla de turno.');
 if(c.whatsapp_enabled&&c.whatsapp_mode==='automatico'&&(!c.whatsapp_token||!/^\d+$/.test(c.whatsapp_phone_id)||!c.whatsapp_template||!/^v\d+\.0$/.test(c.whatsapp_version)))throw Error('Completá la configuración de WhatsApp Business.');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(c),'utf8'),cipher.final()]);
 db.prepare("INSERT INTO ajustes_app(clave,valor) VALUES('canales',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(iv.toString('hex')+'.'+cipher.getAuthTag().toString('hex')+'.'+data.toString('hex'));
 return publico();
}
module.exports={leer,publico,guardar};
