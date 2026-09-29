/**
 * Alertas automáticas de rendimiento, calculadas al vuelo con los datos reales:
 * rendimiento bajo, caída entre periodos y debilidad crítica en alguna capacidad.
 */
const { CAPACIDADES, NOMBRE_CAPACIDAD, UMBRAL, comparacionPeriodos } = require('../../domain/rendimiento');

function alertasDe(dep) {
  const historial = dep.historial_puntajes;
  if (!historial.length) return [];

  const base = { deportista_id: dep.id, deportista: `${dep.nombre} (${dep.codigo})` };
  const alertas = [];
  const ultima = historial.at(-1);

  if (ultima < UMBRAL.medio) {
    alertas.push({
      ...base, tipo: 'bajo', severidad: 'danger',
      mensaje: `Última puntuación ${ultima}/100, por debajo del umbral aceptable (${UMBRAL.medio}).`,
    });
  }

  const periodos = comparacionPeriodos(historial, 4);
  if (periodos && -periodos.diferencia >= UMBRAL.caida) {
    alertas.push({
      ...base, tipo: 'caida', severidad: 'warning',
      mensaje: `Caída de rendimiento de ${(-periodos.diferencia).toFixed(1)} puntos `
        + `(${periodos.anterior.toFixed(1)} → ${periodos.reciente.toFixed(1)}).`,
    });
  }

  const evaluacion = dep.ultima_evaluacion;
  for (const c of CAPACIDADES) {
    const valor = evaluacion?.[c];
    if (valor !== null && valor !== undefined && valor < UMBRAL.critico) {
      alertas.push({
        ...base, tipo: 'debilidad', severidad: 'warning',
        mensaje: `${NOMBRE_CAPACIDAD[c]} en nivel crítico (${valor}/100) en la última evaluación.`,
      });
    }
  }
  return alertas;
}

/** Todas las alertas de la academia, primero las más graves. */
function alertasAcademia(academia) {
  const orden = { danger: 0, warning: 1 };
  return academia.flatMap(alertasDe).sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

module.exports = { alertasDe, alertasAcademia };
