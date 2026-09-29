/**
 * Reportes tabulares. Cada reporte es { titulo, columnas, filas } para que la
 * misma estructura sirva a la vista web, al Excel y al PDF.
 */
const {
  CAPACIDADES, NOMBRE_CAPACIDAD, capitalizar, comparacionPeriodos, promedio, puntajes,
} = require('../../domain/rendimiento');
const { formatearFecha, redondear } = require('../../utils/valores');
const { solicitudInvalida } = require('../../utils/http-error');
const deportistas = require('../deportistas/deportistas.service');

const ETIQUETAS_CAPACIDAD = CAPACIDADES.map((c) => capitalizar(NOMBRE_CAPACIDAD[c]));
const vacio = (valor) => valor ?? '';

// Cuando el administrador ve a todos los coaches, los reportes indican de quién es cada deportista
const columnaCoach = (conCoach) => (conCoach ? ['Coach'] : []);
const celdaCoach = (conCoach, d) => (conCoach ? [d.coach] : []);

function general(academia, { conCoach } = {}) {
  return {
    titulo: 'Reporte general de rendimiento',
    columnas: ['Código', 'Nombre', ...columnaCoach(conCoach), 'Categoría', 'Disciplina', 'Evaluaciones', 'Promedio general', 'Nivel', 'Última evaluación'],
    filas: academia.map((d) => [
      d.codigo, d.nombre, ...celdaCoach(conCoach, d), vacio(d.categoria), vacio(d.disciplina), d.total_evaluaciones,
      vacio(d.promedio_general), d.nivel || 'Sin dato', formatearFecha(d.ultima_evaluacion?.fecha),
    ]),
  };
}

function ranking(academia, { conCoach } = {}) {
  const filas = academia
    .map((d) => ({ d, ev: [...d.evaluaciones].reverse().find((e) => Object.keys(puntajes(e)).length) }))
    .filter(({ ev }) => ev)
    .sort((a, b) => (b.d.promedio_general ?? -1) - (a.d.promedio_general ?? -1))
    .map(({ d, ev }, i) => [
      i + 1, d.codigo, d.nombre, ...celdaCoach(conCoach, d), vacio(d.categoria),
      ...CAPACIDADES.map((c) => vacio(ev[c])), vacio(d.promedio_general),
    ]);
  return {
    titulo: 'Ranking por indicadores deportivos',
    columnas: ['Puesto', 'Código', 'Nombre', ...columnaCoach(conCoach), 'Categoría', ...ETIQUETAS_CAPACIDAD, 'Promedio general'],
    filas,
  };
}

function seguimiento(academia, { conCoach } = {}) {
  const filas = academia
    .filter((d) => d.promedio_general !== null)
    .map((d) => {
      const motivos = [];
      if (d.promedio_general < 50) motivos.push('Rendimiento bajo');
      else if (d.promedio_general < 60) motivos.push('Rendimiento medio-bajo');
      const periodos = comparacionPeriodos(d.historial_puntajes, 4);
      if (periodos && periodos.diferencia < -3) motivos.push('Tendencia en descenso');
      return { d, motivos };
    })
    .filter(({ motivos }) => motivos.length)
    .sort((a, b) => a.d.promedio_general - b.d.promedio_general)
    .map(({ d, motivos }) => [d.codigo, d.nombre, ...celdaCoach(conCoach, d), vacio(d.categoria), d.promedio_general, motivos.join(' | ')]);
  return {
    titulo: 'Deportistas que requieren seguimiento',
    columnas: ['Código', 'Nombre', ...columnaCoach(conCoach), 'Categoría', 'Promedio general', 'Motivo de seguimiento'],
    filas,
  };
}

function evolucion(academia) {
  const porFecha = new Map();
  for (const ev of academia.flatMap((d) => d.evaluaciones)) {
    if (ev.puntuacion_general !== null) porFecha.set(ev.fecha, [...(porFecha.get(ev.fecha) || []), ev.puntuacion_general]);
  }
  return {
    titulo: 'Evolución del rendimiento de la academia',
    columnas: ['Fecha', 'Promedio de la academia', 'Evaluaciones'],
    filas: [...porFecha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, valores]) => [formatearFecha(fecha), redondear(promedio(valores)), valores.length]),
  };
}

function estadisticas(academia) {
  const evaluaciones = academia.flatMap((d) => d.evaluaciones);
  return {
    titulo: 'Estadísticas generales por indicador',
    columnas: ['Indicador', 'Promedio', 'Máximo', 'Mínimo'],
    filas: CAPACIDADES.map((c, i) => {
      const valores = evaluaciones.map((e) => e[c]).filter((v) => v !== null);
      return [ETIQUETAS_CAPACIDAD[i], vacio(redondear(promedio(valores))),
        valores.length ? Math.max(...valores) : '', valores.length ? Math.min(...valores) : ''];
    }),
  };
}

function individual(academia, deportistaId) {
  const dep = academia.find((d) => d.id === deportistaId);
  if (!dep) throw solicitudInvalida('Selecciona un deportista válido');
  return {
    titulo: `Reporte individual: ${dep.nombre} (${dep.codigo})`,
    columnas: ['Fecha', ...ETIQUETAS_CAPACIDAD, 'Puntuación general', 'Observaciones'],
    filas: dep.evaluaciones.map((e) => [
      formatearFecha(e.fecha), ...CAPACIDADES.map((c) => vacio(e[c])), vacio(e.puntuacion_general), vacio(e.observaciones),
    ]),
  };
}

const GENERADORES = { general, ranking, seguimiento, evolucion, estadisticas };
const TIPOS = [...Object.keys(GENERADORES), 'individual'];

async function generar(usuarioId, tipo, deportistaId) {
  if (!TIPOS.includes(tipo)) throw solicitudInvalida(`Tipo de reporte desconocido: ${tipo}`);
  const academia = await deportistas.cargarAcademia(usuarioId);
  return tipo === 'individual' ? individual(academia, deportistaId) : GENERADORES[tipo](academia, { conCoach: usuarioId === null });
}

/** Datos para la pantalla de reportes. */
async function resumen(usuarioId) {
  const academia = await deportistas.cargarAcademia(usuarioId);
  return Object.fromEntries(Object.entries(GENERADORES).map(([tipo, fn]) => [tipo, fn(academia, { conCoach: usuarioId === null })]));
}

module.exports = { TIPOS, generar, resumen };
