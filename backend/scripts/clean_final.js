// Limpieza final de temporales (se ejecuta una vez y se autodestruye).
const fs = require('fs');
const path = require('path');

const backend = path.join(__dirname, '..');
const raiz = path.join(backend, '..');
const borrados = [];

function borrar(ruta) {
  try {
    if (fs.existsSync(ruta)) {
      fs.rmSync(ruta, { force: true, recursive: true });
      borrados.push(ruta);
    }
  } catch (e) {
    console.log('No se pudo borrar', ruta, e.message);
  }
}

// Temporales de diagnóstico (txt/log que empiezan con _)
for (const dir of [backend, path.join(backend, 'scripts'), raiz]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (/^_/u.test(f) && (/\.(txt|log)$/u.test(f))) {
      const full = path.join(dir, f);
      if (f === '_respaldo.txt' || full.includes('_backup')) continue;
      borrar(full);
    }
  }
}

// Cleaners y generadores de logs ya no necesarios (se conservan smoke.js y respaldo.js)
for (const f of fs.readdirSync(path.join(backend, 'scripts'))) {
  if (['limpiar.js', 'arbol.js'].includes(f)) {
    borrar(path.join(backend, 'scripts', f));
  }
}

// Logs de consola del backend
for (const f of ['server.out.log', 'server.err.log', 'server.log']) {
  borrar(path.join(backend, f));
}

fs.writeFileSync(path.join(raiz, '_cleanFinal.txt'), borrados.join('\n') || '(nada)', 'utf8');
console.log('FIN');