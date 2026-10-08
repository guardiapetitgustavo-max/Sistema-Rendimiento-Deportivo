/**
 * Panel de indicadores (FASE 11). Calcula, para un periodo, los seis indicadores de evaluación del sistema:
 *
 *   rastreo      Rendimiento del rastreo de movimiento   → calidad de las trayectorias GPS recibidas
 *   usabilidad   Usabilidad del sistema                  → SUS
 *   reportes     Efectividad de los reportes             → generación exitosa, utilidad y apoyo a decisiones
 *   lesiones     Incidencia de lesiones                  → lesiones por 1000 h de exposición vs. periodo anterior
 *   carga        Carga y recuperación del atleta         → ACWR, monotonía, tensión e índice de bienestar
 *   aceptacion   Aceptación técnica de la plataforma     → TAM + uso real
 *
 * Carga, lesiones y rastreo respetan el alcance (un coach ve a sus deportistas). Las encuestas y el uso de reportes
 * son de toda la academia y solo se muestran agregados.
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { hoyISO } = require('../../utils/valores');
const { condicionDeportista } = require('../../core/alcance');
const I = require('../../domain/indicadores');
const encuestas = require('./encuestas.service');
const lesionesSrv = require('./lesiones.service');

/** Metas usadas para decir si cada indicador "cumple". Valores de referencia de la literatura citada en cada caso. */
const METAS = {
  rastreo: { valor: 90, texto: '≥ 90 % de trayectorias con calidad aceptable' },
  usabilidad: { valor: 68, texto: 'SUS ≥ 68 (promedio de referencia, Bangor et al. 2009)' },
  reportes: { valor: 75, texto: 'Índice de efectividad ≥ 75 / 100' },
  lesiones: { valor: null, texto: 'Incidencia menor que en el periodo anterior' },
  carga: { valor: 70, texto: '≥ 70 % de deportistas con ACWR en zona óptima (0.8-1.3)' },
  aceptacion: { valor: 75, texto: 'TAM ≥ 75 / 100 (media ≥ 5.5 de 7)' },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Periodo pedido (?desde=&hasta=, AAAA-MM-DD). Por defecto, los últimos 90 días. */
function periodo(consulta = {}) {
  const hasta = ISO.test(String(consulta.hasta || '')) ? String(consulta.hasta) : hoyISO();
  const desde = ISO.test(String(consulta.desde || '')) ? String(consulta.desde) : I.sumarDias(hasta, -89);
  if (desde > hasta) throw new HttpError(400, 'La fecha "desde" debe ser anterior a "hasta"');
  const dias = I.diasEntre(desde, hasta) + 1;
  if (dias > 731) throw new HttpError(400, 'El periodo no puede superar los 2 años');
  return { desde, hasta, dias };
}

const pct = (parte, total) => (total ? I.redondear((parte / total) * 100, 1) : null);
const mediaRedondeada = (l, d = 1) => I.redondear(I.media(l.filter((v) => typeof v === 'number' && Number.isFinite(v))), d);
const contar = (lista, clave) => {
  const m = new Map();
  for (const x of lista) { const k = typeof clave === 'function' ? clave(x) : x[clave]; m.set(k ?? 'sin dato', (m.get(k ?? 'sin dato') || 0) + 1); }
  return [...m.entries()].map(([etiqueta, total]) => ({ etiqueta, total })).sort((a, b) => b.total - a.total);
};

// ---------------------------------------------------------------------------
// Datos base (con alcance)
// ---------------------------------------------------------------------------
async function deportistasDelAlcance(alcance) {
  const { rows } = await query(
    `SELECT d.id, d.nombre, d.codigo FROM deportistas d WHERE d.activo AND ${condicionDeportista('d', '$1', '$2')} ORDER BY d.nombre`,
    [alcance.academia, alcance.coach],
  );
  return rows;
}

/** Cargas sRPE (RPE × minutos) por deportista entre dos fechas, y la fecha de su primera carga registrada. */
async function cargas(alcance, desde, hasta, ids = null) {
  const valores = [alcance.academia, alcance.coach, desde, hasta];
  let filtroIds = '';
  if (ids) { valores.push(ids); filtroIds = `AND a.deportista_id = ANY($${valores.length}::int[])`; }
  const { rows } = await query(
    `SELECT a.deportista_id, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.rpe_sesion * coalesce(a.minutos, s.duracion_min) AS carga
     FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id LEFT JOIN sesiones_entrenamiento s ON s.id = a.sesion_id
     WHERE a.estado IN ('presente', 'tardanza') AND a.rpe_sesion IS NOT NULL AND coalesce(a.minutos, s.duracion_min) > 0
       AND a.fecha BETWEEN $3::date AND $4::date AND d.activo AND ${condicionDeportista('d', '$1', '$2')} ${filtroIds}`,
    valores,
  );
  const { rows: primeras } = await query(
    `SELECT a.deportista_id, to_char(min(a.fecha), 'YYYY-MM-DD') AS primera FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
     WHERE a.academia_id = $1 AND a.rpe_sesion IS NOT NULL AND a.estado IN ('presente', 'tardanza') AND ${condicionDeportista('d', '$1', '$2')}
     ${ids ? 'AND a.deportista_id = ANY($3::int[])' : ''} GROUP BY a.deportista_id`,
    ids ? [alcance.academia, alcance.coach, ids] : [alcance.academia, alcance.coach],
  );
  const porDep = new Map();
  for (const r of rows) {
    if (!porDep.has(r.deportista_id)) porDep.set(r.deportista_id, []);
    porDep.get(r.deportista_id).push({ fecha: r.fecha, carga: Number(r.carga) });
  }
  const mapas = new Map([...porDep.entries()].map(([id, l]) => [id, I.cargaPorDia(l)]));
  return { mapas, primeras: new Map(primeras.map((p) => [p.deportista_id, p.primera])) };
}

/** ACWR de un deportista en una fecha, usando su primera carga real para decidir si hay historial suficiente. */
const acwrEn = (mapa, primera, fecha) => I.acwr(mapa || new Map(), fecha, { primera });

// ---------------------------------------------------------------------------
// Carga y recuperación del atleta
// ---------------------------------------------------------------------------
async function carga(alcance, p) {
  const deps = await deportistasDelAlcance(alcance);
  const { mapas, primeras } = await cargas(alcance, I.sumarDias(p.desde, -27), p.hasta);
  const { rows: recu } = await query(
    `SELECT r.deportista_id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.calidad_sueno, r.fatiga, r.estres, r.recuperacion, r.dolor, r.dolor_intensidad, r.horas_sueno
     FROM recuperacion r JOIN deportistas d ON d.id = r.deportista_id
     WHERE r.fecha BETWEEN $3::date AND $4::date AND d.activo AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach, I.sumarDias(p.desde, -6), p.hasta],
  );
  for (const r of recu) r.indice = I.indiceBienestar(r);
  const recuDe = (id, desde, hasta) => recu.filter((r) => r.deportista_id === id && r.fecha >= desde && r.fecha <= hasta && r.indice !== null);

  const desde7 = I.sumarDias(p.hasta, -6);
  const filas = deps.map((d) => {
    const a = acwrEn(mapas.get(d.id), primeras.get(d.id), p.hasta);
    const m = I.monotonia(mapas.get(d.id) || new Map(), p.hasta);
    const bien = recuDe(d.id, desde7, p.hasta);
    const bienestar = mediaRedondeada(bien.map((r) => r.indice));
    return {
      deportista_id: d.id, deportista: d.nombre, codigo: d.codigo,
      ...a, carga_semanal: m.carga_semanal, monotonia: m.monotonia, tension: m.tension, monotonia_alta: m.alta,
      bienestar_7d: bienestar, bienestar_estado: I.estadoBienestar(bienestar), registros_bienestar: bien.length,
      sueno_7d: mediaRedondeada(bien.map((r) => r.horas_sueno)),
    };
  });

  const conAcwr = filas.filter((f) => f.acwr !== null);
  const zonas = { baja: 0, optima: 0, precaucion: 0, riesgo: 0 };
  conAcwr.forEach((f) => { zonas[f.zona] += 1; });
  const conBienestar = filas.filter((f) => f.bienestar_7d !== null);

  // Evolución semanal del grupo (cada 7 días hacia atrás desde "hasta")
  const semanal = [];
  for (let fin = p.hasta; fin >= p.desde && semanal.length < 110; fin = I.sumarDias(fin, -7)) {
    const valores = deps.map((d) => acwrEn(mapas.get(d.id), primeras.get(d.id), fin));
    const ini = I.sumarDias(fin, -6);
    const bienSemana = recu.filter((r) => r.fecha >= ini && r.fecha <= fin && r.indice !== null).map((r) => r.indice);
    semanal.unshift({
      semana_fin: fin,
      acwr_medio: mediaRedondeada(valores.map((v) => v.acwr), 2),
      carga_media: mediaRedondeada(valores.filter((v) => v.aguda > 0).map((v) => v.aguda), 0),
      bienestar_medio: mediaRedondeada(bienSemana),
    });
  }

  return {
    deportistas: filas.sort((a, b) => (b.acwr ?? -1) - (a.acwr ?? -1)),
    resumen: {
      deportistas: filas.length,
      con_acwr: conAcwr.length,
      sin_historial: filas.length - conAcwr.length,
      zonas,
      pct_optima: pct(zonas.optima, conAcwr.length),
      pct_riesgo: pct(zonas.riesgo, conAcwr.length),
      acwr_medio: mediaRedondeada(conAcwr.map((f) => f.acwr), 2),
      monotonia_media: mediaRedondeada(filas.map((f) => f.monotonia), 2),
      monotonia_alta: filas.filter((f) => f.monotonia_alta).length,
      bienestar_medio: mediaRedondeada(conBienestar.map((f) => f.bienestar_7d)),
      bienestar_bajo: conBienestar.filter((f) => f.bienestar_estado === 'bajo').length,
    },
    semanal,
    metodo: 'ACWR de medias móviles acopladas (aguda 7 días / crónica 28 días), con 28 días de historial mínimo. Monotonía y tensión de Foster. Bienestar 0-100 (adaptación del índice de Hooper).',
  };
}

// ---------------------------------------------------------------------------
// Incidencia de lesiones (prevención)
// ---------------------------------------------------------------------------
async function horasExposicion(alcance, desde, hasta) {
  const { rows } = await query(
    `SELECT to_char(a.fecha, 'YYYY-MM') AS mes, coalesce(sum(coalesce(a.minutos, s.duracion_min)), 0)::float / 60 AS horas
     FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id LEFT JOIN sesiones_entrenamiento s ON s.id = a.sesion_id
     WHERE a.estado IN ('presente', 'tardanza') AND a.fecha BETWEEN $3::date AND $4::date AND ${condicionDeportista('d', '$1', '$2')}
     GROUP BY 1`,
    [alcance.academia, alcance.coach, desde, hasta],
  );
  return { total: rows.reduce((s, r) => s + r.horas, 0), porMes: new Map(rows.map((r) => [r.mes, r.horas])) };
}

async function lesionesDelAlcance(alcance, desde, hasta) {
  const { rows } = await query(
    `SELECT l.*, to_char(l.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(l.fecha_alta, 'YYYY-MM-DD') AS fecha_alta, d.nombre AS deportista, d.codigo
     FROM lesiones l JOIN deportistas d ON d.id = l.deportista_id
     WHERE l.activo AND l.fecha_inicio BETWEEN $3::date AND $4::date AND ${condicionDeportista('d', '$1', '$2')} ORDER BY l.fecha_inicio`,
    [alcance.academia, alcance.coach, desde, hasta],
  );
  return rows.map((l) => lesionesSrv.enriquecer(l, hasta));
}

async function lesiones(alcance, p) {
  const anteriorHasta = I.sumarDias(p.desde, -1);
  const anteriorDesde = I.sumarDias(p.desde, -p.dias);
  const [deps, expo, expoAnt, actuales, anteriores, enCursoTodas] = await Promise.all([
    deportistasDelAlcance(alcance),
    horasExposicion(alcance, p.desde, p.hasta),
    horasExposicion(alcance, anteriorDesde, anteriorHasta),
    lesionesDelAlcance(alcance, p.desde, p.hasta),
    lesionesDelAlcance(alcance, anteriorDesde, anteriorHasta),
    lesionesSrv.listar(alcance, { estado: 'en_curso' }),
  ]);
  const actual = I.incidencia(actuales.length, expo.total);
  const anterior = I.incidencia(anteriores.length, expoAnt.total);
  const diasPerdidos = actuales.reduce((s, l) => s + l.dias_baja, 0);

  // Carga previa a cada lesión: ACWR del día anterior (¿la lesión llegó tras un pico de carga?)
  const ids = [...new Set(actuales.map((l) => l.deportista_id))];
  let conCarga = [];
  if (ids.length) {
    const primeraLesion = actuales[0].fecha_inicio;
    const { mapas, primeras } = await cargas(alcance, I.sumarDias(primeraLesion, -28), p.hasta, ids);
    conCarga = actuales.map((l) => {
      const a = acwrEn(mapas.get(l.deportista_id), primeras.get(l.deportista_id), I.sumarDias(l.fecha_inicio, -1));
      return { ...l, acwr_previo: a.acwr, zona_previa: a.zona };
    });
  }
  const evaluables = conCarga.filter((l) => l.acwr_previo !== null);

  // Incidencia mensual
  const meses = new Map();
  for (const [mes, horas] of expo.porMes) meses.set(mes, { mes, horas, lesiones: 0 });
  for (const l of actuales) {
    const mes = l.fecha_inicio.slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, { mes, horas: 0, lesiones: 0 });
    meses.get(mes).lesiones += 1;
  }
  const mensual = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({ ...m, horas: I.redondear(m.horas, 1), ...I.incidencia(m.lesiones, m.horas) }));

  const lesionados = new Set(enCursoTodas.map((l) => l.deportista_id));
  const variacion = I.variacionPorcentual(anterior.tasa, actual.tasa);
  return {
    actual, anterior: { ...anterior, desde: anteriorDesde, hasta: anteriorHasta },
    variacion_pct: variacion,
    efectiva: actual.tasa !== null && anterior.tasa !== null ? actual.tasa <= anterior.tasa : null,
    carga_lesional: expo.total > 0 ? I.redondear((diasPerdidos / expo.total) * 1000, 1) : null,
    dias_perdidos: diasPerdidos,
    prevalencia_pct: pct(lesionados.size, deps.length),
    lesionados_ahora: lesionados.size,
    deportistas: deps.length,
    por_tipo: contar(actuales, 'tipo'),
    por_zona: contar(actuales, 'zona').slice(0, 8),
    por_mecanismo: contar(actuales, 'mecanismo'),
    por_contexto: contar(actuales, 'contexto'),
    por_gravedad: contar(actuales, (l) => (l.en_curso ? 'en_curso' : l.gravedad)),
    relacion_carga: {
      evaluables: evaluables.length,
      tras_acwr_alto: evaluables.filter((l) => l.acwr_previo > 1.3).length,
      pct_tras_acwr_alto: pct(evaluables.filter((l) => l.acwr_previo > 1.3).length, evaluables.length),
    },
    mensual,
    lista: (conCarga.length ? conCarga : actuales).slice().reverse(),
    en_curso: enCursoTodas,
    metodo: 'Incidencia = lesiones nuevas / horas de exposición × 1000 (IC 95 % de Poisson, aproximación de Byar). Exposición = minutos de entrenamiento asistidos. Gravedad por días de baja (Fuller et al., 2006).',
  };
}

// ---------------------------------------------------------------------------
// Rendimiento del rastreo de movimiento (GPS)
// ---------------------------------------------------------------------------
async function rastreo(alcance, p) {
  const { rows } = await query(
    `SELECT r.id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.fuente_medicion, r.datos->'gps' AS gps, d.nombre AS deportista, pr.nombre AS prueba
     FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas pr ON pr.id = r.prueba_id
     WHERE r.activo AND r.datos ? 'gps' AND r.dispositivo_id IS NOT NULL AND r.fecha BETWEEN $3::date AND $4::date AND d.activo AND ${condicionDeportista('d', '$1', '$2')}
     ORDER BY r.fecha DESC, r.id DESC LIMIT 5000`,
    [alcance.academia, alcance.coach, p.desde, p.hasta],
  );
  // Solo cuentan las trayectorias que llegaron de un dispositivo (la calidad la calcula el servidor al recibirlas)
  const conCalidad = rows.filter((r) => r.gps?.calidad);
  const c = conCalidad.map((r) => r.gps.calidad);
  const conRef = c.filter((x) => x.error_distancia_pct !== null && x.error_distancia_pct !== undefined);
  return {
    trayectorias: rows.length,
    evaluadas: conCalidad.length,
    sin_datos_de_calidad: rows.length - conCalidad.length,
    pct_aceptables: pct(c.filter((x) => x.aceptable).length, c.length),
    completitud_media: mediaRedondeada(c.map((x) => x.completitud_pct)),
    frecuencia_media_hz: mediaRedondeada(c.map((x) => x.frecuencia_hz), 2),
    precision_media_m: mediaRedondeada(c.map((x) => x.precision_media_m)),
    error_distancia_medio_pct: mediaRedondeada(conRef.map((x) => x.error_distancia_pct), 2),
    con_distancia_referencia: conRef.length,
    saltos_imposibles: c.reduce((s, x) => s + (x.saltos_imposibles || 0), 0),
    huecos: c.reduce((s, x) => s + (x.huecos || 0), 0),
    puntos_medios: mediaRedondeada(c.map((x) => x.puntos_validos), 0),
    procesamiento_medio_ms: mediaRedondeada(c.map((x) => x.procesamiento_ms), 1),
    lista: conCalidad.slice(0, 100).map((r) => ({
      id: r.id, fecha: r.fecha, deportista: r.deportista, prueba: r.prueba, fuente: r.fuente_medicion, distancia_m: r.gps.distancia_m, ...r.gps.calidad,
    })),
    metodo: 'Calidad de cada trayectoria GPS recibida por la API de integraciones: completitud, frecuencia de muestreo, huecos de señal, saltos imposibles (> 45 km/h) y error frente a la distancia oficial de la prueba. Aceptable = completitud ≥ 95 %, sin saltos y error ≤ 5 %.',
  };
}

// ---------------------------------------------------------------------------
// Efectividad de los reportes
// ---------------------------------------------------------------------------
async function reportes(academia, p) {
  const { rows } = await query(
    `SELECT tipo, formato, exito, duracion_ms, utilidad, apoyo_decision, comentario, usuario_id, to_char(creado_en, 'YYYY-MM-DD') AS fecha
     FROM reportes_uso WHERE academia_id = $1 AND creado_en::date BETWEEN $2::date AND $3::date ORDER BY creado_en DESC`,
    [academia, p.desde, p.hasta],
  );
  const exitosos = rows.filter((r) => r.exito);
  const valorados = rows.filter((r) => r.utilidad !== null);
  const conDecision = rows.filter((r) => r.apoyo_decision !== null);
  const utilidad = I.media(valorados.map((r) => r.utilidad));
  const tasaExito = pct(exitosos.length, rows.length);
  const utilidad100 = utilidad !== null ? I.redondear(((utilidad - 1) / 4) * 100, 1) : null;
  const apoyo = pct(conDecision.filter((r) => r.apoyo_decision).length, conDecision.length);
  const componentes = [tasaExito, utilidad100, apoyo].filter((v) => v !== null);
  const duraciones = exitosos.map((r) => r.duracion_ms).filter((v) => v !== null).sort((a, b) => a - b);
  const porTipo = new Map();
  for (const r of rows) {
    if (!porTipo.has(r.tipo)) porTipo.set(r.tipo, []);
    porTipo.get(r.tipo).push(r);
  }
  return {
    generados: rows.length,
    exitosos: exitosos.length,
    tasa_exito: tasaExito,
    usuarios: new Set(rows.map((r) => r.usuario_id).filter(Boolean)).size,
    duracion_media_ms: mediaRedondeada(duraciones, 0),
    duracion_p95_ms: duraciones.length ? duraciones[Math.min(duraciones.length - 1, Math.ceil(duraciones.length * 0.95) - 1)] : null,
    valorados: valorados.length,
    pct_valorados: pct(valorados.length, exitosos.length),
    utilidad_media: I.redondear(utilidad, 2),
    utilidad_100: utilidad100,
    pct_apoyo_decision: apoyo,
    efectividad: componentes.length ? I.redondear(I.media(componentes), 1) : null,
    por_tipo: [...porTipo.entries()].map(([tipo, l]) => ({
      tipo, generados: l.length, exito: pct(l.filter((r) => r.exito).length, l.length),
      utilidad: mediaRedondeada(l.map((r) => r.utilidad), 2), valorados: l.filter((r) => r.utilidad !== null).length,
    })).sort((a, b) => b.generados - a.generados),
    comentarios: valorados.filter((r) => r.comentario).slice(0, 10).map((r) => ({ fecha: r.fecha, tipo: r.tipo, utilidad: r.utilidad, comentario: r.comentario })),
    metodo: 'Índice de efectividad = promedio de: % de reportes generados sin error, utilidad percibida (1-5 llevada a 0-100) y % de valoraciones que indican que el reporte ayudó a tomar una decisión.',
  };
}

// ---------------------------------------------------------------------------
// Usabilidad (SUS) y aceptación (TAM)
// ---------------------------------------------------------------------------
function porRol(filas) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.rol)) m.set(f.rol, []);
    m.get(f.rol).push(f.puntaje);
  }
  return [...m.entries()].map(([rol, l]) => ({ rol: rol || 'sin rol', n: l.length, media: mediaRedondeada(l) }));
}

async function usabilidad(academia, p) {
  const filas = await encuestas.respuestasDelPeriodo(academia, 'SUS', p);
  const puntajes = filas.map((f) => f.puntaje);
  const resumen = I.resumenEstadistico(puntajes);
  const alfa = I.alfaCronbach(filas.map((f) => I.aportesSus(f.respuestas)));
  return {
    ...resumen,
    interpretacion: I.interpretarSus(resumen.media),
    pct_sobre_68: pct(puntajes.filter((v) => v >= 68).length, puntajes.length),
    por_grado: contar(filas.map((f) => ({ g: I.interpretarSus(f.puntaje).adjetivo })), 'g'),
    por_rol: porRol(filas),
    items: I.ITEMS_SUS.map((texto, i) => ({ texto, media: mediaRedondeada(filas.map((f) => f.respuestas[i]), 2) })),
    alfa_cronbach: alfa,
    fiabilidad: I.interpretarAlfa(alfa),
    comentarios: filas.filter((f) => f.comentario).slice(0, 10).map((f) => ({ fecha: f.fecha, rol: f.rol, comentario: f.comentario })),
    metodo: 'System Usability Scale (Brooke, 1996): 10 ítems Likert 1-5, puntaje 0-100. Se cuenta la última respuesta de cada persona en el periodo. Interpretación de Bangor, Kortum y Miller (2009).',
  };
}

async function aceptacion(academia, p) {
  const filas = await encuestas.respuestasDelPeriodo(academia, 'TAM', p);
  const resumen = I.resumenEstadistico(filas.map((f) => f.puntaje));
  const constructos = I.CONSTRUCTOS_TAM.map((c) => {
    const vals = filas.map((f) => f.detalle?.constructos?.[c.clave]?.puntaje).filter((v) => typeof v === 'number');
    const alfa = I.alfaCronbach(I.matrizTam(filas.map((f) => f.respuestas), c.clave));
    return {
      clave: c.clave, nombre: c.nombre, ...I.resumenEstadistico(vals),
      media_likert: mediaRedondeada(filas.map((f) => f.detalle?.constructos?.[c.clave]?.media), 2),
      alfa_cronbach: alfa, fiabilidad: I.interpretarAlfa(alfa),
    };
  });
  const { rows: [uso] } = await query(
    `SELECT count(*)::int AS miembros,
            count(*) FILTER (WHERE u.ultimo_acceso >= $2::date - 29)::int AS activos_30d
     FROM membresias m JOIN usuarios u ON u.id = m.usuario_id WHERE m.academia_id = $1 AND m.activo AND u.activo`,
    [academia, p.hasta],
  );
  return {
    ...resumen,
    nivel: I.nivelAceptacion(resumen.media),
    constructos,
    por_nivel: contar(filas.map((f) => ({ n: I.nivelAceptacion(f.puntaje) })), 'n'),
    por_rol: porRol(filas),
    uso: { miembros: uso.miembros, activos_30d: uso.activos_30d, pct_activos: pct(uso.activos_30d, uso.miembros) },
    comentarios: filas.filter((f) => f.comentario).slice(0, 10).map((f) => ({ fecha: f.fecha, rol: f.rol, comentario: f.comentario })),
    metodo: 'Modelo de Aceptación Tecnológica (Davis, 1989): utilidad percibida (4 ítems), facilidad de uso percibida (4) e intención de uso (2), Likert 1-7 llevada a 0-100. Se cuenta la última respuesta de cada persona en el periodo. Se complementa con el uso real (personas que entraron en los últimos 30 días).',
  };
}

// ---------------------------------------------------------------------------
// Panel con los seis indicadores
// ---------------------------------------------------------------------------
function estado(valor, meta, { menorEsMejor = false } = {}) {
  if (valor === null || valor === undefined) return 'sin_datos';
  return (menorEsMejor ? valor <= meta : valor >= meta) ? 'cumple' : 'no_cumple';
}

async function panel(alcance, consulta) {
  const p = periodo(consulta);
  const [c, l, r, rep, u, a] = await Promise.all([
    carga(alcance, p), lesiones(alcance, p), rastreo(alcance, p), reportes(alcance.academia, p), usabilidad(alcance.academia, p), aceptacion(alcance.academia, p),
  ]);
  const indicadores = [
    {
      clave: 'rastreo', dimension: 'Procesamiento y rastreo de datos espaciales', nombre: 'Rendimiento del rastreo de movimiento',
      valor: r.pct_aceptables, unidad: '% trayectorias aceptables', n: r.evaluadas, meta: METAS.rastreo.texto, estado: estado(r.pct_aceptables, METAS.rastreo.valor),
      detalle: `Completitud ${r.completitud_media ?? '—'} % · error de distancia ${r.error_distancia_medio_pct ?? '—'} %`,
    },
    {
      clave: 'usabilidad', dimension: 'Usabilidad de la interfaz', nombre: 'Usabilidad del sistema',
      valor: u.media, unidad: 'SUS (0-100)', n: u.n, meta: METAS.usabilidad.texto, estado: estado(u.media, METAS.usabilidad.valor),
      detalle: u.interpretacion ? `${u.interpretacion.adjetivo} · α = ${u.alfa_cronbach ?? '—'}` : 'Sin respuestas en el periodo',
    },
    {
      clave: 'reportes', dimension: 'Usabilidad de la interfaz', nombre: 'Efectividad de los reportes',
      valor: rep.efectividad, unidad: 'índice (0-100)', n: rep.generados, meta: METAS.reportes.texto, estado: estado(rep.efectividad, METAS.reportes.valor),
      detalle: `${rep.generados} generados · éxito ${rep.tasa_exito ?? '—'} % · utilidad ${rep.utilidad_media ?? '—'}/5`,
    },
    {
      clave: 'lesiones', dimension: 'Prevención efectiva de lesiones', nombre: 'Incidencia de lesiones',
      valor: l.actual.tasa, unidad: 'lesiones / 1000 h', n: l.actual.lesiones, meta: METAS.lesiones.texto,
      estado: l.efectiva === null ? 'sin_datos' : l.efectiva ? 'cumple' : 'no_cumple',
      detalle: `Periodo anterior ${l.anterior.tasa ?? '—'} · variación ${l.variacion_pct ?? '—'} % · ${l.actual.horas} h de exposición`,
    },
    {
      clave: 'carga', dimension: 'Control de la carga física', nombre: 'Carga y recuperación del atleta',
      valor: c.resumen.pct_optima, unidad: '% en zona óptima de ACWR', n: c.resumen.con_acwr, meta: METAS.carga.texto, estado: estado(c.resumen.pct_optima, METAS.carga.valor),
      detalle: `ACWR medio ${c.resumen.acwr_medio ?? '—'} · bienestar ${c.resumen.bienestar_medio ?? '—'}/100 · ${c.resumen.zonas.riesgo} en riesgo`,
    },
    {
      clave: 'aceptacion', dimension: 'Control de la carga física', nombre: 'Aceptación técnica de la plataforma',
      valor: a.media, unidad: 'TAM (0-100)', n: a.n, meta: METAS.aceptacion.texto, estado: estado(a.media, METAS.aceptacion.valor),
      detalle: `Aceptación ${a.nivel ?? '—'} · ${a.uso.pct_activos ?? '—'} % de usuarios activos en 30 días`,
    },
  ];
  return { periodo: p, indicadores, carga: c, lesiones: l, rastreo: r, reportes: rep, usabilidad: u, aceptacion: a };
}

/** Libro Excel para la tesis: resumen + datos de cada indicador (las encuestas, anónimas). */
async function exportar(alcance, consulta) {
  const d = await panel(alcance, consulta);
  const fila = (...v) => v.map((x) => (x === null || x === undefined ? '' : x));
  const [sus, tam] = await Promise.all([
    encuestas.respuestasDelPeriodo(alcance.academia, 'SUS', d.periodo),
    encuestas.respuestasDelPeriodo(alcance.academia, 'TAM', d.periodo),
  ]);
  return [
    {
      nombre: 'Resumen',
      columnas: ['Dimensión', 'Indicador', 'Valor', 'Unidad', 'n', 'Meta', 'Estado', 'Detalle'],
      filas: d.indicadores.map((x) => fila(x.dimension, x.nombre, x.valor, x.unidad, x.n, x.meta, x.estado.replace('_', ' '), x.detalle)),
    },
    {
      nombre: 'Carga',
      columnas: ['Código', 'Deportista', 'Carga aguda (7 d)', 'Carga crónica (sem.)', 'ACWR', 'Zona', 'Monotonía', 'Tensión', 'Bienestar 7 d', 'Sueño 7 d (h)', 'Días de historial'],
      filas: d.carga.deportistas.map((x) => fila(x.codigo, x.deportista, x.aguda, x.cronica, x.acwr, x.zona, x.monotonia, x.tension, x.bienestar_7d, x.sueno_7d, x.dias_historial)),
    },
    {
      nombre: 'Lesiones',
      columnas: ['Fecha', 'Código', 'Deportista', 'Zona', 'Tipo', 'Mecanismo', 'Contexto', 'Recurrente', 'Alta', 'Días de baja', 'Gravedad', 'ACWR previo'],
      filas: d.lesiones.lista.map((x) => fila(x.fecha_inicio, x.codigo, x.deportista, x.zona, x.tipo, x.mecanismo, x.contexto, x.recurrente ? 'sí' : 'no', x.fecha_alta, x.dias_baja, x.gravedad || 'en curso', x.acwr_previo)),
    },
    {
      nombre: 'Incidencia mensual',
      columnas: ['Mes', 'Lesiones', 'Horas de exposición', 'Incidencia / 1000 h', 'IC 95 % inferior', 'IC 95 % superior'],
      filas: d.lesiones.mensual.map((x) => fila(x.mes, x.lesiones, x.horas, x.tasa, x.ic95?.[0], x.ic95?.[1])),
    },
    {
      nombre: 'Rastreo GPS',
      columnas: ['Fecha', 'Deportista', 'Prueba', 'Puntos', 'Completitud %', 'Frecuencia Hz', 'Huecos', 'Saltos imposibles', 'Precisión m', 'Distancia medida m', 'Distancia oficial m', 'Error %', 'Procesamiento ms', 'Aceptable'],
      filas: d.rastreo.lista.map((x) => fila(x.fecha, x.deportista, x.prueba, x.puntos_validos, x.completitud_pct, x.frecuencia_hz, x.huecos, x.saltos_imposibles, x.precision_media_m, x.distancia_medida_m, x.distancia_referencia_m, x.error_distancia_pct, x.procesamiento_ms, x.aceptable ? 'sí' : 'no')),
    },
    {
      nombre: 'SUS respuestas',
      columnas: ['Fecha', 'Rol', ...I.ITEMS_SUS.map((_, i) => `P${i + 1}`), 'Puntaje SUS'],
      filas: sus.map((x) => fila(x.fecha, x.rol, ...x.respuestas, x.puntaje)),
    },
    {
      nombre: 'TAM respuestas',
      columnas: ['Fecha', 'Rol', ...I.ITEMS_TAM.map((x, i) => `${x.constructo.slice(0, 3).toUpperCase()}${i + 1}`), ...I.CONSTRUCTOS_TAM.map((c) => `${c.nombre} (0-100)`), 'TAM global'],
      filas: tam.map((x) => fila(x.fecha, x.rol, ...x.respuestas, ...I.CONSTRUCTOS_TAM.map((c) => x.detalle?.constructos?.[c.clave]?.puntaje), x.puntaje)),
    },
    {
      nombre: 'Reportes',
      columnas: ['Tipo', 'Generados', '% éxito', 'Utilidad media (1-5)', 'Valorados'],
      filas: d.reportes.por_tipo.map((x) => fila(x.tipo, x.generados, x.exito, x.utilidad, x.valorados)),
    },
  ];
}

module.exports = {
  METAS, periodo, panel, carga, lesiones, rastreo, reportes, usabilidad, aceptacion, exportar, acwrEn, cargas,
};
