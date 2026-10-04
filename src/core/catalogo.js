/**
 * Fábrica de catálogos de la academia (sedes, instalaciones, categorías, equipos, métricas, pruebas…).
 *
 * Garantiza en un solo lugar lo que todos necesitan:
 * - toda lectura y escritura filtrada por academia_id (nunca se acepta el id de academia del cliente),
 * - validación declarativa de los datos,
 * - claves foráneas comprobadas dentro de la MISMA academia,
 * - baja lógica (activo = false) para conservar el historial.
 */
const { query } = require('../db/pool');
const { noEncontrado, HttpError } = require('../utils/http-error');
const { validar } = require('../utils/validar');
const { perteneceAcademia, esCoachDeAcademia } = require('./alcance');

/**
 * @param {object} op
 * @param {string} op.tabla
 * @param {string} op.entidad  nombre legible ("Sede")
 * @param {object} op.esquema  esquema de validar()
 * @param {Object<string, {tabla:string, etiqueta:string}|'coach'>} [op.referencias]
 * @param {string} [op.orden]
 * @param {Object<string,string>} [op.filtros]  parámetro de query → columna entera (p. ej. { deporte_id: 'deporte_id' })
 * @param {string} [op.seleccion]  SELECT con joins para listar (debe exponer la tabla con alias "x")
 * @param {string[]} [op.extras]  columnas calculadas en preparar() (JSONB…)
 * @param {Function} [op.preparar]  (datos limpios, crudos, alcance) → datos a guardar (puede lanzar errores de validación)
 */
function crearCatalogo({
  tabla, entidad, esquema, referencias = {}, orden = 'x.nombre', filtros = {}, seleccion = null, preparar = null, extras = [],
}) {
  // `extras`: columnas que no se validan con el esquema sino que las calcula preparar() (p. ej. JSONB)
  const columnas = [...Object.keys(esquema), ...extras];
  const select = seleccion || `SELECT x.* FROM ${tabla} x`;

  async function comprobarReferencias(academia, datos) {
    for (const [campo, ref] of Object.entries(referencias)) {
      const valor = datos[campo];
      if (valor === null || valor === undefined) continue;
      if (ref === 'coach') {
        if (!(await esCoachDeAcademia(valor, academia))) throw new HttpError(400, 'El coach elegido no pertenece a la academia o está desactivado');
      } else {
        await perteneceAcademia(ref.tabla, valor, academia, ref.etiqueta);
      }
    }
  }

  async function listar(alcance, consulta = {}) {
    const valores = [alcance.academia];
    const condiciones = ['x.academia_id = $1'];
    if (consulta.incluir_inactivos !== 'true' && consulta.incluir_inactivos !== true) condiciones.push('x.activo');
    for (const [parametro, columna] of Object.entries(filtros)) {
      const valor = consulta[parametro];
      if (valor === undefined || valor === '') continue;
      if (valor === 'null') { condiciones.push(`x.${columna} IS NULL`); continue; }
      const numero = Number(valor);
      if (!Number.isInteger(numero)) continue;
      valores.push(numero);
      condiciones.push(`x.${columna} = $${valores.length}`);
    }
    const { rows } = await query(`${select} WHERE ${condiciones.join(' AND ')} ORDER BY ${orden}`, valores);
    return rows;
  }

  async function obtener(alcance, id) {
    const { rows } = await query(`${select} WHERE x.id = $1 AND x.academia_id = $2`, [id, alcance.academia]);
    if (!rows.length) throw noEncontrado(entidad);
    return rows[0];
  }

  async function guardar(alcance, datos, actual) {
    let limpio = validar(esquema, actual ? { ...actual, ...datos } : datos);
    if (preparar) limpio = await preparar(limpio, datos, alcance, actual);
    await comprobarReferencias(alcance.academia, limpio);
    const lista = columnas.filter((c) => c in limpio);
    if (actual) {
      const { rows } = await query(
        `UPDATE ${tabla} SET ${lista.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND academia_id = $2 RETURNING *`,
        [actual.id, alcance.academia, ...lista.map((c) => limpio[c])],
      );
      return rows[0];
    }
    const { rows } = await query(
      `INSERT INTO ${tabla} (academia_id, ${lista.join(', ')}) VALUES ($1, ${lista.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [alcance.academia, ...lista.map((c) => limpio[c])],
    );
    return rows[0];
  }

  const crear = (alcance, datos) => guardar(alcance, datos, null);

  async function actualizar(alcance, id, datos) {
    const { rows } = await query(`SELECT * FROM ${tabla} WHERE id = $1 AND academia_id = $2`, [id, alcance.academia]);
    if (!rows.length) throw noEncontrado(entidad);
    return guardar(alcance, datos, rows[0]);
  }

  async function darDeBaja(alcance, id) {
    const { rowCount } = await query(`UPDATE ${tabla} SET activo = false WHERE id = $1 AND academia_id = $2`, [id, alcance.academia]);
    if (!rowCount) throw noEncontrado(entidad);
  }

  return {
    listar, obtener, crear, actualizar, darDeBaja, esquema,
  };
}

module.exports = { crearCatalogo };
