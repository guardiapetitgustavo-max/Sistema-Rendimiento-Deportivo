/**
 * Perfil completo de un deportista: resumen, evolución, fortalezas, alertas,
 * última predicción y alimentación. Todo calculado con los datos reales.
 */
const {
  CAPACIDADES, NOMBRE_CAPACIDAD, capitalizar, clasificar, promedio, puntajes,
} = require('../../domain/rendimiento');
const { redondear } = require('../../utils/valores');
const { noEncontrado } = require('../../utils/http-error');
const deportistas = require('./deportistas.service');
const alimentacion = require('../alimentacion/alimentacion.service');
const ml = require('../ml/ml.service');
const { alertasDe } = require('../alertas/alertas.service');
const { generarRecomendacion } = require('../ia/reglas');

/** Promedio de puntuación general en una fecha para un grupo de deportistas. */
function promedioEnFecha(grupo, fecha) {
  return redondear(promedio(grupo.map((d) => d.evaluaciones.find((e) => e.fecha === fecha)?.puntuacion_general ?? null)));
}

/** Series alumno / su disciplina / academia, alineadas a las fechas del alumno. */
function evolucionComparada(dep, academia) {
  const fechas = dep.evaluaciones.map((e) => e.fecha);
  const disciplina = (dep.disciplina || '').trim().toLowerCase();
  const mismaDisciplina = disciplina
    ? academia.filter((d) => (d.disciplina || '').trim().toLowerCase() === disciplina)
    : academia;
  return {
    fechas,
    alumno: dep.evaluaciones.map((e) => e.puntuacion_general),
    disciplina: fechas.map((f) => promedioEnFecha(mismaDisciplina, f)),
    academia: fechas.map((f) => promedioEnFecha(academia, f)),
    nombre_disciplina: dep.disciplina || 'su grupo',
  };
}

/** Primera vs última evaluación por capacidad. */
function evolucionPorCapacidad(evaluaciones) {
  if (evaluaciones.length < 2) return [];
  const primera = evaluaciones[0];
  const ultima = evaluaciones.at(-1);
  return [...CAPACIDADES, 'puntuacion_general']
    .filter((c) => primera[c] !== null && ultima[c] !== null)
    .map((c) => ({
      capacidad: c === 'puntuacion_general' ? 'Puntuación general' : capitalizar(NOMBRE_CAPACIDAD[c]),
      inicial: redondear(primera[c]),
      final: redondear(ultima[c]),
      diferencia: redondear(ultima[c] - primera[c]),
    }));
}

async function obtenerPerfil(usuarioId, id) {
  const academia = await deportistas.cargarAcademia(usuarioId);
  const dep = academia.find((d) => d.id === id);
  if (!dep) throw noEncontrado('Deportista');

  const [comida, [prediccion]] = await Promise.all([
    alimentacion.resumenDeportista(id),
    ml.ultimasPredicciones(usuarioId, { deportistaId: id, limite: 1 }),
  ]);

  const scores = puntajes(dep.ultima_evaluacion);
  const { debiles, fuertes } = clasificar(scores);
  const etiquetar = ([c, v]) => ({ capacidad: capitalizar(NOMBRE_CAPACIDAD[c]), valor: v });
  const { evaluaciones, historial_puntajes: historial, ...datos } = dep;

  return {
    deportista: datos,
    evaluaciones: [...evaluaciones].reverse(),
    prediccion: prediccion || null,
    fortalezas: fuertes.reverse().map(etiquetar),
    aspectos_mejorar: debiles.map(etiquetar),
    recomendacion: dep.ultima_evaluacion ? generarRecomendacion(scores) : null,
    evolucion: evolucionComparada(dep, academia),
    evolucion_capacidades: evolucionPorCapacidad(evaluaciones),
    alimentacion: comida,
    alertas: alertasDe(dep),
  };
}

module.exports = { obtenerPerfil };
