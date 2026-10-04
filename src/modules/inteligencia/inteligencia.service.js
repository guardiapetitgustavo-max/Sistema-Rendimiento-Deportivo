/**
 * Inteligencia (FASE 6): análisis trazables del deportista, del equipo y 360°, alertas, recomendaciones
 * revisadas por una persona, notificaciones y un asistente que responde con los datos reales.
 *
 * Principios:
 * - Motor determinista ("motor-reglas"): cada afirmación sale de un dato concreto que se guarda en datos_usados.
 * - Si no hay datos suficientes se dice "DATOS INSUFICIENTES"; nunca se inventa un resultado.
 * - Las recomendaciones nacen PENDIENTES y solo las ve el deportista cuando un coach/profesional las aprueba.
 * - Nada de esto es diagnóstico médico.
 */
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { condicionDeportista, deportistaEnAlcance } = require('../../core/alcance');
const { verificarLimite } = require('../../core/limites');
const M = require('../../domain/medicion');
const { CAPACIDADES } = require('../../domain/plantillas-deporte');
const rendimiento = require('../rendimiento/rendimiento.service');
const recuperacion = require('../recuperacion/recuperacion.service');
const motor = require('./motor-alertas');

const MODELO = 'motor-reglas';
const VERSION = '1.0.0';
const INSUFICIENTE = 'DATOS INSUFICIENTES';

/** Recolecta todo lo que se sabe del deportista (lo que no exista queda vacío, no inventado). */
async function recolectar(alcance, dep, completo) {
  const evo = await rendimiento.evolucionDeportista(alcance, dep.id);
  const punt = await rendimiento.puntaje(alcance, dep.id, { guardar: true });
  const datos = { evolucion: evo, puntaje: punt };
  if (!completo) return datos;
  const [asis, rec, objs, vids, nut, ent] = await Promise.all([
    query("SELECT estado, to_char(fecha, 'YYYY-MM-DD') AS fecha, rpe_sesion, minutos FROM asistencia WHERE deportista_id = $1 AND fecha >= CURRENT_DATE - 30", [dep.id]),
    query("SELECT *, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM recuperacion WHERE deportista_id = $1 AND fecha >= CURRENT_DATE - 14 ORDER BY recuperacion.fecha", [dep.id]),
    query("SELECT id, descripcion, estado, tipo, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha_limite FROM objetivos WHERE deportista_id = $1 AND estado IN ('activo', 'alcanzado', 'vencido')", [dep.id]),
    query(`SELECT v.id, v.titulo, v.tipo_movimiento, to_char(v.fecha, 'YYYY-MM-DD') AS fecha, a.disponible, a.observaciones
           FROM videos v LEFT JOIN LATERAL (SELECT * FROM analisis_video x WHERE x.video_id = v.id ORDER BY x.id DESC LIMIT 1) a ON true
           WHERE v.deportista_id = $1 AND v.activo ORDER BY v.fecha DESC LIMIT 10`, [dep.id]),
    query("SELECT count(*)::int AS n, max(fecha)::text AS ultima FROM alimentacion WHERE deportista_id = $1 AND fecha >= CURRENT_DATE - 30", [dep.id]),
    query(`SELECT count(*)::int AS n FROM asistencia a JOIN sesiones_entrenamiento s ON s.id = a.sesion_id
           WHERE a.deportista_id = $1 AND a.estado IN ('presente', 'tardanza') AND s.fecha >= CURRENT_DATE - 30`, [dep.id]),
  ]);
  return {
    ...datos, asistencia: asis.rows, recuperacion: rec.rows, objetivos: objs.rows, videos: vids.rows,
    nutricion: nut.rows[0], entrenamientos_30d: ent.rows[0].n,
  };
}

/** Reglas de interpretación: convierte los datos en hallazgos con su evidencia. */
function interpretar(dep, datos, completo) {
  const fortalezas = [];
  const debilidades = [];
  const tendencias = [];
  const riesgos = [];
  const recomendaciones = [];
  const faltantes = [];
  const { evolucion: evo, puntaje: punt } = datos;

  if (!evo.length) faltantes.push('No hay resultados oficiales de pruebas.');
  for (const e of evo) {
    const t = e.tendencia;
    if (t.clasificacion === 'mejora' || t.clasificacion === 'empeora') {
      tendencias.push({
        texto: `${e.prueba}${e.contexto ? ` (${e.contexto})` : ''}: tendencia de ${t.clasificacion === 'mejora' ? 'MEJORA' : 'EMPEORAMIENTO'} `
          + `(${t.cambio_relativo_pct}% en ${t.dias} días, ${t.puntos} mediciones, confianza ${t.confianza}).`,
        evidencia: { prueba_id: e.prueba_id, tendencia: t },
      });
    } else if (t.clasificacion === 'insuficiente') {
      faltantes.push(`${e.prueba}: ${t.motivo.toLowerCase()} para calcular la tendencia (hay ${t.puntos}).`);
    }
    if (e.record_personal) fortalezas.push({ texto: `Récord personal reciente en ${e.prueba}: ${e.textos.actual} (${e.actual.fecha}).`, evidencia: { prueba_id: e.prueba_id } });
    if (e.desde_anterior?.porcentaje <= -5) {
      riesgos.push({ texto: `${e.prueba}: la última marca (${e.textos.actual}) es ${Math.abs(e.desde_anterior.porcentaje)}% peor que la anterior.`, evidencia: { prueba_id: e.prueba_id, variacion: e.desde_anterior } });
    }
  }
  if (punt.disponible) {
    const caps = Object.entries(punt.capacidades || {}).sort((a, b) => b[1] - a[1]);
    for (const [c, v] of caps.filter(([, v]) => v >= 70)) fortalezas.push({ texto: `${CAPACIDADES[c] || c}: ${v}/100 según el baremo de la academia.`, evidencia: { capacidad: c, puntos: v } });
    for (const [c, v] of caps.filter(([, v]) => v < 40)) {
      debilidades.push({ texto: `${CAPACIDADES[c] || c}: ${v}/100 según el baremo de la academia.`, evidencia: { capacidad: c, puntos: v } });
      recomendaciones.push({ categoria: c, texto: `Priorizar trabajo de ${(CAPACIDADES[c] || c).toLowerCase()} (puntaje ${v}/100) y volver a medir en 4-6 semanas.` });
    }
    if (punt.cobertura < 60) faltantes.push(`El puntaje cubre solo el ${punt.cobertura}% de las capacidades ponderadas: faltan pruebas de ${Object.keys(punt.scoring.pesos).filter((c) => !(c in punt.capacidades)).map((c) => CAPACIDADES[c] || c).join(', ')}.`);
  } else faltantes.push(punt.mensaje || 'No se pudo calcular el puntaje compuesto.');

  for (const e of evo.filter((x) => x.tendencia.clasificacion === 'empeora')) {
    recomendaciones.push({ categoria: e.capacidad, texto: `Revisar la planificación de ${e.prueba}: la tendencia empeora (${e.tendencia.cambio_relativo_pct}%). Comprobar carga, técnica y recuperación.` });
  }

  if (completo) {
    const asis = datos.asistencia.filter((a) => a.estado !== 'justificado');
    if (asis.length >= 4) {
      const pct = M.redondear((asis.filter((a) => a.estado !== 'ausente').length / asis.length) * 100, 1);
      (pct >= 85 ? fortalezas : pct < 75 ? riesgos : tendencias).push({ texto: `Asistencia de ${pct}% en 30 días (${asis.length} registros).`, evidencia: { porcentaje: pct } });
      if (pct < 75) recomendaciones.push({ categoria: 'asistencia', texto: `Conversar con el deportista y su familia sobre la asistencia (${pct}%).` });
    } else faltantes.push('Asistencia: menos de 4 registros en 30 días.');

    const r = recuperacion.resumen(datos.recuperacion, 7);
    if (r.registros >= 3) {
      if (r.fatiga_media >= 7) riesgos.push({ texto: `Fatiga media de ${r.fatiga_media}/10 en 7 días.`, evidencia: r });
      if (r.sueno_medio_h !== null && r.sueno_medio_h < 7) riesgos.push({ texto: `Sueño medio de ${r.sueno_medio_h} h en 7 días.`, evidencia: r });
      if (r.dias_con_dolor) riesgos.push({ texto: `${r.dias_con_dolor} día(s) con dolor reportado en 7 días (seguimiento, no diagnóstico).`, evidencia: r });
      if (r.fatiga_media >= 7 || (r.sueno_medio_h !== null && r.sueno_medio_h < 7)) {
        recomendaciones.push({ categoria: 'recuperacion', texto: 'Ajustar la carga de la semana y reforzar hábitos de descanso; si persiste, derivar a un profesional.' });
      }
    } else faltantes.push('Recuperación: menos de 3 registros en 7 días.');

    const vencidos = datos.objetivos.filter((o) => o.estado === 'vencido');
    if (vencidos.length) riesgos.push({ texto: `${vencidos.length} objetivo(s) vencido(s) sin alcanzar.`, evidencia: { objetivos: vencidos.map((o) => o.id) } });
    const alcanzados = datos.objetivos.filter((o) => o.estado === 'alcanzado');
    if (alcanzados.length) fortalezas.push({ texto: `${alcanzados.length} objetivo(s) alcanzado(s).`, evidencia: { objetivos: alcanzados.map((o) => o.id) } });
    if (!datos.objetivos.length) faltantes.push('Sin objetivos definidos.');

    const conAnalisis = datos.videos.filter((v) => v.disponible);
    if (!datos.videos.length) faltantes.push('Video: sin videos.');
    else if (!conAnalisis.length) faltantes.push('Video: ANÁLISIS NO DISPONIBLE (los videos no tienen análisis automático; solo observaciones del coach si las hay).');
    if (!datos.nutricion?.n) faltantes.push('Nutrición: sin registros en 30 días.');
  }

  const suficiente = evo.length > 0;
  const confianza = !suficiente ? 'nula' : faltantes.length <= 1 && evo.some((e) => e.tendencia.confianza === 'alta') ? 'alta' : faltantes.length <= 3 ? 'media' : 'baja';
  const resumen = !suficiente
    ? `${INSUFICIENTE}: ${dep.nombre} no tiene resultados oficiales registrados. Registra pruebas en el Modo Medición para obtener un análisis.`
    : `${dep.nombre}: ${evo.length} prueba(s) con resultados oficiales`
      + `${punt.disponible ? `, puntaje compuesto ${punt.total}/100 (scoring "${punt.scoring.nombre}" v${punt.scoring.version}, cobertura ${punt.cobertura}%)` : ''}. `
      + `${fortalezas.length} fortaleza(s), ${debilidades.length} aspecto(s) a mejorar y ${riesgos.length} riesgo(s) detectados.`;
  return {
    resumen, suficiente, confianza, fortalezas, debilidades, tendencias, riesgos, recomendaciones, datos_faltantes: faltantes,
    aviso: 'Análisis automático basado en reglas y en los datos registrados. Apoya la decisión del coach; no es un diagnóstico médico.',
  };
}

/** Análisis de un deportista ('deportista') o completo ('360'). Se guarda con los datos usados. */
async function analizarDeportista(alcance, usuario, deportistaId, tipo = 'deportista') {
  const dep = await deportistaEnAlcance(alcance, deportistaId);
  await verificarLimite(usuario, 'ia_analisis_mes');
  const completo = tipo === '360';
  const datos = await recolectar(alcance, dep, completo);
  const resultado = interpretar(dep, datos, completo);
  const datosUsados = {
    resultados_por_prueba: datos.evolucion.map((e) => ({ prueba_id: e.prueba_id, prueba: e.prueba, contexto: e.contexto, mediciones: e.mediciones, desde: e.primera.fecha, hasta: e.actual.fecha })),
    puntaje: datos.puntaje.disponible ? { total: datos.puntaje.total, cobertura: datos.puntaje.cobertura } : null,
    ...(completo ? {
      asistencia_registros_30d: datos.asistencia.length, recuperacion_registros_14d: datos.recuperacion.length,
      objetivos: datos.objetivos.length, videos: datos.videos.length, nutricion_registros_30d: datos.nutricion?.n || 0, entrenamientos_30d: datos.entrenamientos_30d,
    } : {}),
  };
  const configuracion = { scoring: datos.puntaje.scoring || null, ventana_puntaje_dias: rendimiento.VENTANA_PUNTAJE_DIAS, tendencia: { minimo: 3, minimo_dias: 7, umbral_pct: 2 } };
  const { rows } = await query(
    `INSERT INTO analisis_ia (academia_id, deportista_id, tipo, usuario_id, modelo, version, configuracion, datos_usados, resultado, suficiente)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, creado_en`,
    [alcance.academia, dep.id, completo ? '360' : 'deportista', usuario.id, MODELO, VERSION, JSON.stringify(configuracion), JSON.stringify(datosUsados), JSON.stringify(resultado), resultado.suficiente],
  );
  for (const rec of resultado.recomendaciones.slice(0, 8)) {
    await query('INSERT INTO recomendaciones (academia_id, deportista_id, analisis_id, categoria, texto) VALUES ($1, $2, $3, $4, $5)',
      [alcance.academia, dep.id, rows[0].id, String(rec.categoria || 'general').slice(0, 40), rec.texto]);
  }
  return {
    id: rows[0].id, creado_en: rows[0].creado_en, tipo: completo ? '360' : 'deportista', modelo: MODELO, version: VERSION,
    deportista: { id: dep.id, nombre: dep.nombre }, ...resultado, datos_usados: datosUsados, configuracion,
  };
}

/** Análisis de equipo: tendencias agregadas y deportistas que requieren atención. */
async function analizarEquipo(alcance, usuario, equipoId) {
  await verificarLimite(usuario, 'ia_analisis_mes');
  const resumen = await rendimiento.resumenEquipo(alcance, equipoId);
  const atencion = [];
  const destacados = [];
  for (const m of resumen.miembros) {
    const evo = await rendimiento.evolucionDeportista(alcance, m.id);
    const mejoras = evo.filter((e) => e.tendencia.clasificacion === 'mejora').length;
    const empeora = evo.filter((e) => e.tendencia.clasificacion === 'empeora').length;
    if (empeora > mejoras) atencion.push({ deportista_id: m.id, nombre: m.nombre, pruebas_empeoran: empeora });
    if (mejoras > 0 && mejoras >= empeora) destacados.push({ deportista_id: m.id, nombre: m.nombre, pruebas_mejoran: mejoras });
  }
  const suficiente = resumen.pruebas.length > 0;
  const resultado = {
    resumen: suficiente
      ? `Equipo ${resumen.equipo.nombre}: ${resumen.miembros.length} deportistas, ${resumen.pruebas.length} prueba(s) medidas. ${destacados.length} con tendencia de mejora, ${atencion.length} requieren atención.`
      : `${INSUFICIENTE}: el equipo ${resumen.equipo.nombre} no tiene resultados oficiales.`,
    suficiente, pruebas: resumen.pruebas, destacados, atencion,
    aviso: 'Análisis automático basado en reglas y en los datos registrados.',
  };
  const { rows } = await query(
    `INSERT INTO analisis_ia (academia_id, equipo_id, tipo, usuario_id, modelo, version, datos_usados, resultado, suficiente)
     VALUES ($1, $2, 'equipo', $3, $4, $5, $6, $7, $8) RETURNING id`,
    [alcance.academia, equipoId, usuario.id, MODELO, VERSION, JSON.stringify({ miembros: resumen.miembros.map((m) => m.id) }), JSON.stringify(resultado), suficiente],
  );
  return { id: rows[0].id, ...resultado };
}

async function historialAnalisis(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = ['a.academia_id = $1', `(a.deportista_id IS NULL OR ${condicionDeportista('d', '$1', '$2')})`];
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`a.deportista_id = $${valores.length}`); }
  const { rows } = await query(
    `SELECT a.id, a.tipo, a.modelo, a.version, a.suficiente, a.creado_en, a.deportista_id, d.nombre AS deportista, a.resultado->>'resumen' AS resumen, u.nombre AS usuario
     FROM analisis_ia a LEFT JOIN deportistas d ON d.id = a.deportista_id LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE ${filtros.join(' AND ')} ORDER BY a.creado_en DESC LIMIT 100`, valores,
  );
  return rows;
}

async function obtenerAnalisis(alcance, id) {
  const { rows } = await query(
    `SELECT a.*, d.nombre AS deportista FROM analisis_ia a LEFT JOIN deportistas d ON d.id = a.deportista_id
     WHERE a.id = $3 AND a.academia_id = $1 AND (a.deportista_id IS NULL OR ${condicionDeportista('d', '$1', '$2')})`,
    [alcance.academia, alcance.coach, id],
  );
  if (!rows.length) throw noEncontrado('Análisis');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
async function listarAlertas(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = ['a.academia_id = $1', `(a.deportista_id IS NULL OR ${condicionDeportista('d', '$1', '$2')})`];
  const estados = String(consulta.estado || 'nueva,vista').split(',').filter((e) => ['nueva', 'vista', 'resuelta', 'descartada'].includes(e));
  valores.push(estados);
  filtros.push(`a.estado = ANY($${valores.length}::text[])`);
  if (consulta.tipo) { valores.push(String(consulta.tipo)); filtros.push(`a.tipo = $${valores.length}`); }
  const { rows } = await query(
    `SELECT a.*, d.nombre AS deportista, d.codigo FROM alertas a LEFT JOIN deportistas d ON d.id = a.deportista_id
     WHERE ${filtros.join(' AND ')} ORDER BY CASE a.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, a.creado_en DESC LIMIT 300`, valores,
  );
  return rows;
}

async function cambiarEstadoAlerta(alcance, id, estado) {
  if (!['vista', 'resuelta', 'descartada', 'nueva'].includes(estado)) throw new HttpError(400, 'Estado no válido');
  const { rows } = await query(
    `UPDATE alertas a SET estado = $4, actualizado_en = now()
     WHERE a.id = $3 AND a.academia_id = $1 AND (a.deportista_id IS NULL OR EXISTS (SELECT 1 FROM deportistas d WHERE d.id = a.deportista_id AND ${condicionDeportista('d', '$1', '$2')}))
     RETURNING a.*`,
    [alcance.academia, alcance.coach, id, estado],
  );
  if (!rows.length) throw noEncontrado('Alerta');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Recomendaciones (revisión humana)
// ---------------------------------------------------------------------------
async function listarRecomendaciones(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionDeportista('d', '$1', '$2')];
  if (consulta.estado) { valores.push(String(consulta.estado)); filtros.push(`r.estado = $${valores.length}`); }
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`r.deportista_id = $${valores.length}`); }
  const { rows } = await query(
    `SELECT r.*, d.nombre AS deportista, u.nombre AS revisor FROM recomendaciones r JOIN deportistas d ON d.id = r.deportista_id
     LEFT JOIN usuarios u ON u.id = r.revisado_por WHERE ${filtros.join(' AND ')} ORDER BY r.creado_en DESC LIMIT 300`, valores,
  );
  return rows;
}

async function revisarRecomendacion(alcance, usuario, id, datos = {}) {
  const estado = datos.estado;
  if (!['aprobada', 'rechazada'].includes(estado)) throw new HttpError(400, 'Indica si la recomendación se aprueba o se rechaza');
  const { rows } = await query(
    `SELECT r.* FROM recomendaciones r JOIN deportistas d ON d.id = r.deportista_id WHERE r.id = $3 AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach, id],
  );
  if (!rows.length) throw noEncontrado('Recomendación');
  const textoNuevo = datos.texto ? String(datos.texto).trim().slice(0, 600) : rows[0].texto;
  const r = await query('UPDATE recomendaciones SET estado = $2, texto = $3, revisado_por = $4, revisado_en = now() WHERE id = $1 RETURNING *',
    [id, estado, textoNuevo, usuario.id]);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Notificaciones del usuario
// ---------------------------------------------------------------------------
async function notificaciones(usuario) {
  const { rows } = await query(
    'SELECT * FROM notificaciones WHERE usuario_id = $1 AND academia_id = $2 ORDER BY creado_en DESC LIMIT 50',
    [usuario.id, usuario.academia.id],
  );
  return { sin_leer: rows.filter((n) => !n.leida).length, lista: rows };
}

async function marcarLeidas(usuario, ids) {
  const lista = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : null;
  await query(
    `UPDATE notificaciones SET leida = true WHERE usuario_id = $1 AND academia_id = $2 ${lista ? 'AND id = ANY($3::bigint[])' : ''}`,
    lista ? [usuario.id, usuario.academia.id, lista] : [usuario.id, usuario.academia.id],
  );
}

// ---------------------------------------------------------------------------
// Asistente: interpreta la pregunta, consulta los datos y responde con ellos (o dice que no hay datos)
// ---------------------------------------------------------------------------
const quitarTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function preguntar(alcance, usuario, pregunta) {
  const t = quitarTildes(String(pregunta || '').slice(0, 500));
  if (t.trim().length < 3) throw new HttpError(400, 'Escribe una pregunta');
  const p = [alcance.academia, alcance.coach];
  const dep = condicionDeportista('d', '$1', '$2');
  let respuesta;
  let datos = [];
  // Buscar una prueba mencionada
  const { rows: pruebas } = await query('SELECT id, nombre FROM pruebas WHERE academia_id = $1 AND activo', [alcance.academia]);
  const prueba = pruebas.filter((x) => t.includes(quitarTildes(x.nombre))).sort((a, b) => b.nombre.length - a.nombre.length)[0]
    || pruebas.find((x) => quitarTildes(x.nombre).split(' ').filter((w) => w.length > 3 && /\d/.test(w)).some((w) => t.includes(w)));

  if (/(record|mejor marca|ranking|mejores|top)/.test(t) && prueba) {
    const r = await rendimiento.ranking(alcance, { prueba_id: prueba.id });
    datos = r.filas.slice(0, 5);
    respuesta = datos.length ? `Mejores marcas oficiales en ${r.prueba}:\n${datos.map((f) => `${f.posicion}. ${f.deportista}: ${f.texto} (${f.fecha})`).join('\n')}`
      : `${INSUFICIENTE}: no hay resultados oficiales de ${prueba.nombre}.`;
  } else if (/(mejor|progres|mejoro|avanz)/.test(t)) {
    const { rows } = await query(`SELECT a.titulo, a.motivo, d.nombre FROM alertas a JOIN deportistas d ON d.id = a.deportista_id
      WHERE a.tipo IN ('mejora_importante', 'record_personal') AND ${dep} AND a.creado_en >= now() - interval '30 days' ORDER BY a.creado_en DESC LIMIT 8`, p);
    datos = rows;
    respuesta = rows.length ? `Mejoras y récords de los últimos 30 días:\n${rows.map((r) => `• ${r.nombre} — ${r.titulo}: ${r.motivo}`).join('\n')}`
      : `${INSUFICIENTE}: no se detectaron mejoras ni récords en los últimos 30 días (ejecuta la evaluación de alertas o registra más resultados).`;
  } else if (/(asisten|falta|ausen)/.test(t)) {
    const { rows } = await query(`SELECT d.nombre, count(*) FILTER (WHERE a.estado <> 'justificado')::int AS n,
        count(*) FILTER (WHERE a.estado IN ('presente', 'tardanza'))::int AS si FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
      WHERE ${dep} AND a.fecha >= CURRENT_DATE - 30 GROUP BY d.nombre HAVING count(*) >= 3`, p);
    datos = rows.map((r) => ({ nombre: r.nombre, porcentaje: M.redondear((r.si / r.n) * 100, 1), registros: r.n })).sort((a, b) => a.porcentaje - b.porcentaje).slice(0, 8);
    respuesta = datos.length ? `Asistencia más baja (30 días):\n${datos.map((r) => `• ${r.nombre}: ${r.porcentaje}% (${r.registros} registros)`).join('\n')}`
      : `${INSUFICIENTE}: no hay registros de asistencia suficientes en 30 días.`;
  } else if (/(fatiga|cansad|sueno|dormir|recupera|dolor)/.test(t)) {
    const { rows } = await query(`SELECT d.nombre, round(avg(r.fatiga)::numeric, 1)::float AS fatiga, round(avg(r.horas_sueno)::numeric, 1)::float AS sueno,
        count(*) FILTER (WHERE r.dolor)::int AS dolor FROM recuperacion r JOIN deportistas d ON d.id = r.deportista_id
      WHERE ${dep} AND r.fecha >= CURRENT_DATE - 7 GROUP BY d.nombre ORDER BY avg(r.fatiga) DESC NULLS LAST LIMIT 8`, p);
    datos = rows;
    respuesta = rows.length ? `Recuperación (7 días), de mayor a menor fatiga:\n${rows.map((r) => `• ${r.nombre}: fatiga ${r.fatiga ?? '—'}/10, sueño ${r.sueno ?? '—'} h${r.dolor ? `, ${r.dolor} día(s) con dolor` : ''}`).join('\n')}\n(Seguimiento, no diagnóstico médico.)`
      : `${INSUFICIENTE}: no hay registros de recuperación en los últimos 7 días.`;
  } else if (/(alerta|riesgo|atencion|preocup)/.test(t)) {
    datos = (await listarAlertas(alcance, {})).slice(0, 8);
    respuesta = datos.length ? `Alertas abiertas:\n${datos.map((a) => `• [${a.prioridad}] ${a.deportista || ''} — ${a.titulo}: ${a.motivo}`).join('\n')}` : 'No hay alertas abiertas.';
  } else if (/(objetivo|meta)/.test(t)) {
    const { rows } = await query(`SELECT o.descripcion, o.estado, d.nombre FROM objetivos o LEFT JOIN deportistas d ON d.id = o.deportista_id
      WHERE o.academia_id = $1 AND (o.deportista_id IS NULL OR ${dep}) ORDER BY o.estado, o.fecha_limite NULLS LAST LIMIT 10`, p);
    datos = rows;
    respuesta = rows.length ? `Objetivos:\n${rows.map((o) => `• ${o.nombre || 'Grupo'}: ${o.descripcion} (${o.estado})`).join('\n')}` : `${INSUFICIENTE}: no hay objetivos definidos.`;
  } else {
    respuesta = 'Puedo responder con los datos de tu academia sobre: récords o ranking de una prueba (p. ej. "mejores marcas en sprint 30 m"), '
      + 'quién mejoró, asistencia, fatiga/sueño/dolor, alertas y objetivos.';
  }
  await query(
    `INSERT INTO analisis_ia (academia_id, tipo, usuario_id, modelo, version, configuracion, datos_usados, resultado, suficiente)
     VALUES ($1, 'asistente', $2, $3, $4, $5, $6, $7, $8)`,
    [alcance.academia, usuario.id, MODELO, VERSION, JSON.stringify({ pregunta: String(pregunta).slice(0, 500) }), JSON.stringify({ filas: datos.length }),
      JSON.stringify({ respuesta }), !respuesta.startsWith(INSUFICIENTE)],
  );
  return { respuesta, datos, modelo: MODELO };
}

module.exports = {
  INSUFICIENTE, MODELO, VERSION, interpretar, analizarDeportista, analizarEquipo, historialAnalisis, obtenerAnalisis,
  listarAlertas, cambiarEstadoAlerta, evaluarAlertas: motor.evaluar,
  listarRecomendaciones, revisarRecomendacion, notificaciones, marcarLeidas, preguntar,
};
