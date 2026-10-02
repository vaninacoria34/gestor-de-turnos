const router = require('express').Router();
const db = require('../db');
const { autenticar, soloAdmin } = require('../auth');

// Valida y normaliza los parámetros de fecha
function rangoFecha(req) {
  const desde = req.query.desde || null;
  const hasta = req.query.hasta || null;
  if ((desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) || (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta))) {
    return null;
  }
  return { desde, hasta };
}

// Construye la cláusula WHERE para fechas sobre la tabla `turnos`
function whereTurnos(rango) {
  if (!rango.desde && !rango.hasta) return '';
  const conds = [];
  if (rango.desde) conds.push('t.fecha >= ?');
  if (rango.hasta) conds.push('t.fecha <= ?');
  return ' WHERE ' + conds.join(' AND ');
}

// Construye la cláusula AND para JOINs (cuando la tabla turnos ya está en un LEFT JOIN)
function andTurnos(rango) {
  if (!rango.desde && !rango.hasta) return '';
  const conds = [];
  if (rango.desde) conds.push('t.fecha >= ?');
  if (rango.hasta) conds.push('t.fecha <= ?');
  return ' AND ' + conds.join(' AND ');
}

function paramsFecha(rango) {
  return [rango.desde, rango.hasta].filter(x => x !== null);
}

// GET /api/reportes/cobertura?desde=&hasta=
// Cuenta de turnos agrupados por fecha y tipo (manana/tarde)
router.get('/cobertura', autenticar, soloAdmin, (req, res) => {
  const rango = rangoFecha(req);
  if (!rango) return res.status(400).json({ error: 'Formato de fecha inválido (use YYYY-MM-DD)' });

  const sql = `SELECT t.fecha, t.tipo, COUNT(*) n FROM turnos t${whereTurnos(rango)} GROUP BY t.fecha, t.tipo ORDER BY t.fecha, t.tipo`;
  const rows = db.prepare(sql).all(...paramsFecha(rango));

  // Agrupar por fecha
  const porFecha = {};
  for (const r of rows) {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = { manana: 0, tarde: 0 };
    porFecha[r.fecha][r.tipo] = r.n;
  }
  res.json(Object.entries(porFecha).map(([fecha, tipos]) => ({ fecha, manana: tipos.manana, tarde: tipos.tarde })));
});

// GET /api/reportes/empleados?desde=&hasta=
// Total de turnos y desglose por tipo para cada empleado activo
router.get('/empleados', autenticar, soloAdmin, (req, res) => {
  const rango = rangoFecha(req);
  if (!rango) return res.status(400).json({ error: 'Formato de fecha inválido (use YYYY-MM-DD)' });

  const sql = `SELECT u.nombre, u.email, u.area, u.horario_fijo,
       COUNT(t.id) AS total,
       SUM(CASE WHEN t.tipo = 'manana' THEN 1 ELSE 0 END) AS manana,
       SUM(CASE WHEN t.tipo = 'tarde' THEN 1 ELSE 0 END) AS tarde,
       SUM(CASE WHEN t.estado = 'completado' THEN 1 ELSE 0 END) AS completados
  FROM usuarios u
  LEFT JOIN turnos t ON t.usuario_id = u.id${andTurnos(rango)}
  WHERE u.activo = 1 AND u.rol = 'empleado'
  GROUP BY u.id ORDER BY u.nombre`;

  const rows = db.prepare(sql).all(...paramsFecha(rango));
  res.json(rows.map(r => ({
    nombre: r.nombre,
    email: r.email,
    area: r.area || '-',
    horario_fijo: r.horario_fijo || 'Flexible',
    total: r.total,
    manana: r.manana,
    tarde: r.tarde,
    completados: r.completados,
  })));
});

// GET /api/reportes/areas?desde=&hasta=
// Distribución de turnos por área
router.get('/areas', autenticar, soloAdmin, (req, res) => {
  const rango = rangoFecha(req);
  if (!rango) return res.status(400).json({ error: 'Formato de fecha inválido (use YYYY-MM-DD)' });

  const sql = `SELECT u.area, t.tipo, COUNT(*) n FROM turnos t
   JOIN usuarios u ON u.id = t.usuario_id${whereTurnos(rango)}
   GROUP BY u.area, t.tipo ORDER BY u.area, t.tipo`;
  const rows = db.prepare(sql).all(...paramsFecha(rango));

  const porArea = {};
  for (const r of rows) {
    const area = r.area || 'Sin área';
    if (!porArea[area]) porArea[area] = { manana: 0, tarde: 0 };
    porArea[area][r.tipo] = r.n;
  }
  res.json(Object.entries(porArea).map(([area, tipos]) => ({ area, manana: tipos.manana, tarde: tipos.tarde })));
});

// GET /api/reportes/solicitudes?desde=&hasta=
// Estadísticas de solicitudes de cambio por estado
router.get('/solicitudes', autenticar, soloAdmin, (req, res) => {
  const rango = rangoFecha(req);
  if (!rango) return res.status(400).json({ error: 'Formato de fecha inválido (use YYYY-MM-DD)' });

  const conds = [];
  const params = [];
  if (rango.desde) { conds.push('s.creado_en >= ?'); params.push(rango.desde); }
  if (rango.hasta) { conds.push("s.creado_en < datetime(?, '+1 day')"); params.push(rango.hasta); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

  const rows = db.prepare(
    `SELECT s.tipo_nuevo, s.estado, COUNT(*) n
     FROM solicitudes s
     JOIN usuarios u ON u.id = s.usuario_id${where}
     GROUP BY s.estado, s.tipo_nuevo ORDER BY s.estado`
  ).all(...params);

  const stats = { total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0, porTipo: {} };
  for (const r of rows) {
    stats.total += r.n;
    if (r.estado === 'pendiente') stats.pendientes += r.n;
    if (r.estado === 'aprobada') stats.aprobadas += r.n;
    if (r.estado === 'rechazada') stats.rechazadas += r.n;
    stats.porTipo[r.tipo_nuevo] = (stats.porTipo[r.tipo_nuevo] || 0) + r.n;
  }
  res.json(stats);
});

module.exports = router;
