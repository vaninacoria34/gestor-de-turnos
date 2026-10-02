const router = require('express').Router();
const db = require('../db');
const { autenticar } = require('../auth');

const BASE = `SELECT h.*, ua.nombre AS autor, u.nombre AS empleado
  FROM historial h
  LEFT JOIN usuarios ua ON ua.id = h.usuario_accion_id
  LEFT JOIN turnos t ON t.id = h.turno_id
  LEFT JOIN usuarios u ON u.id = t.usuario_id`;

router.get('/', autenticar, (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.json(db.prepare(BASE + ' ORDER BY h.id DESC LIMIT 200').all());
  }
  res.json(db.prepare(BASE + ' WHERE t.usuario_id = ? OR h.usuario_accion_id = ? ORDER BY h.id DESC LIMIT 200')
    .all(req.usuario.id, req.usuario.id));
});

module.exports = router;
