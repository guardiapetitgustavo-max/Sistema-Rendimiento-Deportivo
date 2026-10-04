/**
 * Nutrición (FASE 8): perfil (preferencias, restricciones y alergias DECLARADAS), notas del profesional y
 * orientación GENERAL basada en pautas públicas de hidratación y horarios. No es una dieta ni un consejo
 * clínico: las pautas personalizadas las da un profesional cualificado (rol "profesional").
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { deportistaEnAlcance } = require('../../core/alcance');
const M = require('../../domain/medicion');

const AVISO = 'Orientación general, no clínica. Para un plan personalizado consulta con un profesional de la nutrición.';

const esquemaPerfil = {
  preferencias: { tipo: 'texto', etiqueta: 'Preferencias', maxLargo: 500 },
  restricciones: { tipo: 'texto', etiqueta: 'Restricciones', maxLargo: 500 },
  alergias_declaradas: { tipo: 'texto', etiqueta: 'Alergias declaradas', maxLargo: 500 },
  objetivo: { tipo: 'texto', etiqueta: 'Objetivo', maxLargo: 300 },
};

async function perfil(alcance, deportistaId) {
  const dep = await deportistaEnAlcance(alcance, deportistaId);
  const { rows } = await query(
    `SELECT n.*, u.nombre AS profesional FROM nutricion_perfiles n LEFT JOIN usuarios u ON u.id = n.profesional_id WHERE n.deportista_id = $1`, [dep.id],
  );
  return { deportista: { id: dep.id, nombre: dep.nombre, peso_kg: dep.peso_kg }, perfil: rows[0] || null, orientacion: await orientacion(dep) };
}

/**
 * Guarda el perfil. Las notas profesionales solo las escribe quien tenga nutricion.orientar.
 */
async function guardarPerfil(alcance, usuario, deportistaId, datos = {}) {
  const dep = await deportistaEnAlcance(alcance, deportistaId);
  const d = validar(esquemaPerfil, datos);
  const puedeNotas = usuario.permisos.includes('nutricion.orientar');
  if (datos.notas_profesional !== undefined && !puedeNotas) throw new HttpError(403, 'Solo un profesional autorizado escribe las notas profesionales');
  const notas = puedeNotas && datos.notas_profesional !== undefined ? String(datos.notas_profesional || '').slice(0, 2000) : undefined;
  await query(
    `INSERT INTO nutricion_perfiles (deportista_id, academia_id, preferencias, restricciones, alergias_declaradas, objetivo, notas_profesional, profesional_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (deportista_id) DO UPDATE SET preferencias = EXCLUDED.preferencias, restricciones = EXCLUDED.restricciones,
       alergias_declaradas = EXCLUDED.alergias_declaradas, objetivo = EXCLUDED.objetivo,
       notas_profesional = coalesce($7, nutricion_perfiles.notas_profesional),
       profesional_id = CASE WHEN $7 IS NULL THEN nutricion_perfiles.profesional_id ELSE $8 END, actualizado_en = now()`,
    [dep.id, alcance.academia, d.preferencias, d.restricciones, d.alergias_declaradas, d.objetivo, notas ?? null, notas !== undefined ? usuario.id : null],
  );
  return perfil(alcance, dep.id);
}

/**
 * Orientación general con los datos del deportista:
 * - Hidratación de referencia ~35 ml por kg de peso al día (pauta general), más lo que se pierde al entrenar.
 * - Comparación con su hidratación registrada en los últimos 14 días.
 * - Horarios: comida principal 2-3 h antes de entrenar y recuperación dentro de las 2 h posteriores.
 */
async function orientacion(dep) {
  const { rows } = await query(
    `SELECT hidratacion_litros, hora_desayuno, hora_almuerzo, hora_cena, desayuno, almuerzo, cena FROM alimentacion
     WHERE deportista_id = $1 AND activo AND fecha >= CURRENT_DATE - 14`, [dep.id],
  );
  const puntos = [];
  const hid = rows.map((r) => r.hidratacion_litros).filter((v) => typeof v === 'number');
  const media = hid.length ? M.redondear(hid.reduce((s, v) => s + v, 0) / hid.length, 2) : null;
  const referencia = dep.peso_kg ? M.redondear((dep.peso_kg * 35) / 1000, 1) : null;
  if (referencia === null) puntos.push('Registra el peso del deportista para calcular una referencia de hidratación.');
  else if (media === null) puntos.push(`Referencia general de hidratación: ~${referencia} L/día más lo perdido al entrenar. No hay registros de hidratación en 14 días.`);
  else if (media < referencia * 0.8) puntos.push(`Hidratación media registrada ${media} L/día, por debajo de la referencia general (~${referencia} L/día): reforzar el hábito de beber agua.`);
  else puntos.push(`Hidratación media registrada ${media} L/día, acorde con la referencia general (~${referencia} L/día).`);
  const sinDesayuno = rows.filter((r) => !r.desayuno).length;
  if (rows.length >= 5 && sinDesayuno / rows.length > 0.4) puntos.push(`En ${sinDesayuno} de ${rows.length} registros no consta el desayuno.`);
  puntos.push('Horarios: comida principal 2-3 h antes de entrenar, algo ligero si falta menos de 1 h, y comida de recuperación dentro de las 2 h posteriores.');
  return {
    datos: { registros_14d: rows.length, hidratacion_media_l: media, referencia_hidratacion_l: referencia }, puntos, aviso: AVISO,
    suficiente: rows.length >= 3,
  };
}

module.exports = { AVISO, perfil, guardarPerfil, orientacion };
