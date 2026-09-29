const { query } = require('../../db/pool');
const { noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO, redondear } = require('../../utils/valores');
const deportistas = require('../deportistas/deportistas.service');

const texto = (etiqueta) => ({ tipo: 'texto', etiqueta, maxLargo: 255 });

const esquema = {
  fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
  desayuno: texto('Desayuno'),
  almuerzo: texto('Almuerzo'),
  cena: texto('Cena'),
  colaciones: texto('Colaciones'),
  hidratacion_litros: { tipo: 'numero', etiqueta: 'Hidratación (litros)', min: 0, max: 24 },
  suplementos: texto('Suplementos'),
  horas_sueno: { tipo: 'numero', etiqueta: 'Horas de sueño', min: 0, max: 24 },
  notas: { tipo: 'texto', etiqueta: 'Notas', maxLargo: 2000 },
};
const COLUMNAS = Object.keys(esquema);

async function listar(usuarioId, { deportista_id: deportistaId } = {}) {
  const { rows } = await query(
    `SELECT a.*, d.codigo, d.nombre
     FROM alimentacion a JOIN deportistas d ON d.id = a.deportista_id
     WHERE ($1::int IS NULL OR d.usuario_id = $1) AND d.activo AND a.activo AND ($2::int IS NULL OR a.deportista_id = $2)
     ORDER BY a.fecha DESC, a.id DESC
     LIMIT 1000`,
    [usuarioId, deportistaId ? Number(deportistaId) : null],
  );
  return rows;
}

/** Últimos registros y promedio de hidratación de un deportista (para su perfil). */
async function resumenDeportista(deportistaId) {
  const { rows } = await query(
    `SELECT *, avg(hidratacion_litros) OVER () AS promedio_hidratacion
     FROM alimentacion WHERE deportista_id = $1 AND activo
     ORDER BY fecha DESC, id DESC`,
    [deportistaId],
  );
  return {
    promedio_hidratacion: redondear(rows[0]?.promedio_hidratacion),
    recientes: rows.slice(0, 5).map(({ promedio_hidratacion: _, ...fila }) => fila),
  };
}

async function obtener(usuarioId, id) {
  const { rows } = await query(
    `SELECT a.*, d.codigo, d.nombre
     FROM alimentacion a JOIN deportistas d ON d.id = a.deportista_id
     WHERE a.id = $1 AND ($2::int IS NULL OR d.usuario_id = $2) AND a.activo AND d.activo`,
    [id, usuarioId],
  );
  if (!rows.length) throw noEncontrado('Registro de alimentación');
  return rows[0];
}

async function crear(usuarioId, datos) {
  const deportista = await deportistas.obtener(usuarioId, Number(datos.deportista_id));
  const fila = { ...validar(esquema, datos) };
  fila.fecha = fila.fecha || hoyISO();
  const { rows } = await query(
    `INSERT INTO alimentacion (deportista_id, ${COLUMNAS.join(', ')})
     VALUES ($1, ${COLUMNAS.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [deportista.id, ...COLUMNAS.map((c) => fila[c])],
  );
  return rows[0];
}

async function actualizar(usuarioId, id, datos) {
  const actual = await obtener(usuarioId, id);
  const fila = { ...validar(esquema, datos) };
  fila.fecha = fila.fecha || actual.fecha;
  const { rows } = await query(
    `UPDATE alimentacion SET ${COLUMNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')}
     WHERE id = $1 RETURNING *`,
    [id, ...COLUMNAS.map((c) => fila[c])],
  );
  return rows[0];
}

async function darDeBaja(usuarioId, id) {
  await obtener(usuarioId, id);
  await query('UPDATE alimentacion SET activo = false WHERE id = $1', [id]);
}

module.exports = { listar, resumenDeportista, obtener, crear, actualizar, darDeBaja };
