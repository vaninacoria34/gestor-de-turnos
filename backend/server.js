const path=require('path'),fs=require('fs'),crypto=require('crypto');
require('dotenv').config({path:process.env.ENV_FILE||path.join(__dirname,'.env'),quiet:true});
if(!process.env.JWT_SECRET||process.env.JWT_SECRET==='cambia-esta-clave-secreta'){
 process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
 if(!process.env.DB_PATH){
 const envPath=path.join(__dirname,'.env'),contenido=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
 const limpio=contenido.replace(/^JWT_SECRET=.*$/m,'');
 fs.writeFileSync(envPath,limpio+'\nJWT_SECRET='+process.env.JWT_SECRET+'\n');
 }
}
const express=require('express'),app=express();
require('./db');
app.disable('x-powered-by');
app.use(express.json({limit:'100kb'}));
app.use('/api',(req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origen no permitido.'});}
  catch{return res.status(403).json({error:'Origen inválido.'});}
 }
 next();
});
const intentos=new Map();
app.use('/api/auth/login',(req,res,next)=>{
 const now=Date.now(),ip=req.ip;
 for(const [k,v] of intentos)if(v.hasta<now)intentos.delete(k);
 const r=intentos.get(ip)||{n:0,hasta:now+15*60000};
 if(r.n>=20)return res.status(429).json({error:'Demasiados intentos. Volvé a intentar en 15 minutos.'});
 r.n++;intentos.set(ip,r);res.on('finish',()=>{if(res.statusCode===200)intentos.delete(ip);});next();
});
function asegurarAsync(router){
 for(const layer of router.stack||[]){
  if(layer.route){for(const handler of layer.route.stack){
   const fn=handler.handle;handler.handle=(req,res,next)=>{try{Promise.resolve(fn(req,res,next)).catch(next);}catch(e){next(e);}};
  }}
 }
 return router;
}
for(const nombre of ['auth','turnos','reglas','historial','solicitudes','descansos','notificaciones','reportes','sistema']){
 app.use('/api/'+nombre,asegurarAsync(require('./routes/'+nombre)));
}
app.get('/api/health',require('./auth').autenticar,(req,res)=>res.json({ok:true}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
app.use(express.static(path.join(__dirname,'../gestor-turnos'),{index:'pages/login.html'}));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 console.error('Error de solicitud:',err.code||err.name);
 res.status(err.status===400?400:500).json({error:err.status===400?'Datos de solicitud inválidos.':'No se pudo completar la operación. Revisá los datos e intentá nuevamente.'});
});
if(require.main===module){
 const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>{
 console.log('Gestor de Turnos disponible en puerto '+(process.env.PORT||3000));
 require('./services/email').iniciarCola();
 require('./services/respaldo').iniciar();
 });
 const cerrar=()=>server.close(()=>process.exit(0));
 process.on('SIGINT',cerrar);process.on('SIGTERM',cerrar);
}
module.exports=app;
