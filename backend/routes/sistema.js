const router=require('express').Router(),os=require('os');
const {autenticar,soloAdmin}=require('../auth');
const {crear,listar}=require('../services/respaldo');
const {estadoCanales}=require('../services/email');
router.use(autenticar,soloAdmin);
router.get('/canales',(req,res)=>res.json(require('../services/canales').publico()));
router.put('/canales',(req,res)=>{
 try{res.json(require('../services/canales').guardar(req.body));}
 catch(e){res.status(400).json({error:e.message});}
});
router.get('/',(req,res)=>{
 const port=process.env.PORT||3000;
 const direcciones=Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>'http://'+i.address+':'+port);
 res.json({direcciones,canales:estadoCanales(),respaldos:listar()});
});
router.post('/respaldo',async(req,res)=>res.json(await crear()));
module.exports=router;
