/**
 * Alcance de los datos deportivos dentro de una academia.
 *
 * Un coach ve a los deportistas de los que es responsable y a los miembros de los equipos que dirige.
 * El administrador (coach = null) ve toda la academia. TODA consulta filtra además por academia_id.
 */
const { query } = require('../db/pool');
const { noEncontrado, HttpError } = require('../utils/http-error');

/**
 * Condición SQL para que el deportista `alias` esté dentro del alcance.
 * @param {string} alias  alias de la tabla deportistas en la consulta (p. ej. "d")
 * @param {string} pAcademia  marcador del parámetro con el id de la academia (p. ej. "$1")
 * @param {string} pCoach  marcador del parámetro con el id del coach o null (p. ej. "$2")
 */
function condicionDeportista(alias, pAcademia, pCoach) {
  return `(${alias}.academia_id = ${pAcademia} AND (${pCoach}::int IS NULL OR ${alias}.usuario_id = ${pCoach}
    OR EXISTS (SELECT 1 FROM equipo_miembros em_ JOIN equipos eq_ ON eq_.id = em_.equipo_id
               WHERE em_.deportista_id = ${alias}.id AND eq_.coach_id = ${pCoach} AND eq_.activo)))`;
}

/** Deportista activo dentro del alcance, o 404 (nunca revela si existe en otra academia). */
async function deportistaEnAlcance(alcance, id, cliente = null) {
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  const { rows } = await ejecutar(
    `SELECT d.* FROM deportistas d WHERE d.id = $3 AND d.activo AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach, id],
  );
  if (!rows.length) throw noEncontrado('Deportista');
  return rows[0];
}

/** Ids de los deportistas activos visibles en el alcance. */
async function idsDeportistas(alcance) {
  const { rows } = await query(
    `SELECT d.id FROM deportistas d WHERE d.activo AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach],
  );
  return rows.map((r) => r.id);
}

/** Comprueba que un registro de otra tabla pertenezca a la academia (para claves foráneas enviadas por el cliente). */
async function perteneceAcademia(tabla, id, academia, etiqueta, cliente = null) {
  if (id === null || id === undefined) return null;
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  const { rows } = await ejecutar(`SELECT * FROM ${tabla} WHERE id = $1 AND academia_id = $2`, [id, academia]);
  if (!rows.length) throw new HttpError(400, `${etiqueta} no existe en esta academia`);
  return rows[0];
}

/** El usuario es coach o administrador activo de la academia (para asignar responsables). */
async function esCoachDeAcademia(usuarioId, academia) {
  if (!usuarioId) return false;
  const { rows } = await query(
    `SELECT 1 FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.usuario_id = $1 AND m.academia_id = $2 AND m.rol IN ('coach', 'admin') AND m.activo AND u.activo`,
    [usuarioId, academia],
  );
  return rows.length > 0;
}

module.exports = {
  condicionDeportista, deportistaEnAlcance, idsDeportistas, perteneceAcademia, esCoachDeAcademia,
};
