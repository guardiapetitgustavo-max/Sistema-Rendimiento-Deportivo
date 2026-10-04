/**
 * BATERÍA DE VALIDACIÓN: ¿el sistema es apto para analizar rendimiento deportivo?
 *
 * Cada prueba compara lo que calcula el sistema con un valor CONOCIDO de antemano (verdad de referencia).
 * Parte 1 (siempre): motor de medición puro — dirección de mejora, tiempos, intentos, tendencias con su
 *   precisión estadística (simulación Monte Carlo), compatibilidad, scoring, natación, GPS y cronometraje.
 * Parte 2 (con TEST_DATABASE_URL): extremo a extremo contra PostgreSQL con la academia demo — aislamiento
 *   multi-academia, permisos, idempotencia, versionado, alertas, IA sin invención, objetivos, límites,
 *   integraciones, video y rendimiento a escala.
 *
 *   node --test tests/validacion.test.js
 *   TEST_DATABASE_URL=postgresql://… node --test tests/validacion.test.js
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('../src/domain/medicion');

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);
const REPORTE = {};

function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===========================================================================
// PARTE 1 — Motor de medición (verdad conocida)
// ===========================================================================
describe('1. Dirección de mejora y comparación', () => {
  test('30 m: 5.12 s → 4.82 s es MEJORA de 5.86 % (menos es mejor)', () => {
    const v = M.variacion(5.12, 4.82, 'LOWER_IS_BETTER');
    assert.equal(v.sentido, 'mejora');
    cerca(v.porcentaje, 5.86, 0.01, 'porcentaje');
    cerca(v.absoluta, -0.3, 1e-9, 'diferencia');
  });
  test('Salto vertical: 42 → 49 cm es MEJORA de 16.67 % (más es mejor)', () => {
    const v = M.variacion(42, 49, 'HIGHER_IS_BETTER');
    assert.equal(v.sentido, 'mejora');
    cerca(v.porcentaje, 16.67, 0.01, 'porcentaje');
  });
  test('Cooper: 2200 → 2430 m es MEJORA de 10.45 %', () => cerca(M.variacion(2200, 2430, 'HIGHER_IS_BETTER').porcentaje, 10.45, 0.01, 'Cooper'));
  test('Un tiempo que SUBE es empeoramiento (no se confunde con mejora)', () => {
    const v = M.variacion(4.82, 5.12, 'LOWER_IS_BETTER');
    assert.equal(v.sentido, 'empeora');
    assert.ok(v.porcentaje < 0);
  });
  test('TARGET_RANGE (frecuencia de brazada 40-55): dentro del rango es mejor que fuera', () => {
    assert.equal(M.esMejor(48, 60, 'TARGET_RANGE', { min: 40, max: 55 }), true);
    assert.equal(M.esMejor(52, 38, 'TARGET_RANGE', { min: 40, max: 55 }), true);
    assert.equal(M.esMejor(56, 30, 'TARGET_RANGE', { min: 40, max: 55 }), true); // 1 fuera es mejor que 10 fuera
  });
  test('CUSTOM no tiene "mejor": no se inventa un récord', () => assert.equal(M.mejorValor([1, 2, 3], 'CUSTOM'), null));
});

describe('2. Tiempos escritos por personas', () => {
  test('formatos válidos', () => {
    assert.equal(M.parsearTiempo('4.82'), 4.82);
    assert.equal(M.parsearTiempo('4,82'), 4.82);
    cerca(M.parsearTiempo('1:04.32'), 64.32, 1e-9, 'm:ss.cc');
    assert.equal(M.parsearTiempo('1:04:32'), 3872);
  });
  test('formatos inválidos se rechazan', () => {
    assert.throws(() => M.parsearTiempo('1:75'));
    assert.throws(() => M.parsearTiempo('abc'));
  });
  test('ida y vuelta: 64.32 s se muestra como 1:04.32', () => assert.equal(M.formatearTiempo(64.32), '1:04.32'));
});

describe('3. Intentos y valor oficial', () => {
  test('mejor / promedio / último', () => {
    assert.equal(M.consolidarIntentos([5.1, 4.9, 5.0], 'mejor', 'LOWER_IS_BETTER'), 4.9);
    assert.equal(M.consolidarIntentos([40, 44, 42], 'mejor', 'HIGHER_IS_BETTER'), 44);
    cerca(M.consolidarIntentos([5.1, 4.9, 5.0], 'promedio', 'LOWER_IS_BETTER'), 5.0, 1e-9, 'promedio');
    assert.equal(M.consolidarIntentos([5.1, 4.9, 5.0], 'ultimo'), 5.0);
  });
  test('récord personal: solo si supera ESTRICTAMENTE todo lo anterior', () => {
    const base = [{ fecha: '2026-01-01', valor: 5.0 }, { fecha: '2026-02-01', valor: 4.9 }].map((r) => ({ ...r, prueba_id: 1, unidad: 's' }));
    assert.equal(M.evolucion([...base, { fecha: '2026-03-01', valor: 4.8, prueba_id: 1, unidad: 's' }], 'LOWER_IS_BETTER').record_personal, true);
    assert.equal(M.evolucion([...base, { fecha: '2026-03-01', valor: 4.9, prueba_id: 1, unidad: 's' }], 'LOWER_IS_BETTER').record_personal, false);
  });
});

describe('4. Comparaciones solo entre resultados compatibles', () => {
  test('25 m y 50 m de piscina NO se mezclan en una evolución', () => {
    const r = (fecha, valor, largo) => ({ fecha, valor, prueba_id: 7, unidad: 's', datos: { largo_piscina: largo } });
    assert.throws(() => M.evolucion([r('2026-01-01', 62, 25), r('2026-02-01', 63, 50)], 'LOWER_IS_BETTER'));
    assert.equal(M.compatibles(r('a', 1, 25), r('b', 2, 25)), true);
    assert.equal(M.compatibles(r('a', 1, 25), r('b', 2, 50)), false);
  });
});

describe('5. Tendencias: precisión estadística (Monte Carlo, 1000 deportistas por escenario)', () => {
  const al = rng(20261003);
  const normal = () => Math.sqrt(-2 * Math.log(al() || 1e-9)) * Math.cos(2 * Math.PI * al());
  function simular(cambio, ruido, mediciones = 6, semanas = 10, n = 1000) {
    const cuenta = { mejora: 0, empeora: 0, estable: 0, insuficiente: 0 };
    for (let i = 0; i < n; i += 1) {
      const base = 5 + al();
      const serie = Array.from({ length: mediciones }, (_, k) => ({
        fecha: new Date(Date.UTC(2026, 0, 1) + Math.round((k * semanas * 7) / (mediciones - 1)) * 86400000).toISOString().slice(0, 10),
        valor: base * (1 - (cambio * k) / (mediciones - 1)) * (1 + normal() * ruido),
      }));
      cuenta[M.tendencia(serie, 'LOWER_IS_BETTER').clasificacion] += 1;
    }
    return Object.fromEntries(Object.entries(cuenta).map(([k, v]) => [k, v / n]));
  }
  test('sin cambio real: falsos positivos ≤ 12 % (nivel de confianza 90 %)', () => {
    const r = simular(0, 0.015);
    REPORTE.falsos_positivos_ruido_1_5 = r.mejora + r.empeora;
    assert.ok(r.mejora + r.empeora <= 0.12, JSON.stringify(r));
    const r2 = simular(0, 0.01);
    REPORTE.falsos_positivos_ruido_1_0 = r2.mejora + r2.empeora;
  });
  test('mejora real del 5 % (ruido 1.5 %, 6 mediciones): detectada ≥ 70 %', () => {
    const r = simular(0.05, 0.015);
    REPORTE.sensibilidad_5pct = r.mejora;
    assert.ok(r.mejora >= 0.7, JSON.stringify(r));
    assert.ok(r.empeora <= 0.01, 'nunca se invierte el sentido');
  });
  test('mejora real del 3 %: se mide el poder estadístico (depende del ruido y del nº de mediciones)', () => {
    REPORTE.sensibilidad_3pct_6med_ruido_1_5 = simular(0.03, 0.015).mejora;
    REPORTE.sensibilidad_3pct_6med_ruido_1_0 = simular(0.03, 0.01).mejora;
    REPORTE.sensibilidad_3pct_10med_ruido_1_5 = simular(0.03, 0.015, 10).mejora;
    assert.ok(REPORTE.sensibilidad_3pct_10med_ruido_1_5 > REPORTE.sensibilidad_3pct_6med_ruido_1_5, 'más mediciones → más sensibilidad');
  });
  test('empeoramiento real del 4 % se detecta como "empeora", nunca como "mejora"', () => {
    const r = simular(-0.04, 0.015);
    REPORTE.deteccion_empeora_4pct = r.empeora;
    assert.ok(r.empeora >= 0.5 && r.mejora === 0, JSON.stringify(r));
  });
  test('con menos de 3 mediciones o menos de 7 días: DATOS INSUFICIENTES', () => {
    assert.equal(M.tendencia([{ fecha: '2026-01-01', valor: 5 }, { fecha: '2026-02-01', valor: 4.8 }], 'LOWER_IS_BETTER').clasificacion, 'insuficiente');
    assert.equal(M.tendencia(['2026-01-01', '2026-01-02', '2026-01-03'].map((fecha, i) => ({ fecha, valor: 5 - i * 0.1 })), 'LOWER_IS_BETTER').clasificacion, 'insuficiente');
  });
});

describe('6. Puntaje (scoring) con baremos', () => {
  test('normalización lineal y recortada a 0-100', () => {
    const b = { base: 6, excelente: 4 }; // 30 m: 6 s = 0 puntos, 4 s = 100
    assert.equal(M.normalizar(5, b), 50);
    assert.equal(M.normalizar(3.5, b), 100);
    assert.equal(M.normalizar(7, b), 0);
    assert.equal(M.normalizar(49, { base: 20, excelente: 65 }), 64.4);
  });
  test('compuesto ponderado con cobertura (no se inventan capacidades sin datos)', () => {
    const r = M.puntajeCompuesto({ velocidad: 80, resistencia: 60 }, { velocidad: 40, resistencia: 40, tecnica: 20 });
    assert.equal(r.total, 70);
    assert.equal(r.cobertura, 80);
    assert.equal(M.puntajeCompuesto({}, { velocidad: 1 }).total, null);
  });
});

describe('7. Natación', () => {
  test('ritmo, velocidad y eficiencia de brazada', () => {
    assert.equal(M.ritmoPor(200, 150, 100), 75);
    cerca(M.velocidadMs(100, 62.5), 1.6, 1e-9, 'velocidad');
    assert.equal(M.distanciaPorBrazada(50, 20), 2.5);
    assert.equal(M.frecuenciaBrazada(40, 60), 40);
  });
  test('parciales coherentes / incoherentes', () => {
    assert.deepEqual(M.validarParciales([{ m: 50, t: 31 }, { m: 100, t: 64.32 }], 100, 64.32), []);
    assert.ok(M.validarParciales([{ m: 50, t: 40 }, { m: 100, t: 60 }], 100, 65.3).length > 0);
    assert.ok(M.validarParciales([{ m: 50, t: 40 }, { m: 25, t: 50 }], 100, 65).length > 0);
    assert.deepEqual(M.tramos([{ m: 50, t: 31 }, { m: 100, t: 64.32 }]).map((t) => t.tiempo), [31, 33.32]);
  });
});

describe('8. Cronometraje con dos dispositivos', () => {
  test('desfase de reloj estimado y duración corregida dentro de la incertidumbre', () => {
    // Reloj del teléfono A adelantado 350 ms, ida y vuelta 80 ms; teléfono B atrasado 1200 ms, ida y vuelta 120 ms
    const servidorEn = (local, desfase) => local + desfase;
    const muestra = (desfaseReal, ida) => {
      const envio = 1_000_000;
      return { envio, servidor: servidorEn(envio + ida / 2, desfaseReal), recepcion: envio + ida };
    };
    const a = M.estimarDesfase([muestra(-350, 80), muestra(-350, 140)]);
    const b = M.estimarDesfase([muestra(1200, 120)]);
    cerca(a.desfase_ms, -350, a.incertidumbre_ms, 'desfase A');
    cerca(b.desfase_ms, 1200, b.incertidumbre_ms, 'desfase B');
    // Salida real en t=0 del servidor, llegada real 10.000 s después
    const salida = { marca_ms: 0 + 350, desfase_ms: a.desfase_ms, incertidumbre_ms: a.incertidumbre_ms };
    const llegada = { marca_ms: 10000 - 1200, desfase_ms: b.desfase_ms, incertidumbre_ms: b.incertidumbre_ms };
    const d = M.duracionDosDispositivos(salida, llegada);
    cerca(d.segundos, 10, d.incertidumbre_ms / 1000, 'duración');
    REPORTE.crono_dos_dispositivos = { calculado_s: d.segundos, real_s: 10, incertidumbre_ms: d.incertidumbre_ms };
  });
});

describe('9. GPS', () => {
  test('1° de latitud ≈ 111.2 km (error < 0.1 %)', () => cerca(M.haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111195, 111, 'haversine'));
  test('vuelta de 400 m (círculo) medida con 200 puntos: error < 0.5 %', () => {
    const radio = 400 / (2 * Math.PI);
    const lat0 = -12.1;
    const mLat = 111195;
    const mLon = 111195 * Math.cos((lat0 * Math.PI) / 180);
    const puntos = Array.from({ length: 201 }, (_, i) => {
      const a = (2 * Math.PI * i) / 200;
      return { lat: lat0 + (radio * Math.sin(a)) / mLat, lon: -77 + (radio * Math.cos(a)) / mLon, t: 1_700_000_000_000 + i * 400 };
    });
    const r = M.resumenGps(puntos);
    REPORTE.gps_vuelta_400m = r.distancia_m;
    cerca(r.distancia_m, 400, 2, 'distancia');
    cerca(r.duracion_s, 80, 0.01, 'duración');
    assert.equal(r.derivado, true);
  });
});

describe('10. Edad y categoría', () => {
  test('edad exacta y categoría por rango', () => {
    assert.equal(M.edad('2012-10-04', new Date('2026-10-03T12:00:00Z')), 13);
    assert.equal(M.edad('2012-10-03', new Date('2026-10-03T12:00:00Z')), 14);
    const cats = [{ id: 1, edad_min: 12, edad_max: 13 }, { id: 2, edad_min: 14, edad_max: 15 }];
    assert.equal(M.categoriaPorEdad(cats, 14).id, 2);
  });
});

// ===========================================================================
// PARTE 2 — Extremo a extremo con PostgreSQL y la academia demo
// ===========================================================================
const URL_PRUEBAS = process.env.TEST_DATABASE_URL;

function cliente(base) {
  let cookie = '';
  return async (metodo, ruta, cuerpo, { cabeceras = {} } = {}) => {
    const headers = { 'X-Requested-With': 'fetch', ...cabeceras };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (Buffer.isBuffer(cuerpo)) body = cuerpo;
    else if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const inicio = performance.now();
    const r = await fetch(base + ruta, { method: metodo, headers, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, datos: tipo.includes('json') ? await r.json() : await r.text(), ms: performance.now() - inicio };
  };
}

test('PARTE 2: validación extremo a extremo con la academia demo', { skip: !URL_PRUEBAS && 'define TEST_DATABASE_URL', timeout: 300000 }, async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'videos-'));
  Object.assign(process.env, {
    DATABASE_URL: URL_PRUEBAS, DB_SSL: process.env.DB_SSL || 'false', JWT_SECRET: process.env.JWT_SECRET || 'clave-de-pruebas-suficientemente-larga-123',
    ALMACENAMIENTO_LOCAL: carpeta, CRON_SECRET: 'secreto-cron-pruebas', NODE_ENV: 'test',
  });
  const app = require('../src/app');
  const { pool } = require('../src/db/pool');
  const { crearDemo, DOMINIO, CLAVE_DEMO } = require('../src/demo/demo');
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));
  const servidor = app.listen(0);
  await new Promise((r) => { servidor.once('listening', r); });
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  try {
    // ---- Demo
    const demo = await crearDemo({ reiniciar: true });
    REPORTE.demo = { deportistas: demo.deportistas, resultados: demo.resultados, entrenamientos: demo.entrenamientos, alertas: demo.alertas, segundos: demo.duracion_ms / 1000 };
    await t.test('la demo cumple el mínimo pedido (≥30 deportistas, 3 deportes, 4 categorías, ≥3 coaches)', async () => {
      assert.ok(demo.deportistas >= 30);
      const [x] = await q(`SELECT (SELECT count(*) FROM deportes WHERE academia_id = $1)::int AS deportes, (SELECT count(*) FROM categorias WHERE academia_id = $1)::int AS cats,
        (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'coach')::int AS coaches,
        (SELECT count(*) FROM resultados WHERE academia_id = $1 AND fuente_medicion IS NULL)::int AS sin_fuente`, [demo.academia_id]);
      assert.deepEqual([x.deportes, x.cats, x.coaches >= 3, x.sin_fuente], [3, 4, true, 0]);
    });

    const entrar = async (alias) => {
      const c = cliente(base);
      const r = await c('POST', '/auth/login', { correo: `${alias}${DOMINIO}`, password: CLAVE_DEMO });
      assert.equal(r.status, 200, `login ${alias}`);
      return c;
    };
    const admin = await entrar('admin');
    const coachNat = await entrar('coach.natacion');
    const coachFut = await entrar('coach.futbol');
    const deportista = await entrar('deportista');
    const padre = await entrar('padre');
    const pruebas = (await admin('GET', '/metodologia/pruebas')).datos;
    const prueba = (clave) => pruebas.find((p) => p.clave === clave);
    const deps = (await admin('GET', '/deportistas')).datos.datos;
    const depsNat = (await coachNat('GET', '/deportistas')).datos.datos;
    const depsFut = (await coachFut('GET', '/deportistas')).datos.datos;

    await t.test('alcance del coach: solo ve a los deportistas de sus equipos', async () => {
      assert.equal(depsNat.length, 12);
      assert.equal(depsFut.length, 12);
      assert.ok(!depsNat.some((d) => depsFut.some((f) => f.id === d.id)));
      assert.equal((await coachNat('GET', `/rendimiento/deportistas/${depsFut[0].id}/evolucion`)).status, 404);
      assert.equal((await coachNat('POST', '/medicion/resultados', { deportista_id: depsFut[0].id, prueba_id: prueba('sprint_30m').id, valor: 4.5 })).status, 404);
    });

    await t.test('el deportista y el padre NO pueden registrar ni corregir resultados oficiales', async () => {
      const r1 = await deportista('POST', '/medicion/resultados', { deportista_id: deps[0].id, prueba_id: prueba('sprint_30m').id, valor: 3 });
      const [res] = await q('SELECT id FROM resultados WHERE academia_id = $1 LIMIT 1', [demo.academia_id]);
      const r2 = await padre('PUT', `/medicion/resultados/${res.id}`, { valor: 1, motivo: 'trampa' });
      const r3 = await deportista('DELETE', `/medicion/resultados/${res.id}?motivo=xx`);
      assert.deepEqual([r1.status, r2.status, r3.status], [403, 403, 403]);
    });

    // ---- Medición
    const nadador = depsNat[0];
    const p100 = prueba('nat_100_libre');
    const ses = (await coachNat('POST', '/medicion/sesiones', { nombre: 'Validación', modo: 'piscina', condiciones: { largo_piscina: 25 } })).datos;
    await t.test('registro: guarda la fuente, convierte 1:04.32, valida parciales y deriva ritmo y velocidad', async () => {
      const r = await coachNat('POST', '/medicion/resultados', {
        deportista_id: nadador.id, prueba_id: p100.id, sesion_id: ses.id, valor: '1:04.32', clave_idempotencia: 'val-1', datos: { brazadas: 64 },
        parciales: [{ m: 50, t: '31.10' }, { m: 100, t: '1:04.32' }],
      });
      assert.equal(r.status, 201, JSON.stringify(r.datos));
      cerca(r.datos.valor, 64.32, 1e-9, 'valor');
      assert.equal(r.datos.fuente_medicion, 'MANUAL');
      assert.equal(r.datos.datos.largo_piscina, 25);
      cerca(r.datos.datos.derivados.velocidad_ms, 100 / 64.32, 0.001, 'velocidad');
      assert.equal(r.datos.datos.derivados.ritmo_100m_s, 64.32);
      assert.equal(r.datos.datos.derivados.distancia_por_brazada_m, 1.56);
      const malo = await coachNat('POST', '/medicion/resultados', { deportista_id: nadador.id, prueba_id: p100.id, sesion_id: ses.id, valor: 65, parciales: [{ m: 50, t: 40 }, { m: 100, t: 60 }] });
      assert.equal(malo.status, 400);
    });
    await t.test('idempotencia: reenviar la misma captura no duplica', async () => {
      const r = await coachNat('POST', '/medicion/resultados', { deportista_id: nadador.id, prueba_id: p100.id, sesion_id: ses.id, valor: '1:04.32', clave_idempotencia: 'val-1' });
      assert.equal(r.status, 200);
      assert.equal(r.datos.duplicado, true);
      const lote = await coachNat('POST', '/medicion/resultados/lote', { resultados: [{ deportista_id: nadador.id, prueba_id: p100.id, sesion_id: ses.id, valor: '1:04.32', clave_idempotencia: 'val-1' }] });
      assert.equal(lote.datos.duplicados, 1);
      const [{ n }] = await q("SELECT count(*)::int AS n FROM resultados WHERE clave_idempotencia = 'val-1'");
      assert.equal(n, 1);
    });
    await t.test('una estimación por video NUNCA es oficial ni entra en rankings ni evolución', async () => {
      const r = await coachNat('POST', '/medicion/resultados', { deportista_id: nadador.id, prueba_id: p100.id, sesion_id: ses.id, valor: 40, fuente_medicion: 'VIDEO' });
      assert.equal(r.datos.oficial, false);
      const rank = (await coachNat('GET', `/rendimiento/ranking?prueba_id=${p100.id}`)).datos;
      assert.ok(!rank.filas.some((f) => f.valor === 40));
      const evo = (await coachNat('GET', `/rendimiento/deportistas/${nadador.id}/evolucion`)).datos;
      assert.ok(!evo.some((e) => e.serie.some((s) => s.valor === 40)));
    });
    await t.test('corrección auditada: conserva el valor anterior y el motivo', async () => {
      const [r] = await q("SELECT id FROM resultados WHERE clave_idempotencia = 'val-1'");
      const c = await coachNat('PUT', `/medicion/resultados/${r.id}`, { valor: '1:04.52', motivo: 'error de tipeo' });
      assert.equal(c.status, 200);
      const [fila] = await q('SELECT valor, datos FROM resultados WHERE id = $1', [r.id]);
      cerca(fila.valor, 64.52, 1e-9, 'valor corregido');
      assert.equal(fila.datos.correcciones[0].valor_anterior, 64.32);
      assert.equal(fila.datos.correcciones[0].motivo, 'error de tipeo');
    });
    await t.test('piscina de 50 m no se mezcla con 25 m en el ranking', async () => {
      const s50 = (await coachNat('POST', '/medicion/sesiones', { nombre: 'Larga', modo: 'piscina', condiciones: { largo_piscina: 50 } })).datos;
      await coachNat('POST', '/medicion/resultados', { deportista_id: nadador.id, prueba_id: p100.id, sesion_id: s50.id, valor: 50 });
      const rank = (await coachNat('GET', `/rendimiento/ranking?prueba_id=${p100.id}`)).datos;
      assert.ok(rank.contextos.length >= 2);
      const filas = rank.filas.map((f) => f.valor);
      assert.ok(!filas.includes(50), 'el resultado de 50 m no aparece en el ranking de 25 m');
      const solo50 = (await coachNat('GET', `/rendimiento/ranking?prueba_id=${p100.id}&contexto=${encodeURIComponent(`${p100.id}|s|50`)}`)).datos;
      assert.deepEqual(solo50.filas.map((f) => f.valor), [50]);
    });
    await t.test('ranking ordenado según la dirección (30 m ascendente, salto descendente)', async () => {
      const r30 = (await admin('GET', `/rendimiento/ranking?prueba_id=${prueba('sprint_30m').id}`)).datos.filas.map((f) => f.valor);
      const rs = (await admin('GET', `/rendimiento/ranking?prueba_id=${prueba('salto_vertical').id}`)).datos.filas.map((f) => f.valor);
      assert.deepEqual(r30, [...r30].sort((a, b) => a - b));
      assert.deepEqual(rs, [...rs].sort((a, b) => b - a));
    });
    await t.test('cronómetro de dos dispositivos crea un resultado PHONE con su incertidumbre', async () => {
      const c = (await coachNat('POST', '/medicion/cronometros', { deportista_id: nadador.id, prueba_id: prueba('nat_50_libre').id, sesion_id: ses.id })).datos;
      await coachNat('POST', `/medicion/cronometros/${c.codigo}/marca`, { tipo: 'salida', marca_ms: 5_000_000, desfase_ms: 200, incertidumbre_ms: 30 });
      const fin = (await coachNat('POST', `/medicion/cronometros/${c.codigo}/marca`, { tipo: 'llegada', marca_ms: 5_000_000 + 31_000 + 600, desfase_ms: -400, incertidumbre_ms: 25 })).datos;
      assert.equal(fin.resultado.valor, 31);
      assert.equal(fin.resultado.fuente_medicion, 'PHONE');
      assert.equal(fin.incertidumbre_ms, 55);
    });

    // ---- Scoring versionado
    await t.test('cambiar el scoring crea una versión nueva y NO altera los puntajes ya guardados', async () => {
      const dep = depsFut[1];
      const p1 = (await admin('GET', `/rendimiento/deportistas/${dep.id}/puntaje`)).datos;
      assert.equal(p1.disponible, true);
      const vigente = (await admin('GET', '/metodologia/scoring')).datos.find((s) => s.id === p1.scoring.id);
      const nueva = (await admin('PUT', `/metodologia/scoring/${vigente.id}`, { nombre: vigente.nombre, deporte_id: vigente.deporte_id, pesos: { velocidad: 100 }, baremos: vigente.baremos })).datos;
      assert.equal(nueva.version, vigente.version + 1);
      const p2 = (await admin('GET', `/rendimiento/deportistas/${dep.id}/puntaje`)).datos;
      assert.equal(p2.scoring.version, vigente.version + 1);
      assert.equal(p2.total, p1.capacidades.velocidad);
      const [antiguo] = await q('SELECT puntaje FROM snapshots_rendimiento WHERE deportista_id = $1 AND scoring_id = $2 AND fecha = CURRENT_DATE', [dep.id, vigente.id]);
      assert.equal(antiguo.puntaje, p1.total, 'el puntaje calculado con la versión anterior sigue igual');
      const hist = (await admin('GET', `/rendimiento/deportistas/${dep.id}/puntajes`)).datos;
      assert.ok(new Set(hist.map((h) => h.version)).size >= 2);
      REPORTE.scoring_versionado = { v1: p1.total, v2: p2.total };
    });
    await t.test('una prueba con resultados no cambia su protocolo (409)', async () => {
      const p = prueba('sprint_30m');
      assert.equal((await admin('PUT', `/metodologia/pruebas/${p.id}`, { distancia_m: 40 })).status, 409);
      assert.equal((await admin('PUT', `/metodologia/pruebas/${p.id}`, { baremo_base: 6.5, baremo_excelente: 4 })).status, 200);
    });
    await t.test('el coach no cambia la metodología sin permiso', async () => {
      assert.equal((await coachFut('PUT', `/metodologia/pruebas/${prueba('sprint_30m').id}`, { baremo_base: 9 })).status, 403);
      assert.equal((await coachFut('POST', '/metodologia/scoring', { nombre: 'x', pesos: { velocidad: 1 } })).status, 403);
    });

    // ---- Alertas
    await t.test('alertas: caída, fatiga repetida, dolor y baja asistencia detectadas en la demo; reevaluar no duplica', async () => {
      const tipos = (await q('SELECT tipo, count(*)::int AS n FROM alertas WHERE academia_id = $1 GROUP BY tipo', [demo.academia_id]))
        .reduce((o, r) => ({ ...o, [r.tipo]: r.n }), {});
      for (const tipo of ['caida_rendimiento', 'fatiga_repetida', 'dolor_reportado', 'baja_asistencia', 'record_personal']) assert.ok(tipos[tipo] > 0, `falta ${tipo}`);
      REPORTE.alertas_por_tipo = tipos;
      await admin('POST', '/inteligencia/alertas/evaluar');
      const r = (await admin('POST', '/inteligencia/alertas/evaluar')).datos;
      assert.equal(r.creadas, 0, 'volver a evaluar no duplica alertas');
      // Cada caída detectada corresponde a un deportista que en la simulación empeora en la última evaluación
      const caidas = await q(`SELECT DISTINCT d.codigo FROM alertas a JOIN deportistas d ON d.id = a.deportista_id WHERE a.academia_id = $1 AND a.tipo = 'caida_rendimiento'`, [demo.academia_id]);
      const esperados = new Set(Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => n % 9 === 4).map((n) => `SAD-${String(n).padStart(3, '0')}`));
      REPORTE.caidas = { detectadas: caidas.map((c) => c.codigo).sort(), simuladas: [...esperados].sort() };
      assert.ok(caidas.every((c) => esperados.has(c.codigo)), 'sin falsas alarmas de caída');
      assert.ok([...esperados].every((c) => caidas.some((x) => x.codigo === c)), 'todas las caídas simuladas detectadas');
    });
    await t.test('valor atípico (error de tipeo) no se toma como récord', async () => {
      const dep = depsFut[2];
      const r = (await coachFut('POST', '/medicion/resultados', { deportista_id: dep.id, prueba_id: prueba('sprint_10m').id, valor: 1.0 })).datos;
      assert.equal(r.lectura.atipico, true);
      assert.equal(r.lectura.record_personal, false);
      const alertas = await q("SELECT tipo, datos FROM alertas WHERE deportista_id = $1 AND (datos->>'valor')::float = 1", [dep.id]);
      const tipos = alertas.map((a) => a.tipo);
      assert.ok(tipos.includes('valor_atipico'), JSON.stringify(tipos));
      assert.ok(!tipos.includes('record_personal'));
    });

    // ---- IA
    await t.test('la IA no inventa: sin resultados → DATOS INSUFICIENTES', async () => {
      const nuevo = (await admin('POST', '/deportistas', { codigo: 'VAL-0', nombre: 'Sin Datos', coach_id: depsFut[0].usuario_id })).datos;
      const r = (await admin('POST', `/inteligencia/analisis/deportistas/${nuevo.id}/360`)).datos;
      assert.equal(r.suficiente, false);
      assert.ok(r.resumen.startsWith('DATOS INSUFICIENTES'));
      assert.equal(r.fortalezas.length + r.tendencias.length, 0);
      const [g] = await q('SELECT datos_usados, suficiente FROM analisis_ia WHERE id = $1', [r.id]);
      assert.equal(g.suficiente, false);
    });
    await t.test('análisis con datos: cada hallazgo trae su evidencia y las recomendaciones nacen pendientes', async () => {
      const caida = (await q(`SELECT deportista_id FROM alertas WHERE academia_id = $1 AND tipo = 'caida_rendimiento' LIMIT 1`, [demo.academia_id]))[0];
      const r = (await admin('POST', `/inteligencia/analisis/deportistas/${caida.deportista_id}/360`)).datos;
      assert.equal(r.suficiente, true);
      assert.ok([...r.fortalezas, ...r.riesgos, ...r.tendencias, ...r.debilidades].every((x) => x.evidencia));
      assert.ok(r.datos_usados.resultados_por_prueba.length > 0);
      const recs = (await admin('GET', `/inteligencia/recomendaciones?deportista_id=${caida.deportista_id}`)).datos;
      assert.ok(recs.every((x) => x.estado === 'pendiente'));
    });
    await t.test('recomendaciones: el deportista solo ve las aprobadas', async () => {
      const mateo = (await deportista('GET', '/portal/deportistas')).datos[0];
      await admin('POST', `/inteligencia/analisis/deportistas/${mateo.id}`);
      const recs = (await admin('GET', `/inteligencia/recomendaciones?deportista_id=${mateo.id}&estado=pendiente`)).datos;
      let vistas = (await deportista('GET', `/portal/deportistas/${mateo.id}/seguimiento`)).datos.recomendaciones;
      assert.equal(vistas.length, 0);
      if (recs.length) {
        await admin('PUT', `/inteligencia/recomendaciones/${recs[0].id}`, { estado: 'aprobada' });
        vistas = (await deportista('GET', `/portal/deportistas/${mateo.id}/seguimiento`)).datos.recomendaciones;
        assert.equal(vistas.length, 1);
      }
    });

    // ---- Objetivos
    await t.test('objetivo de rendimiento: progreso calculado y "alcanzado" al lograr la marca', async () => {
      const dep = depsFut[3];
      const o = (await coachFut('POST', '/objetivos', { tipo: 'rendimiento', deportista_id: dep.id, prueba_id: prueba('salto_vertical').id, descripcion: 'Saltar más', valor_objetivo: 80 })).datos;
      assert.equal(o.estado, 'activo');
      assert.ok(o.progreso < 100);
      await coachFut('POST', '/medicion/resultados', { deportista_id: dep.id, prueba_id: prueba('salto_vertical').id, valor: 30 });
      const sinCambio = (await coachFut('GET', `/objetivos/${o.id}`)).datos;
      assert.equal(sinCambio.estado, 'activo');
      await q('UPDATE objetivos SET valor_objetivo = 30 WHERE id = $1', [o.id]); // la marca de hoy (30) ya alcanza el objetivo
      const ok = (await coachFut('GET', `/objetivos/${o.id}`)).datos;
      assert.equal(ok.estado, 'alcanzado');
      assert.equal(ok.progreso, 100);
    });

    // ---- Multi-academia
    await t.test('aislamiento total entre academias en las tablas nuevas', async () => {
      const bcrypt = require('bcryptjs');
      const [{ id: acad }] = await q("INSERT INTO academias (nombre, slug) VALUES ('Otra', 'otra-val-' || floor(random()*1e9)::text) RETURNING id");
      await q('INSERT INTO academia_config (academia_id) VALUES ($1)', [acad]);
      await q("INSERT INTO suscripciones (academia_id, plan_id) SELECT $1, id FROM planes WHERE clave = 'ENTERPRISE'", [acad]);
      const [{ id: u }] = await q("INSERT INTO usuarios (nombre, correo, password_hash) VALUES ('Intruso', 'intruso-' || floor(random()*1e9)::text || '@x.pe', $1) RETURNING id", [await bcrypt.hash('clave123', 10)]);
      await q("INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')", [u, acad]);
      const [{ correo }] = await q('SELECT correo FROM usuarios WHERE id = $1', [u]);
      const intruso = cliente(base);
      await intruso('POST', '/auth/login', { correo, password: 'clave123' });
      const [res] = await q('SELECT id FROM resultados WHERE academia_id = $1 LIMIT 1', [demo.academia_id]);
      const [sesion] = await q('SELECT id FROM sesiones_evaluacion WHERE academia_id = $1 LIMIT 1', [demo.academia_id]);
      const [ent] = await q('SELECT id FROM sesiones_entrenamiento WHERE academia_id = $1 LIMIT 1', [demo.academia_id]);
      const checks = await Promise.all([
        intruso('GET', '/medicion/resultados'), intruso('GET', `/medicion/sesiones/${sesion.id}`), intruso('PUT', `/medicion/resultados/${res.id}`, { valor: 1, motivo: 'xxx' }),
        intruso('GET', `/entrenamientos/sesiones/${ent.id}`), intruso('GET', '/inteligencia/alertas'), intruso('GET', `/rendimiento/deportistas/${deps[0].id}/evolucion`),
        intruso('GET', `/rendimiento/ranking?prueba_id=${prueba('sprint_30m').id}`), intruso('GET', '/objetivos'), intruso('GET', '/recuperacion'), intruso('GET', '/comercial/pagos'),
        intruso('POST', `/inteligencia/analisis/deportistas/${deps[0].id}`), intruso('GET', `/nutricion/deportistas/${deps[0].id}`),
      ]);
      assert.equal(checks[0].datos.length, 0);
      assert.equal(checks[1].status, 404);
      assert.equal(checks[2].status, 404);
      assert.equal(checks[3].status, 404);
      assert.equal(checks[4].datos.length, 0);
      assert.equal(checks[5].status, 404);
      assert.equal(checks[6].datos.filas.length, 0);
      assert.equal(checks[7].datos.length, 0);
      assert.equal(checks[8].datos.length, 0);
      assert.equal(checks[9].datos.length, 0);
      assert.equal(checks[10].status, 404);
      assert.equal(checks[11].status, 404);
      REPORTE.aislamiento = `${checks.length} intentos de acceso cruzado bloqueados`;
    });

    // ---- Límites del plan
    await t.test('límites del plan: no se supera el máximo de deportistas', async () => {
      await q(`INSERT INTO planes (clave, nombre, limites, modulos) VALUES ('VAL', 'Validación', '{"deportistas": 1}', '["nutricion"]') ON CONFLICT (clave) DO UPDATE SET limites = EXCLUDED.limites`);
      const sup = await q('SELECT s.id FROM suscripciones s WHERE s.academia_id = $1 AND s.actual', [demo.academia_id]);
      await q("UPDATE suscripciones SET plan_id = (SELECT id FROM planes WHERE clave = 'VAL') WHERE id = $1", [sup[0].id]);
      const r = await admin('POST', '/deportistas', { codigo: 'VAL-9', nombre: 'Excede', coach_id: depsFut[0].usuario_id });
      const sinModulo = await admin('GET', '/videos');
      await q("UPDATE suscripciones SET plan_id = (SELECT id FROM planes WHERE clave = 'ENTERPRISE') WHERE id = $1", [sup[0].id]);
      assert.equal(r.status, 403);
      assert.match(r.datos.error, /plan/i);
      assert.equal(sinModulo.status, 403, 'un módulo fuera del plan queda desactivado');
    });

    // ---- Integraciones
    await t.test('API de dispositivos: clave válida guarda con fuente SENSOR; GPS deriva distancia; clave falsa 401', async () => {
      const disp = (await admin('POST', '/integraciones/dispositivos', { nombre: 'Fotocélula', tipo: 'fotocelula' })).datos;
      const enviar = (cuerpo, clave = disp.clave) => fetch(`${base}/integraciones/api/mediciones`, { method: 'POST', headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const r1 = await enviar({ deportista_codigo: 'SAD-001', prueba_clave: 'sprint_30m', valor: 4.7, clave_idempotencia: 'f1' });
      const j1 = await r1.json();
      assert.equal(r1.status, 201);
      assert.equal(j1.fuente, 'SENSOR');
      assert.equal((await enviar({ deportista_codigo: 'SAD-001', prueba_clave: 'sprint_30m', valor: 4.7, clave_idempotencia: 'f1' })).status, 200);
      const gps = Array.from({ length: 101 }, (_, i) => ({ lat: -12.1 + (i * 10) / 111195, lon: -77, t: 1_700_000_000_000 + i * 3000 }));
      const r2 = await (await enviar({ deportista_codigo: 'SAD-025', prueba_clave: 'cooper', gps })).json();
      cerca(r2.valor, 1000, 1, 'distancia GPS (1000 m reales)');
      assert.equal((await enviar({}, 'sk_dev_falsa')).status, 401);
    });

    // ---- Video + worker
    await t.test('video: subida privada, confirmación y análisis "ANÁLISIS NO DISPONIBLE" sin modelo (worker real)', async (tt) => {
      let mp4;
      try {
        const destino = path.join(carpeta, 'prueba.mp4');
        execFileSync('ffmpeg', ['-v', 'quiet', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25', '-pix_fmt', 'yuv420p', destino]);
        mp4 = fs.readFileSync(destino);
      } catch {
        tt.skip('ffmpeg no disponible');
        return;
      }
      const v = (await coachNat('POST', '/videos', { deportista_id: nadador.id, titulo: 'Viraje', mime: 'video/mp4', tamano_bytes: mp4.length, tipo_movimiento: 'viraje' })).datos;
      assert.equal((await coachNat('PUT', `/videos/${v.id}/archivo`, mp4, { cabeceras: { 'Content-Type': 'video/mp4' } })).status, 204);
      const conf = (await coachNat('POST', `/videos/${v.id}/confirmar`)).datos;
      assert.equal(conf.estado, 'PENDING');
      assert.equal((await coachFut('GET', `/videos/${v.id}`)).status, 404, 'otro coach no ve el video');
      try {
        execFileSync('python3', ['-c', `
import os, psycopg, worker
con = psycopg.connect(os.environ['DATABASE_URL'])
worker.latido(con); con.commit()
t = worker.tomar_trabajo(con); con.commit()
worker.procesar(con, t)`], { cwd: path.join(__dirname, '..', 'worker'), env: { ...process.env, DATABASE_URL: URL_PRUEBAS, ALMACENAMIENTO_LOCAL: carpeta } });
      } catch (error) {
        tt.skip(`worker de Python no disponible (${String(error.message).slice(0, 80)})`);
        return;
      }
      const fin = (await coachNat('GET', `/videos/${v.id}`)).datos;
      assert.equal(fin.estado, 'COMPLETED');
      assert.equal(fin.analisis.disponible, false);
      assert.match(fin.analisis.mensaje, /ANÁLISIS NO DISPONIBLE/);
      assert.equal(fin.analisis.medidos.archivo.duracion_s, 2);
      REPORTE.video = { mensaje: fin.analisis.mensaje, medidos: fin.analisis.medidos };
      const aud = await q("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'ver_video'");
      await coachNat('GET', `/videos/${v.id}/url`);
      const aud2 = await q("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'ver_video'");
      assert.equal(aud2[0].n, aud[0].n + 1, 'cada reproducción queda auditada');
    });

    // ---- Tareas programadas
    await t.test('tareas programadas: exigen CRON_SECRET', async () => {
      assert.equal((await fetch(`${base}/tareas/diarias`)).status, 401);
      const r = await fetch(`${base}/tareas/diarias`, { headers: { Authorization: 'Bearer secreto-cron-pruebas' } });
      assert.equal(r.status, 200);
    });

    // ---- Rendimiento a escala
    await t.test('tiempos de respuesta con la academia demo (local)', async () => {
      const medidas = {};
      for (const [n, ruta] of [['panel', '/rendimiento/panel'], ['ranking', `/rendimiento/ranking?prueba_id=${prueba('sprint_30m').id}`],
        ['evolucion', `/rendimiento/deportistas/${deps[0].id}/evolucion`], ['alertas', '/inteligencia/alertas'], ['asistencia', '/asistencia/estadisticas'],
        ['dashboard', '/dashboard'], ['resultados', '/medicion/resultados?limite=500']]) {
        const r = await admin('GET', ruta);
        assert.equal(r.status, 200, ruta);
        medidas[n] = Math.round(r.ms);
      }
      const analisis = await admin('POST', `/inteligencia/analisis/deportistas/${deps[0].id}/360`);
      medidas.analisis_360 = Math.round(analisis.ms);
      REPORTE.tiempos_ms = medidas;
      assert.ok(Object.values(medidas).every((ms) => ms < 3000), JSON.stringify(medidas));
    });
  } finally {
    servidor.close();
    await pool.end();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

after(() => {
  if (Object.keys(REPORTE).length) {
    const destino = process.env.REPORTE_VALIDACION;
    if (destino) fs.writeFileSync(destino, JSON.stringify(REPORTE, null, 2));
    console.log(`REPORTE_VALIDACION ${JSON.stringify(REPORTE)}`);
  }
});
