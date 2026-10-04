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

// ---- Reportes con los datos de medición reales (fases 3-6)
const { query } = require('../../db/pool');
const { condicionDeportista } = require('../../core/alcance');
const M = require('../../domain/medicion');

/** Mejor marca oficial de cada deportista en cada prueba y contexto (nunca mezcla contextos). */
async function marcas(alcance) {
  const { rows } = await query(
    `SELECT d.codigo, d.nombre, p.nombre AS prueba, r.valor, r.unidad, r.datos, r.prueba_id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.fuente_medicion,
            m.direccion_mejora, m.tipo_resultado, m.decimales, m.rango_min, m.rango_max
     FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
     WHERE r.activo AND r.oficial AND d.activo AND ${condicionDeportista('d', '$1', '$2')} ORDER BY p.nombre, d.nombre, r.fecha`,
    [alcance.academia, alcance.coach],
  );
  const mejores = new Map();
  for (const r of rows) {
    const k = `${r.codigo}|${M.claveComparacion(r)}`;
    const actual = mejores.get(k);
    if (!actual || M.esMejor(r.valor, actual.valor, r.direccion_mejora, { min: r.rango_min, max: r.rango_max })) mejores.set(k, { ...r, mediciones: (actual?.mediciones || 0) + 1 });
    else actual.mediciones += 1;
  }
  return {
    titulo: 'Mejores marcas oficiales por deportista y prueba',
    nota: 'Solo resultados oficiales; los de distinto contexto (p. ej. piscina de 25 y 50 m) se informan por separado.',
    columnas: ['Prueba', 'Contexto', 'Código', 'Deportista', 'Mejor marca', 'Fecha', 'Mediciones', 'Fuente'],
    filas: [...mejores.values()].map((r) => [r.prueba, r.datos?.largo_piscina ? `Piscina ${r.datos.largo_piscina} m` : '', r.codigo, r.nombre,
      M.formatearValor(r.valor, { tipo: r.tipo_resultado, unidad: r.unidad, decimales: r.decimales }), formatearFecha(r.fecha), r.mediciones, r.fuente_medicion]),
  };
}

async function asistencia(alcance) {
  const est = await require('../entrenamiento/entrenamiento.service').estadisticas(alcance, {
    desde: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  });
  return {
    titulo: 'Asistencia de los últimos 30 días',
    nota: '% de asistencia = (presentes + tardanzas) / registros sin justificados. Carga = RPE × minutos (sRPE).',
    columnas: ['Código', 'Deportista', '% asistencia', 'Presentes', 'Tardanzas', 'Ausencias', 'Justificadas', 'Carga total (UA)'],
    filas: est.deportistas.map((d) => [d.codigo, d.deportista, d.porcentaje ?? '', d.presentes, d.tardanzas, d.ausencias, d.justificadas, d.carga_total_srpe ?? '']),
  };
}

async function alertas(alcance) {
  const lista = await require('../inteligencia/inteligencia.service').listarAlertas(alcance, { estado: 'nueva,vista,resuelta' });
  return {
    titulo: 'Alertas del rendimiento',
    nota: 'Generadas por reglas configurables con los datos registrados. Seguimiento, no diagnóstico médico.',
    columnas: ['Fecha', 'Deportista', 'Tipo', 'Prioridad', 'Estado', 'Motivo'],
    filas: lista.map((a) => [formatearFecha(String(a.creado_en.toISOString?.() || a.creado_en).slice(0, 10)), a.deportista || '', a.titulo, a.prioridad, a.estado, a.motivo]),
  };
}

const GENERADORES_DATOS = { marcas, asistencia, alertas };
const TIPOS = [...Object.keys(GENERADORES), ...Object.keys(GENERADORES_DATOS), 'individual'];

async function generar(alcance, tipo, deportistaId) {
  if (!TIPOS.includes(tipo)) throw solicitudInvalida(`Tipo de reporte desconocido: ${tipo}`);
  if (GENERADORES_DATOS[tipo]) return GENERADORES_DATOS[tipo](alcance);
  const academia = await deportistas.cargarAcademia(alcance);
  return tipo === 'individual' ? individual(academia, deportistaId) : GENERADORES[tipo](academia, { conCoach: alcance.coach === null });
}

/** Datos para la pantalla de reportes. */
async function resumen(alcance) {
  const academia = await deportistas.cargarAcademia(alcance);
  const datos = Object.fromEntries(Object.entries(GENERADORES).map(([tipo, fn]) => [tipo, fn(academia, { conCoach: alcance.coach === null })]));
  for (const [tipo, fn] of Object.entries(GENERADORES_DATOS)) datos[tipo] = await fn(alcance);
  return datos;
}

module.exports = { TIPOS, generar, resumen };
