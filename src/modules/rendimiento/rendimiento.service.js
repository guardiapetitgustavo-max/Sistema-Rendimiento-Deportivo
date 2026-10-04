/**
 * Rendimiento (FASE 5): evolución por prueba, récords personales, puntaje compuesto con scoring VERSIONADO,
 * rankings y comparativas. Solo se comparan resultados compatibles (misma prueba, unidad y contexto, p. ej.
 * el largo de la piscina). Solo cuentan los resultados oficiales (las estimaciones no).
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { condicionDeportista, deportistaEnAlcance } = require('../../core/alcance');
const { hoyISO } = require('../../utils/valores');
const M = require('../../domain/medicion');
const { CAPACIDADES } = require('../../domain/plantillas-deporte');

const VENTANA_PUNTAJE_DIAS = 180; // un resultado más antiguo no representa el estado actual

async function resultadosOficiales(academia, filtro, valores) {
  const { rows } = await query(
    `SELECT r.id, r.deportista_id, r.prueba_id, r.valor, r.unidad, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.datos, r.fuente_medicion,
            p.nombre AS prueba, p.capacidad, p.criterio, p.baremo_base, p.baremo_excelente, p.distancia_m, p.estilo, p.modo,
            m.tipo_resultado, m.direccion_mejora, m.rango_min, m.rango_max, m.decimales, m.nombre AS metrica
     FROM resultados r JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
     WHERE r.academia_id = $1 AND r.activo AND r.oficial AND ${filtro} ORDER BY r.fecha, r.id`,
    [academia, ...valores],
  );
  return rows;
}

const contexto = (r) => (r.datos?.largo_piscina ? `Piscina ${r.datos.largo_piscina} m` : null);

/** Agrupa por (prueba + contexto) y consolida los intentos de un mismo día con el criterio de la prueba. */
function agruparCompatibles(filas) {
  const grupos = new Map();
  for (const r of filas) {
    const clave = M.claveComparacion(r);
    if (!grupos.has(clave)) grupos.set(clave, { clave, muestra: r, porDia: new Map() });
    const g = grupos.get(clave);
    g.porDia.set(r.fecha, [...(g.porDia.get(r.fecha) || []), r]);
  }
  return [...grupos.values()].map((g) => {
    const p = g.muestra;
    const rango = { min: p.rango_min, max: p.rango_max };
    const diarios = [...g.porDia.entries()].map(([fecha, lista]) => ({
      fecha, prueba_id: p.prueba_id, unidad: p.unidad, datos: p.datos,
      valor: M.consolidarIntentos(lista.map((x) => x.valor), p.criterio, p.direccion_mejora, rango),
      intentos: lista.length,
    }));
    return { ...g, diarios, rango };
  });
}

const formato = (p, valor) => (valor === null || valor === undefined ? null
  : M.formatearValor(valor, { tipo: p.tipo_resultado, unidad: p.unidad, decimales: p.decimales }));

/** Evolución de un deportista en todas sus pruebas. */
async function evolucionDeportista(alcance, deportistaId) {
  const dep = await deportistaEnAlcance(alcance, deportistaId);
  const filas = await resultadosOficiales(alcance.academia, 'r.deportista_id = $2', [dep.id]);
  return agruparCompatibles(filas).map((g) => {
    const p = g.muestra;
    const evo = M.evolucion(g.diarios, p.direccion_mejora, g.rango);
    return {
      prueba_id: p.prueba_id, prueba: p.prueba, capacidad: p.capacidad, metrica: p.metrica, unidad: p.unidad, tipo_resultado: p.tipo_resultado,
      direccion_mejora: p.direccion_mejora, contexto: contexto(p), clave: g.clave,
      ...evo,
      textos: { actual: formato(p, evo.actual.valor), mejor_marca: formato(p, evo.mejor_marca?.valor) },
    };
  }).sort((a, b) => String(b.actual.fecha).localeCompare(String(a.actual.fecha)));
}

/** Configuración de scoring vigente más específica (deporte + categoría → deporte → general). */
async function scoringVigente(academia, deporteId, categoriaId) {
  const { rows } = await query(
    `SELECT * FROM configuraciones_scoring WHERE academia_id = $1 AND vigente
       AND (deporte_id = $2 OR deporte_id IS NULL) AND (categoria_id = $3 OR categoria_id IS NULL)
     ORDER BY (deporte_id IS NOT NULL) DESC, (categoria_id IS NOT NULL) DESC, version DESC LIMIT 1`,
    [academia, deporteId || null, categoriaId || null],
  );
  return rows[0] || null;
}

/**
 * Puntaje compuesto 0-100 del deportista a una fecha, con la versión de scoring indicada (o la vigente).
 * Cada prueba se normaliza con su baremo (base → 0, excelente → 100); cada capacidad es la media de sus
 * pruebas; el total pondera las capacidades con datos e informa la COBERTURA (qué % del peso tiene datos).
 */
function calcularPuntaje(grupos, config, fecha) {
  const limite = new Date(new Date(`${fecha}T00:00:00Z`).getTime() - VENTANA_PUNTAJE_DIAS * 86400000).toISOString().slice(0, 10);
  const porCapacidad = {};
  const pruebas = [];
  for (const g of grupos) {
    const p = g.muestra;
    const enVentana = g.diarios.filter((x) => x.fecha <= fecha && x.fecha >= limite);
    if (!enVentana.length) continue;
    const ultimo = enVentana.at(-1);
    const baremo = config.baremos?.[p.prueba_id] || { base: p.baremo_base, excelente: p.baremo_excelente };
    const puntos = M.normalizar(ultimo.valor, baremo);
    pruebas.push({
      prueba_id: p.prueba_id, prueba: p.prueba, capacidad: p.capacidad, valor: ultimo.valor, fecha: ultimo.fecha, puntos,
      baremo: puntos === null ? null : baremo, contexto: contexto(p),
    });
    if (puntos !== null) (porCapacidad[p.capacidad] ||= []).push(puntos);
  }
  const medias = Object.fromEntries(Object.entries(porCapacidad).map(([c, l]) => [c, M.redondear(l.reduce((s, v) => s + v, 0) / l.length, 1)]));
  const compuesto = M.puntajeCompuesto(medias, config.pesos);
  return { ...compuesto, pruebas, sin_baremo: pruebas.filter((x) => x.puntos === null).map((x) => x.prueba) };
}

async function puntaje(alcance, deportistaId, { fecha = hoyISO(), guardar = true, scoringId = null } = {}) {
  const dep = await deportistaEnAlcance(alcance, deportistaId);
  let config;
  if (scoringId) {
    const { rows } = await query('SELECT * FROM configuraciones_scoring WHERE id = $1 AND academia_id = $2', [scoringId, alcance.academia]);
    config = rows[0];
  } else config = await scoringVigente(alcance.academia, dep.deporte_id, dep.categoria_id);
  if (!config) {
    return { deportista_id: dep.id, disponible: false, mensaje: 'DATOS INSUFICIENTES: la academia no tiene una configuración de scoring para este deporte.' };
  }
  const filas = await resultadosOficiales(alcance.academia, 'r.deportista_id = $2 AND r.fecha <= $3', [dep.id, fecha]);
  const calc = calcularPuntaje(agruparCompatibles(filas), config, fecha);
  const salida = {
    deportista_id: dep.id, fecha, disponible: calc.total !== null,
    scoring: { id: config.id, nombre: config.nombre, version: config.version, pesos: config.pesos },
    total: calc.total, cobertura: calc.cobertura, capacidades: calc.capacidades, pruebas: calc.pruebas, sin_baremo: calc.sin_baremo,
    mensaje: calc.total === null ? 'DATOS INSUFICIENTES: no hay resultados oficiales recientes con baremo para calcular el puntaje.' : null,
  };
  if (guardar && calc.total !== null) {
    await query(
      `INSERT INTO snapshots_rendimiento (academia_id, deportista_id, scoring_id, fecha, puntaje, cobertura, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (deportista_id, scoring_id, fecha) DO UPDATE SET puntaje = EXCLUDED.puntaje, cobertura = EXCLUDED.cobertura,
         detalle = EXCLUDED.detalle, creado_en = now()`,
      [alcance.academia, dep.id, config.id, fecha, calc.total, calc.cobertura, JSON.stringify({ capacidades: calc.capacidades, pruebas: calc.pruebas })],
    );
  }
  return salida;
}

/** Historial de puntajes guardados, cada uno con la versión de scoring con que se calculó. */
async function historialPuntajes(alcance, deportistaId) {
  await deportistaEnAlcance(alcance, deportistaId);
  const { rows } = await query(
    `SELECT s.id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.puntaje, s.cobertura, s.detalle, c.nombre AS scoring, c.version, c.id AS scoring_id
     FROM snapshots_rendimiento s JOIN configuraciones_scoring c ON c.id = s.scoring_id
     WHERE s.deportista_id = $1 AND s.academia_id = $2 ORDER BY s.fecha, c.version`,
    [deportistaId, alcance.academia],
  );
  return rows;
}

/**
 * Ranking de una prueba: mejor marca oficial de cada deportista visible. Si la prueba se mide en varios
 * contextos (piscina de 25 y de 50 m) se elige UNO (el pedido o el más frecuente): nunca se mezclan.
 */
async function ranking(alcance, consulta = {}) {
  const pruebaId = Number(consulta.prueba_id);
  if (!Number.isInteger(pruebaId) || pruebaId <= 0) throw new HttpError(400, 'Elige una prueba');
  const valores = [pruebaId, alcance.coach];
  const filtros = ['r.prueba_id = $2', condicionDeportista('d', '$1', '$3'), 'd.activo'];
  if (Number(consulta.categoria_id)) { valores.push(Number(consulta.categoria_id)); filtros.push(`d.categoria_id = $${valores.length + 1}`); }
  if (Number(consulta.equipo_id)) {
    valores.push(Number(consulta.equipo_id));
    filtros.push(`EXISTS (SELECT 1 FROM equipo_miembros em WHERE em.deportista_id = d.id AND em.equipo_id = $${valores.length + 1})`);
  }
  if (consulta.sexo) { valores.push(String(consulta.sexo)); filtros.push(`d.sexo = $${valores.length + 1}`); }
  if (consulta.desde) { valores.push(String(consulta.desde).slice(0, 10)); filtros.push(`r.fecha >= $${valores.length + 1}::date`); }
  const { rows } = await query(
    `SELECT r.id, r.deportista_id, r.prueba_id, r.valor, r.unidad, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.datos,
            d.nombre AS deportista, d.codigo, p.nombre AS prueba, m.tipo_resultado, m.direccion_mejora, m.rango_min, m.rango_max, m.decimales
     FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
     WHERE r.academia_id = $1 AND r.activo AND r.oficial AND ${filtros.join(' AND ')}`,
    [alcance.academia, ...valores],
  );
  if (!rows.length) return { prueba_id: pruebaId, contextos: [], contexto: null, filas: [] };
  const conteo = new Map();
  for (const r of rows) conteo.set(M.claveComparacion(r), (conteo.get(M.claveComparacion(r)) || 0) + 1);
  const contextos = [...conteo.entries()].map(([clave, n]) => ({ clave, n, nombre: contexto(rows.find((r) => M.claveComparacion(r) === clave)) || 'Único' }));
  const elegido = consulta.contexto && conteo.has(consulta.contexto) ? consulta.contexto : contextos.sort((a, b) => b.n - a.n)[0].clave;
  const p = rows[0];
  const rango = { min: p.rango_min, max: p.rango_max };
  const porDep = new Map();
  for (const r of rows.filter((x) => M.claveComparacion(x) === elegido)) {
    const actual = porDep.get(r.deportista_id);
    if (!actual || M.esMejor(r.valor, actual.valor, p.direccion_mejora, rango)) porDep.set(r.deportista_id, r);
  }
  if (p.direccion_mejora === 'CUSTOM') throw new HttpError(400, 'Esta métrica no tiene dirección de mejora: no se puede ordenar en un ranking');
  const filas = [...porDep.values()].sort((a, b) => {
    if (M.esMejor(a.valor, b.valor, p.direccion_mejora, rango)) return -1;
    if (M.esMejor(b.valor, a.valor, p.direccion_mejora, rango)) return 1;
    return a.fecha.localeCompare(b.fecha); // a igual marca, primero quien la logró antes
  }).map((r, i) => ({
    posicion: i + 1, deportista_id: r.deportista_id, deportista: r.deportista, codigo: r.codigo, valor: r.valor, fecha: r.fecha,
    texto: formato(p, r.valor),
  }));
  return {
    prueba_id: pruebaId, prueba: p.prueba, direccion_mejora: p.direccion_mejora, unidad: p.unidad, contextos, contexto: elegido, filas,
  };
}

/** Comparativa de 2 a 6 deportistas en las pruebas que tienen en común (contexto compatible). */
async function comparar(alcance, ids) {
  const lista = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (lista.length < 2 || lista.length > 6) throw new HttpError(400, 'Elige entre 2 y 6 deportistas para comparar');
  const deportistas = [];
  for (const id of lista) deportistas.push(await deportistaEnAlcance(alcance, id));
  const filas = await resultadosOficiales(alcance.academia, 'r.deportista_id = ANY($2::int[])', [lista]);
  const porClave = new Map();
  for (const r of filas) {
    const k = M.claveComparacion(r);
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(r);
  }
  const pruebas = [];
  for (const [clave, rs] of porClave) {
    const p = rs[0];
    const rango = { min: p.rango_min, max: p.rango_max };
    const valores = lista.map((id) => {
      const propios = rs.filter((r) => r.deportista_id === id);
      if (!propios.length) return { deportista_id: id, mejor: null, ultimo: null };
      const mejor = M.mejorValor(propios.map((r) => r.valor), p.direccion_mejora, rango);
      return { deportista_id: id, mejor, ultimo: propios.at(-1).valor, fecha_ultimo: propios.at(-1).fecha, texto: formato(p, mejor) };
    });
    const conDatos = valores.filter((v) => v.mejor !== null);
    if (conDatos.length < 2) continue; // solo se compara lo que tienen en común
    const lider = M.mejorValor(conDatos.map((v) => v.mejor), p.direccion_mejora, rango);
    pruebas.push({
      clave, prueba_id: p.prueba_id, prueba: p.prueba, capacidad: p.capacidad, unidad: p.unidad, direccion_mejora: p.direccion_mejora, contexto: contexto(p),
      valores: valores.map((v) => ({ ...v, lider: v.mejor !== null && v.mejor === lider })),
    });
  }
  return { deportistas: deportistas.map((d) => ({ id: d.id, nombre: d.nombre, codigo: d.codigo })), pruebas };
}

/** Resumen de un equipo: récords recientes, asistencia y medias por prueba (compatibles). */
async function resumenEquipo(alcance, equipoId) {
  const { rows: eq } = await query('SELECT * FROM equipos WHERE id = $1 AND academia_id = $2', [equipoId, alcance.academia]);
  if (!eq.length || (alcance.coach && eq[0].coach_id !== alcance.coach)) throw new HttpError(404, 'Equipo no encontrado');
  const { rows: miembros } = await query(
    `SELECT d.id, d.nombre, d.codigo FROM equipo_miembros em JOIN deportistas d ON d.id = em.deportista_id WHERE em.equipo_id = $1 AND d.activo ORDER BY d.nombre`,
    [equipoId],
  );
  const ids = miembros.map((m) => m.id);
  const filas = ids.length ? await resultadosOficiales(alcance.academia, 'r.deportista_id = ANY($2::int[])', [ids]) : [];
  const porPrueba = agruparCompatibles(filas).map((g) => {
    const p = g.muestra;
    const ultimos = new Map();
    for (const r of filas.filter((x) => M.claveComparacion(x) === g.clave)) ultimos.set(r.deportista_id, r.valor);
    const vals = [...ultimos.values()];
    return {
      prueba: p.prueba, contexto: contexto(p), unidad: p.unidad, deportistas_medidos: vals.length,
      media: M.redondear(vals.reduce((s, v) => s + v, 0) / vals.length, 2),
      mejor: M.mejorValor(vals, p.direccion_mejora, g.rango),
    };
  });
  return { equipo: eq[0], miembros, pruebas: porPrueba };
}

/** Panel principal (admin y coach) con datos REALES del alcance. */
async function panel(alcance) {
  const p = [alcance.academia, alcance.coach];
  const dep = condicionDeportista('d', '$1', '$2');
  const [tot, recientes, asistencia, cargas, records, alertas, objetivos, porSemana] = await Promise.all([
    query(`SELECT count(*)::int AS deportistas,
             (SELECT count(*)::int FROM resultados r JOIN deportistas d ON d.id = r.deportista_id WHERE r.activo AND ${dep} AND r.fecha >= CURRENT_DATE - 30) AS resultados_30d,
             (SELECT count(*)::int FROM sesiones_entrenamiento s WHERE s.academia_id = $1 AND s.fecha >= CURRENT_DATE - 7 AND ($2::int IS NULL OR s.coach_id = $2)) AS entrenamientos_7d,
             (SELECT count(*)::int FROM sesiones_evaluacion s WHERE s.academia_id = $1 AND s.estado = 'abierta' AND ($2::int IS NULL OR s.coach_id = $2)) AS evaluaciones_abiertas
           FROM deportistas d WHERE d.activo AND ${dep}`, p),
    query(`SELECT r.id, r.deportista_id, d.nombre AS deportista, p.nombre AS prueba, r.valor, r.unidad, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.fuente_medicion, m.tipo_resultado, m.decimales
           FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
           WHERE r.activo AND ${dep} ORDER BY r.creado_en DESC LIMIT 8`, p),
    query(`SELECT a.estado FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id WHERE ${dep} AND a.fecha >= CURRENT_DATE - 30`, p),
    query(`SELECT r.fatiga, r.horas_sueno, r.dolor FROM recuperacion r JOIN deportistas d ON d.id = r.deportista_id WHERE ${dep} AND r.fecha >= CURRENT_DATE - 7`, p),
    query(`SELECT a.datos, a.titulo, a.deportista_id, to_char(a.creado_en, 'YYYY-MM-DD') AS fecha FROM alertas a JOIN deportistas d ON d.id = a.deportista_id
           WHERE a.tipo = 'record_personal' AND ${dep} ORDER BY a.creado_en DESC LIMIT 6`, p),
    query(`SELECT a.id, a.titulo, a.motivo, a.prioridad, a.estado, a.deportista_id, d.nombre AS deportista, to_char(a.creado_en, 'YYYY-MM-DD') AS fecha
           FROM alertas a LEFT JOIN deportistas d ON d.id = a.deportista_id
           WHERE a.academia_id = $1 AND a.estado IN ('nueva', 'vista') AND a.tipo <> 'record_personal' AND (a.deportista_id IS NULL OR ${dep})
           ORDER BY CASE a.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, a.creado_en DESC LIMIT 10`, p),
    query(`SELECT o.estado, count(*)::int AS n FROM objetivos o LEFT JOIN deportistas d ON d.id = o.deportista_id
           WHERE o.academia_id = $1 AND (o.deportista_id IS NULL OR ${dep}) GROUP BY o.estado`, p),
    query(`SELECT to_char(date_trunc('week', r.fecha), 'YYYY-MM-DD') AS semana, count(*)::int AS n
           FROM resultados r JOIN deportistas d ON d.id = r.deportista_id WHERE r.activo AND ${dep} AND r.fecha >= CURRENT_DATE - 84
           GROUP BY 1 ORDER BY 1`, p),
  ]);
  const asis = asistencia.rows.filter((a) => a.estado !== 'justificado');
  const media = (l) => (l.length ? M.redondear(l.reduce((s, v) => s + v, 0) / l.length, 1) : null);
  return {
    totales: {
      ...tot.rows[0],
      asistencia_30d: asis.length ? M.redondear((asis.filter((a) => a.estado !== 'ausente').length / asis.length) * 100, 1) : null,
      fatiga_media_7d: media(cargas.rows.map((r) => r.fatiga).filter((v) => v !== null)),
      sueno_medio_7d: media(cargas.rows.map((r) => r.horas_sueno).filter((v) => v !== null)),
      dolor_reportado_7d: cargas.rows.filter((r) => r.dolor).length,
      objetivos: Object.fromEntries(objetivos.rows.map((r) => [r.estado, r.n])),
    },
    ultimos_resultados: recientes.rows.map((r) => ({ ...r, texto: M.formatearValor(r.valor, { tipo: r.tipo_resultado, unidad: r.unidad, decimales: r.decimales }) })),
    records_recientes: records.rows,
    alertas: alertas.rows,
    resultados_por_semana: porSemana.rows,
  };
}

module.exports = {
  VENTANA_PUNTAJE_DIAS, CAPACIDADES, evolucionDeportista, scoringVigente, calcularPuntaje, agruparCompatibles, puntaje, historialPuntajes,
  ranking, comparar, resumenEquipo, panel, resultadosOficiales,
};
