/**
 * Motor de reglas del Asistente IA: analiza los datos reales del deportista
 * y genera recomendaciones de entrenamiento. Siempre disponible, sin costo.
 */
const {
  NOMBRE_CAPACIDAD, UMBRAL, capitalizar, clasificar, comparacionPeriodos, puntajes, promedio,
} = require('../../domain/rendimiento');
const { formatearFecha } = require('../../utils/valores');

const SUGERENCIAS = {
  velocidad: 'series de sprint corto (10-30 m) con recuperación completa y trabajo de técnica de carrera',
  resistencia: 'carrera continua progresiva, intervalos aeróbicos (4x800 m) y circuitos de resistencia mixta',
  fuerza: 'ejercicios de fuerza funcional con peso corporal y progresión a cargas externas, 2-3 sesiones por semana',
  agilidad: 'drills de cambios de dirección, escalera de coordinación y ejercicios reactivos con estímulo visual',
  coordinacion: 'ejercicios de coordinación óculo-manual/podal, ritmos de movimiento y combinaciones técnicas',
  tecnica: 'trabajo técnico analítico por bloques, videoanálisis y repeticiones con corrección inmediata',
  disciplina_score: 'refuerzo de hábitos: puntualidad, cumplimiento de rutinas y acuerdos de convivencia claros',
  asistencia: 'plan de seguimiento de asistencia con comunicación directa a la familia y registro semanal',
};

const AVISO = 'Nota: este análisis es una herramienta de apoyo basada en observación directa. '
  + 'No constituye un diagnóstico médico; la decisión final es del entrenador.';

/** Recomendación personalizada a partir de {capacidad: valor 0-100}. */
function generarRecomendacion(scores) {
  if (!scores || !Object.keys(scores).length) {
    return 'No hay suficientes datos de evaluación para generar una recomendación. '
      + 'Registra o importa una evaluación del deportista.';
  }

  const { debiles, neutras, fuertes } = clasificar(scores);
  const partes = [];

  if (debiles.length) {
    partes.push(`Se recomienda priorizar el desarrollo de: ${debiles.slice(0, 3).map(([k]) => NOMBRE_CAPACIDAD[k]).join(', ')}.`);
    for (const [k, v] of debiles.slice(0, 3)) {
      partes.push(`• ${capitalizar(NOMBRE_CAPACIDAD[k])} (${Math.round(v)}/100): ${SUGERENCIAS[k]}.`);
    }
  } else {
    partes.push('El deportista no presenta debilidades marcadas en este periodo.');
  }

  if (fuertes.length) {
    const texto = fuertes.slice(-3).map(([k, v]) => `${NOMBRE_CAPACIDAD[k]} (${Math.round(v)}/100)`).join(', ');
    partes.push(`Fortalezas a mantener y potenciar: ${texto}. Usarlas como base para elevar el rendimiento global.`);
  } else if (neutras.length) {
    partes.push(`Capacidades en nivel intermedio que pueden progresar: ${neutras.slice(0, 3).map(([k]) => NOMBRE_CAPACIDAD[k]).join(', ')}.`);
  }

  return partes.join('\n');
}

function describirTendencia(historial) {
  const comparacion = comparacionPeriodos(historial);
  if (!comparacion) return 'sin historial suficiente para comparar';
  const { diferencia } = comparacion;
  if (diferencia > UMBRAL.tendencia) return `en mejora (+${diferencia.toFixed(1)} puntos respecto a evaluaciones anteriores)`;
  if (diferencia < -UMBRAL.tendencia) return `en descenso (${diferencia.toFixed(1)} puntos, requiere atención)`;
  return 'estable';
}

/** Análisis completo de un deportista (resumido con sus evaluaciones). */
function analizarDeportista(dep) {
  if (!dep.total_evaluaciones) {
    return `${dep.nombre} aún no tiene evaluaciones registradas. Registra o importa una para generar el análisis.`;
  }
  const ultima = dep.ultima_evaluacion;
  return [
    `ANÁLISIS DE ${dep.nombre.toUpperCase()} (${dep.codigo})`,
    `Categoría: ${dep.categoria || 'sin dato'} | Disciplina: ${dep.disciplina || 'sin dato'}`,
    `Evaluaciones registradas: ${dep.total_evaluaciones} | Última: ${formatearFecha(ultima.fecha)}`,
    `Promedio general: ${dep.promedio_general ?? '—'}/100 | Evolución: ${describirTendencia(dep.historial_puntajes)}`,
    '',
    generarRecomendacion(puntajes(ultima)),
    '',
    AVISO,
  ].join('\n');
}

/** Resumen general de la academia con datos agregados reales. */
function resumirAcademia(academia) {
  const totalEvaluaciones = academia.reduce((s, d) => s + d.total_evaluaciones, 0);
  if (!academia.length || !totalEvaluaciones) {
    return 'Aún no hay datos en el sistema. Importa un Excel o registra evaluaciones para generar el primer análisis.';
  }

  const conPromedio = academia.filter((d) => d.promedio_general !== null);
  if (!conPromedio.length) return 'Los deportistas registrados aún no tienen evaluaciones con puntuación.';

  const cuenta = (nivel) => conPromedio.filter((d) => d.nivel === nivel).length;
  const prioritarios = [...conPromedio]
    .sort((a, b) => a.promedio_general - b.promedio_general)
    .filter((d) => d.promedio_general < UMBRAL.alto)
    .slice(0, 5);

  const lineas = [
    'RESUMEN DE LA ACADEMIA (datos reales registrados)',
    `Deportistas activos: ${academia.length} | Evaluaciones totales: ${totalEvaluaciones}`,
    `Rendimiento promedio: ${promedio(conPromedio.map((d) => d.promedio_general)).toFixed(1)}/100`,
    `Distribución: ${cuenta('Alto')} en nivel alto, ${cuenta('Medio')} en nivel medio, ${cuenta('Bajo')} en nivel bajo.`,
    '',
  ];
  if (prioritarios.length) {
    lineas.push('Deportistas que requieren seguimiento prioritario:');
    prioritarios.forEach((d) => lineas.push(`• ${d.nombre} (${d.codigo}): promedio ${d.promedio_general}/100`));
    lineas.push(
      '',
      `Sugerencia: enfocar las próximas sesiones en los ${cuenta('Bajo') + cuenta('Medio')} deportistas de nivel bajo/medio, `
        + 'priorizando las capacidades con menor promedio grupal (Dashboard → Comparación de habilidades).',
    );
  } else {
    lineas.push('Todos los deportistas evaluados están en nivel alto. ¡Buen trabajo!');
  }
  return lineas.join('\n');
}

module.exports = { generarRecomendacion, analizarDeportista, resumirAcademia };
