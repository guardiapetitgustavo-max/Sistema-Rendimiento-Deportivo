/**
 * Indicadores de evaluación (FASE 11): cada fórmula se comprueba con valores conocidos o calculados a mano.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/domain/indicadores');

const cerca = (real, esperado, tolerancia, texto) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${texto}: ${real} ≠ ${esperado} ± ${tolerancia}`);

/** Cargas diarias consecutivas que terminan en `ref`. */
function serie(ref, cargas) {
  return cargas.map((carga, i) => ({ fecha: I.sumarDias(ref, -(cargas.length - 1 - i)), carga }));
}

describe('Usabilidad: SUS', () => {
  test('respuestas neutras = 50, ideales = 100, peores = 0', () => {
    assert.equal(I.puntajeSus(Array(10).fill(3)), 50);
    assert.equal(I.puntajeSus([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
    assert.equal(I.puntajeSus([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  });
  test('ejemplo de Brooke: 4 en impares y 2 en pares = 75', () => {
    assert.equal(I.puntajeSus([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]), 75);
  });
  test('interpretación de Bangor et al. (68 = promedio)', () => {
    assert.equal(I.interpretarSus(85).grado, 'A');
    assert.equal(I.interpretarSus(68).adjetivo, 'Buena');
    assert.equal(I.interpretarSus(60).aceptable, false);
    assert.equal(I.interpretarSus(40).grado, 'F');
  });
  test('rechaza respuestas incompletas o fuera de escala', () => {
    assert.throws(() => I.puntajeSus([3, 3, 3]), /10 preguntas/);
    assert.throws(() => I.puntajeSus([3, 3, 3, 3, 3, 3, 3, 3, 3, 6]), /1 a 5/);
  });
});

describe('Aceptación: TAM', () => {
  test('todo 7 = 100, todo 1 = 0, todo 4 = 50; constructos por separado', () => {
    const n = I.ITEMS_TAM.length;
    assert.equal(I.puntajeTam(Array(n).fill(7)).puntaje, 100);
    assert.equal(I.puntajeTam(Array(n).fill(1)).puntaje, 0);
    assert.equal(I.puntajeTam(Array(n).fill(4)).puntaje, 50);
    // Utilidad (4 ítems) = 7, facilidad (4) = 4, intención (2) = 1
    const t = I.puntajeTam([7, 7, 7, 7, 4, 4, 4, 4, 1, 1]);
    assert.deepEqual([t.constructos.utilidad.puntaje, t.constructos.facilidad.puntaje, t.constructos.intencion.puntaje], [100, 50, 0]);
    assert.equal(t.puntaje, 50);
  });
  test('nivel: media ≥ 5.5 alta, ≥ 4 moderada', () => {
    assert.equal(I.nivelAceptacion(80), 'alta'); // media 5.8
    assert.equal(I.nivelAceptacion(60), 'moderada'); // media 4.6
    assert.equal(I.nivelAceptacion(30), 'baja');
  });
});

describe('Fiabilidad: alfa de Cronbach', () => {
  test('ítems perfectamente consistentes = 1', () => {
    assert.equal(I.alfaCronbach([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]), 1);
  });
  test('ejemplo calculado a mano = 0.667', () => {
    // varianzas (n − 1): ítem 1 = 1, ítem 2 = 1, total (5, 8, 8) = 3 → α = 2/1 × (1 − 2/3) = 0.667
    assert.equal(I.alfaCronbach([[2, 3], [4, 4], [3, 5]]), 0.667);
  });
  test('con menos de 3 personas no se calcula', () => {
    assert.equal(I.alfaCronbach([[1, 2], [2, 3]]), null);
  });
});

describe('Carga: ACWR 7:28 (medias acopladas)', () => {
  const ref = '2026-06-30';
  test('carga constante = 1.00 (zona óptima)', () => {
    const a = I.acwr(serie(ref, Array(28).fill(100)), ref);
    assert.deepEqual([a.aguda, a.cronica, a.acwr, a.zona], [700, 700, 1, 'optima']);
  });
  test('pico: 21 días a 100 y 7 días a 200 → 1400 / 875 = 1.60 (riesgo)', () => {
    const a = I.acwr(serie(ref, [...Array(21).fill(100), ...Array(7).fill(200)]), ref);
    assert.deepEqual([a.aguda, a.cronica, a.acwr, a.zona], [1400, 875, 1.6, 'riesgo']);
  });
  test('descarga: 7 días a 50 tras 21 a 100 → 350 / 612.5 = 0.57 (baja)', () => {
    const a = I.acwr(serie(ref, [...Array(21).fill(100), ...Array(7).fill(50)]), ref);
    assert.equal(a.acwr, 0.57);
    assert.equal(a.zona, 'baja');
  });
  test('límites de zona: 0.8 y 1.3 son óptimos, 1.5 es precaución', () => {
    assert.equal(I.zonaAcwr(0.8).zona, 'optima');
    assert.equal(I.zonaAcwr(1.3).zona, 'optima');
    assert.equal(I.zonaAcwr(1.31).zona, 'precaucion');
    assert.equal(I.zonaAcwr(1.5).zona, 'precaucion');
    assert.equal(I.zonaAcwr(1.51).zona, 'riesgo');
  });
  test('con menos de 28 días de historial no se informa', () => {
    const a = I.acwr(serie(ref, Array(27).fill(100)), ref);
    assert.equal(a.suficiente, false);
    assert.equal(a.acwr, null);
  });
  test('la primera carga real decide el historial aunque solo lleguen los últimos días', () => {
    const a = I.acwr(serie(ref, Array(28).fill(100)).slice(-10), ref, { primera: '2026-01-01' });
    assert.equal(a.suficiente, true);
    assert.equal(a.acwr, 2.8); // 700 / (1000 / 4): los días sin datos cuentan como 0
  });
  test('días sin entrenar cuentan como carga 0 y la carga del mismo día se suma', () => {
    const m = I.cargaPorDia([{ fecha: ref, carga: 300 }, { fecha: ref, carga: 200 }]);
    assert.equal(m.get(ref), 500);
  });
});

describe('Carga: monotonía y tensión (Foster)', () => {
  const ref = '2026-06-30';
  test('5 días a 100 y 2 de descanso: monotonía 1.46, tensión 732', () => {
    const m = I.monotonia(serie(ref, [100, 100, 100, 100, 100, 0, 0]), ref);
    // media 71.43; DE muestral 48.80
    cerca(m.monotonia, 1.4638, 0.005, 'monotonía');
    cerca(m.tension, 732, 2, 'tensión');
    assert.equal(m.carga_semanal, 500);
    assert.equal(m.alta, false);
  });
  test('misma carga todos los días: DE 0 → monotonía no definida', () => {
    assert.equal(I.monotonia(serie(ref, Array(7).fill(100)), ref).monotonia, null);
  });
});

describe('Recuperación: índice de bienestar', () => {
  test('mejor estado = 100, peor = 0, sin datos = null', () => {
    assert.equal(I.indiceBienestar({ calidad_sueno: 5, fatiga: 1, estres: 1, recuperacion: 10, dolor: false }), 100);
    assert.equal(I.indiceBienestar({ calidad_sueno: 1, fatiga: 10, estres: 10, recuperacion: 1, dolor: true, dolor_intensidad: 10 }), 0);
    assert.equal(I.indiceBienestar({}), null);
  });
  test('promedia solo los componentes registrados', () => {
    assert.equal(I.indiceBienestar({ fatiga: 10, recuperacion: 10 }), 50);
  });
});

describe('Lesiones: incidencia por 1000 h', () => {
  test('3 lesiones en 1500 h = 2.0 / 1000 h con IC 95 % ≈ exacto de Poisson (0.41 - 5.84)', () => {
    const r = I.incidencia(3, 1500);
    assert.equal(r.tasa, 2);
    cerca(r.ic95[0], (0.6187 / 1500) * 1000, 0.02, 'IC inferior');
    cerca(r.ic95[1], (8.7673 / 1500) * 1000, 0.02, 'IC superior');
  });
  test('0 lesiones: tasa 0 e IC superior ≈ 3.69 eventos', () => {
    const r = I.incidencia(0, 1000);
    assert.equal(r.tasa, 0);
    cerca(r.ic95[1], 3.689, 0.05, 'IC superior');
  });
  test('sin horas de exposición no hay tasa', () => {
    assert.equal(I.incidencia(2, 0).tasa, null);
  });
  test('variación entre periodos', () => {
    assert.equal(I.variacionPorcentual(4, 3), -25);
    assert.equal(I.variacionPorcentual(0, 3), null);
  });
  test('gravedad por días de baja (Fuller et al., 2006)', () => {
    assert.deepEqual([0, 1, 3, 4, 7, 8, 28, 29].map(I.gravedad), ['sin_baja', 'minima', 'minima', 'leve', 'leve', 'moderada', 'moderada', 'grave']);
    assert.equal(I.diasBaja({ fecha_inicio: '2026-06-01', fecha_alta: '2026-06-15' }, '2026-07-01'), 14);
    assert.equal(I.diasBaja({ fecha_inicio: '2026-06-01', fecha_alta: null }, '2026-07-01'), 30);
  });
});

describe('Rastreo: calidad de la trayectoria GPS', () => {
  const centro = { lat: -12.0675, lon: -77.0336 };
  const mLat = 1 / 111320;
  const mLon = 1 / (111320 * Math.cos((centro.lat * Math.PI) / 180));
  const radio = 400 / (2 * Math.PI);
  const vuelta = (n = 80, t0 = 1.7e12) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { lat: centro.lat + radio * Math.sin(a) * mLat, lon: centro.lon + radio * Math.cos(a) * mLon, t: t0 + i * 1000, acc: 3 };
  });

  test('vuelta de 400 m a 1 Hz: completa, sin saltos, error < 1 % y aceptable', () => {
    const c = I.calidadGps(vuelta(), { distanciaReferencia: 400 });
    assert.equal(c.completitud_pct, 100);
    assert.equal(c.frecuencia_hz, 1);
    assert.equal(c.saltos_imposibles, 0);
    assert.equal(c.precision_media_m, 3);
    assert.ok(c.error_distancia_pct < 1, `error ${c.error_distancia_pct}`);
    assert.equal(c.aceptable, true);
  });
  test('puntos sin coordenadas bajan la completitud y un salto de 80 m se detecta', () => {
    const p = vuelta();
    p[10] = { lat: null, lon: null, t: p[10].t };
    p[40] = { ...p[40], lat: p[40].lat + 80 * mLat };
    const c = I.calidadGps(p, { distanciaReferencia: 400 });
    cerca(c.completitud_pct, (80 / 81) * 100, 0.1, 'completitud');
    assert.equal(c.saltos_imposibles, 2); // ida y vuelta del salto
    assert.equal(c.aceptable, false);
  });
  test('detecta huecos de señal (intervalo > 3 veces la mediana)', () => {
    const p = vuelta().filter((_, i) => i < 20 || i > 30);
    assert.equal(I.calidadGps(p).huecos, 1);
  });
  test('menos de 2 puntos válidos = sin calidad', () => {
    assert.equal(I.calidadGps([{ lat: 1, lon: 1 }]), null);
  });
});

describe('Estadística', () => {
  test('media con IC 95 % de t de Student', () => {
    const r = I.resumenEstadistico([60, 70, 80]);
    assert.equal(r.media, 70);
    assert.equal(r.de, 10);
    // 70 ± 4.303 × 10 / √3 = 70 ± 24.84
    assert.deepEqual(r.ic95, [45.2, 94.8]);
  });
});
