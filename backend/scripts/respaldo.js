require('dotenv').config({path:require('path').join(__dirname,'../.env'),quiet:true});
const db=require('../db');
require('../services/respaldo').crear().then(r=>{console.log('Respaldo creado: '+r.nombre);db.close();}).catch(e=>{console.error(e.message);db.close();process.exitCode=1;});
