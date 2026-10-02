// =====================================================================
// Servicio de configuración del sistema.
// Toda la configuración se guarda en SQLite (tabla `reglas`) y se edita
// desde la API REST: el administrador NO necesita tocar código.
// =====================================================================
const db = require('../db');

const TIPOS = ['manana', 'tarde'];

// Definición formal de cada clave de configuración:
//   tipo:  'int'  → entero obligatorio
//          'int?' → entero opcional (cadena vacía = sin límite)
//          'hora' → formato HH:MM
//          'bool' → 1 | 0
const CLAVES = {
  min_manana:            { tipo: 'int',  min: 0, dflt: 1 },
  min_tarde:             { tipo: 'int',  min: 0, dflt: 1 },
  max_manana:            { tipo: 'int?', min: 0, dflt: '' },
  max_tarde:             { tipo: 'int?', min: 0, dflt: '' },
  horario_manana_inicio: { tipo: 'hora', dflt: '06:00' },
  horario_manana_fin:    { tipo: 'hora', dflt: '14:00' },
  horario_tarde_inicio:  { tipo: 'hora', dflt: '14:00' },
  horario_tarde_fin:     { tipo: 'hora', dflt: '22:00' },
  min_domingos_mes:      { tipo: 'int',  min: 0, dflt: 1 },
  rotar_domingos:        { tipo: 'bool', dflt: '1' },
};

// Devuelve todas las claves registradas (para el frontend).
function todas() {
  return db.prepare('SELECT clave, valor FROM reglas ORDER BY clave').all();
}

// Configuración tipada y con valores por defecto, lista para consumir.
function getConfig() {
  const raw = {};
  for (const f of todas()) raw[f.clave] = f.valor;

  const cfg = {
    tipos: TIPOS,
    horarios: {},   // manana_inicio, manana_fin, tarde_inicio, tarde_fin
    min: {},        // manana, tarde
    max: {},        // manana, tarde (null = sin límite)
    minDomingosMes: 1,
    rotarDomingos: true,
  };

  for (const [clave, def] of Object.entries(CLAVES)) {
    const s = String(raw[clave] ?? def.dflt).trim();

    if (clave === 'min_domingos_mes') {
      cfg.minDomingosMes = entero(s, def);
    } else if (clave.startsWith('horario_')) {
      const partes = clave.split('_'); // horario, manana|tarde, inicio|fin
      cfg.horarios[partes[1] + '_' + partes[2]] = /^\d{2}:\d{2}$/.test(s) ? s : def.dflt;
    } else if (clave.startsWith('min_')) {
      cfg.min[clave.slice(4)] = entero(s, def);
    } else if (clave.startsWith('max_')) {
      const n = parseInt(s, 10);
      cfg.max[clave.slice(4)] = s === '' || Number.isNaN(n) ? null : Math.max(0, n);
    } else if (clave === 'rotar_domingos') {
      cfg.rotarDomingos = s !== '0' && s !== 'false';
    }
  }
  return cfg;
}

function entero(s, def) {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return def.dflt;
  return Math.max(def.min ?? 0, n);
}

// Valida un conjunto de cambios { clave: valor }. Devuelve:
//   { ok, errores: [..], valores: [[clave, valorNormalizado]..] }
function validarCambios(cambios) {
  const errores = [];
  const valores = [];

  for (const [clave, valor] of Object.entries(cambios || {})) {
    const def = CLAVES[clave];
    if (!def) { errores.push(`Clave desconocida: ${clave}`); continue; }
    const s = String(valor).trim();

    if (def.tipo === 'int') {
      const n = Number(s);
      if (s === '' || !Number.isInteger(n) || n < (def.min ?? 0)) {
        errores.push(`"${clave}" debe ser un número entero mayor o igual a ${def.min ?? 0}`);
        continue;
      }
      valores.push([clave, String(n)]);
    } else if (def.tipo === 'int?') {
      if (s === '') { valores.push([clave, '']); continue; }
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0) {
        errores.push(`"${clave}" debe ser un entero mayor o igual a 0, o vacío (sin límite)`);
        continue;
      }
      valores.push([clave, String(n)]);
    } else if (def.tipo === 'hora') {
      if (!/^\d{2}:\d{2}$/.test(s)) { errores.push(`"${clave}" debe tener el formato HH:MM`); continue; }
      const [h, m] = s.split(':').map(Number);
      if (h > 23 || m > 59) { errores.push(`"${clave}" debe ser una hora válida (HH:MM)`); continue; }
      valores.push([clave, s]);
    } else if (def.tipo === 'bool') {
      valores.push([clave, (s === '1' || s === 'true' || s === 'on') ? '1' : '0']);
    }
  }

  const final=Object.fromEntries(todas().map(r=>[r.clave,r.valor]));
  Object.assign(final,Object.fromEntries(valores));
  for(const tipo of TIPOS){
    if(final['max_'+tipo]!==''&&Number(final['max_'+tipo])<Number(final['min_'+tipo]))errores.push('El máximo no puede ser menor al mínimo de '+tipo);
    if(final['horario_'+tipo+'_inicio']>=final['horario_'+tipo+'_fin'])errores.push('El horario de '+tipo+' debe terminar después de su inicio.');
  }
  if(final.horario_manana_fin>final.horario_tarde_inicio)errores.push('Los horarios de mañana y tarde no pueden superponerse.');
  return { ok: errores.length === 0, errores, valores };
}

// Persiste cambios YA validados en una transacción.
function guardarCambios(valores) {
  const update = db.prepare('UPDATE reglas SET valor = ? WHERE clave = ?');
  const tx = db.transaction((pares) => { for (const [c, v] of pares) update.run(v, c); });
  tx(valores);
}

module.exports = { TIPOS, CLAVES, todas, getConfig, validarCambios, guardarCambios };
