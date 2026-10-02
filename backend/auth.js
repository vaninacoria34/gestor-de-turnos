const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'cambia-esta-clave-secreta';

// Parámetros de la cookie httpOnly utilizada para mantener la sesión.
// (La cookie se construye en la ruta de login/logout con el token real.)
const COOKIE_NOMBRE = 'gt_token';

function generarToken(usuario) {
  return jwt.sign({ id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, version: usuario.sesion_version || 0 }, SECRET, { expiresIn: '8h' });
}

// Extrae el token del header Authorization (Bearer) o de la cookie httpOnly.
function extraerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);

  const cookies = (req.headers.cookie || '').split(';');
  const c = cookies.map(s => s.trim()).find(s => s.startsWith(COOKIE_NOMBRE + '='));
  if (c) return decodeURIComponent(c.slice(COOKIE_NOMBRE.length + 1));
  return null;
}

// Verifica token y adjunta req.usuario
function autenticar(req, res, next) {
  const token = extraerToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const datos = jwt.verify(token, SECRET);
    const usuario = require('./db').prepare('SELECT id,nombre,rol,activo,sesion_version FROM usuarios WHERE id=?').get(datos.id);
    if (!usuario || !usuario.activo || (datos.version || 0) !== usuario.sesion_version)
      return res.status(401).json({ error: 'La sesión ya no es válida. Ingresá nuevamente.' });
    req.usuario = usuario;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Restringe a administradores
function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Requiere rol administrador' });
  next();
}

module.exports = { generarToken, autenticar, soloAdmin, COOKIE_NOMBRE };
