/**
 * Portal del deportista y del padre/madre: SOLO lectura y SOLO de las fichas vinculadas a su cuenta
 * (deportistas.cuenta_id para el deportista, tutores para el padre). Nunca modifican resultados oficiales.
 */
const { query } = require('../../db/pool');
const { noEncontrado } = require('../../utils/http-error');
const deportistas = require('../deportistas/deportistas.service');
const { obtenerPerfil } = require('../deportistas/perfil.service');

async function idsVinculados(usuario) {
  const academia = usuario.academia.id;
  const { rows } = usuario.rol === 'padre'
    ? await query(
      `SELECT d.id FROM tutores t JOIN deportistas d ON d.id = t.deportista_id
       WHERE t.usuario_id = $1 AND d.academia_id = $2 AND d.activo`,
      [usuario.id, academia],
    )
    : await query('SELECT id FROM deportistas WHERE cuenta_id = $1 AND academia_id = $2 AND activo', [usuario.id, academia]);
  return rows.map((r) => r.id);
}

async function listar(usuario) {
  const ids = await idsVinculados(usuario);
  if (!ids.length) return [];
  const academia = await deportistas.cargarAcademia({ academia: usuario.academia.id, coach: null });
  return academia
    .filter((d) => ids.includes(d.id))
    .map(({
      id, codigo, nombre, categoria, disciplina, edad, coach, total_evaluaciones: total, promedio_general: promedio, nivel, ultima_evaluacion: ultima,
    }) => ({
      id, codigo, nombre, categoria, disciplina, edad, coach, total_evaluaciones: total, promedio_general: promedio, nivel, ultima_fecha: ultima?.fecha || null,
    }));
}

/**
 * Perfil de consulta de una ficha vinculada. No incluye predicciones de ML ni recomendaciones
 * automáticas: se mostrarán al deportista cuando exista la autorización del coach (FASE 6).
 */
async function perfil(usuario, id) {
  if (!(await idsVinculados(usuario)).includes(id)) throw noEncontrado('Deportista');
  const completo = await obtenerPerfil({ academia: usuario.academia.id, coach: null }, id);
  const {
    prediccion, recomendacion, alimentacion, ...visible
  } = completo;
  return visible;
}

module.exports = { listar, perfil };
