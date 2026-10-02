const router = require('express').Router();
const db = require('../db');
const { autenticar, soloAdmin } = require('../auth');
const { todas, validarCambios, guardarCambios } = require('../services/config');

// GET /api/reglas — cualquier usuario autenticado puede consultar la configuración
router.get('/', autenticar, (req, res) => {
  res.json(todas());
});

// PUT /api/reglas — solo admin; valida cada clave antes de persistir
router.put('/', autenticar, soloAdmin, (req, res) => {
  const { ok, errores, valores } = validarCambios(req.body);
  if (!ok) {
    return res.status(400).json({ error: errores.join('; ') });
  }
  if (valores.length) guardarCambios(valores);

  const resumen = Object.fromEntries(valores);
  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (?, 'cambio_reglas', ?)")
    .run(req.usuario.id, `Configuración actualizada: ${JSON.stringify(resumen)}`);
  res.json({ ok: true });
});

module.exports = router;
