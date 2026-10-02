// =====================================================================
// Smoke test de la API REST (Etapa 1).
// Asume que el servidor ya está corriendo en http://localhost:3000
// =====================================================================
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000/api';
const out = [];
let token = null;
let cookie = '';

function log(...a) { out.push(a.join(' ')); }

async function peticion(ruta, opciones = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + ruta, { ...opciones, headers, redirect: 'manual' });
  const cuerpo = await res.json().catch(() => ({}));
  if (cuerpo.token && !token) cookie = (cuerpo.token);
  return { status: res.status, cuerpo, setCookie: res.headers.get('set-cookie') || '' };
}

async function main() {
  // 1) Login
  let r = await peticion('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }) });
  log('1. login ->', r.status, r.cuerpo.usuario ? 'usuario: ' + r.cuerpo.usuario.rol : JSON.stringify(r.cuerpo));
  log('   Set-Cookie httpOnly: ' + (r.setCookie.includes('HttpOnly') ? 'OK' : 'FALTA'));
  token = r.cuerpo.token || null;

  // 2) /auth/me con header
  r = await peticion('/auth/me');
  log('2. /auth/me ->', r.status, r.cuerpo.nombre || JSON.stringify(r.cuerpo));

  // 3) /reglas
  r = await peticion('/reglas');
  const claves = (r.cuerpo || []).map(x => x.clave);
  log('3. /reglas ->', r.status, '| sin min_noche:', !claves.includes('min_noche'), '| horario_manana_inicio:', claves.includes('horario_manana_inicio'));

  // 4) validación de claves desconocidas
  r = await peticion('/reglas', { method: 'PUT', body: JSON.stringify({ min_noche: 5 }) });
  log('4. PUT /reglas clave desconocida ->', r.status, '| error:', r.cuerpo.error || 'SIN ERROR');

  // 5) validación de hora inválida
  r = await peticion('/reglas', { method: 'PUT', body: JSON.stringify({ horario_manana_inicio: '99:99' }) });
  log('5. PUT hora inválida ->', r.status, '| error:', r.cuerpo.error || 'SIN ERROR');

  // 6) cambio válido y restauración
  r = await peticion('/reglas', { method: 'PUT', body: JSON.stringify({ horario_manana_inicio: '05:30' }) });
  log('6. PUT hora válida ->', r.status);
  r = await peticion('/reglas', { method: 'PUT', body: JSON.stringify({ horario_manana_inicio: '06:00' }) });
  log('   restore ->', r.status);

  // 7) crear empleado de prueba
  const sufijo = Date.now() % 100000;
  r = await peticion('/auth/usuarios', { method: 'POST', body: JSON.stringify({ nombre: 'Test Employee ' + sufijo, email: 'test' + sufijo + '@empresa.com', password: 'test123', rol: 'empleado' }) });
  log('7. crear empleado ->', r.status);
  const empId = r.cuerpo.id;
  if (!empId) { log('   NO HAY empId'); return guardar(); }

  // 8) descansos vacíos
  r = await peticion('/descansos');
  log('8. /descansos ->', r.status, '| cantidad:', Array.isArray(r.cuerpo) ? r.cuerpo.length : '?');

  // 9) alta de descanso semanal (domingo=0)
  r = await peticion('/descansos', { method: 'POST', body: JSON.stringify({ usuario_id: empId, dia_semana: 0, motivo: 'Descanso fijo domingo' }) });
  log('9. POST /descansos ->', r.status, 'id:', r.cuerpo.id);
  const descId = r.cuerpo.id;

  // 10) alta de descanso inválida (sin datos)
  r = await peticion('/descansos', { method: 'POST', body: JSON.stringify({ usuario_id: empId }) });
  log('10. POST /descansos sin datos ->', r.status, '| error:', r.cuerpo.error || 'SIN ERROR');

  // 11) turno noche rechazado
  r = await peticion('/turnos', { method: 'POST', body: JSON.stringify({ usuario_id: empId, fecha: '2026-11-01', tipo: 'noche', motivo: 'Prueba noche' }) });
  log('11. POST /turnos tipo noche ->', r.status, '| error:', r.cuerpo.error || 'SIN ERROR');

  // 12) turno manana válido con motivo
  r = await peticion('/turnos', { method: 'POST', body: JSON.stringify({ usuario_id: empId, fecha: '2026-11-02', tipo: 'manana', motivo: 'Asignación manual de prueba' }) });
  log('12. POST /turnos manana ->', r.status, '| motivo:', r.cuerpo.motivo);
  const turnoId = r.cuerpo.id;
  // 13) leer turnos y verificar motivo
  r = await peticion('/turnos?desde=2026-11-01&hasta=2026-11-08');
  const t = (r.cuerpo || []).find(x => x.id === turnoId);
  log('13. GET /turnos verifica motivo ->', r.status, '| motivo turno:', t ? t.motivo : 'NO ENCONTRADO');

  // 14) solicitud con tipo noche rechazada
  r = await peticion('/solicitudes', { method: 'POST', body: JSON.stringify({ turno_id: turnoId, tipo_nuevo: 'noche', fecha_nueva: '2026-11-03', motivo: 'Quiero noche' }) });
  log('14. POST /solicitudes tipo noche ->', r.status, '| error:', r.cuerpo.error || 'SIN ERROR');

  // 15) generación automática (semana futura)
  const lunes = '2027-01-04';
  r = await peticion('/turnos/generar', { method: 'POST', body: JSON.stringify({ lunes }) });
  const detalle = r.cuerpo.detalle || [];
  const hayNoche = detalle.some(x => x.tipo === 'noche');
  const todosConMotivo = detalle.every(x => !!x.motivo);
  log('15. POST /turnos/generar ->', r.status, '| creados:', r.cuerpo.creados, '| sin noche:', !hayNoche, '| todos con motivo:', todosConMotivo);
  if (detalle.length) log('    ejemplo:', JSON.stringify(detalle[0]));

  // 16) cleanup: borrar turnos generados + descanso + empleado
  const borrarDetalle = await peticion('/turnos?desde=2027-01-04&hasta=2027-01-10');
  for (const x of borrarDetalle.cuerpo || []) {
    await peticion('/turnos/' + x.id, { method: 'DELETE', body: JSON.stringify({ motivo: 'limpieza smoke test' }) });
  }
  if (descId) await peticion('/descansos/' + descId, { method: 'DELETE' });
  if (turnoId) await peticion('/turnos/' + turnoId, { method: 'DELETE', body: JSON.stringify({ motivo: 'limpieza' }) });
  r = await peticion('/auth/usuarios/' + empId, { method: 'DELETE' });
  log('16. limpieza ->', r.status);

  await guardar();
}

async function guardar() {
  fs.writeFileSync(path.join(__dirname, '..', '_smoke.txt'), out.join('\n'), 'utf8');
}

main().catch(e => {
  out.push('ERROR GENERAL: ' + e.message);
  fs.writeFileSync(path.join(__dirname, '..', '_smoke.txt'), out.join('\n'), 'utf8');
});