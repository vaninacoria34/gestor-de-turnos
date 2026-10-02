const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'gestor.db'));
db.pragma('journal_mode = WAL');
// NOTA: las migraciones corren con foreign_keys apagadas (para poder reordenar
// tablas y eliminar referencias viejas); se habilita al final de db.js.

// =====================================================================
// ESQUEMA BASE
// =====================================================================
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'empleado',
  area TEXT,
  telefono TEXT,
  horario_fijo TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reglas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'programado',
  origen TEXT DEFAULT 'manual',
  motivo TEXT,
  UNIQUE(usuario_id, fecha, tipo)
);
CREATE TABLE IF NOT EXISTS historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER,
  usuario_accion_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL,
  fecha TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER NOT NULL REFERENCES turnos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo_nuevo TEXT NOT NULL,
  fecha_nueva TEXT NOT NULL,
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  creado_en TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS descansos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  dia_semana INTEGER CHECK (dia_semana IS NULL OR (dia_semana >= 0 AND dia_semana <= 6)),
  fecha TEXT,
  motivo TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  CHECK (dia_semana IS NOT NULL OR fecha IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_usuario ON turnos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_descansos_usuario ON descansos(usuario_id);
`);

// =====================================================================
// MIGRACIONES ACUMULATIVAS (idempotentes)
// =====================================================================

// --- 1) Correo electrónico opcional (nullable) ---
const colEmail = db.pragma('table_info(usuarios)').find(c => c.name === 'email');
if (colEmail && colEmail.notnull) {
  db.exec(`
  ALTER TABLE usuarios RENAME TO usuarios_viejo;
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'empleado',
    area TEXT,
    telefono TEXT,
    horario_fijo TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO usuarios (id, nombre, email, password_hash, rol, area, telefono, horario_fijo, activo, creado_en)
    SELECT id, nombre, email, password_hash, rol, area, telefono, horario_fijo, activo, creado_en FROM usuarios_viejo;
  DROP TABLE IF EXISTS usuarios_viejo;
  `);
}

// --- 2) Reparación de FKs que apuntan a la tabla fantasma `usuarios_viejo`.
//     Una migración anterior renombró `usuarios` a `usuarios_viejo` y quedó a
//     medias. Las tablas hijas quedaron referenciando esa tabla. Si lo
//     detectamos, regeneramos esas tablas apuntando a `usuarios` (sin perder datos).
function reconstruirSiApuntaA(tabla, sql) {
  const fila = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tabla);
  if (!fila || !fila.sql || !fila.sql.includes('usuarios_viejo')) return;
  const tmp = tabla + '_tmp_reconstruccion';
  db.exec(`ALTER TABLE ${tabla} RENAME TO ${tmp}`);
  db.exec(sql);
  const cols = db.pragma(`table_info(${tabla})`).map(c => c.name).join(', ');
  db.exec(`INSERT INTO ${tabla} (${cols}) SELECT ${cols} FROM ${tmp}`);
  db.exec(`DROP TABLE ${tmp}`);
  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (NULL, 'migracion', ?)")
    .run(`Migración: tabla ${tabla} reconstruida (referencias a usuarios corregidas).`);
}

const SQL_TABLA_TURNOS = `CREATE TABLE turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'programado',
  origen TEXT DEFAULT 'manual',
  motivo TEXT,
  UNIQUE(usuario_id, fecha, tipo)
)`;
const SQL_TABLA_HISTORIAL = `CREATE TABLE historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER,
  usuario_accion_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL,
  fecha TEXT DEFAULT (datetime('now'))
)`;
const SQL_TABLA_SOLICITUDES = `CREATE TABLE solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER NOT NULL REFERENCES turnos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo_nuevo TEXT NOT NULL,
  fecha_nueva TEXT NOT NULL,
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creado_en TEXT DEFAULT (datetime('now'))
)`;

reconstruirSiApuntaA('turnos', SQL_TABLA_TURNOS);
reconstruirSiApuntaA('historial', SQL_TABLA_HISTORIAL);
reconstruirSiApuntaA('solicitudes', SQL_TABLA_SOLICITUDES);

// Recrear índices por si las tablas se reconstruyeron.
db.exec(`CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_usuario ON turnos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_descansos_usuario ON descansos(usuario_id);`);

// La tabla fantasma ya no se necesita.
db.exec('DROP TABLE IF EXISTS usuarios_viejo');

// --- 3) Columna "motivo" en turnos (razón de la asignación) ---
if (!db.pragma('table_info(turnos)').some(c => c.name === 'motivo')) {
  db.exec('ALTER TABLE turnos ADD COLUMN motivo TEXT');
}

// --- 4) Eliminar el turno NOCHE (el sistema solo maneja mañana y tarde) ---
const turnosNoche = db.prepare("SELECT COUNT(*) n FROM turnos WHERE tipo = 'noche'").get().n;
if (turnosNoche > 0) {
  db.prepare("DELETE FROM turnos WHERE tipo = 'noche'").run();
  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (NULL, 'eliminar', ?)")
    .run(`Migración: se eliminaron ${turnosNoche} turnos de noche. El sistema ahora usa solo turno mañana y tarde.`);
}

// --- 5) Empleados con horario fijo "noche" pasan a flexibles ---
const fijosNoche = db.prepare("UPDATE usuarios SET horario_fijo = NULL WHERE horario_fijo = 'noche'").run();
if (fijosNoche.changes > 0) {
  db.prepare("INSERT INTO historial (usuario_accion_id, accion, detalle) VALUES (NULL, 'cambio', ?)")
    .run(`Migración: ${fijosNoche.changes} empleado(s) con horario fijo de noche quedaron como flexibles.`);
}

// =====================================================================
// SEED: administrador por defecto
// =====================================================================
const admin = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get();
if (!admin) {
  db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')")
    .run('Administrador', 'admin@empresa.com', bcrypt.hashSync('admin123', 10));
}

// =====================================================================
// CONFIGURACIÓN POR DEFECTO (administrable desde la API, sin código)
// =====================================================================
db.prepare("DELETE FROM reglas WHERE clave = 'min_noche'").run();

const reglaDefault = db.prepare('INSERT OR IGNORE INTO reglas (clave, valor) VALUES (?, ?)');
[
  ['horario_manana_inicio', '06:00'],
  ['horario_manana_fin',    '14:00'],
  ['horario_tarde_inicio',  '14:00'],
  ['horario_tarde_fin',     '22:00'],
  ['min_manana',            '1'],
  ['min_tarde',             '1'],
  ['max_manana',            ''],
  ['max_tarde',             ''],
  ['min_domingos_mes',      '1'],
  ['rotar_domingos',        '1'],
].forEach(([c, v]) => reglaDefault.run(c, v));

// Las migraciones terminaron: a partir de acá se exigen integridad referencial.
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Separate delivery state from whether an in-app notification was read.
for (const [column,definition] of Object.entries({
  leida:'INTEGER NOT NULL DEFAULT 0',
  email_estado:"TEXT NOT NULL DEFAULT 'no_configurado'",
  whatsapp_estado:"TEXT NOT NULL DEFAULT 'no_configurado'",
  email_error:'TEXT', whatsapp_error:'TEXT'
})) {
  if (!db.pragma('table_info(notificaciones)').some(c=>c.name===column))
    db.exec('ALTER TABLE notificaciones ADD COLUMN '+column+' '+definition);
}
if (!db.pragma('table_info(usuarios)').some(c=>c.name==='sesion_version'))
  db.exec('ALTER TABLE usuarios ADD COLUMN sesion_version INTEGER NOT NULL DEFAULT 0');
db.prepare("UPDATE usuarios SET horario_fijo=NULL WHERE horario_fijo=''").run();

module.exports = db;
