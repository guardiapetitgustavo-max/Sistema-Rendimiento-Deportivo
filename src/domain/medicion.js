/**
 * Motor de medición y rendimiento (funciones puras, sin base de datos).
 *
 * Reglas que garantiza:
 * - Nunca asume que "más alto es mejor": cada métrica tiene su dirección de mejora.
 * - Solo compara resultados compatibles (misma prueba, misma unidad y mismo contexto, p. ej. largo de piscina).
 * - No inventa: si no hay datos suficientes devuelve null / "insuficiente".
 * - Los valores derivados (ritmo, velocidad, distancia por brazada…) se calculan de datos medidos y se marcan como tales.
 */

const TIPOS_RESULTADO = [
  'TIME', 'DISTANCE', 'SPEED', 'PACE', 'COUNT', 'SCORE', 'PERCENTAGE', 'HEART_RATE', 'RPE', 'WEIGHT', 'HEIGHT', 'ANGLE', 'CUSTOM',
];
const DIRECCIONES = ['LOWER_IS_BETTER', 'HIGHER_IS_BETTER', 'TARGET_RANGE', 'CUSTOM'];
const FUENTES_MEDICION = ['MANUAL', 'PHONE', 'VIDEO', 'SENSOR', 'EXTERNAL_SYSTEM'];
const MODOS = ['campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado'];
const CRITERIOS_INTENTOS = ['mejor', 'promedio', 'ultimo'];

const redondear = (valor, decimales = 2) => (valor === null || valor === undefined || Number.isNaN(valor)
  ? null : Math.round(valor * 10 ** decimales) / 10 ** decimales);
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Tiempos
// ---------------------------------------------------------------------------
/**
 * Convierte un tiempo escrito por una persona a segundos.
 * Acepta "4.82", "4,82", "1:04.32" (m:ss.cc) y "1:04:32" o "1:04:32.5" (h:mm:ss).
 */
function parsearTiempo(texto) {
  if (esNumero(texto)) return texto;
  const limpio = String(texto ?? '').trim().replace(',', '.');
  if (!limpio) return null;
  if (/^\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
  const partes = limpio.split(':');
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
    throw new Error(`tiempo no válido: "${texto}" (usa 4.82, 1:04.32 o 1:04:32)`);
  }
  const numeros = partes.map(Number);
  const [mayor, ...resto] = numeros;
  if (resto.some((n) => n >= 60)) throw new Error(`tiempo no válido: "${texto}" (minutos y segundos deben ser menores de 60)`);
  return partes.length === 2 ? mayor * 60 + numeros[1] : mayor * 3600 + numeros[1] * 60 + numeros[2];
}

/** Segundos → texto legible ("4.82 s", "1:04.32", "1:04:32"). */
function formatearTiempo(segundos, decimales = 2) {
  if (!esNumero(segundos)) return '—';
  if (segundos < 60) return `${segundos.toFixed(decimales)} s`;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const ss = s.toFixed(decimales).padStart(decimales ? 3 + decimales : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function formatearValor(valor, { tipo, unidad = '', decimales = 2 } = {}) {
  if (!esNumero(valor)) return '—';
  if (tipo === 'TIME' || unidad === 's') return formatearTiempo(valor, decimales);
  return `${redondear(valor, decimales)}${unidad ? ` ${unidad}` : ''}`;
}

// ---------------------------------------------------------------------------
// Dirección de mejora
// ---------------------------------------------------------------------------
/**
 * ¿`a` es mejor que `b`? Devuelve true/false, o null cuando la métrica no tiene criterio automático (CUSTOM).
 * TARGET_RANGE: es mejor el valor dentro del rango; si ambos están fuera, el más cercano a él.
 */
function esMejor(a, b, direccion, rango = {}) {
  if (!esNumero(a)) return false;
  if (!esNumero(b)) return true;
  switch (direccion) {
    case 'LOWER_IS_BETTER': return a < b;
    case 'HIGHER_IS_BETTER': return a > b;
    case 'TARGET_RANGE': return distanciaAlRango(a, rango) < distanciaAlRango(b, rango);
    default: return null;
  }
}

function distanciaAlRango(valor, { min = null, max = null } = {}) {
  if (esNumero(min) && valor < min) return min - valor;
  if (esNumero(max) && valor > max) return valor - max;
  return 0;
}

/** Mejor valor de una lista según la dirección. CUSTOM no tiene "mejor": devuelve null. */
function mejorValor(valores, direccion, rango) {
  const numeros = valores.filter(esNumero);
  if (!numeros.length || direccion === 'CUSTOM' || !DIRECCIONES.includes(direccion)) return null;
  return numeros.reduce((mejor, v) => (esMejor(v, mejor, direccion, rango) ? v : mejor));
}

/** Valor oficial de una serie de intentos según el criterio de la prueba (mejor, promedio o último). */
function consolidarIntentos(valores, criterio = 'mejor', direccion = 'HIGHER_IS_BETTER', rango) {
  const numeros = valores.filter(esNumero);
  if (!numeros.length) return null;
  if (criterio === 'promedio') return redondear(numeros.reduce((s, v) => s + v, 0) / numeros.length, 4);
  if (criterio === 'ultimo') return numeros.at(-1);
  return mejorValor(numeros, direccion, rango) ?? numeros.at(-1);
}

/**
 * Cambio entre dos resultados compatibles, interpretado según la dirección.
 * porcentaje = cambio relativo al valor anterior, con signo POSITIVO cuando es mejora.
 */
function variacion(anterior, actual, direccion, rango) {
  if (!esNumero(anterior) || !esNumero(actual)) return null;
  const absoluta = redondear(actual - anterior, 4);
  const base = Math.abs(anterior) || null;
  let sentido = 'igual';
  if (absoluta !== 0) {
    const mejora = esMejor(actual, anterior, direccion, rango);
    sentido = mejora === null ? 'sin_criterio' : mejora ? 'mejora' : 'empeora';
  }
  const magnitud = base ? Math.abs(absoluta) / base * 100 : null;
  let porcentaje = null;
  if (magnitud !== null) {
    if (sentido === 'mejora') porcentaje = redondear(magnitud, 2);
    else if (sentido === 'empeora') porcentaje = -redondear(magnitud, 2);
    else if (sentido === 'igual') porcentaje = 0;
  }
  return { anterior, actual, absoluta, porcentaje, sentido };
}

// ---------------------------------------------------------------------------
// Tendencia (regresión lineal sobre el tiempo)
// ---------------------------------------------------------------------------
const DIA_MS = 86400000;

// Valores críticos de la t de Student (bilateral) por grados de libertad, al 90 % y al 95 %
const T_90 = [null, 6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761, 1.753, 1.746, 1.74, 1.734, 1.729, 1.725];
const T_95 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];
function tCritico(gl, nivel = 0.9) {
  const tabla = nivel >= 0.95 ? T_95 : T_90;
  if (gl < 1) return Infinity;
  if (gl < tabla.length) return tabla[gl];
  return nivel >= 0.95 ? 1.96 + 2.4 / gl : 1.645 + 1.6 / gl;
}
const aDia = (fecha) => Math.floor(new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`).getTime() / DIA_MS);

/**
 * Tendencia de una serie [{fecha, valor}] con regresión lineal por días.
 * Clasifica en mejora / empeora / estable según la dirección, o "insuficiente" si hay menos de `minimo` puntos
 * o de `minimoDias` días de diferencia. `umbral` = cambio relativo estimado en el periodo para no ser "estable".
 */
function tendencia(serie, direccion, { minimo = 3, minimoDias = 7, umbral = 0.02, nivel = 0.9 } = {}) {
  const puntos = serie.filter((p) => esNumero(p.valor) && p.fecha).map((p) => ({ x: aDia(p.fecha), y: p.valor }));
  const resultado = { puntos: puntos.length, clasificacion: 'insuficiente' };
  if (puntos.length < minimo) return { ...resultado, motivo: `Se necesitan al menos ${minimo} mediciones` };
  const xs = puntos.map((p) => p.x);
  const dias = Math.max(...xs) - Math.min(...xs);
  if (dias < minimoDias) return { ...resultado, motivo: `Las mediciones deben abarcar al menos ${minimoDias} días` };

  const n = puntos.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  const sxx = puntos.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = puntos.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const syy = puntos.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const pendiente = sxy / sxx; // unidades por día
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  const cambioPeriodo = pendiente * dias;
  const relativo = my ? cambioPeriodo / Math.abs(my) : 0;
  // Significación estadística de la pendiente (prueba t, bilateral al 90 %): con pocas mediciones y
  // mucho ruido una pendiente aparente no se informa como mejora/empeora (evita falsos positivos).
  const residual = Math.max(0, syy - pendiente * sxy);
  const errorPendiente = n > 2 ? Math.sqrt(residual / (n - 2) / sxx) : Infinity;
  const t = errorPendiente === 0 ? Infinity : Math.abs(pendiente / errorPendiente);
  const significativa = t >= tCritico(n - 2, nivel);

  let clasificacion = 'estable';
  if (Math.abs(relativo) >= umbral && significativa) {
    if (direccion === 'LOWER_IS_BETTER') clasificacion = pendiente < 0 ? 'mejora' : 'empeora';
    else if (direccion === 'HIGHER_IS_BETTER') clasificacion = pendiente > 0 ? 'mejora' : 'empeora';
    else clasificacion = pendiente > 0 ? 'sube' : 'baja'; // sin criterio de mejora: solo se describe
  }
  return {
    ...resultado,
    clasificacion,
    pendiente_dia: redondear(pendiente, 5),
    cambio_periodo: redondear(cambioPeriodo, 4),
    cambio_relativo_pct: redondear(relativo * 100, 2),
    dias,
    r2: redondear(r2, 3),
    t: Number.isFinite(t) ? redondear(t, 2) : null,
    significativa,
    confianza: !significativa ? 'baja' : r2 >= 0.6 ? 'alta' : r2 >= 0.3 ? 'media' : 'baja',
  };
}

// ---------------------------------------------------------------------------
// Compatibilidad: nunca comparar pruebas distintas como si fueran la misma métrica
// ---------------------------------------------------------------------------
/** Clave de comparación de un resultado: prueba + unidad + contexto que cambia el valor (largo de piscina). */
function claveComparacion(r) {
  const largo = r.datos?.largo_piscina ?? r.largo_piscina ?? '';
  return `${r.prueba_id}|${r.unidad || ''}|${largo}`;
}

function compatibles(a, b) {
  return claveComparacion(a) === claveComparacion(b);
}

/** Evolución de UNA prueba: primera, anterior, actual, mejor marca personal y variaciones. */
function evolucion(resultados, direccion, rango) {
  const ordenados = [...resultados].filter((r) => esNumero(r.valor))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.id ?? 0) - (b.id ?? 0));
  if (!ordenados.length) return null;
  const claves = new Set(ordenados.map(claveComparacion));
  if (claves.size > 1) throw new Error('No se pueden mezclar resultados de pruebas o contextos distintos en una misma evolución');

  const primera = ordenados[0];
  const actual = ordenados.at(-1);
  const anterior = ordenados.length > 1 ? ordenados.at(-2) : null;
  const mejorMarca = direccion === 'CUSTOM' ? null : ordenados.reduce((m, r) => (esMejor(r.valor, m.valor, direccion, rango) ? r : m));
  // Récord personal = el actual supera estrictamente todo lo anterior
  const previas = ordenados.slice(0, -1).map((r) => r.valor);
  const record = previas.length > 0 && direccion !== 'CUSTOM' && esMejor(actual.valor, mejorValor(previas, direccion, rango), direccion, rango) === true;

  return {
    mediciones: ordenados.length,
    primera: { valor: primera.valor, fecha: primera.fecha },
    anterior: anterior ? { valor: anterior.valor, fecha: anterior.fecha } : null,
    actual: { valor: actual.valor, fecha: actual.fecha },
    mejor_marca: mejorMarca ? { valor: mejorMarca.valor, fecha: mejorMarca.fecha } : null,
    desde_primera: ordenados.length > 1 ? variacion(primera.valor, actual.valor, direccion, rango) : null,
    desde_anterior: anterior ? variacion(anterior.valor, actual.valor, direccion, rango) : null,
    record_personal: record,
    tendencia: tendencia(ordenados, direccion),
    serie: ordenados.map((r) => ({ fecha: r.fecha, valor: r.valor })),
  };
}

// ---------------------------------------------------------------------------
// Puntuación (Performance Scoring Engine)
// ---------------------------------------------------------------------------
/**
 * Normaliza un valor a 0-100 con un baremo {base, excelente}: base → 0 puntos, excelente → 100.
 * Funciona para cualquier dirección (si "excelente" es menor que "base", menos es mejor). Se recorta a 0-100.
 */
function normalizar(valor, baremo) {
  if (!esNumero(valor) || !baremo || !esNumero(baremo.base) || !esNumero(baremo.excelente) || baremo.base === baremo.excelente) return null;
  const puntos = ((valor - baremo.base) / (baremo.excelente - baremo.base)) * 100;
  return redondear(Math.min(100, Math.max(0, puntos)), 1);
}

/** Percentil (0-100) de un valor dentro de su grupo, según la dirección (normalización relativa explícita). */
function percentil(valor, grupo, direccion) {
  const numeros = grupo.filter(esNumero);
  if (!esNumero(valor) || numeros.length < 2 || !['LOWER_IS_BETTER', 'HIGHER_IS_BETTER'].includes(direccion)) return null;
  const peores = numeros.filter((v) => esMejor(valor, v, direccion)).length;
  const iguales = numeros.filter((v) => v === valor).length;
  return redondear(((peores + (iguales - 1) / 2) / (numeros.length - 1)) * 100, 1);
}

/**
 * Puntaje compuesto: promedio ponderado de capacidades con datos. Devuelve también la cobertura
 * (qué parte del peso total tenía datos), para no presentar un puntaje parcial como completo.
 */
function puntajeCompuesto(porCapacidad, pesos) {
  const entradas = Object.entries(pesos || {}).filter(([, p]) => esNumero(p) && p > 0);
  const pesoTotal = entradas.reduce((s, [, p]) => s + p, 0);
  const conDatos = entradas.filter(([c]) => esNumero(porCapacidad[c]));
  const pesoConDatos = conDatos.reduce((s, [, p]) => s + p, 0);
  if (!pesoConDatos) return { total: null, cobertura: 0, capacidades: porCapacidad };
  return {
    total: redondear(conDatos.reduce((s, [c, p]) => s + porCapacidad[c] * p, 0) / pesoConDatos, 1),
    cobertura: redondear((pesoConDatos / pesoTotal) * 100, 1),
    capacidades: porCapacidad,
  };
}

// ---------------------------------------------------------------------------
// Natación, carrera y derivados (calculados a partir de datos medidos)
// ---------------------------------------------------------------------------
const ritmoPor = (distanciaM, tiempoS, cada = 100) => (esNumero(distanciaM) && esNumero(tiempoS) && distanciaM > 0 ? redondear((tiempoS / distanciaM) * cada, 2) : null);
const velocidadMs = (distanciaM, tiempoS) => (esNumero(distanciaM) && esNumero(tiempoS) && tiempoS > 0 ? redondear(distanciaM / tiempoS, 3) : null);
const velocidadKmh = (distanciaM, tiempoS) => { const v = velocidadMs(distanciaM, tiempoS); return v === null ? null : redondear(v * 3.6, 2); };
const distanciaPorBrazada = (distanciaM, brazadas) => (esNumero(distanciaM) && esNumero(brazadas) && brazadas > 0 ? redondear(distanciaM / brazadas, 2) : null);
const frecuenciaBrazada = (brazadas, tiempoS) => (esNumero(brazadas) && esNumero(tiempoS) && tiempoS > 0 ? redondear((brazadas / tiempoS) * 60, 1) : null);

/**
 * Valida parciales acumulados [{m, t}]: distancias y tiempos crecientes, dentro de la prueba,
 * y que el último coincida con el tiempo final (si se indica). Devuelve la lista de problemas.
 */
function validarParciales(parciales, distanciaM, tiempoFinal, tolerancia = 0.05) {
  const errores = [];
  if (!Array.isArray(parciales) || !parciales.length) return errores;
  parciales.forEach((p, i) => {
    if (!esNumero(p.m) || !esNumero(p.t) || p.m <= 0 || p.t <= 0) errores.push(`El parcial ${i + 1} no es válido`);
    if (i > 0 && (p.m <= parciales[i - 1].m || p.t <= parciales[i - 1].t)) errores.push(`El parcial ${i + 1} debe ser mayor que el anterior`);
    if (esNumero(distanciaM) && p.m > distanciaM) errores.push(`El parcial ${i + 1} supera la distancia de la prueba`);
  });
  const ultimo = parciales.at(-1);
  if (esNumero(tiempoFinal) && esNumero(distanciaM) && ultimo.m === distanciaM && Math.abs(ultimo.t - tiempoFinal) > tolerancia) {
    errores.push('El último parcial no coincide con el tiempo final');
  }
  return errores;
}

/** Tiempo de cada tramo a partir de parciales acumulados. */
function tramos(parciales) {
  return (parciales || []).map((p, i) => ({
    desde: i ? parciales[i - 1].m : 0,
    hasta: p.m,
    tiempo: redondear(p.t - (i ? parciales[i - 1].t : 0), 2),
  }));
}

// ---------------------------------------------------------------------------
// GPS (aguas abiertas, carrera, ciclismo)
// ---------------------------------------------------------------------------
const RADIO_TIERRA_M = 6371008.8;
function haversine(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Resumen de una trayectoria [{lat, lon, t (ms epoch o s), fc?}]: distancia, duración, ritmo, velocidad y FC media. */
function resumenGps(puntos) {
  const validos = (puntos || []).filter((p) => esNumero(p.lat) && esNumero(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  if (validos.length < 2) return null;
  let distancia = 0;
  for (let i = 1; i < validos.length; i += 1) distancia += haversine(validos[i - 1], validos[i]);
  const conTiempo = validos.filter((p) => esNumero(p.t));
  const duracion = conTiempo.length >= 2 ? (conTiempo.at(-1).t - conTiempo[0].t) / (conTiempo[0].t > 1e11 ? 1000 : 1) : null;
  const fcs = validos.map((p) => p.fc).filter(esNumero);
  return {
    puntos: validos.length,
    distancia_m: redondear(distancia, 1),
    duracion_s: duracion !== null ? redondear(duracion, 1) : null,
    ritmo_100m_s: duracion ? ritmoPor(distancia, duracion, 100) : null,
    ritmo_km_s: duracion ? ritmoPor(distancia, duracion, 1000) : null,
    velocidad_kmh: duracion ? velocidadKmh(distancia, duracion) : null,
    fc_media: fcs.length ? redondear(fcs.reduce((s, v) => s + v, 0) / fcs.length, 0) : null,
    fc_maxima: fcs.length ? Math.max(...fcs) : null,
    derivado: true, // calculado a partir de la trayectoria medida
  };
}

// ---------------------------------------------------------------------------
// Cronometraje con dos dispositivos (A = salida, B = llegada)
// ---------------------------------------------------------------------------
/**
 * Estima el desfase del reloj de un dispositivo respecto al servidor a partir de varias muestras
 * {envio, servidor, recepcion} (ms). Usa la muestra con menor ida y vuelta (la más precisa).
 */
function estimarDesfase(muestras) {
  const validas = (muestras || []).filter((m) => esNumero(m.envio) && esNumero(m.servidor) && esNumero(m.recepcion) && m.recepcion >= m.envio);
  if (!validas.length) return null;
  const mejor = validas.reduce((a, b) => ((b.recepcion - b.envio) < (a.recepcion - a.envio) ? b : a));
  const idaVuelta = mejor.recepcion - mejor.envio;
  return { desfase_ms: Math.round(mejor.servidor - (mejor.envio + idaVuelta / 2)), incertidumbre_ms: Math.ceil(idaVuelta / 2) };
}

/** Duración entre la salida (dispositivo A) y la llegada (dispositivo B), corrigiendo el reloj de cada uno. */
function duracionDosDispositivos(salida, llegada) {
  if (!salida || !llegada || !esNumero(salida.marca_ms) || !esNumero(llegada.marca_ms)) return null;
  const inicio = salida.marca_ms + (salida.desfase_ms || 0);
  const fin = llegada.marca_ms + (llegada.desfase_ms || 0);
  if (fin <= inicio) return null;
  return {
    segundos: redondear((fin - inicio) / 1000, 3),
    incertidumbre_ms: (salida.incertidumbre_ms || 0) + (llegada.incertidumbre_ms || 0),
  };
}

// ---------------------------------------------------------------------------
// Edad y categoría
// ---------------------------------------------------------------------------
function edad(fechaNacimiento, hoy = new Date()) {
  if (!fechaNacimiento) return null;
  const n = new Date(`${String(fechaNacimiento).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(n.getTime())) return null;
  let anios = hoy.getUTCFullYear() - n.getUTCFullYear();
  const m = hoy.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < n.getUTCDate())) anios -= 1;
  return anios;
}

/** Categoría que corresponde a una edad (la primera cuyo rango la contiene). */
function categoriaPorEdad(categorias, anios) {
  if (!esNumero(anios)) return null;
  return categorias.find((c) => (c.edad_min ?? -Infinity) <= anios && anios <= (c.edad_max ?? Infinity)) || null;
}

module.exports = {
  TIPOS_RESULTADO,
  DIRECCIONES,
  FUENTES_MEDICION,
  MODOS,
  CRITERIOS_INTENTOS,
  redondear,
  esNumero,
  parsearTiempo,
  formatearTiempo,
  formatearValor,
  esMejor,
  mejorValor,
  consolidarIntentos,
  variacion,
  tendencia,
  tCritico,
  claveComparacion,
  compatibles,
  evolucion,
  normalizar,
  percentil,
  puntajeCompuesto,
  ritmoPor,
  velocidadMs,
  velocidadKmh,
  distanciaPorBrazada,
  frecuenciaBrazada,
  validarParciales,
  tramos,
  haversine,
  resumenGps,
  estimarDesfase,
  duracionDosDispositivos,
  edad,
  categoriaPorEdad,
};
