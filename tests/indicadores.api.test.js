/**
 * Indicadores (FASE 11) de punta a punta contra PostgreSQL con la academia demo: panel, permisos y alcance,
 * lesiones, cuestionarios, valoración de reportes, calidad GPS por la API de integraciones y aislamiento.
 * Solo se ejecuta con TEST_DATABASE_URL (¡una base de pruebas!).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;

function cliente(base) {
  let cookie = '';
  return async (metodo, ruta, cuerpo, { cabeceras = {} } = {}) => {
    const headers = { 'X-Requested-With': 'fetch', ...cabeceras };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(base + ruta, { method: metodo, headers, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, datos, tipo, cabeceras: r.headers };
  };
}

test('FASE 11: indicadores de evaluación con la academia demo', { skip: !URL_PRUEBAS && 'define TEST_DATABASE_URL', timeout: 300000 }, async (t) => {
  Object.assign(process.env, {
    DATABASE_URL: URL_PRUEBAS, DB_SSL: process.env.DB_SSL || 'false', JWT_SECRET: process.env.JWT_SECRET || 'clave-de-pruebas-suficientemente-larga-123', NODE_ENV: 'test',
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
    const demo = await crearDemo({ reiniciar: true });
    await q('DELETE FROM intentos_login');
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

    let panel;
    await t.test('panel: los seis indicadores con datos de la demo', async () => {
      const r = await admin('GET', '/indicadores');
      assert.equal(r.status, 200, JSON.stringify(r.datos));
      panel = r.datos;
      assert.deepEqual(panel.indicadores.map((i) => i.clave), ['rastreo', 'usabilidad', 'reportes', 'lesiones', 'carga', 'aceptacion']);
      assert.ok(panel.indicadores.every((i) => i.valor !== null), JSON.stringify(panel.indicadores.map((i) => [i.clave, i.valor])));
      assert.equal(panel.periodo.dias, 90);
    });

    await t.test('carga: ACWR para los 36 deportistas y pico en el equipo de fútbol (que genera alerta)', async () => {
      assert.equal(panel.carga.resumen.deportistas, 36);
      assert.equal(panel.carga.resumen.con_acwr, 36);
      const futbol = (await coachFut('GET', '/indicadores')).datos.carga;
      // Pico de carga en casi todo el equipo (quien faltó a los entrenamientos del torneo puede quedar por debajo)
      const altos = futbol.deportistas.filter((d) => d.acwr > 1.3).length;
      assert.ok(altos >= 8 && futbol.resumen.zonas.riesgo >= 6, JSON.stringify(futbol.deportistas.map((d) => d.acwr)));
      const nat = (await coachNat('GET', '/indicadores')).datos.carga;
      assert.equal(nat.deportistas.length, 12);
      assert.ok(nat.resumen.pct_optima >= 50, `natación en zona óptima: ${nat.resumen.pct_optima}`);
      const [{ n }] = await q("SELECT count(*)::int AS n FROM alertas WHERE academia_id = $1 AND tipo = 'carga_acwr'", [demo.academia_id]);
      assert.ok(n >= 6, `alertas de carga: ${n}`);
      assert.ok(panel.carga.semanal.length >= 12);
    });

    await t.test('lesiones: 3 en el periodo y 6 en el anterior con la misma exposición → incidencia menor (efectiva)', async () => {
      const l = panel.lesiones;
      assert.equal(l.actual.lesiones, 3);
      assert.equal(l.anterior.lesiones, 6);
      assert.ok(l.actual.horas > 1000 && l.anterior.horas > 1000);
      assert.ok(l.actual.tasa < l.anterior.tasa);
      assert.equal(l.efectiva, true);
      assert.equal(l.lesionados_ahora, 1);
      // El coach de natación solo ve lesiones de sus deportistas
      const nat = (await coachNat('GET', '/indicadores')).datos.lesiones;
      assert.equal(nat.actual.lesiones, 0);
      assert.equal(nat.anterior.lesiones, 1);
    });

    await t.test('rastreo: 36 carreras GPS evaluadas, con algunas de mala señal detectadas', async () => {
      const r = panel.rastreo;
      assert.equal(r.evaluadas, 36);
      assert.ok(r.pct_aceptables > 60 && r.pct_aceptables < 100, `aceptables ${r.pct_aceptables}`);
      assert.ok(r.saltos_imposibles > 0);
      assert.ok(r.error_distancia_medio_pct !== null);
      assert.ok(r.lista.some((x) => !x.aceptable) && r.lista.some((x) => x.aceptable));
    });

    await t.test('cuestionarios: 7 respuestas SUS y TAM con alfa de Cronbach; cada persona cuenta una vez', async () => {
      assert.equal(panel.usabilidad.n, 7);
      assert.equal(panel.aceptacion.n, 7);
      assert.ok(panel.usabilidad.alfa_cronbach !== null);
      assert.equal(panel.aceptacion.constructos.length, 3);
      assert.equal(panel.aceptacion.uso.miembros, 7);
    });

    await t.test('el deportista responde los cuestionarios pero no ve el panel', async () => {
      assert.equal((await deportista('GET', '/indicadores')).status, 403);
      const cat = await deportista('GET', '/encuestas');
      assert.equal(cat.status, 200);
      assert.equal(cat.datos.catalogo.SUS.items.length, 10);
      assert.equal((await deportista('POST', '/encuestas/SUS', { respuestas: [3, 3, 3] })).status, 400);
      const ok = await deportista('POST', '/encuestas/SUS', { respuestas: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], comentario: 'Muy claro' });
      assert.equal(ok.status, 201, JSON.stringify(ok.datos));
      assert.equal(ok.datos.puntaje, 100);
      assert.equal((await deportista('POST', '/encuestas/SUS', { respuestas: Array(10).fill(3) })).status, 409);
      assert.equal((await deportista('POST', '/encuestas/XYZ', { respuestas: [] })).status, 404);
      // La nueva respuesta reemplaza la anterior del deportista: siguen siendo 7 personas
      assert.equal((await admin('GET', '/indicadores')).datos.usabilidad.n, 7);
      assert.equal((await deportista('POST', '/lesiones', { deportista_id: 1, fecha_inicio: '2026-01-01', zona: 'x' })).status, 403);
    });

    await t.test('lesiones: alta, alcance del coach y validaciones', async () => {
      const depsNat = (await coachNat('GET', '/deportistas')).datos.datos;
      const depsFut = (await coachFut('GET', '/deportistas')).datos.datos;
      const hoy = new Date().toISOString().slice(0, 10);
      const ajena = await coachNat('POST', '/lesiones', { deportista_id: depsFut[0].id, fecha_inicio: hoy, zona: 'Rodilla' });
      assert.equal(ajena.status, 404);
      const futura = await coachNat('POST', '/lesiones', { deportista_id: depsNat[0].id, fecha_inicio: '2099-01-01', zona: 'Rodilla' });
      assert.equal(futura.status, 400);
      const mala = await coachNat('POST', '/lesiones', { deportista_id: depsNat[0].id, fecha_inicio: hoy, zona: 'Rodilla', tipo: 'inventada' });
      assert.equal(mala.status, 400);
      const hace10 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      const nueva = await coachNat('POST', '/lesiones', { deportista_id: depsNat[0].id, fecha_inicio: hace10, zona: 'Hombro', tipo: 'tendinosa', mecanismo: 'sobreuso' });
      assert.equal(nueva.status, 201, JSON.stringify(nueva.datos));
      assert.equal(nueva.datos.en_curso, true);
      const alta = await coachNat('PUT', `/lesiones/${nueva.datos.id}`, { fecha_alta: hoy });
      assert.equal(alta.status, 200);
      assert.equal(alta.datos.dias_baja, 10);
      assert.equal(alta.datos.gravedad, 'moderada');
      assert.equal((await coachFut('GET', `/lesiones/${nueva.datos.id}`)).status, 404);
      assert.equal((await coachNat('DELETE', `/lesiones/${nueva.datos.id}`)).status, 204);
    });

    await t.test('reportes: se registra cada descarga y solo quien la generó puede valorarla', async () => {
      const r = await admin('GET', '/reportes/general/pdf');
      assert.equal(r.status, 200);
      const id = r.cabeceras.get('x-reporte-id');
      assert.ok(id);
      assert.equal((await coachFut('PUT', `/reportes/uso/${id}/valoracion`, { utilidad: 1 })).status, 404);
      assert.equal((await admin('PUT', `/reportes/uso/${id}/valoracion`, { utilidad: 9 })).status, 400);
      const v = await admin('PUT', `/reportes/uso/${id}/valoracion`, { utilidad: 5, apoyo_decision: true, comentario: 'Útil para la reunión' });
      assert.equal(v.status, 200);
      const [fila] = await q('SELECT exito, utilidad, apoyo_decision FROM reportes_uso WHERE id = $1', [id]);
      assert.deepEqual(fila, { exito: true, utilidad: 5, apoyo_decision: true });
      const fallido = await admin('GET', '/reportes/inexistente/pdf');
      assert.ok(fallido.status >= 400);
      const [{ n }] = await q('SELECT count(*)::int AS n FROM reportes_uso WHERE academia_id = $1 AND NOT exito AND tipo = $2', [demo.academia_id, 'inexistente']);
      assert.equal(n, 1);
    });

    await t.test('GPS por la API de integraciones: la calidad se calcula al recibir la trayectoria', async () => {
      const disp = await admin('POST', '/integraciones/dispositivos', { nombre: 'Reloj de prueba', tipo: 'gps' });
      assert.equal(disp.status, 201, JSON.stringify(disp.datos));
      const centro = { lat: -12.0675, lon: -77.0336 };
      const radio = 400 / (2 * Math.PI);
      const puntos = Array.from({ length: 76 }, (_, i) => {
        const a = (2 * Math.PI * i) / 75;
        return { lat: centro.lat + (radio * Math.sin(a)) / 111320, lon: centro.lon + (radio * Math.cos(a)) / (111320 * Math.cos((centro.lat * Math.PI) / 180)), t: 1.75e12 + i * 1000, acc: 2.5 };
      });
      const depsAtl = (await admin('GET', '/deportistas?por_pagina=100')).datos.datos.filter((d) => d.codigo);
      const r = await fetch(`${base}/integraciones/api/mediciones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${disp.datos.clave}` },
        body: JSON.stringify({ deportista_id: depsAtl.at(-1).id, prueba_clave: 'atl_400m', gps: puntos }),
      });
      const cuerpo = await r.json();
      assert.equal(r.status, 201, JSON.stringify(cuerpo));
      const [res] = await q("SELECT datos->'gps'->'calidad' AS c FROM resultados WHERE id = $1", [cuerpo.id]);
      assert.equal(res.c.aceptable, true);
      assert.equal(res.c.distancia_referencia_m, 400);
      assert.ok(res.c.error_distancia_pct < 1);
      assert.ok(res.c.procesamiento_ms >= 0);
    });

    await t.test('exportación a Excel y aislamiento entre academias', async () => {
      const x = await admin('GET', '/indicadores/exportar?desde=2026-01-01');
      assert.equal(x.status, 200);
      assert.ok(x.tipo.includes('spreadsheet'));
      assert.equal((await admin('GET', '/indicadores?desde=2026-05-01&hasta=2026-01-01')).status, 400);
      // Otra academia no ve nada de la demo
      const bcrypt = require('bcryptjs');
      const [{ id: otra }] = await q("INSERT INTO academias (nombre, slug) VALUES ('Otra', 'otra-' || floor(random() * 1e9)::text) RETURNING id");
      await q('INSERT INTO academia_config (academia_id) VALUES ($1)', [otra]);
      const [{ id: u }] = await q("INSERT INTO usuarios (nombre, correo, password_hash, debe_cambiar_clave) VALUES ('Intruso', 'intruso' || floor(random() * 1e9)::text || '@x.test', $1, false) RETURNING id, correo",
        [await bcrypt.hash('Intruso123!', 10)]);
      await q("INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')", [u, otra]);
      const [{ correo }] = await q('SELECT correo FROM usuarios WHERE id = $1', [u]);
      const intruso = cliente(base);
      assert.equal((await intruso('POST', '/auth/login', { correo, password: 'Intruso123!' })).status, 200);
      const [lesion] = await q('SELECT id FROM lesiones WHERE academia_id = $1 LIMIT 1', [demo.academia_id]);
      assert.equal((await intruso('GET', `/lesiones/${lesion.id}`)).status, 404);
      assert.equal((await intruso('PUT', `/lesiones/${lesion.id}`, { fecha_alta: null })).status, 404);
      const otroPanel = (await intruso('GET', '/indicadores')).datos;
      assert.equal(otroPanel.carga.resumen.deportistas, 0);
      assert.equal(otroPanel.usabilidad.n, 0);
      assert.equal(otroPanel.reportes.generados, 0);
      assert.equal(otroPanel.lesiones.actual.lesiones, 0);
      const [uso] = await q('SELECT id FROM reportes_uso WHERE academia_id = $1 AND exito LIMIT 1', [demo.academia_id]);
      assert.equal((await intruso('PUT', `/reportes/uso/${uso.id}/valoracion`, { utilidad: 1 })).status, 404);
    });
  } finally {
    servidor.close();
    await pool.end();
  }
});
