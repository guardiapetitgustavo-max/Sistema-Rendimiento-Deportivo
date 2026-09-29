/**
 * Reglas de negocio del rendimiento deportivo (fuente única de verdad).
 * Todas las capacidades se evalúan por observación directa en escala 0-100.
 */
const { redondear } = require('../utils/valores');

const CAPACIDADES = [
  'velocidad', 'resistencia', 'fuerza', 'agilidad',
  'coordinacion', 'tecnica', 'disciplina_score', 'asistencia',
];

const NOMBRE_CAPACIDAD = {
  velocidad: 'velocidad',
  resistencia: 'resistencia',
  fuerza: 'fuerza',
  agilidad: 'agilidad',
  coordinacion: 'coordinación',
  tecnica: 'técnica',
  disciplina_score: 'disciplina',
  asistencia: 'asistencia',
};

const NIVELES = ['Bajo', 'Medio', 'Alto'];

const UMBRAL = {
  alto: 75, // nivel Alto y fortaleza
  medio: 50, // nivel Medio; por debajo, rendimiento bajo
  debil: 55, // capacidad por debajo = aspecto por mejorar
  critico: 45, // capacidad por debajo = alerta de debilidad crítica
  caida: 5, // puntos de descenso entre periodos que disparan alerta
  tendencia: 3, // diferencia mínima para hablar de mejora o descenso
};

const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

const promedio = (valores) => {
  const lista = valores.filter((v) => v !== null && v !== undefined);
  return lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null;
};

function nivelDe(puntuacion) {
  if (puntuacion === null || puntuacion === undefined) return null;
  if (puntuacion >= UMBRAL.alto) return 'Alto';
  if (puntuacion >= UMBRAL.medio) return 'Medio';
  return 'Bajo';
}

/** {capacidad: valor} solo con las capacidades registradas en la evaluación. */
function puntajes(evaluacion) {
  const resultado = {};
  for (const c of CAPACIDADES) {
    if (evaluacion?.[c] !== null && evaluacion?.[c] !== undefined) resultado[c] = evaluacion[c];
  }
  return resultado;
}

const esCompleta = (evaluacion) => CAPACIDADES.every((c) => evaluacion[c] !== null && evaluacion[c] !== undefined);

/** Promedio de las capacidades registradas (se usa si no hay puntuación general). */
const calcularPuntuacion = (evaluacion) => redondear(promedio(Object.values(puntajes(evaluacion))));

const puntuacionDe = (evaluacion) => evaluacion.puntuacion_general ?? calcularPuntuacion(evaluacion);

/** Separa las capacidades en débiles, neutras y fuertes (ordenadas de menor a mayor). */
function clasificar(scores) {
  const ordenados = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  return {
    debiles: ordenados.filter(([, v]) => v < UMBRAL.debil),
    neutras: ordenados.filter(([, v]) => v >= UMBRAL.debil && v < UMBRAL.alto),
    fuertes: ordenados.filter(([, v]) => v >= UMBRAL.alto),
  };
}

/**
 * Compara la primera mitad del historial con la segunda.
 * Devuelve {anterior, reciente, diferencia} o null si hay menos de `minimo` puntajes.
 */
function comparacionPeriodos(listaPuntajes, minimo = 2) {
  if (listaPuntajes.length < minimo) return null;
  const mitad = Math.max(1, Math.floor(listaPuntajes.length / 2));
  const anterior = promedio(listaPuntajes.slice(0, mitad));
  const reciente = promedio(listaPuntajes.slice(-mitad));
  return { anterior, reciente, diferencia: reciente - anterior };
}

/**
 * Resumen calculado de un deportista a partir de sus evaluaciones activas
 * (ordenadas por fecha ascendente).
 */
function resumirDeportista(deportista) {
  const evaluaciones = deportista.evaluaciones || [];
  const historial = evaluaciones.map((e) => e.puntuacion_general).filter((v) => v !== null);
  const promedioGeneral = redondear(promedio(historial));
  return {
    ...deportista,
    total_evaluaciones: evaluaciones.length,
    ultima_evaluacion: evaluaciones.at(-1) || null,
    promedio_general: promedioGeneral,
    nivel: nivelDe(promedioGeneral),
    historial_puntajes: historial,
  };
}

module.exports = {
  CAPACIDADES,
  NOMBRE_CAPACIDAD,
  NIVELES,
  UMBRAL,
  capitalizar,
  promedio,
  nivelDe,
  puntajes,
  esCompleta,
  calcularPuntuacion,
  puntuacionDe,
  clasificar,
  comparacionPeriodos,
  resumirDeportista,
};
