const db=require('../db');
const {getConfig}=require('./config');
function fechaValida(fecha){
 if(typeof fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(fecha))return false;
 const d=new Date(fecha+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===fecha;
}
function validarTurno(usuarioId,fecha,tipo,excluir=0){
 if(!fechaValida(fecha)||!['manana','tarde'].includes(tipo))return 'Indicá una fecha y un turno válidos.';
 const u=db.prepare("SELECT * FROM usuarios WHERE id=? AND activo=1 AND rol='empleado'").get(usuarioId);
 if(!u)return 'El empleado no existe o está inactivo.';
 if(db.prepare('SELECT id FROM turnos WHERE usuario_id=? AND fecha=? AND id!=?').get(usuarioId,fecha,excluir))return 'El empleado ya tiene un turno ese día.';
 const dia=new Date(fecha+'T12:00:00').getDay();
 if(db.prepare('SELECT id FROM descansos WHERE usuario_id=? AND (fecha=? OR (fecha IS NULL AND dia_semana=?))').get(usuarioId,fecha,dia))return 'El empleado tiene un descanso registrado ese día.';
 const cfg=getConfig(),cantidad=db.prepare('SELECT COUNT(*) n FROM turnos WHERE fecha=? AND tipo=? AND id!=?').get(fecha,tipo,excluir).n;
 if(cfg.max[tipo]!==null&&cantidad>=cfg.max[tipo])return 'El turno alcanzó el máximo de personas configurado.';
 return null;
}
module.exports={fechaValida,validarTurno};
