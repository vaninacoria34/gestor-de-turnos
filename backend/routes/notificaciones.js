const router=require('express').Router(),db=require('../db');
const {autenticar,soloAdmin}=require('../auth');
const {estadoCanales}=require('../services/email');
router.use(autenticar);
router.get('/count',(req,res)=>{
 res.json({count:db.prepare('SELECT COUNT(*) n FROM notificaciones WHERE usuario_id=? AND leida=0').get(req.usuario.id).n});
});
router.get('/canales',soloAdmin,(req,res)=>res.json(estadoCanales()));
router.get('/',(req,res)=>{
 const all=req.usuario.rol==='admin'&&req.query.todos==='1';
 res.json(db.prepare('SELECT n.*,u.nombre AS empleado FROM notificaciones n JOIN usuarios u ON u.id=n.usuario_id'+(all?'':' WHERE n.usuario_id=?')+' ORDER BY n.id DESC LIMIT 200').all(...(all?[]:[req.usuario.id])));
});
router.put('/leer-todas',(req,res)=>{
 db.prepare('UPDATE notificaciones SET leida=1 WHERE usuario_id=?').run(req.usuario.id);res.json({ok:true});
});
router.put('/:id/leer',(req,res)=>{
 const n=db.prepare('SELECT * FROM notificaciones WHERE id=? AND usuario_id=?').get(req.params.id,req.usuario.id);
 if(!n)return res.status(404).json({error:'Aviso no encontrado.'});
 db.prepare('UPDATE notificaciones SET leida=1 WHERE id=?').run(n.id);res.json({ok:true});
});
router.post('/:id/reintentar',soloAdmin,(req,res)=>{
 const n=db.prepare('SELECT * FROM notificaciones WHERE id=?').get(req.params.id);
 if(!n)return res.status(404).json({error:'Aviso no encontrado.'});
 const cfg=estadoCanales();
 const email=cfg.email&&['error','no_configurado'].includes(n.email_estado)?'pendiente':n.email_estado;
 const wa=cfg.whatsapp&&['error','no_configurado'].includes(n.whatsapp_estado)?'pendiente':n.whatsapp_estado;
 db.prepare('UPDATE notificaciones SET email_estado=?,whatsapp_estado=? WHERE id=?').run(email,wa,n.id);
 res.json({ok:true});
});
module.exports=router;
