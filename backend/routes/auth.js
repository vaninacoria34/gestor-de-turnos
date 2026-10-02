const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generarToken, autenticar, soloAdmin, COOKIE_NOMBRE } = require('../auth');

const MAX_EDAD_SESION_SEG = 8 * 3600;

// POST /api/auth/login — inicia sesión y fija la cookie httpOnly
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  if (!u.activo) return res.status(403).json({ error: 'Usuario desactivado' });

  const token = generarToken(u);
  // Cookie httpOnly: la sesión no vive en localStorage, solo en el navegador.
  res.setHeader('Set-Cookie',
    `${COOKIE_NOMBRE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_EDAD_SESION_SEG}`);
  res.json({
    token,
    usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, horario_fijo: u.horario_fijo },
  });
});

// POST /api/auth/logout — elimina la cookie de sesión
router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie',
    `${COOKIE_NOMBRE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', autenticar, (req, res) => {
  const u = db.prepare('SELECT id, nombre, email, rol, area, horario_fijo FROM usuarios WHERE id = ?')
    .get(req.usuario.id);
  res.json(u);
});

// GET /api/auth/usuarios  (lista de empleados — admin o empleado)
router.get('/usuarios', autenticar, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, email, rol, area, telefono, horario_fijo, activo FROM usuarios ORDER BY nombre').all());
});

router.put('/cuenta', autenticar, (req,res) => {
  const u=db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.usuario.id);
  const {password_actual,password_nueva}=req.body || {};
  if(typeof password_actual!=='string'||!bcrypt.compareSync(password_actual,u.password_hash))
    return res.status(400).json({error:'La contraseña actual no es correcta.'});
  if(typeof password_nueva!=='string'||password_nueva.length<8||password_nueva.length>72)
    return res.status(400).json({error:'La nueva contraseña debe tener entre 8 y 72 caracteres.'});
  db.prepare('UPDATE usuarios SET password_hash=?,sesion_version=sesion_version+1 WHERE id=?').run(bcrypt.hashSync(password_nueva,10),u.id);
  res.setHeader('Set-Cookie',COOKIE_NOMBRE+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ok:true});
});

function validarUsuario(datos,actual) {
  const u={...actual,...datos};
  if(typeof u.nombre!=='string'||!u.nombre.trim())return 'El nombre es obligatorio.';
  if(!['empleado','admin'].includes(u.rol))return 'Rol inválido.';
  if(u.horario_fijo && !['manana','tarde'].includes(u.horario_fijo))return 'Horario inválido.';
  if(u.email && (typeof u.email!=='string'||!/^\S+@\S+\.\S+$/.test(u.email)))return 'Correo inválido.';
  if(u.password && (typeof u.password!=='string'||u.password.length<8||u.password.length>72))return 'La contraseña debe tener entre 8 y 72 caracteres.';
  if(u.activo!==undefined && ![0,1].includes(u.activo))return 'Estado inválido.';
  return null;
}

// POST /api/auth/usuarios  (crear empleado/admin — solo admin)
router.post('/usuarios', autenticar, soloAdmin, (req, res) => {
  const { nombre, email, password, rol = 'empleado', area, telefono, horario_fijo = null } = req.body;
  const error=validarUsuario(req.body,{rol:'empleado'});
  if(error)return res.status(400).json({error});
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  // Email y teléfono son opcionales
  const emailFinal = (email && email.trim()) ? email.trim() : null;
  const passFinal = password || 'temporal123';
  try {
    const info = db.prepare(
      "INSERT INTO usuarios (nombre, email, password_hash, rol, area, telefono, horario_fijo) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(nombre.trim(), emailFinal ? emailFinal.toLowerCase() : null, bcrypt.hashSync(passFinal, 10), rol, area || null, telefono || null, horario_fijo || null);
    res.status(201).json({ id: info.lastInsertRowid, email: emailFinal });
  } catch (e) {
    res.status(400).json({ error: 'El email ya está registrado' });
  }
});

// PUT /api/auth/usuarios/:id  (editar — solo admin)
router.put('/usuarios/:id', autenticar, soloAdmin, (req, res) => {
  const { nombre, email, rol, area, telefono, horario_fijo, activo, password } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  const error=validarUsuario(req.body,u);
  if(error)return res.status(400).json({error});
  if(u.rol==='admin' && u.activo && (rol==='empleado'||activo===0) &&
      db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='admin' AND activo=1").get().n<=1)
    return res.status(409).json({error:'Debe quedar al menos un administrador activo.'});
  const opt=(valor,anterior)=>valor===undefined?anterior:(typeof valor==='string'?valor.trim()||null:valor);
  try {
  db.prepare(
    `UPDATE usuarios SET nombre=?, email=?, rol=?, area=?, telefono=?, horario_fijo=?, activo=?, sesion_version=sesion_version+?
     ${password ? ', password_hash=?' : ''} WHERE id=?`
  ).run(
    nombre===undefined?u.nombre:nombre.trim(), email===undefined?u.email:(email?email.trim().toLowerCase():null), rol ?? u.rol, opt(area,u.area),
    opt(telefono,u.telefono), opt(horario_fijo,u.horario_fijo), activo ?? u.activo, password?1:0,
    ...(password ? [bcrypt.hashSync(password, 10)] : []), req.params.id
  );
  res.json({ ok: true });
  } catch(error) { res.status(409).json({error:'No se pudo guardar. Verificá que el correo no esté registrado.'}); }
});

// DELETE /api/auth/usuarios/:id  — elimina físicamente (con sus turnos) si no tiene historial crítico
router.delete('/usuarios/:id', autenticar, soloAdmin, (req, res) => {
  const id = req.params.id;
  if(Number(id)===req.usuario.id)return res.status(409).json({error:'No podés eliminar tu propia cuenta.'});
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  if (u.rol === 'admin' && db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='admin' AND activo=1").get().n <= 1) {
    return res.status(409).json({ error: 'No puedes eliminar el último administrador' });
  }
  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM descansos WHERE usuario_id = ?').run(id);
    db.prepare('DELETE FROM notificaciones WHERE usuario_id = ?').run(id);
    db.prepare('UPDATE historial SET usuario_accion_id=NULL WHERE usuario_accion_id=?').run(id);
    db.prepare('DELETE FROM solicitudes WHERE usuario_id = ?').run(id);
    db.prepare('DELETE FROM turnos WHERE usuario_id = ?').run(id);
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (?, 'eliminar', ?)")
      .run(req.usuario.id, `Empleado eliminado: ${u.nombre} (${u.email || 'sin correo'})`);
  });
  borrar();
  res.json({ ok: true });
});

module.exports = router;
