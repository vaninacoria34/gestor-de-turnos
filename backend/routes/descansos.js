const router = require('express').Router();
const db = require('../db');
const { autenticar, soloAdmin } = require('../auth');
const { fechaValida } = require('../services/validacion');

const BASE = `
  SELECT d.id, d.usuario_id, d.dia_semana, d.fecha, d.motivo, d.creado_en, u.nombre AS empleado
  FROM descansos d JOIN usuarios u ON u.id = d.usuario_id`;

// GET /api/descansos — admin: todos; empleado: solo los suyos
router.get('/', autenticar, (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.json(db.prepare(BASE + ' ORDER BY d.id DESC').all());
  }
  res.json(db.prepare(BASE + ' WHERE d.usuario_id = ? ORDER BY d.id DESC').all(req.usuario.id));
});

// POST /api/descansos — solo admin. { usuario_id, dia_semana (0-6) | fecha (YYYY-MM-DD), motivo? }
router.post('/', autenticar, soloAdmin, (req, res) => {
  const { usuario_id, dia_semana, fecha, motivo } = req.body || {};
  if((dia_semana!=null)===!!fecha)return res.status(400).json({error:'Elegí un día semanal o una fecha puntual, no ambos.'});
  if(fecha&&!fechaValida(fecha))return res.status(400).json({error:'Fecha inválida.'});

  const usuario = db.prepare('SELECT id, nombre FROM usuarios WHERE id = ?').get(usuario_id);
  if (!usuario) return res.status(404).json({ error: 'Empleado no encontrado' });
  const conflicto=fecha
    ? db.prepare('SELECT id FROM turnos WHERE usuario_id=? AND fecha=?').get(usuario_id,fecha)
    : db.prepare("SELECT id FROM turnos WHERE usuario_id=? AND fecha>=date('now','localtime') AND CAST(strftime('%w',fecha) AS INTEGER)=?").get(usuario_id,Number(dia_semana));
  if(conflicto)return res.status(409).json({error:'Hay turnos asignados en ese descanso. Modificalos o cancelalos primero.'});
  if(db.prepare('SELECT id FROM descansos WHERE usuario_id=? AND (fecha=? OR (fecha IS NULL AND dia_semana=?))').get(usuario_id,fecha||null,dia_semana??null))
    return res.status(409).json({error:'Este descanso ya está registrado.'});
  if (dia_semana == null && !fecha) {
    return res.status(400).json({ error: 'Indicá dia_semana (0=domingo … 6=sábado) o una fecha puntual (YYYY-MM-DD)' });
  }
  if (dia_semana != null) {
    const d = Number(dia_semana);
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return res.status(400).json({ error: 'dia_semana debe ser un entero entre 0 (domingo) y 6 (sábado)' });
    }
  }
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'La fecha debe tener el formato YYYY-MM-DD' });
  }

  const info = db.prepare(
    'INSERT INTO descansos (usuario_id, dia_semana, fecha, motivo) VALUES (?, ?, ?, ?)'
  ).run(usuario_id, dia_semana != null ? Number(dia_semana) : null, fecha || null, motivo || null);

  const descripcion = dia_semana != null
    ? `descanso los ${nombresDia()[dia_semana]}`
    : `descanso el ${fecha}`;

  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (?, 'ausencia', ?)")
    .run(req.usuario.id, `Descanso registrado: ${usuario.nombre} — ${descripcion}${motivo ? ` — Motivo: ${motivo}` : ''}`);

  res.status(201).json({ id: info.lastInsertRowid });
});

// DELETE /api/descansos/:id — solo admin
router.delete('/:id', autenticar, soloAdmin, (req, res) => {
  const d = db.prepare('SELECT * FROM descansos WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM descansos WHERE id = ?').run(d.id);
  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (?, 'ausencia', ?)")
    .run(req.usuario.id, `Descanso eliminado (empleado ${d.usuario_id})`);
  res.json({ ok: true });
});

function nombresDia() {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
}

module.exports = router;
