/**
 * Prueba de integración de punta a punta contra una base PostgreSQL real.
 * Se ejecuta solo si defines TEST_DATABASE_URL (¡usa una base de pruebas, no la de producción!):
 *   TEST_DATABASE_URL=postgresql://usuario:clave@localhost:5432/pruebas npm test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
let base = '';

const ok = (condicion, mensaje, extra) =>
  assert.ok(condicion, `${mensaje}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ''}`);

function cliente() {
  let cookie = '';
  return async (metodo, ruta, cuerpo, { csrf = true, form, coach } = {}) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (coach) headers['X-Coach'] = String(coach);
    if (csrf) headers['X-Requested-With'] = 'fetch';
    let body;
    if (form) body = form; else if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(base + ruta, { method: metodo, headers, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, datos, tipo, disp: r.headers.get('content-disposition') };
  };
}

async function excelDePrueba() {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet('Datos');
  h.addRow(['Código', 'Nombres', 'Edad', 'Categoría', 'Deporte', 'Fecha de Evaluación', 'Velocidad', 'Resistencia', 'Fuerza', 'Agilidad', 'Coordinación', 'Técnica', 'Disciplina Puntaje', 'Asistencia %', 'Comentarios', 'Columna rara']);
  const deps = [['A-1', 'Ana Ruiz', 15, 'Sub-16', 'Fútbol'], ['A-2', 'Beto Soto', 14, 'Sub-15', 'Karate'], ['A-3', 'Cira Luna', 16, 'Sub-17', 'Vóley'], ['A-4', 'Dani Paz', 15, 'Sub-16', 'Ajedrez']];
  const fechas = [new Date(Date.UTC(2026, 2, 5)), '12/04/2026', '2026-05-20', '15/06/2026', '20/07/2026'];
  deps.forEach(([c, n, e, cat, dis], i) => fechas.forEach((f, k) => {
    const base = [85, 40, 65, 55][i] + (i === 1 ? -k * 3 : k * 2);
    const v = (d) => Math.max(0, Math.min(100, base + d));
    h.addRow([c, n, e, cat, dis, f, v(3), v(-2), v(1), v(4), v(-3), v(2), v(5), k === 2 && i === 3 ? null : v(0), 'obs ' + k, 'x']);
  }));
  h.addRow(['', 'Sin código', 15]);
  h.addRow(['A-9', 'Malo', 200, '', '', '31/02/2026', 'abc', 150]);
  h.addRow([]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

test('flujo completo de la API', { skip: !URL_PRUEBAS && 'define TEST_DATABASE_URL para ejecutarla', timeout: 120000 }, async () => {
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.DB_SSL = process.env.DB_SSL || 'false';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'clave-de-pruebas-suficientemente-larga-123';
  const app = require('../src/app');
  const { pool } = require('../src/db/pool');
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8'));
  const servidor = app.listen(0);
  await new Promise((resolve) => { servidor.once('listening', resolve); });
  base = `http://127.0.0.1:${servidor.address().port}/api`;

  try {
    const api = cliente();
    const otro = cliente();
    const admin = cliente();
    const sello = Date.now();
    const correo = `coach${sello}@test.pe`;
    const correoAdmin = `admin${sello}@test.pe`;
    const correoOtro = `otro${sello}@t.pe`;

    // Super admin + primera academia (en producción se crea con sql/crear_admin.sql)
    const bcrypt = require('bcryptjs');
    const { rows: [{ id: superId }] } = await pool.query(
      "INSERT INTO usuarios (nombre, correo, password_hash, es_super_admin) VALUES ('Admin', $1, $2, true) RETURNING id",
      [correoAdmin, await bcrypt.hash('admin123', 10)],
    );
    const { rows: [{ id: academiaA }] } = await pool.query(
      "INSERT INTO academias (nombre, slug) VALUES ('Academia Sur', $1) RETURNING id", [`sur-${sello}`],
    );
    await pool.query('INSERT INTO academia_config (academia_id) VALUES ($1)', [academiaA]);
    await pool.query("INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')", [superId, academiaA]);

    let r = await api('POST', '/auth/registro', { nombre: 'X', correo, password: 'secreto1' });
    ok([401, 404].includes(r.status), 'no existe registro público', r.status);
    r = await admin('POST', '/auth/login', { correo: correoAdmin.toUpperCase(), password: 'admin123' });
    ok(r.status === 200 && r.datos.rol === 'admin' && r.datos.academia.id === academiaA && r.datos.es_super_admin, 'login de administrador', r.datos);
    ok(r.datos.permisos.includes('permisos.configurar') && r.datos.academia.modulos.nutricion === true, 'sesión trae permisos y módulos', r.datos);

    // El administrador crea las cuentas de los coaches
    r = await admin('POST', '/admin/usuarios', { nombre: 'Coach Test', correo, password: 'temporal1' });
    ok(r.status === 201 && r.datos.rol === 'coach' && r.datos.debe_cambiar_clave && r.datos.clave_temporal === 'temporal1', 'admin crea coach', r.datos);
    const coachId = r.datos.id;
    r = await admin('POST', '/admin/usuarios', { nombre: 'X', correo, password: 'secreto1' });
    ok(r.status === 409, 'correo duplicado → 409', r);
    r = await admin('POST', '/admin/usuarios', { nombre: 'X', correo: 'malo', password: '1' });
    ok(r.status === 400, 'cuenta inválida → 400', r.datos);
    r = await admin('POST', '/admin/usuarios', { nombre: 'Otro Coach', correo: correoOtro });
    ok(r.status === 201 && r.datos.clave_temporal.length === 10, 'clave temporal generada', r.datos);
    const otroId = r.datos.id;
    const claveOtro = r.datos.clave_temporal;

    r = await api('POST', '/auth/login', { correo, password: 'temporal1' });
    ok(r.status === 200 && r.datos.debe_cambiar_clave === true, 'coach entra y debe cambiar su clave', r.datos);
    r = await api('PUT', '/cuenta/password', { actual: 'temporal1', nueva: 'temporal1', confirmar: 'temporal1' });
    ok(r.status === 400, 'la clave nueva debe ser distinta', r.datos);
    r = await api('PUT', '/cuenta/password', { actual: 'temporal1', nueva: 'secreto1', confirmar: 'secreto1' });
    ok(r.status === 204, 'coach cambia su contraseña');
    r = await api('GET', '/auth/sesion');
    ok(r.status === 200 && r.datos.nombre === 'Coach Test' && r.datos.debe_cambiar_clave === false, 'sesión activa', r.datos);
    r = await api('GET', '/admin/usuarios');
    ok(r.status === 403, 'coach no entra al panel de administración', r.status);
    r = await api('POST', '/deportistas', { codigo: 'X', nombre: 'Y' }, { csrf: false });
    ok(r.status === 403, 'CSRF: POST sin cabecera → 403', r.datos);
    r = await otro('GET', '/dashboard');
    ok(r.status === 401, 'sin sesión → 401', r.datos);

    // Deportistas
    r = await api('POST', '/deportistas', { codigo: 'D-1', nombre: 'Pedro Gómez', edad: '15', categoria: 'Sub-16', disciplina: 'Ciclismo' });
    ok(r.status === 201 && r.datos.edad === 15, 'crear deportista', r.datos);
    const d1 = r.datos.id;
    r = await api('POST', '/deportistas', { codigo: 'D-1', nombre: 'Otro' });
    ok(r.status === 409, 'código duplicado → 409', r.datos);
    r = await api('POST', '/deportistas', { codigo: 'D-2', nombre: '', edad: 2 });
    ok(r.status === 400 && r.datos.detalles.length === 2, 'validación deportista', r.datos);
    r = await api('PUT', `/deportistas/${d1}`, { nombre: 'Pedro Gómez R.', edad: 16, categoria: 'Sub-17', disciplina: 'Ciclismo' });
    ok(r.status === 200 && r.datos.nombre === 'Pedro Gómez R.' && r.datos.codigo === 'D-1', 'editar deportista', r.datos);

    // Evaluaciones
    r = await api('POST', '/evaluaciones', { deportista_id: d1, fecha: '01/03/2026', velocidad: '70', resistencia: 40, fuerza: '60,5', agilidad: 80, coordinacion: 75, tecnica: 50, disciplina_score: 90, asistencia: 95, observaciones: 'primera' });
    ok(r.status === 201 && r.datos.puntuacion_general === 70.1 && r.datos.fecha === '2026-03-01', 'crear evaluación calcula puntuación', r.datos);
    const e1 = r.datos.id;
    r = await api('POST', '/evaluaciones', { deportista_id: d1, velocidad: 120 });
    ok(r.status === 400, 'evaluación fuera de rango → 400', r.datos);
    r = await api('PUT', `/evaluaciones/${e1}`, { velocidad: 72, resistencia: 42, fuerza: 60, agilidad: 80, coordinacion: 75, tecnica: 50, disciplina_score: 90, asistencia: 95 });
    ok(r.status === 200 && r.datos.fecha === '2026-03-01' && r.datos.velocidad === 72, 'editar evaluación conserva fecha', r.datos);
    r = await api('POST', '/evaluaciones', { deportista_id: d1, fecha: '2026-04-01', velocidad: 60, resistencia: 30 });
    const e2 = r.datos.id;
    r = await api('DELETE', `/evaluaciones/${e2}`);
    ok(r.status === 204, 'baja lógica de evaluación');
    r = await api('GET', `/evaluaciones/${e2}`);
    ok(r.status === 404, 'evaluación dada de baja no se ve');

    // Alimentación
    r = await api('POST', '/alimentacion', { deportista_id: d1, fecha: '2026-03-02', desayuno: 'Avena', hidratacion_litros: '2,5', horas_sueno: 8 });
    ok(r.status === 201 && r.datos.hidratacion_litros === 2.5, 'crear alimentación', r.datos);
    const a1 = r.datos.id;
    r = await api('POST', '/alimentacion', { deportista_id: d1, hidratacion_litros: 30 });
    ok(r.status === 400, 'alimentación inválida → 400', r.datos);
    r = await api('PUT', `/alimentacion/${a1}`, { desayuno: 'Pan', hidratacion_litros: 3 });
    ok(r.status === 200 && r.datos.fecha === '2026-03-02' && r.datos.desayuno === 'Pan', 'editar alimentación', r.datos);

    r = await api('POST', '/ml/predecir');
    ok(r.status === 400, 'predecir sin modelo → 400', r.datos);
    r = await api('POST', '/ml/entrenar', { usar_demo: false });
    ok(r.status === 400, 'entrenar sin datos suficientes → 400', r.datos);
    r = await api('POST', '/ml/entrenar', { usar_demo: true });
    ok(r.status === 200 && r.datos.es_demo && r.datos.registros_reales === 1 && r.datos.total_registros === 151, 'entrenar con datos demo', r.datos);

    // Importación
    const form = new FormData();
    form.append('archivo', new Blob([await excelDePrueba()]), 'datos.xlsx');
    r = await api('POST', '/importacion/previsualizar', undefined, { form });
    ok(r.status === 200 && r.datos.filas_validas === 20 && r.datos.filas_con_error === 2, 'previsualizar Excel (20 válidas, 2 con error)', r.datos && { v: r.datos.filas_validas, e: r.datos.errores, x: r.datos.columnas_extra });
    ok(r.datos.columnas_extra?.includes('Columna rara'), 'detecta columnas extra', r.datos.columnas_extra);
    ok(r.datos.registros?.[0]?.fecha === '2026-03-05' && r.datos.registros[1].fecha === '2026-04-12', 'fechas de Excel (Date y texto)', r.datos.registros?.slice(0, 2));
    const registros = r.datos.registros;
    r = await api('POST', '/importacion/confirmar', { registros, baja_ausentes: false });
    ok(r.status === 201 && r.datos.nuevos === 4 && r.datos.evaluaciones === 20, 'confirmar importación', r.datos);
    r = await api('POST', '/importacion/confirmar', { registros: [{ codigo: 'Z', nombre: 'Z', velocidad: 999 }] });
    ok(r.status === 400, 'confirmar re-valida registros', r.datos);
    const form2 = new FormData();
    form2.append('archivo', new Blob([Buffer.from('no es excel')]), 'malo.xlsx');
    r = await api('POST', '/importacion/previsualizar', undefined, { form: form2 });
    ok(r.status === 400, 'archivo corrupto → 400', r.datos);
    r = await api('GET', '/importacion/plantilla');
    ok(r.status === 200 && r.datos.length > 1000, 'descargar plantilla');

    // Listados
    r = await api('GET', '/deportistas?q=ana');
    ok(r.status === 200 && r.datos.datos.length === 1 && r.datos.disciplinas.length >= 4, 'listar deportistas con filtro', r.datos);
    const ana = r.datos.datos[0];
    r = await api('GET', '/evaluaciones?orden=puntuacion_desc&categoria=Sub-16');
    ok(r.status === 200 && r.datos.length > 0 && r.datos.every((e) => e.categoria === 'Sub-16'), 'listar evaluaciones con filtros', r.datos.length);
    r = await api('GET', '/evaluaciones?q=beto&desde=2026-05-01');
    ok(r.status === 200 && r.datos.length === 3, 'filtro por texto y fecha', r.datos.length);

    // Dashboard
    r = await api('GET', '/dashboard');
    ok(r.status === 200 && r.datos.totales.deportistas === 5 && r.datos.totales.evaluaciones === 21, 'dashboard totales', r.datos.totales);
    ok(r.datos.alertas.some((a) => a.tipo === 'caida') && r.datos.alertas.some((a) => a.tipo === 'bajo'), 'alertas de caída y bajo', r.datos.alertas.map((a) => a.tipo));
    ok(r.datos.graficos.evolucion.fechas.length >= 5 && r.datos.graficos.niveles.Alto >= 1, 'series de gráficos', r.datos.graficos);

    // Perfil y rutina
    r = await api('GET', `/deportistas/${ana.id}/perfil`);
    ok(r.status === 200 && r.datos.evaluaciones.length === 5 && r.datos.evolucion.fechas.length === 5 && r.datos.evolucion_capacidades.length > 0, 'perfil completo', Object.keys(r.datos));
    r = await api('GET', `/deportistas/${d1}/perfil`);
    ok(r.status === 200 && r.datos.alimentacion.promedio_hidratacion === 3, 'perfil incluye alimentación', r.datos.alimentacion);
    r = await api('GET', `/deportistas/${d1}/rutina`);
    ok(r.status === 200 && r.datos.origen === 'categoria' && r.datos.enfoque === 'Deporte de resistencia', 'rutina por categoría (ciclismo)', r.datos);
    r = await api('GET', `/deportistas/${ana.id}/rutina`);
    ok(r.datos.origen === 'deporte' && r.datos.enfoque === 'Fútbol', 'rutina por deporte (fútbol)', r.datos.enfoque);
    r = await api('GET', `/deportistas/${ana.id}/rutina/pdf`);
    ok(r.status === 200 && r.tipo.includes('pdf') && r.datos.slice(0, 4).toString() === '%PDF', 'rutina en PDF', r.tipo);

    // ML
    r = await api('POST', '/ml/entrenar', { usar_demo: false });
    ok(r.status === 200 && !r.datos.es_demo && r.datos.registros_reales === 20, 'entrenar con datos reales', r.datos);
    r = await api('POST', '/ml/entrenar', { usar_demo: true });
    ok(r.status === 200 && !r.datos.es_demo && r.datos.exactitud_pct > 50, 'entrenar (demo no necesario)', r.datos && { e: r.datos.exactitud_pct, t: r.datos.total_registros, imp: r.datos.importancia_variables });
    r = await api('POST', '/ml/predecir');
    ok(r.status === 200 && r.datos.procesados === 5, 'predecir todos', r.datos);
    r = await api('GET', '/ml');
    ok(r.status === 200 && r.datos.info && r.datos.predicciones.length === 5, 'estado ML', r.datos && { p: r.datos.predicciones.length });

    // IA
    r = await api('POST', '/ia/analizar', { deportista_id: ana.id });
    ok(r.status === 200 && r.datos.texto.includes('ANÁLISIS DE ANA RUIZ') && r.datos.modo === 'local', 'análisis IA local', r.datos);
    r = await api('POST', '/ia/resumen');
    ok(r.status === 200 && r.datos.texto.includes('RESUMEN DE LA ACADEMIA'), 'resumen academia', r.datos);
    r = await api('POST', '/ia/automatico', { usar_demo: true });
    ok(r.status === 200 && r.datos.pasos.length === 4 && r.datos.pasos[0].detalle.includes('Se completaron 1 '), 'modo automático', r.datos.pasos);

    // Reportes
    r = await api('GET', '/reportes');
    ok(r.status === 200 && r.datos.ranking.filas[0][0] === 1 && r.datos.seguimiento.filas.length > 0, 'resumen de reportes', Object.keys(r.datos));
    for (const tipo of ['general', 'ranking', 'seguimiento', 'evolucion', 'estadisticas']) {
      for (const f of ['excel', 'pdf']) {
        r = await api('GET', `/reportes/${tipo}/${f}`);
        ok(r.status === 200 && r.datos.length > 500, `reporte ${tipo} ${f}`, r.status);
      }
    }
    r = await api('GET', `/reportes/individual/pdf?deportista_id=${ana.id}`);
    ok(r.status === 200 && r.tipo.includes('pdf'), 'reporte individual pdf');
    r = await api('GET', '/reportes/individual/excel');
    ok(r.status === 400, 'individual sin deportista → 400', r.datos);
    r = await api('GET', '/reportes/otro/pdf');
    ok(r.status === 400, 'tipo desconocido → 400', r.datos);

    // Aislamiento entre coaches
    r = await otro('POST', '/auth/login', { correo: correoOtro, password: claveOtro });
    ok(r.status === 200, 'otro coach entra con su clave temporal', r.datos);
    r = await otro('GET', `/deportistas/${ana.id}/perfil`);
    ok(r.status === 404, 'otro coach no ve deportistas ajenos', r.status);
    r = await otro('PUT', `/evaluaciones/${e1}`, { velocidad: 1 });
    ok(r.status === 404, 'otro coach no edita evaluaciones ajenas', r.status);
    r = await otro('POST', '/evaluaciones', { deportista_id: ana.id, velocidad: 50 });
    ok(r.status === 404, 'otro coach no crea evaluaciones ajenas', r.status);
    r = await otro('GET', '/dashboard');
    ok(r.datos.totales.deportistas === 0, 'dashboard del otro coach vacío', r.datos.totales);

    // El administrador ve y edita todo
    r = await admin('GET', '/deportistas');
    ok(r.status === 200 && r.datos.datos.some((d) => d.id === ana.id && d.coach === 'Coach Test'), 'admin ve deportistas de todos', r.datos.datos?.length);
    r = await admin('GET', '/deportistas', undefined, { coach: otroId });
    ok(r.datos.datos.length === 0, 'admin filtra por coach', r.datos.datos.length);
    r = await admin('PUT', `/evaluaciones/${e1}`, { deportista_id: ana.id, velocidad: 66 });
    ok(r.status === 200 && r.datos.velocidad === 66, 'admin edita evaluaciones de un coach', r.datos);
    r = await admin('POST', '/deportistas', { codigo: 'ADM-1', nombre: 'Sin coach' });
    ok(r.status === 400, 'admin viendo a todos debe elegir coach', r.datos);
    r = await admin('POST', '/deportistas', { codigo: 'ADM-1', nombre: 'Para otro', coach_id: otroId });
    ok(r.status === 201 && r.datos.usuario_id === otroId, 'admin crea deportista para un coach', r.datos);
    r = await otro('GET', '/dashboard');
    ok(r.datos.totales.deportistas === 1, 'el coach ve lo que le asignó el admin', r.datos.totales);
    r = await admin('GET', '/dashboard');
    ok(r.status === 200 && r.datos.totales.deportistas >= 6, 'dashboard global del admin', r.datos.totales);
    r = await admin('GET', '/ml');
    ok(r.status === 200, 'ML del admin con todos los coaches', r.datos);
    r = await admin('POST', '/importacion/confirmar', { registros: [] });
    ok(r.status === 400 && /elige primero un coach/i.test(r.datos.error), 'importar exige elegir coach', r.datos);
    r = await admin('GET', '/admin/resumen');
    ok(r.status === 200 && r.datos.coaches >= 2 && r.datos.deportistas >= 6, 'resumen global', r.datos);
    r = await admin('GET', '/admin/usuarios');
    ok(r.datos.find((u) => u.id === coachId)?.deportistas >= 5, 'lista de coaches con actividad', r.datos.find((u) => u.id === coachId));
    r = await admin('PUT', `/admin/usuarios/${coachId}`, { nombre: 'Coach Editado' });
    ok(r.status === 200 && r.datos.nombre === 'Coach Editado' && r.datos.correo === correo, 'admin edita un coach', r.datos);
    r = await api('GET', '/auth/sesion');
    ok(r.datos.nombre === 'Coach Editado', 'el cambio se aplica sin volver a entrar', r.datos);
    r = await admin('GET', '/auth/sesion');
    r = await admin('PUT', `/admin/usuarios/${r.datos.id}`, { rol: 'coach' });
    ok(r.status === 400, 'admin no puede quitarse su propio rol', r.datos);
    r = await admin('DELETE', `/admin/usuarios/${coachId}`);
    ok(r.status === 409, 'no se elimina un coach con deportistas', r.datos);

    // Desactivar y restablecer contraseña
    r = await admin('PUT', `/admin/usuarios/${otroId}`, { activo: false });
    ok(r.status === 200 && r.datos.activo === false, 'admin desactiva coach', r.datos);
    r = await otro('GET', '/dashboard');
    ok(r.status === 403, 'coach desactivado pierde el acceso al instante', r.status);
    r = await otro('POST', '/auth/login', { correo: correoOtro, password: claveOtro });
    ok(r.status === 403, 'coach desactivado no puede entrar', r.datos);
    await admin('PUT', `/admin/usuarios/${otroId}`, { activo: true });
    r = await admin('POST', `/admin/usuarios/${otroId}/password`, {});
    ok(r.status === 200 && r.datos.clave_temporal.length === 10, 'admin restablece contraseña', r.datos);
    r = await otro('POST', '/auth/login', { correo: correoOtro, password: r.datos.clave_temporal });
    ok(r.status === 200 && r.datos.debe_cambiar_clave, 'entra con la clave restablecida', r.datos);
    r = await admin('POST', `/admin/usuarios/${otroId}/transferir`, { destino_id: coachId });
    ok(r.status === 200 && r.datos.deportistas_transferidos === 1, 'transferir deportistas a otro coach', r.datos);
    r = await admin('DELETE', `/admin/usuarios/${otroId}`);
    ok(r.status === 204, 'eliminar coach sin deportistas', r.status);

    // =====================================================================
    // FASE 1 · Multi-academia, RBAC, configuración, portal y auditoría
    // =====================================================================
    const adminB = cliente();
    const coachB = cliente();
    const atleta = cliente();
    const padre = cliente();
    const correoAdminB = `adminb${sello}@t.pe`;
    const correoCoachB = `coachb${sello}@t.pe`;

    r = await api('GET', '/plataforma/academias');
    ok(r.status === 403, 'un coach no entra a la plataforma', r.status);
    r = await admin('POST', '/plataforma/academias', { nombre: 'Academia Norte', admin_nombre: 'Admin Norte', admin_correo: correoAdminB });
    ok(r.status === 201 && r.datos.clave_temporal.length === 10, 'super admin crea academia con su administrador', r.datos);
    const academiaB = r.datos.id;
    r = await adminB('POST', '/auth/login', { correo: correoAdminB, password: r.datos.clave_temporal });
    ok(r.status === 200 && r.datos.academia.id === academiaB && r.datos.rol === 'admin' && !r.datos.es_super_admin, 'admin B entra a su academia', r.datos);
    r = await adminB('GET', '/plataforma/academias');
    ok(r.status === 403, 'un admin de academia no es super admin', r.status);
    r = await adminB('POST', '/admin/usuarios', { nombre: 'Coach Norte', correo: correoCoachB, password: 'norte123' });
    const coachBId = r.datos.id;
    await coachB('POST', '/auth/login', { correo: correoCoachB, password: 'norte123' });
    r = await coachB('POST', '/deportistas', { codigo: 'D-1', nombre: 'Lucía Norte', disciplina: 'Natación' });
    ok(r.status === 201, 'el mismo código puede existir en otra academia', r.datos);
    const depB = r.datos.id;
    await coachB('POST', '/evaluaciones', { deportista_id: depB, fecha: '2026-05-01', velocidad: 70, resistencia: 80 });

    // Aislamiento total entre academias
    r = await coachB('GET', '/deportistas');
    ok(r.datos.datos.length === 1 && r.datos.datos[0].id === depB, 'coach B solo ve su academia', r.datos.datos.map((d) => d.nombre));
    r = await coachB('GET', `/deportistas/${ana.id}/perfil`);
    ok(r.status === 404, 'coach B no ve deportistas de A', r.status);
    r = await coachB('PUT', `/evaluaciones/${e1}`, { velocidad: 1 });
    ok(r.status === 404, 'coach B no edita evaluaciones de A', r.status);
    r = await adminB('GET', '/deportistas', undefined, { coach: coachId });
    ok(r.datos.datos.length === 0, 'admin B no puede mirar a un coach de A con X-Coach', r.datos.datos.length);
    r = await adminB('POST', '/deportistas', { codigo: 'X-9', nombre: 'Intruso', coach_id: coachId });
    ok(r.status === 400, 'admin B no asigna deportistas a un coach de A', r.datos);
    r = await adminB('PUT', `/admin/usuarios/${coachId}`, { nombre: 'Hackeado' });
    ok(r.status === 404, 'admin B no edita usuarios de A', r.status);
    r = await adminB('GET', '/admin/usuarios');
    ok(r.datos.length === 2 && r.datos.every((u) => [correoAdminB, correoCoachB].includes(u.correo)), 'admin B solo lista su academia', r.datos.map((u) => u.correo));
    r = await adminB('GET', '/dashboard');
    ok(r.datos.totales.deportistas === 1, 'dashboard de B solo cuenta B', r.datos.totales);
    r = await adminB('GET', '/reportes/general/excel');
    ok(r.status === 200, 'reporte de B', r.status);
    r = await adminB('GET', '/reportes');
    ok(r.datos.general.filas.length === 1 && r.datos.general.filas[0][1] === 'Lucía Norte', 'reportes de B sin datos de A', r.datos.general.filas);
    r = await admin('GET', '/deportistas');
    ok(!r.datos.datos.some((d) => d.id === depB), 'admin A no ve deportistas de B', r.datos.datos.length);
    r = await admin('GET', '/ml');
    ok(r.status === 200 && r.datos.predicciones.every((p) => p.deportista_id !== depB), 'ML de A sin datos de B');

    // Permisos configurables por academia
    r = await coachB('GET', '/academia/permisos');
    ok(r.status === 403, 'coach no configura permisos', r.status);
    r = await adminB('GET', '/academia/permisos');
    ok(r.status === 200 && r.datos.permisos.find((p) => p.clave === 'importacion.usar').valores.coach.permitido === true, 'matriz de permisos', r.datos.roles);
    r = await adminB('PUT', '/academia/permisos', { cambios: [{ rol: 'coach', permiso: 'usuarios.gestionar', permitido: true }] });
    ok(r.status === 400, 'no se conceden permisos de solo administrador', r.datos);
    r = await adminB('PUT', '/academia/permisos', { cambios: [{ rol: 'deportista', permiso: 'evaluaciones.gestionar', permitido: true }] });
    ok(r.status === 400, 'un deportista nunca puede modificar resultados', r.datos);
    r = await adminB('PUT', '/academia/permisos', { cambios: [{ rol: 'coach', permiso: 'importacion.usar', permitido: false }] });
    ok(r.status === 200, 'admin B quita un permiso al coach', r.datos);
    r = await coachB('POST', '/importacion/confirmar', { registros: [] });
    ok(r.status === 403, 'permiso retirado → 403', r.status);
    r = await coachB('GET', '/auth/sesion');
    ok(!r.datos.permisos.includes('importacion.usar') && r.datos.permisos.includes('deportistas.ver'), 'la sesión refleja el permiso retirado', r.datos.permisos);
    r = await api('GET', '/auth/sesion');
    ok(r.datos.permisos.includes('importacion.usar'), 'el cambio en B no afecta a A', r.datos.permisos);

    // Configuración y módulos
    r = await adminB('PUT', '/academia', { zona_horaria: 'Marte/Olympus' });
    ok(r.status === 400, 'zona horaria inválida → 400', r.datos);
    r = await adminB('PUT', '/academia', { color_primario: 'rojo' });
    ok(r.status === 400, 'color inválido → 400', r.datos);
    r = await adminB('PUT', '/academia', { modulos: { video: true } });
    ok(r.status === 400, 'no se activa un módulo aún no disponible', r.datos);
    r = await adminB('PUT', '/academia', { logo: 'data:text/html;base64,PHNjcmlwdD4=' });
    ok(r.status === 400, 'logo que no es imagen → 400', r.datos);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    r = await adminB('PUT', '/academia', {
      nombre: 'Academia Norte SAC', ciudad: 'Trujillo', color_primario: '#0ea5e9', moneda: 'usd', logo: png, modulos: { nutricion: false },
    });
    ok(r.status === 200 && r.datos.nombre === 'Academia Norte SAC' && r.datos.config.moneda === 'USD' && r.datos.tiene_logo && r.datos.config.modulos.nutricion === false, 'admin B configura su academia', r.datos);
    r = await coachB('GET', '/academia/logo');
    ok(r.status === 200 && r.tipo.includes('image/png'), 'logo servido a los miembros', r.tipo);
    r = await coachB('PUT', '/academia', { nombre: 'Tomada' });
    ok(r.status === 403, 'coach no configura la academia', r.status);
    r = await coachB('GET', '/alimentacion');
    ok(r.status === 403, 'módulo desactivado → 403', r.status);
    r = await api('GET', '/alimentacion');
    ok(r.status === 200, 'el módulo sigue activo en A', r.status);
    r = await admin('GET', '/academia/logo');
    ok(r.status === 404, 'A no ve el logo de B', r.status);

    // Portal del deportista y del padre (solo lectura, solo sus fichas)
    r = await adminB('POST', '/admin/usuarios', { nombre: 'Lucía', correo: `lucia${sello}@t.pe`, password: 'lucia123', rol: 'deportista', deportistas: [ana.id] });
    ok(r.status === 400, 'no se vincula una ficha de otra academia', r.datos);
    r = await adminB('POST', '/admin/usuarios', { nombre: 'Lucía', correo: `lucia${sello}@t.pe`, password: 'lucia123', rol: 'deportista', deportistas: [depB] });
    ok(r.status === 201 && r.datos.rol === 'deportista', 'admin B crea cuenta de deportista vinculada', r.datos);
    r = await adminB('POST', '/admin/usuarios', { nombre: 'Mamá de Lucía', correo: `mama${sello}@t.pe`, password: 'mama1234', rol: 'padre', deportistas: [depB] });
    ok(r.status === 201, 'admin B crea cuenta de padre vinculada', r.datos);
    r = await atleta('POST', '/auth/login', { correo: `lucia${sello}@t.pe`, password: 'lucia123' });
    ok(r.status === 200 && r.datos.rol === 'deportista' && r.datos.permisos.join() === 'portal.ver', 'deportista solo tiene el portal', r.datos.permisos);
    r = await atleta('GET', '/portal/deportistas');
    ok(r.datos.length === 1 && r.datos[0].id === depB, 'deportista ve su ficha', r.datos);
    r = await atleta('GET', `/portal/deportistas/${depB}`);
    ok(r.status === 200 && r.datos.evaluaciones.length === 1 && !('prediccion' in r.datos), 'deportista consulta su perfil', Object.keys(r.datos));
    r = await atleta('GET', '/deportistas');
    ok(r.status === 403, 'deportista no ve la lista de la academia', r.status);
    r = await atleta('POST', '/evaluaciones', { deportista_id: depB, velocidad: 100 });
    ok(r.status === 403, 'deportista no modifica resultados', r.status);
    r = await atleta('GET', `/portal/deportistas/${ana.id}`);
    ok(r.status === 404, 'deportista no ve fichas ajenas', r.status);
    r = await padre('POST', '/auth/login', { correo: `mama${sello}@t.pe`, password: 'mama1234' });
    r = await padre('GET', '/portal/deportistas');
    ok(r.status === 200 && r.datos.length === 1, 'padre ve a su hijo', r.datos);
    r = await padre('GET', '/dashboard');
    ok(r.status === 403, 'padre no ve el dashboard de la academia', r.status);

    // Una persona en dos academias
    r = await admin('POST', '/admin/usuarios', { nombre: 'Coach Norte', correo: correoCoachB, rol: 'coach' });
    ok(r.status === 201 && r.datos.cuenta_existente && r.datos.clave_temporal === null, 'se da acceso a una cuenta existente sin tocar su clave', r.datos);
    r = await adminB('POST', `/admin/usuarios/${coachBId}/password`, {});
    ok(r.status === 403, 'un admin no cambia la clave de una cuenta que también se usa en otra academia', r.datos);
    r = await adminB('PUT', `/admin/usuarios/${coachBId}`, { nombre: 'Otro nombre' });
    ok(r.status === 403, 'un admin no cambia la identidad de una cuenta compartida', r.datos);
    r = await adminB('PUT', `/admin/usuarios/${coachBId}`, { activo: true });
    ok(r.status === 200, 'pero sí gestiona su acceso a la academia', r.datos);
    r = await coachB('GET', '/auth/sesion');
    ok(r.datos.academias.length === 2, 'coach B pertenece a dos academias', r.datos.academias);
    r = await coachB('POST', '/auth/academia', { academia_id: academiaA });
    ok(r.status === 200 && r.datos.academia.id === academiaA, 'cambio de academia activa', r.datos.academia);
    r = await coachB('GET', '/deportistas');
    ok(r.datos.datos.length === 0, 'en A no ve sus deportistas de B', r.datos.datos.length);
    r = await atleta('POST', '/auth/academia', { academia_id: academiaA });
    ok(r.status === 403, 'no se entra a una academia sin membresía', r.status);
    await coachB('POST', '/auth/academia', { academia_id: academiaB });

    // Suspensión de una academia
    r = await admin('PUT', `/plataforma/academias/${academiaB}`, { estado: 'suspendida' });
    ok(r.status === 200 && r.datos.estado === 'suspendida', 'super admin suspende la academia B', r.datos);
    r = await adminB('GET', '/dashboard');
    ok(r.status === 403 && /suspendida/.test(r.datos.error), 'academia suspendida → acceso bloqueado al instante', r.datos);
    r = await adminB('POST', '/auth/login', { correo: correoAdminB, password: 'x' });
    r = await coachB('GET', '/auth/sesion');
    ok(r.datos.academia.id === academiaA, 'quien pertenece a otra academia sigue trabajando en ella', r.datos.academia);
    r = await admin('PUT', `/plataforma/academias/${academiaB}`, { estado: 'activa' });
    r = await adminB('GET', '/dashboard');
    ok(r.status === 200, 'academia reactivada', r.status);
    r = await admin('GET', '/plataforma/academias');
    const filaB = r.datos.find((a) => a.id === academiaB);
    ok(filaB.deportistas === 1 && filaB.coaches === 1 && !filaB.soy_miembro && !('nombre_deportistas' in filaB), 'la plataforma muestra uso sin datos privados', filaB);
    r = await admin('POST', `/plataforma/academias/${academiaB}/acceso`);
    ok(r.status === 204, 'acceso explícito del super admin', r.status);

    // Auditoría por academia
    r = await adminB('GET', '/academia/auditoria');
    const acciones = r.datos.map((a) => a.accion);
    ok(r.status === 200 && ['configurar', 'configurar_permisos', 'plataforma:estado_suspendida', 'plataforma:acceso_super_admin', 'login'].every((a) => acciones.includes(a)), 'auditoría registra los eventos de B', acciones);
    ok(r.datos.some((a) => a.accion === 'crear' && a.entidad === 'deportistas'), 'auditoría registra altas', acciones);
    ok(!r.datos.some((a) => a.correo === correo), 'auditoría de B sin eventos de A', r.datos.length);
    r = await coachB('GET', '/academia/auditoria');
    ok(r.status === 403, 'coach no ve la auditoría por defecto', r.status);

    // Baja de ausentes y reactivación
    r = await api('POST', '/importacion/confirmar', { registros: registros.filter((x) => x.codigo === 'A-1'), baja_ausentes: true });
    ok(r.status === 201 && r.datos.dados_de_baja === 5, 'baja de ausentes (incluye el transferido)', r.datos);
    r = await api('POST', '/importacion/confirmar', { registros: registros.filter((x) => x.codigo === 'A-2').slice(0, 1) });
    ok(r.datos.reactivados === 1, 'reactivación con historial', r.datos);
    r = await api('GET', '/deportistas?q=beto');
    ok(r.datos.datos[0]?.total_evaluaciones === 6, 'historial conservado al reactivar', r.datos.datos[0]);

    // Baja lógica de deportista
    r = await api('DELETE', `/deportistas/${d1}`);
    ok(r.status === 404, 'd1 ya fue dado de baja por ausente');
    r = await api('DELETE', `/deportistas/${ana.id}`);
    ok(r.status === 204, 'baja lógica deportista');
    r = await api('POST', '/deportistas', { codigo: 'D-1', nombre: 'Pedro vuelve' });
    ok(r.status === 201 && r.datos.reactivado, 'crear con código dado de baja lo reactiva', r.datos);

    // Cuenta
    r = await api('GET', '/cuenta/respaldo');
    ok(r.status === 200 && r.datos.deportistas.length >= 5, 'respaldo JSON', r.status);
    r = await api('POST', '/cuenta/reiniciar', { confirmacion: 'REINICIAR' });
    ok(r.status === 403, 'un coach no puede borrar datos', r.datos);
    r = await admin('POST', '/cuenta/reiniciar', { confirmacion: 'REINICIAR' });
    ok(r.status === 400, 'reinicio exige elegir un coach', r.datos);
    r = await admin('POST', '/cuenta/reiniciar', { confirmacion: 'no' }, { coach: coachId });
    ok(r.status === 400, 'reinicio exige confirmación', r.datos);
    r = await admin('POST', '/cuenta/reiniciar', { confirmacion: 'REINICIAR' }, { coach: coachId });
    ok(r.status === 200 && r.datos.deportistas_borrados >= 5, 'reinicio de datos', r.datos);
    r = await api('GET', '/dashboard');
    ok(r.datos.totales.deportistas === 0 && r.datos.graficos.evolucion.fechas.length === 0, 'dashboard vacío tras reinicio', r.datos.totales);

    // Anti fuerza bruta
    const intruso = cliente();
    for (let i = 0; i < 5; i++) await intruso('POST', '/auth/login', { correo, password: 'mal' });
    r = await intruso('POST', '/auth/login', { correo, password: 'secreto1' });
    ok(r.status === 429, 'bloqueo tras 5 fallos', r.datos);
    r = await api('POST', '/auth/logout');
    ok(r.status === 204, 'logout');
    r = await api('GET', '/dashboard');
    ok(r.status === 401, 'tras logout → 401');
  } finally {
    servidor.close();
    await pool.end();
  }
});
