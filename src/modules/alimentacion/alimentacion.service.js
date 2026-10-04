const { query } = require('../../db/pool');
const { noEncontrado, solicitudInvalida } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO, redondear } = require('../../utils/valores');
const deportistas = require('../deportistas/deportistas.service');
const { condicionDeportista } = require('../../core/alcance');

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
  hora_desayuno: { tipo: 'texto', etiqueta: 'Hora del desayuno', maxLargo: 5 },
  hora_almuerzo: { tipo: 'texto', etiqueta: 'Hora del almuerzo', maxLargo: 5 },
  hora_cena: { tipo: 'texto', etiqueta: 'Hora de la cena', maxLargo: 5 },
};
const COLUMNAS = Object.keys(esquema);
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

function validarRegistro(datos) {
  const fila = { ...validar(esquema, datos) };
  for (const c of ['hora_desayuno', 'hora_almuerzo', 'hora_cena']) {
    if (fila[c] && !HORA.test(fila[c])) throw solicitudInvalida(`Hora no válida en ${esquema[c].etiqueta} (usa HH:MM)`);
  }
  return fila;
}

async function listar(alcance, { deportista_id: deportistaId } = {}) {
  const { rows } = await query(
    `SELECT a.*, d.codigo, d.nombre
     FROM alimentacion a JOIN deportistas d ON d.id = a.deportista_id
     WHERE ${condicionDeportista('d', '$1', '$2')} AND d.activo AND a.activo
       AND ($3::int IS NULL OR a.deportista_id = $3)
     ORDER BY a.fecha DESC, a.id DESC
     LIMIT 1000`,
    [alcance.academia, alcance.coach, deportistaId ? Number(deportistaId) : null],
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

async function obtener(alcance, id) {
  const { rows } = await query(
    `SELECT a.*, d.codigo, d.nombre
     FROM alimentacion a JOIN deportistas d ON d.id = a.deportista_id
     WHERE a.id = $1 AND ${condicionDeportista('d', '$2', '$3')} AND a.activo AND d.activo`,
    [id, alcance.academia, alcance.coach],
  );
  if (!rows.length) throw noEncontrado('Registro de alimentación');
  return rows[0];
}

/** Inserta un registro (origen: coach, profesional o el propio deportista desde el portal). */
async function insertar(deportistaId, datos, origen = 'coach', usuarioId = null) {
  const fila = validarRegistro(datos);
  fila.fecha = fila.fecha || hoyISO();
  const { rows } = await query(
    `INSERT INTO alimentacion (deportista_id, ${COLUMNAS.join(', ')}, origen, registrado_por)
     VALUES ($1, ${COLUMNAS.map((_, i) => `$${i + 2}`).join(', ')}, $${COLUMNAS.length + 2}, $${COLUMNAS.length + 3}) RETURNING *`,
    [deportistaId, ...COLUMNAS.map((c) => fila[c]), origen, usuarioId],
  );
  return rows[0];
}

async function crear(alcance, datos, usuario) {
  const deportista = await deportistas.obtener(alcance, Number(datos.deportista_id));
  return insertar(deportista.id, datos, usuario?.rol === 'profesional' ? 'profesional' : 'coach', usuario?.id || null);
}

async function actualizar(alcance, id, datos) {
  const actual = await obtener(alcance, id);
  const fila = validarRegistro(datos);
  fila.fecha = fila.fecha || actual.fecha;
  const { rows } = await query(
    `UPDATE alimentacion SET ${COLUMNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')}
     WHERE id = $1 RETURNING *`,
    [id, ...COLUMNAS.map((c) => fila[c])],
  );
  return rows[0];
}

async function darDeBaja(alcance, id) {
  await obtener(alcance, id);
  await query('UPDATE alimentacion SET activo = false WHERE id = $1', [id]);
}

module.exports = {
  listar, resumenDeportista, obtener, crear, insertar, actualizar, darDeBaja,
};
