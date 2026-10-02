// =====================================================================
// Configuración del lado del cliente.
// Se obtiene de la API REST (tabla `reglas` en SQLite): nada de horarios
// hardcodeados. Cada página que necesite horarios llama a obtenerConfig().
// =====================================================================
const NOMBRES_TIPO = {
  manana: 'Mañana',
  tarde: 'Tarde',
};

async function obtenerConfig() {
  const reglas = await API.get('/reglas');
  const r = Object.fromEntries(reglas.map(x => [x.clave, x.valor]));

  return {
    horarios: {
      manana: `${r.horario_manana_inicio} - ${r.horario_manana_fin}`,
      tarde: `${r.horario_tarde_inicio} - ${r.horario_tarde_fin}`,
    },
    min: { manana: +r.min_manana, tarde: +r.min_tarde },
    max: {
      manana: r.max_manana ? +r.max_manana : null,
      tarde: r.max_tarde ? +r.max_tarde : null,
    },
    minDomingosMes: +r.min_domingos_mes,
    rotarDomingos: r.rotar_domingos !== '0',
  };
}

// Devuelve el horario legible de un tipo de turno (p. ej. "06:00 - 14:00").
function horarioDeTurno(config, tipo) {
  if (!config || !config.horarios) return '';
  return config.horarios[tipo] || '';
}