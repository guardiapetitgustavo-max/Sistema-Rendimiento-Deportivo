/**
 * Uso y valoración de los reportes (indicador "Efectividad de los reportes", FASE 11).
 * Registrar nunca hace fallar la descarga: si la tabla aún no existe, solo se anota en el log.
 */
const { query } = require('../../db/pool');
const { noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

async function registrar({ academia, usuario, tipo, formato, exito, duracionMs, error = null }) {
  try {
    const { rows } = await query(
      `INSERT INTO reportes_uso (academia_id, usuario_id, tipo, formato, exito, duracion_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [academia, usuario, String(tipo).slice(0, 40), formato, exito, duracionMs, error ? String(error).slice(0, 300) : null],
    );
    return rows[0];
  } catch (e) {
    console.error(JSON.stringify({ nivel: 'error', origen: 'reportes_uso', mensaje: e.message }));
    return null;
  }
}

/** Solo quien generó el reporte puede valorarlo. */
async function valorar(usuario, id, datos = {}) {
  const d = validar({
    utilidad: { tipo: 'entero', etiqueta: 'Utilidad', requerido: true, min: 1, max: 5 },
    apoyo_decision: { tipo: 'booleano', etiqueta: 'Ayudó a decidir' },
    comentario: { tipo: 'texto', etiqueta: 'Comentario', maxLargo: 500 },
  }, datos);
  const { rows } = await query(
    `UPDATE reportes_uso SET utilidad = $4, apoyo_decision = $5, comentario = $6, valorado_en = now()
     WHERE id = $1 AND academia_id = $2 AND usuario_id = $3 AND exito RETURNING id, utilidad, apoyo_decision`,
    [id, usuario.academia.id, usuario.id, d.utilidad, datos.apoyo_decision === undefined || datos.apoyo_decision === null ? null : d.apoyo_decision, d.comentario || null],
  );
  if (!rows.length) throw noEncontrado('Reporte');
  return rows[0];
}

module.exports = { registrar, valorar };
