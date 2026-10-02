// Frontend behavior checks with isolated API stubs; never changes the application database.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../gestor-turnos/js');
function screen(file,admin=true){
 const nodes=new Map(),writes=[],callbacks={};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,checked:false,dataset:{},classList:{toggle(){}},addEventListener(type,fn){callbacks[id+':'+type]=fn;},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const ctx={document:{getElementById:el,addEventListener(type,fn){callbacks[type]=fn;},querySelectorAll:()=>[]},location:{pathname:'/pages/'+file.replace('.js','.html'),replace(p){this.redirect=p;}},confirm:()=>true,API:{esAdmin:()=>admin,proteger:async()=>{},usuario:()=>({id:7,nombre:'Test',rol:admin?'admin':'empleado'}),get:async()=>[],put:async(p,d)=>writes.push({p,d}),post:async(p,d)=>writes.push({p,d})},obtenerConfig:async()=>({horarios:{manana:'06:00 - 14:00',tarde:'14:00 - 22:00'}}),horarioDeTurno:(c,t)=>c.horarios[t],console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'interfaz.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
 return {ctx,el,writes,callbacks,run:s=>vm.runInContext(s,ctx)};
}
async function main(){
 let s=screen('solicitudes.js');
 s.ctx.API.get=async()=>[{id:2,estado:'pendiente',empleado:'Ana <script>',motivo:'<img src=x>',tipo_actual:'manana',tipo_nuevo:'tarde',fecha_actual:'2026-09-30',fecha_nueva:'2026-10-01'}];
 await s.run('renderizar()');
 assert(s.el('lista-solicitudes').innerHTML.includes('&lt;script&gt;'));
 assert(!s.el('lista-solicitudes').innerHTML.includes('<img'));
 s.el('filtro-estado').value='aprobada';s.run('pintar()');assert(s.el('lista-solicitudes').innerHTML.includes('colspan="6"'));
 s.el('filtro-estado').value='';await s.run("resolver(2,'aprobar')");assert.equal(s.writes[0].p,'/solicitudes/2/aprobar');
 s=screen('solicitudes.js',false);await s.run("resolver(2,'aprobar')");assert.equal(s.writes.length,0);
 s.run('UI.menu()');assert(!s.el('menu').innerHTML.includes('reportes.html'));
 assert(s.el('menu').innerHTML.includes('../index.html'));

 s=screen('historial.js');s.ctx.API.get=async()=>[{accion:'cambio',detalle:'<script>bad</script>',autor:'Ana',fecha:'2026-09-30 10:00:00'}];
 await s.run('renderizar()');assert(s.el('lista-historial').innerHTML.includes('&lt;script&gt;'));
 s.el('buscar').value='nadie';s.run('pintar()');assert(s.el('lista-historial').innerHTML.includes('colspan="4"'));

 s=screen('mis-turnos.js');s.ctx.API.get=async()=>[{id:9,usuario_id:7,tipo:'manana',fecha:'2026-09-30',estado:'asignado'},{id:10,usuario_id:8,tipo:'tarde',fecha:'2026-09-30'}];
 await s.run('renderizar()');assert.equal(s.el('stat-0').textContent,1);
 s.run('abrirSolicitud(9)');assert.equal(s.el('modal-solicitud').open,true);
 s.el('ms-motivo').value='';s.ctx.event={preventDefault(){},target:{querySelector:()=>({disabled:false})}};
 await s.run('enviarSolicitud(event)');assert.equal(s.writes.length,0);
 s.el('ms-motivo').value='Cambio personal';await s.run('enviarSolicitud(event)');assert.equal(s.writes[0].d.turno_id,9);
 assert.equal(s.el('modal-solicitud').open,false);

 s=screen('reglas.js');const f={};
 for(const k of ['horario_manana_inicio','horario_manana_fin','min_manana','max_manana','horario_tarde_inicio','horario_tarde_fin','min_tarde','max_tarde','min_domingos_mes'])f[k]={type:'text',value:'1'};
 f.rotar_domingos={type:'checkbox',checked:true};
 s.ctx.event={preventDefault(){},target:{elements:f}};
 f.min_manana.value='3';await s.run('guardar(event)');assert.equal(s.writes.length,0);
 f.max_manana.value='';await s.run('guardar(event)');assert.equal(s.writes[0].d.max_manana,'');assert.equal(s.writes[0].d.rotar_domingos,'1');
 s.ctx.API.put=async()=>{throw Error('Error de prueba');};await s.run('guardar(event)');assert.equal(s.el('guardar-reglas').disabled,false);
 assert.equal(s.el('estado-pagina').textContent,'Error de prueba');

 s=screen('reportes.js');s.el('r-desde').value='2026-10-02';s.el('r-hasta').value='2026-10-01';
 let calls=0;s.ctx.API.get=async()=>{calls++;return [];};await s.run('renderizar()');assert.equal(calls,0);
 assert.equal(s.run('celdaCSV(\'a"b,c\')'),'"a""b,c"');
 assert.equal(s.run('celdaCSV("=1+1")'),'"\'=1+1"');
 s.el('r-desde').value='2026-10-01';
 let resolveFirst;s.ctx.API.get=()=>new Promise(resolve=>{resolveFirst=resolve;});
 const first=s.run('renderizar()');
 s.ctx.API.get=async()=>[{area:'Actual',manana:1,tarde:2}];
 await s.run("reporteActivo='areas';renderizar()");resolveFirst([{fecha:'2020-01-01',manana:99,tarde:99}]);await first;
 assert(s.el('reporte-contenido').innerHTML.includes('Actual'));assert(!s.el('reporte-contenido').innerHTML.includes('199'));

 // Exercise the SQL taken from the route with a separate in-memory database.
 const Database=require('better-sqlite3'),db=new Database(':memory:');
 db.exec("CREATE TABLE turnos(fecha TEXT,tipo TEXT); INSERT INTO turnos VALUES ('2026-09-30','manana');");
 const src=fs.readFileSync(path.join(__dirname,'../routes/reportes.js'),'utf8');
 const body=src.match(/const sql = `(SELECT t\.fecha[^\x60]+)`;/)[1];
 const sql=body.replace('${whereTurnos(rango)}',' WHERE t.fecha BETWEEN ? AND ?');
 assert.equal(db.prepare(sql).get('2026-09-30','2026-09-30').n,1);
 const bound=src.match(/conds.push\("(s\.creado_en < [^"]+)"\)/)[1];
 db.exec("CREATE TABLE solicitudes(creado_en TEXT); INSERT INTO solicitudes VALUES ('2026-09-30 23:59:59'),('2026-10-01 00:00:00');");
 assert.equal(db.prepare('SELECT COUNT(*) n FROM solicitudes s WHERE '+bound).get('2026-09-30').n,1);
 db.close();
 console.log('PASS: filters, escaping, roles, form validation, API payloads, error recovery, report races, CSV and SQL date boundaries');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
