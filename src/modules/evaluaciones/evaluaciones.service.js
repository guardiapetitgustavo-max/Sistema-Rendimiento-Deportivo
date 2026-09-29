const { pool, query } = require('../../db/pool');
const { noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO } = require('../../utils/valores');
const { CAPACIDADES, calcularPuntuacion } = require('../../domain/rendimiento');
const deportistas = require('../deportistas/deportistas.service');

const puntaje = (etiqueta) => ({ tipo: 'numero', etiqueta, min: 0, max: 100 });

const esquema = {
  fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
  velocidad: puntaje('Velocidad'),
  resistencia: puntaje('Resistencia'),
  fuerza: puntaje('Fuerza'),
  agilidad: puntaje('Agilidad'),
  coordinacion: puntaje('Coordinación'),
  tecnica: puntaje('Técnica'),
  disciplina_score: puntaje('Disciplina'),
  asistencia: puntaje('Asistencia'),
  puntuacion_general: puntaje('Puntuación general'),
  observaciones: { tipo: 'texto', etiqueta: 'Observaciones', maxLargo: 2000 },
};

const COLUMNAS = ['fecha', ...CAPACIDADES, 'puntuacion_general', 'observaciones'];

const ORDENES = {
  fecha_desc: 'e.fecha DESC, e.id DESC',
  fecha_asc: 'e.fecha ASC, e.id ASC',
  puntuacion_desc: 'e.puntuacion_general DESC NULLS LAST',
  puntuacion_asc: 'e.puntuacion_general ASC NULLS LAST',
};

/** Completa fecha y puntuación general cuando no vienen. */
function completar(datos) {
  return {
    ...datos,
    fecha: datos.fecha || hoyISO(),
    puntuacion_general: datos.puntuacion_general ?? calcularPuntuacion(datos),
  };
}

/**
 * Inserta evaluaciones ya validadas en bloques (una sola consulta por bloque).
 * `db` puede ser el pool o un cliente de transacción.
 * Cada elemento: { deportistaId, datos, origen }.
 */
async function insertarVarias(db, elementos) {
  const columnas = ['deportista_id', 'origen', ...COLUMNAS];
  const insertadas = [];
  for (let inicio = 0; inicio < elementos.length; inicio += 1000) {
    const bloque = elementos.slice(inicio, inicio + 1000);
    const valores = bloque.flatMap(({ deportistaId, datos, origen }) => {
      const fila = completar(datos);
      return [deportistaId, origen, ...COLUMNAS.map((c) => fila[c] ?? null)];
    });
    const marcadores = bloque.map((_, i) =>
      `(${columnas.map((__, j) => `$${i * columnas.length + j + 1}`).join(', ')})`);
    const { rows } = await db.query(
      `INSERT INTO evaluaciones (${columnas.join(', ')}) VALUES ${marcadores.join(', ')} RETURNING *`,
      valores,
    );
    insertadas.push(...rows);
  }
  return insertadas;
}

async function listar(usuarioId, filtros = {}) {
  const valores = [usuarioId];
  const param = (valor) => {
    valores.push(valor);
    return `$${valores.length}`;
  };
  const condiciones = ['($1::int IS NULL OR d.usuario_id = $1)', 'd.activo', 'e.activa'];

  if (filtros.q) {
    const p = param(filtros.q);
    condiciones.push(`(d.nombre ILIKE '%' || ${p} || '%' OR d.codigo ILIKE '%' || ${p} || '%')`);
  }
  if (filtros.deportista_id) condiciones.push(`e.deportista_id = ${param(Number(filtros.deportista_id))}`);
  if (filtros.categoria) condiciones.push(`d.categoria = ${param(filtros.categoria)}`);
  if (filtros.desde) condiciones.push(`e.fecha >= ${param(filtros.desde)}::date`);
  if (filtros.hasta) condiciones.push(`e.fecha <= ${param(filtros.hasta)}::date`);

  const { rows } = await query(
    `SELECT e.*, d.codigo, d.nombre, d.categoria, d.disciplina, u.nombre AS coach
     FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id JOIN usuarios u ON u.id = d.usuario_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY ${ORDENES[filtros.orden] || ORDENES.fecha_desc}
     LIMIT 1000`,
    valores,
  );
  return rows;
}

async function obtener(usuarioId, id) {
  const { rows } = await query(
    `SELECT e.*, d.codigo, d.nombre, d.categoria, d.disciplina
     FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
     WHERE e.id = $1 AND ($2::int IS NULL OR d.usuario_id = $2) AND e.activa AND d.activo`,
    [id, usuarioId],
  );
  if (!rows.length) throw noEncontrado('Evaluación');
  return rows[0];
}

async function crear(usuarioId, datos) {
  const deportista = await deportistas.obtener(usuarioId, Number(datos.deportista_id));
  const [evaluacion] = await insertarVarias(pool, [{ deportistaId: deportista.id, datos: validar(esquema, datos), origen: 'manual' }]);
  return evaluacion;
}

async function actualizar(usuarioId, id, datos) {
  const actual = await obtener(usuarioId, id);
  const limpio = validar(esquema, datos);
  const fila = completar({ ...limpio, fecha: limpio.fecha || actual.fecha });
  const { rows } = await query(
    `UPDATE evaluaciones SET ${COLUMNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')}
     WHERE id = $1 RETURNING *`,
    [id, ...COLUMNAS.map((c) => fila[c] ?? null)],
  );
  return rows[0];
}

/** Baja lógica: el dato se conserva para no perder la evolución del deportista. */
async function darDeBaja(usuarioId, id) {
  await obtener(usuarioId, id);
  await query('UPDATE evaluaciones SET activa = false WHERE id = $1', [id]);
}

module.exports = { esquema, insertarVarias, listar, obtener, crear, actualizar, darDeBaja };
