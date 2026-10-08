/**
 * Indicadores de evaluación del sistema (FASE 11). Funciones puras, sin base de datos, para poder probarlas
 * con valores conocidos (tests/indicadores.test.js).
 *
 *   Dimensión                               Indicador                              Instrumento / fórmula
 *   Procesamiento y rastreo espacial        Rendimiento del rastreo de movimiento  Calidad de trayectorias GPS (completitud, muestreo, error de distancia)
 *   Usabilidad de la interfaz               Usabilidad del sistema                 SUS (System Usability Scale, Brooke 1996)
 *                                           Efectividad de los reportes            Generación exitosa, utilidad percibida y apoyo a decisiones
 *   Prevención efectiva de lesiones         Incidencia de lesiones                 Lesiones por 1000 h de exposición (consenso Fuller et al. 2006)
 *   Control de la carga física              Carga y recuperación del atleta        ACWR 7:28, monotonía y tensión (Foster) e índice de bienestar
 *                                           Aceptación técnica de la plataforma    TAM (Davis 1989): utilidad, facilidad de uso e intención de uso
 */

const redondear = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const suma = (l) => l.reduce((s, v) => s + v, 0);
const media = (l) => (l.length ? suma(l) / l.length : null);

/** Desviación estándar muestral (n - 1). */
function desviacion(l) {
  if (l.length < 2) return null;
  const m = media(l);
  return Math.sqrt(suma(l.map((v) => (v - m) ** 2)) / (l.length - 1));
}

/** Varianza muestral (n - 1). */
const varianza = (l) => { const d = desviacion(l); return d === null ? null : d ** 2; };

// t de Student bilateral al 95 % (gl 1-30; desde 31 se aproxima con 1.96)
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const tCritico95 = (gl) => (gl < 1 ? null : gl <= 30 ? T95[gl - 1] : 1.96);

/** Media con su intervalo de confianza al 95 % (t de Student). */
function resumenEstadistico(valores) {
  const l = valores.filter(esNumero);
  const m = media(l);
  const de = desviacion(l);
  const margen = de !== null ? tCritico95(l.length - 1) * (de / Math.sqrt(l.length)) : null;
  return {
    n: l.length,
    media: redondear(m, 1),
    de: redondear(de, 1),
    ic95: margen !== null ? [redondear(m - margen, 1), redondear(m + margen, 1)] : null,
    minimo: l.length ? redondear(Math.min(...l), 1) : null,
    maximo: l.length ? redondear(Math.max(...l), 1) : null,
  };
}

/**
 * Alfa de Cronbach (consistencia interna de un cuestionario).
 * @param {number[][]} matriz  una fila por persona, una columna por ítem (ya puntuados en el mismo sentido)
 */
function alfaCronbach(matriz) {
  const filas = (matriz || []).filter((f) => Array.isArray(f) && f.length && f.every(esNumero));
  if (filas.length < 3) return null;
  const k = filas[0].length;
  if (k < 2 || filas.some((f) => f.length !== k)) return null;
  const varItems = Array.from({ length: k }, (_, j) => varianza(filas.map((f) => f[j])));
  const varTotal = varianza(filas.map(suma));
  if (!varTotal) return null;
  return redondear((k / (k - 1)) * (1 - suma(varItems) / varTotal), 3);
}

const interpretarAlfa = (a) => (a === null ? null : a >= 0.9 ? 'excelente' : a >= 0.8 ? 'buena' : a >= 0.7 ? 'aceptable' : a >= 0.6 ? 'cuestionable' : 'pobre');

// ---------------------------------------------------------------------------
// Fechas (siempre 'AAAA-MM-DD', en UTC para no tener desfases)
// ---------------------------------------------------------------------------
const aFecha = (d) => d.toISOString().slice(0, 10);
const sumarDias = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return aFecha(d); };
const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

// ---------------------------------------------------------------------------
// Control de la carga física (sRPE de Foster: RPE de la sesión × minutos)
// ---------------------------------------------------------------------------
/** Suma la carga de cada día. registros: [{ fecha, carga }] */
function cargaPorDia(registros) {
  const mapa = new Map();
  for (const r of registros || []) {
    if (!r?.fecha || !esNumero(r.carga)) continue;
    const f = String(r.fecha).slice(0, 10);
    mapa.set(f, (mapa.get(f) || 0) + r.carga);
  }
  return mapa;
}

/** Cargas diarias de una ventana [ref - (dias - 1), ref], con 0 en los días sin carga. */
function ventana(mapa, ref, dias) {
  return Array.from({ length: dias }, (_, i) => mapa.get(sumarDias(ref, -(dias - 1 - i))) || 0);
}

// < 0.8 baja · 0.8-1.3 óptima · > 1.3-1.5 precaución · > 1.5 riesgo (Gabbett 2016)
const ZONAS_ACWR = [
  { zona: 'baja', texto: 'Carga baja (posible desentrenamiento)', cumple: (v) => v < 0.8 },
  { zona: 'optima', texto: 'Zona óptima', cumple: (v) => v <= 1.3 },
  { zona: 'precaucion', texto: 'Precaución', cumple: (v) => v <= 1.5 },
  { zona: 'riesgo', texto: 'Riesgo alto de lesión', cumple: () => true },
];
const zonaAcwr = (v) => (v === null || v === undefined ? null : ZONAS_ACWR.find((z) => z.cumple(v)));

/**
 * Relación de carga aguda:crónica (ACWR, modelo de medias móviles acopladas, Gabbett 2016).
 *   aguda   = carga total de los últimos 7 días
 *   crónica = carga semanal media de los últimos 28 días (total de 28 días / 4)
 * Exige 28 días de historial: con menos, el valor no es fiable y se marca como insuficiente.
 * @param {{ primera?: string }} opciones  fecha de la primera carga registrada (para medir el historial real)
 */
function acwr(registros, ref, { primera = null } = {}) {
  const mapa = registros instanceof Map ? registros : cargaPorDia(registros);
  // `primera` = fecha de la primera carga real del deportista (puede ser anterior a los datos recibidos)
  const fechas = [...mapa.keys()].filter((f) => f <= ref).sort();
  const inicio = primera && primera <= ref ? primera : fechas[0];
  const historial = inicio ? diasEntre(inicio, ref) + 1 : 0;
  const aguda = suma(ventana(mapa, ref, 7));
  const cronica = suma(ventana(mapa, ref, 28)) / 4;
  const suficiente = historial >= 28;
  const valor = suficiente && cronica > 0 ? redondear(aguda / cronica, 2) : null;
  const z = zonaAcwr(valor);
  return {
    aguda: redondear(aguda, 0), cronica: redondear(cronica, 0), acwr: valor, zona: z?.zona ?? null, zona_texto: z?.texto ?? null,
    dias_historial: historial, suficiente,
  };
}

/**
 * Monotonía y tensión de la última semana (Foster 1998).
 *   monotonía = media diaria / desviación estándar diaria (7 días, los días sin entrenar cuentan como 0)
 *   tensión   = carga semanal × monotonía.  Monotonía > 2 indica poca variación (riesgo de sobreentrenamiento).
 */
function monotonia(registros, ref) {
  const mapa = registros instanceof Map ? registros : cargaPorDia(registros);
  const dias = ventana(mapa, ref, 7);
  const semanal = suma(dias);
  const de = desviacion(dias);
  const valor = de ? semanal / 7 / de : null;
  return {
    carga_semanal: redondear(semanal, 0), media_diaria: redondear(semanal / 7, 1), de_diaria: redondear(de, 1),
    monotonia: redondear(valor, 2), tension: valor !== null ? redondear(semanal * valor, 0) : null, alta: valor !== null && valor > 2,
  };
}

/**
 * Índice de bienestar 0-100 (adaptación del índice de Hooper a los campos que registra el sistema).
 * Promedia los componentes disponibles, cada uno llevado a 0-100 donde 100 = mejor estado:
 *   calidad de sueño (1-5), fatiga (1-10, invertida), estrés (1-10, invertido), recuperación percibida (1-10) y dolor (0-10, invertido).
 */
function indiceBienestar(r) {
  if (!r) return null;
  const partes = [];
  if (esNumero(r.calidad_sueno)) partes.push((r.calidad_sueno - 1) / 4);
  if (esNumero(r.fatiga)) partes.push((10 - r.fatiga) / 9);
  if (esNumero(r.estres)) partes.push((10 - r.estres) / 9);
  if (esNumero(r.recuperacion)) partes.push((r.recuperacion - 1) / 9);
  if (r.dolor === true || esNumero(r.dolor_intensidad)) partes.push(1 - (r.dolor ? (r.dolor_intensidad ?? 5) : 0) / 10);
  else if (r.dolor === false) partes.push(1);
  if (!partes.length) return null;
  return redondear(Math.max(0, Math.min(1, media(partes))) * 100, 1);
}

const estadoBienestar = (v) => (v === null ? null : v >= 70 ? 'bueno' : v >= 50 ? 'moderado' : 'bajo');

// ---------------------------------------------------------------------------
// Prevención de lesiones
// ---------------------------------------------------------------------------
/** Gravedad por días de baja (consenso de Fuller et al., 2006). */
function gravedad(dias) {
  if (!esNumero(dias)) return null;
  if (dias <= 0) return 'sin_baja';
  if (dias <= 3) return 'minima';
  if (dias <= 7) return 'leve';
  if (dias <= 28) return 'moderada';
  return 'grave';
}

/** Días de baja: hasta el alta o, si sigue lesionado, hasta la fecha de referencia. */
function diasBaja(lesion, ref) {
  const fin = lesion.fecha_alta || ref;
  return Math.max(0, diasEntre(String(lesion.fecha_inicio).slice(0, 10), String(fin).slice(0, 10)));
}

/**
 * Intervalo de confianza al 95 % de un conteo de Poisson (aproximación de Byar).
 * Devuelve los límites del NÚMERO de eventos.
 */
function icPoisson(n) {
  const z = 1.959964;
  const inferior = n === 0 ? 0 : n * (1 - 1 / (9 * n) - z / (3 * Math.sqrt(n))) ** 3;
  const m = n + 1;
  const superior = m * (1 - 1 / (9 * m) + z / (3 * Math.sqrt(m))) ** 3;
  return [inferior, superior];
}

/**
 * Incidencia de lesiones por 1000 horas de exposición, con IC 95 %.
 * @param {number} lesiones  número de lesiones nuevas en el periodo
 * @param {number} horas     horas de exposición (entrenamiento) de los deportistas en el periodo
 */
function incidencia(lesiones, horas) {
  if (!esNumero(horas) || horas <= 0) return { lesiones, horas: redondear(horas || 0, 1), tasa: null, ic95: null };
  const [a, b] = icPoisson(lesiones);
  return {
    lesiones, horas: redondear(horas, 1),
    tasa: redondear((lesiones / horas) * 1000, 2),
    ic95: [redondear((a / horas) * 1000, 2), redondear((b / horas) * 1000, 2)],
  };
}

/** Variación porcentual entre dos tasas (negativa = la incidencia bajó = prevención efectiva). */
function variacionPorcentual(anterior, actual) {
  if (!esNumero(anterior) || !esNumero(actual) || anterior === 0) return null;
  return redondear(((actual - anterior) / anterior) * 100, 1);
}

// ---------------------------------------------------------------------------
// Usabilidad: System Usability Scale (SUS)
// ---------------------------------------------------------------------------
const ITEMS_SUS = [
  'Creo que me gustaría usar este sistema con frecuencia.',
  'Encontré el sistema innecesariamente complejo.',
  'Pensé que el sistema era fácil de usar.',
  'Creo que necesitaría el apoyo de una persona técnica para poder usar este sistema.',
  'Encontré que las distintas funciones del sistema estaban bien integradas.',
  'Pensé que había demasiada inconsistencia en este sistema.',
  'Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.',
  'Encontré el sistema muy engorroso de usar.',
  'Me sentí muy seguro/a usando el sistema.',
  'Necesité aprender muchas cosas antes de poder empezar a usar este sistema.',
];

/** Aporte de cada ítem (0-4): impares = respuesta - 1; pares = 5 - respuesta. */
const aportesSus = (r) => r.map((v, i) => (i % 2 === 0 ? v - 1 : 5 - v));

function validarLikert(respuestas, cantidad, min, max) {
  if (!Array.isArray(respuestas) || respuestas.length !== cantidad) return `Responde las ${cantidad} preguntas`;
  const malo = respuestas.findIndex((v) => !Number.isInteger(v) || v < min || v > max);
  return malo >= 0 ? `La respuesta ${malo + 1} debe ser un número entero de ${min} a ${max}` : null;
}

/** Puntaje SUS (0-100) = suma de aportes × 2.5. */
function puntajeSus(respuestas) {
  const error = validarLikert(respuestas, 10, 1, 5);
  if (error) throw new Error(error);
  return suma(aportesSus(respuestas)) * 2.5;
}

/** Interpretación (Bangor, Kortum y Miller, 2009; promedio de referencia = 68). */
function interpretarSus(p) {
  if (!esNumero(p)) return null;
  if (p > 80.3) return { grado: 'A', adjetivo: 'Excelente', aceptable: true };
  if (p >= 68) return { grado: 'B', adjetivo: 'Buena', aceptable: true };
  if (p >= 51) return { grado: 'C', adjetivo: 'Aceptable (marginal)', aceptable: false };
  return { grado: 'F', adjetivo: 'Pobre', aceptable: false };
}

// ---------------------------------------------------------------------------
// Aceptación técnica: Modelo de Aceptación Tecnológica (TAM), escala Likert 1-7
// ---------------------------------------------------------------------------
const CONSTRUCTOS_TAM = [
  {
    clave: 'utilidad', nombre: 'Utilidad percibida', items: [
      'Usar la plataforma me permite seguir el rendimiento deportivo más rápido.',
      'Usar la plataforma mejora la calidad de las decisiones sobre el entrenamiento.',
      'Usar la plataforma me ahorra tiempo en el seguimiento de los deportistas.',
      'En general, la plataforma me resulta útil.',
    ],
  },
  {
    clave: 'facilidad', nombre: 'Facilidad de uso percibida', items: [
      'Aprender a usar la plataforma me resultó fácil.',
      'Me resulta fácil conseguir que la plataforma haga lo que necesito.',
      'La interacción con la plataforma es clara y comprensible.',
      'En general, la plataforma es fácil de usar.',
    ],
  },
  {
    clave: 'intencion', nombre: 'Intención de uso', items: [
      'Tengo la intención de seguir usando la plataforma.',
      'Recomendaría la plataforma a otros entrenadores o academias.',
    ],
  },
];
const ITEMS_TAM = CONSTRUCTOS_TAM.flatMap((c) => c.items.map((texto) => ({ constructo: c.clave, texto })));

/** Lleva una media Likert 1-7 a 0-100. */
const a100 = (m) => ((m - 1) / 6) * 100;

/** Puntajes TAM: media por constructo (1-7 y 0-100) y aceptación global (promedio de constructos). */
function puntajeTam(respuestas) {
  const error = validarLikert(respuestas, ITEMS_TAM.length, 1, 7);
  if (error) throw new Error(error);
  let i = 0;
  const constructos = {};
  for (const c of CONSTRUCTOS_TAM) {
    const valores = respuestas.slice(i, i + c.items.length);
    i += c.items.length;
    const m = media(valores);
    constructos[c.clave] = { media: redondear(m, 2), puntaje: redondear(a100(m), 1) };
  }
  const global = redondear(media(Object.values(constructos).map((c) => a100(c.media))), 1);
  return { puntaje: global, constructos };
}

/** Nivel de aceptación según la media 1-7 (≥ 5.5 alta, ≥ 4 moderada, < 4 baja). */
function nivelAceptacion(puntaje100) {
  if (!esNumero(puntaje100)) return null;
  const m = 1 + (puntaje100 / 100) * 6;
  return m >= 5.5 ? 'alta' : m >= 4 ? 'moderada' : 'baja';
}

/** Matriz por constructo para el alfa de Cronbach. */
function matrizTam(listaRespuestas, clave) {
  let inicio = 0;
  for (const c of CONSTRUCTOS_TAM) {
    if (c.clave === clave) return listaRespuestas.map((r) => r.slice(inicio, inicio + c.items.length));
    inicio += c.items.length;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rendimiento del rastreo de movimiento (GPS)
// ---------------------------------------------------------------------------
const RADIO_TIERRA_M = 6371008.8;
function haversine(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const mediana = (l) => {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Calidad de una trayectoria GPS [{ lat, lon, t, acc? }].
 *   completitud     % de puntos con coordenadas válidas
 *   frecuencia      muestras por segundo (Hz) e intervalo medio
 *   huecos          intervalos mayores a 3 veces la mediana (pérdida de señal)
 *   saltos          tramos con velocidad imposible (> velocidadMaxima m/s, por defecto 12.5 m/s = 45 km/h)
 *   precisión       media de la precisión horizontal que informa el dispositivo (acc, en metros), si la envía
 *   error           |distancia medida − distancia de referencia| / referencia, si la prueba tiene distancia oficial
 * Es aceptable si completitud ≥ 95 %, sin saltos imposibles y, con referencia, error ≤ 5 %.
 */
function calidadGps(puntos, { distanciaReferencia = null, velocidadMaxima = 12.5 } = {}) {
  const recibidos = Array.isArray(puntos) ? puntos.length : 0;
  const validos = (puntos || []).filter((p) => p && esNumero(p.lat) && esNumero(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  if (validos.length < 2) return null;
  const escala = validos.find((p) => esNumero(p.t))?.t > 1e11 ? 1000 : 1; // t en ms o en s
  let distancia = 0;
  let saltos = 0;
  const intervalos = [];
  for (let i = 1; i < validos.length; i += 1) {
    const d = haversine(validos[i - 1], validos[i]);
    distancia += d;
    if (esNumero(validos[i].t) && esNumero(validos[i - 1].t)) {
      const dt = (validos[i].t - validos[i - 1].t) / escala;
      if (dt > 0) {
        intervalos.push(dt);
        if (d / dt > velocidadMaxima) saltos += 1;
      }
    }
  }
  const med = mediana(intervalos);
  const huecos = med ? intervalos.filter((x) => x > med * 3).length : 0;
  const intervaloMedio = intervalos.length ? media(intervalos) : null;
  const precisiones = validos.map((p) => p.acc ?? p.precision ?? p.hacc).filter(esNumero);
  const completitud = (validos.length / recibidos) * 100;
  const error = esNumero(distanciaReferencia) && distanciaReferencia > 0
    ? (Math.abs(distancia - distanciaReferencia) / distanciaReferencia) * 100 : null;
  return {
    puntos_recibidos: recibidos,
    puntos_validos: validos.length,
    completitud_pct: redondear(completitud, 1),
    intervalo_medio_s: redondear(intervaloMedio, 2),
    frecuencia_hz: intervaloMedio ? redondear(1 / intervaloMedio, 2) : null,
    huecos,
    saltos_imposibles: saltos,
    precision_media_m: precisiones.length ? redondear(media(precisiones), 1) : null,
    distancia_medida_m: redondear(distancia, 1),
    distancia_referencia_m: esNumero(distanciaReferencia) ? distanciaReferencia : null,
    error_distancia_pct: redondear(error, 2),
    aceptable: completitud >= 95 && saltos === 0 && (error === null || error <= 5),
  };
}

module.exports = {
  redondear, media, desviacion, resumenEstadistico, tCritico95, alfaCronbach, interpretarAlfa,
  sumarDias, diasEntre, cargaPorDia, acwr, zonaAcwr, ZONAS_ACWR, monotonia, indiceBienestar, estadoBienestar,
  gravedad, diasBaja, icPoisson, incidencia, variacionPorcentual,
  ITEMS_SUS, aportesSus, puntajeSus, interpretarSus, CONSTRUCTOS_TAM, ITEMS_TAM, puntajeTam, nivelAceptacion, matrizTam,
  calidadGps,
};
