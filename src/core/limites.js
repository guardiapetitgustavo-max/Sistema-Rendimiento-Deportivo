/**
 * Límites del plan contratado (definidos en la tabla planes, nunca fijos en el código).
 * Un límite null o ausente = sin límite.
 */
const { query } = require('../db/pool');
const { HttpError } = require('../utils/http-error');

const RECURSOS = {
  deportistas: { etiqueta: 'deportistas activos', sql: 'SELECT count(*)::int AS n FROM deportistas WHERE academia_id = $1 AND activo' },
  coaches: { etiqueta: 'coaches', sql: "SELECT count(*)::int AS n FROM membresias WHERE academia_id = $1 AND rol = 'coach' AND activo" },
  sedes: { etiqueta: 'sedes', sql: 'SELECT count(*)::int AS n FROM sedes WHERE academia_id = $1 AND activo' },
  videos: { etiqueta: 'videos', sql: 'SELECT count(*)::int AS n FROM videos WHERE academia_id = $1 AND activo' },
  almacenamiento_mb: { etiqueta: 'MB de almacenamiento', sql: 'SELECT coalesce(sum(tamano_bytes), 0) / 1048576.0 AS n FROM videos WHERE academia_id = $1 AND activo' },
  ia_analisis_mes: { etiqueta: 'análisis de IA este mes', sql: "SELECT count(*)::int AS n FROM analisis_ia WHERE academia_id = $1 AND creado_en >= date_trunc('month', now())" },
  reportes_mes: { etiqueta: 'reportes este mes', sql: "SELECT count(*)::int AS n FROM auditoria WHERE academia_id = $1 AND accion = 'reporte' AND creado_en >= date_trunc('month', now())" },
};

/** Uso actual de un recurso. */
async function uso(academia, recurso) {
  const { rows } = await query(RECURSOS[recurso].sql, [academia]);
  return Number(rows[0].n);
}

/**
 * Comprueba que se pueda añadir `cantidad` del recurso sin superar el límite del plan.
 * @param {object} usuario  req.usuario (trae la academia y su plan)
 */
async function verificarLimite(usuario, recurso, cantidad = 1) {
  const plan = usuario?.academia?.plan;
  const limite = plan?.limites?.[recurso];
  if (limite === null || limite === undefined) return;
  const actual = await uso(usuario.academia.id, recurso);
  if (actual + cantidad > limite) {
    throw new HttpError(403, `Tu plan ${plan.nombre} permite como máximo ${limite} ${RECURSOS[recurso].etiqueta} (ahora: ${Math.round(actual)}). `
      + 'Pide al responsable de la plataforma ampliar el plan.');
  }
}

/** Resumen de uso vs. límites para la pantalla de la academia y de la plataforma. */
async function resumenUso(academia, limites = {}) {
  const resultado = {};
  for (const recurso of Object.keys(RECURSOS)) {
    resultado[recurso] = { uso: Math.round((await uso(academia, recurso)) * 10) / 10, limite: limites?.[recurso] ?? null };
  }
  return resultado;
}

module.exports = { RECURSOS, verificarLimite, resumenUso, uso };
