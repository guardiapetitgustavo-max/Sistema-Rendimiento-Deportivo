/**
 * Tareas programadas (Vercel Cron, una vez al día): evalúa las reglas de alerta de cada academia con el módulo
 * activo, marca pagos/matrículas/suscripciones vencidas y reencola trabajos de video atascados.
 */
const { query } = require('../../db/pool');
const modulos = require('../../core/modulos');
const motor = require('../inteligencia/motor-alertas');
const comercial = require('../comercial/comercial.service');

async function diarias() {
  const inicio = Date.now();
  const { rows: academias } = await query(
    `SELECT a.id, coalesce(c.modulos, '{}'::jsonb) AS modulos, pl.modulos AS plan FROM academias a
     LEFT JOIN academia_config c ON c.academia_id = a.id
     LEFT JOIN suscripciones s ON s.academia_id = a.id AND s.actual LEFT JOIN planes pl ON pl.id = s.plan_id
     WHERE a.estado = 'activa'`,
  );
  const alertas = [];
  for (const a of academias) {
    if (!modulos.efectivos(a.modulos, a.plan ?? null).ia_alertas) continue;
    try {
      alertas.push({ academia: a.id, ...(await motor.evaluar(a.id)) });
    } catch (error) {
      alertas.push({ academia: a.id, error: error.message });
    }
  }
  const pagos = await comercial.marcarVencidos();
  const matriculas = (await query("UPDATE matriculas SET estado = 'vencida' WHERE estado = 'activa' AND fecha_fin < CURRENT_DATE")).rowCount;
  const suscripciones = (await query("UPDATE suscripciones SET estado = 'vencida' WHERE actual AND estado IN ('activa', 'prueba') AND fin < CURRENT_DATE")).rowCount;
  const reencolados = (await query(
    `UPDATE trabajos SET estado = CASE WHEN intentos >= 3 THEN 'fallido' ELSE 'pendiente' END, actualizado_en = now(),
       error = CASE WHEN intentos >= 3 THEN 'Superó el número de intentos' ELSE error END
     WHERE estado = 'procesando' AND actualizado_en < now() - interval '30 minutes'`,
  )).rowCount;
  return {
    academias: academias.length, alertas, pagos_vencidos: pagos, matriculas_vencidas: matriculas, suscripciones_vencidas: suscripciones,
    trabajos_reencolados: reencolados, duracion_ms: Date.now() - inicio,
  };
}

module.exports = { diarias };
