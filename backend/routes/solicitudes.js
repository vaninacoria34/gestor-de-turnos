const router = require('express').Router();
const db = require('../db');
const { autenticar, soloAdmin } = require('../auth');
const { TIPOS } = require('../services/config');
const { notificar } = require('../services/email');
const { validarTurno,fechaValida } = require('../services/validacion');

const SELECT = `SELECT s.*, t.fecha AS fecha_actual, t.tipo AS tipo_actual,
  u.nombre AS empleado, u.email AS email_empleado
  FROM solicitudes s
  JOIN turnos t ON t.id = s.turno_id
  JOIN usuarios u ON u.id = s.usuario_id`;

// GET /api/solicitudes — empleado ve las suyas, admin todas
router.get('/', autenticar, (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.json(db.prepare(SELECT + ' ORDER BY s.id DESC').all());
  }
  res.json(db.prepare(SELECT + ' WHERE s.usuario_id = ? ORDER BY s.id DESC').all(req.usuario.id));
});

// POST /api/solicitudes — empleado solicita cambio de su turno
router.post('/', autenticar, async (req, res) => {
  const { turno_id, tipo_nuevo, fecha_nueva, motivo } = req.body;
  if (!TIPOS.includes(tipo_nuevo)) {
    return res.status(400).json({ error: 'Tipo de turno inválido (solo manana o tarde)' });
  }
  const turno = db.prepare('SELECT * FROM turnos WHERE id = ?').get(turno_id);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  if (turno.usuario_id !== req.usuario.id && req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo puedes solicitar cambios sobre tus propios turnos' });
  }
  if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Debes indicar el motivo' });
  if(!fechaValida(fecha_nueva))return res.status(400).json({error:'Fecha inválida.'});
  if(turno.fecha===fecha_nueva&&turno.tipo===tipo_nuevo)return res.status(400).json({error:'La solicitud debe proponer un cambio.'});
  if(db.prepare("SELECT id FROM solicitudes WHERE turno_id=? AND estado='pendiente'").get(turno.id))
    return res.status(409).json({error:'Ya existe una solicitud pendiente para este turno.'});
  const conflicto=validarTurno(turno.usuario_id,fecha_nueva,tipo_nuevo,turno.id);
  if(conflicto)return res.status(409).json({error:conflicto});

  const info = db.prepare(
    'INSERT INTO solicitudes (turno_id, usuario_id, tipo_nuevo, fecha_nueva, motivo) VALUES (?, ?, ?, ?, ?)'
  ).run(turno_id, turno.usuario_id, tipo_nuevo, fecha_nueva, motivo.trim());

  // Aviso al admin
  const admins = db.prepare("SELECT * FROM usuarios WHERE rol='admin' AND activo=1").all();
  for (const a of admins) {
    await notificar(a.id, a.email, 'Nueva solicitud de cambio de turno',
      `${req.usuario.nombre} solicita cambiar su turno ${turno.tipo} del ${turno.fecha} a ${tipo_nuevo} del ${fecha_nueva}. Motivo: ${motivo.trim()}`);
  }
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/solicitudes/:id/aprobar — admin: aplica el cambio al turno
router.put('/:id/aprobar', autenticar, soloAdmin, async (req, res) => {
  const s = db.prepare(SELECT + ' WHERE s.id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (s.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue procesada' });

  // Conflicto: el empleado ya tendría ese mismo turno (fecha + tipo)
  const duplicado = db.prepare('SELECT id FROM turnos WHERE usuario_id=? AND fecha=? AND tipo=? AND id != ?')
    .get(s.usuario_id, s.fecha_nueva, s.tipo_nuevo, s.turno_id);
  if (duplicado) return res.status(409).json({ error: 'Conflicto: el empleado ya tiene un turno ' + s.tipo_nuevo + ' el ' + s.fecha_nueva });
  const conflicto=validarTurno(s.usuario_id,s.fecha_nueva,s.tipo_nuevo,s.turno_id);
  if(conflicto)return res.status(409).json({error:conflicto});

  try {
    const aplicar = db.transaction(() => {
    db.prepare("UPDATE turnos SET tipo=?, fecha=?, estado='cambiado', origen='cambio' WHERE id=?")
      .run(s.tipo_nuevo, s.fecha_nueva, s.turno_id);
    db.prepare("UPDATE solicitudes SET estado='aprobada' WHERE id=?").run(s.id);
    db.prepare("INSERT INTO historial (turno_id, usuario_accion_id, accion, detalle) VALUES (?, ?, 'cambio', ?)")
      .run(s.turno_id, req.usuario.id,
        `Cambio APROBADO (solicitud #${s.id}): turno del ${s.fecha_actual} (${s.tipo_actual}) a ${s.fecha_nueva} (${s.tipo_nuevo}). Motivo: ${s.motivo}`);
  });
    aplicar();
  } catch (e) {
    return res.status(409).json({ error: 'No se pudo aplicar el cambio: ' + e.message });
  }

  await notificar(s.usuario_id, s.email_empleado, 'Tu solicitud fue APROBADA ✔',
    `Tu cambio de turno fue aprobado: ${s.tipo_actual} del ${s.fecha_actual} → ${s.tipo_nuevo} del ${s.fecha_nueva}.`);
  res.json({ ok: true });
});

// PUT /api/solicitudes/:id/rechazar — admin: solo marca rechazada
router.put('/:id/rechazar', autenticar, soloAdmin, async (req, res) => {
  const s = db.prepare(SELECT + ' WHERE s.id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (s.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue procesada' });

  db.prepare("UPDATE solicitudes SET estado='rechazada' WHERE id=?").run(s.id);
  db.prepare("INSERT INTO historial (turno_id, usuario_accion_id, accion, detalle) VALUES (?, ?, 'cambio', ?)")
    .run(s.turno_id, req.usuario.id,
      `Cambio RECHAZADO (solicitud #${s.id}): ${s.tipo_actual} del ${s.fecha_actual} → ${s.tipo_nuevo} del ${s.fecha_nueva}. Motivo del empleado: ${s.motivo}`);

  await notificar(s.usuario_id, s.email_empleado, 'Tu solicitud fue rechazada',
    `Tu solicitud de cambio de turno fue rechazada. Motivo indicado: ${s.motivo}`);
  res.json({ ok: true });
});

module.exports = router;
