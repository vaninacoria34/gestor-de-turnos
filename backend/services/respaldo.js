const fs=require('fs'),path=require('path'),db=require('../db');
const dir=process.env.BACKUP_DIR||path.join(__dirname,'../_backup');
let activo=null;
function listar(){
 if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(n=>/^gestor-.*\.sqlitebak$/.test(n)).map(nombre=>({nombre,bytes:fs.statSync(path.join(dir,nombre)).size})).sort((a,b)=>b.nombre.localeCompare(a.nombre));
}
async function crear(){
 if(activo)return activo;
 activo=(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const nombre='gestor-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlitebak';
 await db.backup(path.join(dir,nombre));
 return {nombre,bytes:fs.statSync(path.join(dir,nombre)).size};
 })();
 try{return await activo;}finally{activo=null;}
}
function iniciar(){
 if(process.env.BACKUPS_DISABLED==='1')return;
 const revisar=()=>{const hoy=new Date().toISOString().slice(0,10);if(!listar().some(b=>b.nombre.startsWith('gestor-'+hoy)))crear().catch(e=>console.error('Respaldo:',e.message));};
 revisar();const timer=setInterval(revisar,3600000);timer.unref();
}
module.exports={crear,listar,iniciar};
