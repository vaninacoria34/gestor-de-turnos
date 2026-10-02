const {leer}=require('./canales');

// Envío simple por CallMeBot (mensajes de WhatsApp sin configurar Meta).
// Requiere CALLMEBOT_APIKEY en el .env y solo funciona hacia el número
// que autorizó el servicio (ver README / .env.example).
async function enviarCallMeBot(telefono, texto){
  const apiKey=process.env.CALLMEBOT_APIKEY;
  if(!apiKey)return {estado:'no_configurado'};
  const tel=String(telefono||'').replace(/\D/g,'');
  if(tel.length<10||tel.length>15)return {estado:'sin_destino'};
  try{
    const url='https://api.callmebot.com/whatsapp.php?phone=%2B'+tel
      +'&text='+encodeURIComponent(texto.slice(0,900))+'&apikey='+encodeURIComponent(apiKey);
    const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
    if(!res.ok)return {estado:'error',error:'CallMeBot respondió '+res.status};
    const cuerpo=(await res.text()).toLowerCase();
    // CallMeBot responde "Message queued" en HTML/texto plano.
    if(!/message queued|procesado|queued/.test(cuerpo))return {estado:'error',error:'CallMeBot no aceptó el mensaje.'};
    return {estado:'aceptado'};
  }catch(e){return {estado:'error',error:e.name==='TimeoutError'?'Tiempo de espera agotado.':'No se pudo contactar a CallMeBot.'};}
}

// Unifica los dos canales: Cloud API si está configurado, si no CallMeBot.
async function enviar(telefono, texto){
  const c=leer();
  if(!c.whatsapp_enabled||c.whatsapp_mode==='simple')return {estado:'no_configurado'};
  if(configurado())return enviarWhatsApp(telefono, 'Aviso', texto);
  return enviarCallMeBot(telefono, texto);
}

function configurado(){
 const c=leer();return !!(c.whatsapp_mode==='automatico'&&c.whatsapp_enabled&&c.whatsapp_token&&c.whatsapp_phone_id&&c.whatsapp_template&&c.whatsapp_version);
}
async function enviarWhatsApp(telefono,asunto,cuerpo){
 const tel=String(telefono||'').replace(/\D/g,'');
 if(tel.length<10||tel.length>15)return {estado:'sin_destino'};
 if(!configurado())return {estado:'no_configurado'};
 const c=leer(),version=c.whatsapp_version;
 if(!/^v\d+\.0$/.test(version))return {estado:'error',error:'Versión de Meta inválida.'};
 try{
 const res=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(c.whatsapp_phone_id)+'/messages',{
 method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+c.whatsapp_token,'Content-Type':'application/json'},
 body:JSON.stringify({messaging_product:'whatsapp',to:tel,type:'template',template:{name:c.whatsapp_template,language:{code:c.whatsapp_language||'es_AR'},components:[{type:'body',parameters:[{type:'text',text:asunto},{type:'text',text:cuerpo.replace(/\s+/g,' ').slice(0,900)}]}]}})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.messages?.[0]?.id)return {estado:'error',error:'Meta rechazó el envío ('+(data.error?.code||res.status)+').'};
 return {estado:'aceptado'};
 }catch(e){return {estado:'error',error:e.name==='TimeoutError'?'Tiempo de espera agotado.':'No se pudo contactar a Meta.'};}
}
module.exports={enviarWhatsApp,enviarCallMeBot,enviar,configurado};
