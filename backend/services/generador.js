const db=require('../db');
const {getConfig,TIPOS}=require('./config');
const {fechaValida}=require('./validacion');
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function generarSemana(lunes,actor=null){
 if(!fechaValida(lunes)||new Date(lunes+'T12:00:00').getDay()!==1)throw new Error('La fecha debe ser un lunes válido.');
 return db.transaction(()=>{
 const cfg=getConfig(),creados=[];
 const empleados=db.prepare("SELECT * FROM usuarios WHERE activo=1 AND rol='empleado' ORDER BY id").all();
 const descansos=db.prepare('SELECT * FROM descansos').all();
 const inicio=new Date(lunes+'T12:00:00'),carga=id=>db.prepare('SELECT COUNT(*) n FROM turnos WHERE usuario_id=? AND fecha>=? AND fecha<?').get(id,lunes.slice(0,7)+'-01',lunes.slice(0,7)+'-32').n;
 for(let i=0;i<7;i++){
  const d=new Date(inicio);d.setDate(d.getDate()+i);const fecha=iso(d);
  const ocupados=new Set(db.prepare('SELECT usuario_id FROM turnos WHERE fecha=?').all(fecha).map(t=>t.usuario_id));
  const libre=u=>!ocupados.has(u.id)&&!descansos.some(r=>r.usuario_id===u.id&&(r.fecha?r.fecha===fecha:r.dia_semana===d.getDay()));
  const domingos=id=>db.prepare("SELECT COUNT(*) n FROM turnos WHERE usuario_id=? AND fecha LIKE ? AND strftime('%w',fecha)='0'").get(id,fecha.slice(0,7)+'%').n;
  const ordenar=(a,b)=>{
   if(d.getDay()===0&&cfg.rotarDomingos){const delta=domingos(a.id)-domingos(b.id);if(delta)return delta;}
   return carga(a.id)-carga(b.id)||a.id-b.id;
  };
  for(const tipo of TIPOS){
   let n=db.prepare('SELECT COUNT(*) n FROM turnos WHERE fecha=? AND tipo=?').get(fecha,tipo).n;
   const agregar=(u,motivo)=>{
    db.prepare("INSERT INTO turnos(usuario_id,fecha,tipo,origen,motivo) VALUES(?,?,?,'automatico',?)").run(u.id,fecha,tipo,motivo);
    ocupados.add(u.id);n++;creados.push({usuario_id:u.id,usuario:u.nombre,fecha,tipo,motivo});
   };
   for(const u of empleados.filter(u=>u.horario_fijo===tipo).sort(ordenar)){
    if(!libre(u))continue;if(cfg.max[tipo]!==null&&n>=cfg.max[tipo])break;
    agregar(u,'Horario fijo');
   }
   for(const u of empleados.filter(u=>!u.horario_fijo).sort(ordenar)){
    if(n>=cfg.min[tipo]||(cfg.max[tipo]!==null&&n>=cfg.max[tipo]))break;
    if(libre(u))agregar(u,d.getDay()===0&&cfg.rotarDomingos?'Rotación de domingos':'Cobertura mínima');
   }
  }
 }
 if(creados.length)db.prepare("INSERT INTO historial(usuario_accion_id,accion,detalle) VALUES(?,'generar',?)").run(actor,'Semana '+lunes+': '+creados.length+' turnos creados.');
 return creados;
 })();
}
function cobertura(lunes){
 const cfg=getConfig(),avisos=[],inicio=new Date(lunes+'T12:00:00');
 for(let i=0;i<7;i++){const d=new Date(inicio);d.setDate(d.getDate()+i);const fecha=iso(d);
 for(const tipo of TIPOS){const n=db.prepare('SELECT COUNT(*) n FROM turnos WHERE fecha=? AND tipo=?').get(fecha,tipo).n;
 if(n<cfg.min[tipo])avisos.push({fecha,tipo,faltan:cfg.min[tipo]-n});}}
 return avisos;
}
function previsualizar(lunes){
 let resultado;const rollback=new Error('preview');
 try{db.transaction(()=>{const detalle=generarSemana(lunes);resultado={creados:detalle.length,detalle,avisos:cobertura(lunes)};throw rollback;})();}catch(e){if(e!==rollback)throw e;}
 return resultado;
}
module.exports={generarSemana,cobertura,previsualizar,TIPOS,getReglas:getConfig};
