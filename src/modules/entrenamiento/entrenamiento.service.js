/**
 * Entrenamiento y asistencia (FASE 4): sesiones planificadas/realizadas con sus ejercicios, asistencia por
 * sesión o por fecha y carga de entrenamiento (sRPE = RPE de la sesión × minutos, método de Foster).
 */
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { condicionDeportista, deportistaEnAlcance, perteneceAcademia } = require('../../core/alcance');
const { redondear } = require('../../domain/medicion');

const texto = (etiqueta, maxLargo, requerido = false) => ({ tipo: 'texto', etiqueta, maxLargo, requerido });
const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'tardanza', 'justificado'];

const esquemaSesion = {
  fecha: { tipo: 'fecha', etiqueta: 'Fecha', requerido: true },
  hora: texto('Hora', 5),
  deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
  equipo_id: { tipo: 'entero', etiqueta: 'Equipo', min: 1 },
  instalacion_id: { tipo: 'entero', etiqueta: 'Instalación', min: 1 },
  plantilla_id: { tipo: 'entero', etiqueta: 'Tipo de sesión', min: 1 },
  duracion_min: { tipo: 'entero', etiqueta: 'Duración (min)', min: 1, max: 600 },
  objetivo: texto('Objetivo', 300),
  intensidad: { tipo: 'entero', etiqueta: 'Intensidad planificada', min: 1, max: 10 },
  observaciones: texto('Observaciones', 2000),
};

const esquemaEjercicio = {
  nombre: texto('Ejercicio', 120, true),
  series: { tipo: 'entero', etiqueta: 'Series', min: 1, max: 200 },
  repeticiones: { tipo: 'entero', etiqueta: 'Repeticiones', min: 1, max: 1000 },
  distancia_m: { tipo: 'numero', etiqueta: 'Distancia (m)', min: 0.1, max: 200000 },
  duracion_min: { tipo: 'numero', etiqueta: 'Duración (min)', min: 0.1, max: 600 },
  intensidad: { tipo: 'entero', etiqueta: 'Intensidad', min: 1, max: 10 },
  descanso_s: { tipo: 'entero', etiqueta: 'Descanso (s)', min: 0, max: 3600 },
  notas: texto('Notas', 300),
};

const condicionSesion = (alias, pA, pC) => `(${alias}.academia_id = ${pA} AND (${pC}::int IS NULL OR ${alias}.coach_id = ${pC}
  OR ${alias}.creado_por = ${pC} OR EXISTS (SELECT 1 FROM equipos e_ WHERE e_.id = ${alias}.equipo_id AND e_.coach_id = ${pC})))`;

async function listarSesiones(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionSesion('s', '$1', '$2')];
  if (consulta.desde) { valores.push(String(consulta.desde).slice(0, 10)); filtros.push(`s.fecha >= $${valores.length}::date`); }
  if (consulta.hasta) { valores.push(String(consulta.hasta).slice(0, 10)); filtros.push(`s.fecha <= $${valores.length}::date`); }
  if (Number(consulta.equipo_id)) { valores.push(Number(consulta.equipo_id)); filtros.push(`s.equipo_id = $${valores.length}`); }
  if (consulta.estado) { valores.push(String(consulta.estado)); filtros.push(`s.estado = $${valores.length}`); }
  const { rows } = await query(
    `SELECT s.*, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, dp.nombre AS deporte, e.nombre AS equipo, pl.nombre AS tipo, u.nombre AS coach,
            (SELECT count(*)::int FROM ejercicios x WHERE x.sesion_id = s.id) AS ejercicios,
            (SELECT count(*)::int FROM asistencia a WHERE a.sesion_id = s.id AND a.estado IN ('presente', 'tardanza')) AS presentes,
            (SELECT count(*)::int FROM asistencia a WHERE a.sesion_id = s.id) AS registrados
     FROM sesiones_entrenamiento s LEFT JOIN deportes dp ON dp.id = s.deporte_id LEFT JOIN equipos e ON e.id = s.equipo_id
     LEFT JOIN plantillas_entrenamiento pl ON pl.id = s.plantilla_id LEFT JOIN usuarios u ON u.id = s.coach_id
     WHERE ${filtros.join(' AND ')} ORDER BY s.fecha DESC, s.hora DESC NULLS LAST, s.id DESC LIMIT 300`,
    valores,
  );
  return rows;
}

async function cargarSesion(alcance, id, cliente = null) {
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  const { rows } = await ejecutar(`SELECT s.*, to_char(s.fecha, 'YYYY-MM-DD') AS fecha FROM sesiones_entrenamiento s WHERE s.id = $3 AND ${condicionSesion('s', '$1', '$2')}`,
    [alcance.academia, alcance.coach, id]);
  if (!rows.length) throw noEncontrado('Sesión de entrenamiento');
  return rows[0];
}

/** Totales de la sesión (metros, minutos, series) a partir de sus ejercicios. */
function totales(ejercicios) {
  const suma = (f) => redondear(ejercicios.reduce((s, e) => s + f(e), 0), 1);
  return {
    metros: suma((e) => (e.distancia_m || 0) * (e.series || 1)),
    minutos: suma((e) => (e.duracion_min || 0) * (e.series || 1)),
    series: suma((e) => e.series || 0),
    repeticiones: suma((e) => (e.repeticiones || 0) * (e.series || 1)),
  };
}

async function obtenerSesion(alcance, id) {
  const sesion = await cargarSesion(alcance, id);
  const [ej, asis, pl] = await Promise.all([
    query('SELECT * FROM ejercicios WHERE sesion_id = $1 ORDER BY orden, id', [id]),
    query(`SELECT a.*, d.nombre AS deportista, d.codigo FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
           WHERE a.sesion_id = $1 ORDER BY d.nombre`, [id]),
    sesion.plantilla_id ? query('SELECT * FROM plantillas_entrenamiento WHERE id = $1', [sesion.plantilla_id]) : { rows: [] },
  ]);
  // Participantes esperados: miembros del equipo de la sesión (si lo hay)
  let participantes = [];
  if (sesion.equipo_id) {
    const r = await query(`SELECT d.id, d.nombre, d.codigo FROM equipo_miembros em JOIN deportistas d ON d.id = em.deportista_id
      WHERE em.equipo_id = $1 AND d.activo ORDER BY d.nombre`, [sesion.equipo_id]);
    participantes = r.rows;
  }
  const carga = asis.rows.filter((a) => a.rpe_sesion !== null && (a.minutos || sesion.duracion_min))
    .map((a) => a.rpe_sesion * (a.minutos || sesion.duracion_min));
  return {
    ...sesion,
    plantilla: pl.rows[0] || null,
    ejercicios: ej.rows,
    totales: totales(ej.rows),
    asistencia: asis.rows,
    participantes,
    carga_media_srpe: carga.length ? Math.round(carga.reduce((s, v) => s + v, 0) / carga.length) : null,
  };
}

async function validarReferencias(alcance, d) {
  await perteneceAcademia('deportes', d.deporte_id, alcance.academia, 'El deporte');
  await perteneceAcademia('instalaciones', d.instalacion_id, alcance.academia, 'La instalación');
  await perteneceAcademia('plantillas_entrenamiento', d.plantilla_id, alcance.academia, 'El tipo de sesión');
  const equipo = await perteneceAcademia('equipos', d.equipo_id, alcance.academia, 'El equipo');
  if (equipo && alcance.coach && equipo.coach_id !== alcance.coach) throw new HttpError(403, 'Solo puedes planificar sesiones de tus equipos');
  if (d.hora && !/^\d{1,2}:\d{2}$/.test(d.hora)) throw new HttpError(400, 'Hora no válida (usa HH:MM)');
  return equipo;
}

async function guardarEjercicios(cliente, sesionId, lista) {
  if (!Array.isArray(lista)) return;
  if (lista.length > 80) throw new HttpError(400, 'Como máximo 80 ejercicios por sesión');
  await cliente.query('DELETE FROM ejercicios WHERE sesion_id = $1', [sesionId]);
  let orden = 1;
  for (const crudo of lista) {
    const e = validar(esquemaEjercicio, crudo);
    await cliente.query(
      `INSERT INTO ejercicios (sesion_id, orden, nombre, series, repeticiones, distancia_m, duracion_min, intensidad, descanso_s, notas, datos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [sesionId, orden, e.nombre, e.series, e.repeticiones, e.distancia_m, e.duracion_min, e.intensidad, e.descanso_s, e.notas,
        JSON.stringify(crudo?.datos && typeof crudo.datos === 'object' ? crudo.datos : {})],
    );
    orden += 1;
  }
}

async function crearSesion(alcance, usuario, datos) {
  const d = validar(esquemaSesion, datos);
  const equipo = await validarReferencias(alcance, d);
  return transaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `INSERT INTO sesiones_entrenamiento (academia_id, fecha, hora, deporte_id, equipo_id, instalacion_id, plantilla_id, duracion_min, objetivo,
         intensidad, observaciones, coach_id, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [alcance.academia, d.fecha, d.hora, d.deporte_id, d.equipo_id, d.instalacion_id, d.plantilla_id, d.duracion_min, d.objetivo,
        d.intensidad, d.observaciones, equipo?.coach_id || alcance.coach || usuario.id, usuario.id],
    );
    await guardarEjercicios(cliente, rows[0].id, datos.ejercicios);
    return rows[0].id;
  }).then((id) => obtenerSesion(alcance, id));
}

async function actualizarSesion(alcance, id, datos) {
  const actual = await cargarSesion(alcance, id);
  if (actual.estado === 'realizada' && datos.ejercicios) throw new HttpError(409, 'La sesión ya se cerró como realizada: su contenido no se puede modificar');
  const d = validar(esquemaSesion, { ...actual, hora: actual.hora ? String(actual.hora).slice(0, 5) : null, ...datos });
  await validarReferencias(alcance, d);
  await transaccion(async (cliente) => {
    await cliente.query(
      `UPDATE sesiones_entrenamiento SET fecha = $2, hora = $3, deporte_id = $4, equipo_id = $5, instalacion_id = $6, plantilla_id = $7,
         duracion_min = $8, objetivo = $9, intensidad = $10, observaciones = $11 WHERE id = $1`,
      [id, d.fecha, d.hora, d.deporte_id, d.equipo_id, d.instalacion_id, d.plantilla_id, d.duracion_min, d.objetivo, d.intensidad, d.observaciones],
    );
    await guardarEjercicios(cliente, id, datos.ejercicios);
  });
  return obtenerSesion(alcance, id);
}

/** Cerrar: marca la sesión como realizada (o cancelada) y guarda las observaciones finales. */
async function cerrarSesion(alcance, id, datos = {}) {
  await cargarSesion(alcance, id);
  const estado = datos.estado === 'cancelada' ? 'cancelada' : 'realizada';
  await query(
    `UPDATE sesiones_entrenamiento SET estado = $2, cerrada_en = now(), observaciones = coalesce($3, observaciones),
       duracion_min = coalesce($4, duracion_min) WHERE id = $1`,
    [id, estado, datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null, Number(datos.duracion_min) || null],
  );
  return obtenerSesion(alcance, id);
}

async function eliminarSesion(alcance, id) {
  const s = await cargarSesion(alcance, id);
  if (s.estado === 'realizada') throw new HttpError(409, 'Una sesión realizada no se elimina (forma parte del historial). Puedes cancelarla.');
  await query('DELETE FROM sesiones_entrenamiento WHERE id = $1', [id]);
}

// ---------------------------------------------------------------------------
// Asistencia
// ---------------------------------------------------------------------------
/**
 * Registra la asistencia de varios deportistas (de una sesión o de una fecha). Idempotente:
 * repetir el envío actualiza la misma fila (deportista + fecha + sesión).
 */
async function registrarAsistencia(alcance, usuario, datos = {}) {
  const lista = Array.isArray(datos.registros) ? datos.registros : [];
  if (!lista.length) throw new HttpError(400, 'No hay registros de asistencia');
  if (lista.length > 200) throw new HttpError(400, 'Como máximo 200 registros por envío');
  let sesion = null;
  if (datos.sesion_id) sesion = await cargarSesion(alcance, Number(datos.sesion_id));
  const fecha = sesion?.fecha || validar({ fecha: { tipo: 'fecha', etiqueta: 'Fecha', requerido: true } }, { fecha: datos.fecha }).fecha;
  const guardados = [];
  await transaccion(async (cliente) => {
    for (const r of lista) {
      const dep = await deportistaEnAlcance(alcance, Number(r.deportista_id), cliente);
      if (!ESTADOS_ASISTENCIA.includes(r.estado)) throw new HttpError(400, `Estado de asistencia no válido para ${dep.nombre}`);
      const rpe = r.rpe_sesion === '' || r.rpe_sesion === null || r.rpe_sesion === undefined ? null : Number(r.rpe_sesion);
      if (rpe !== null && (!Number.isInteger(rpe) || rpe < 0 || rpe > 10)) throw new HttpError(400, `RPE no válido para ${dep.nombre} (0 a 10)`);
      const minutos = r.minutos ? Number(r.minutos) : null;
      const { rows } = await cliente.query(
        `INSERT INTO asistencia (academia_id, deportista_id, sesion_id, equipo_id, fecha, estado, rpe_sesion, minutos, notas, registrado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (deportista_id, fecha, sesion_id) DO UPDATE SET estado = EXCLUDED.estado, rpe_sesion = EXCLUDED.rpe_sesion,
           minutos = EXCLUDED.minutos, notas = EXCLUDED.notas, registrado_por = EXCLUDED.registrado_por
         RETURNING *`,
        [alcance.academia, dep.id, sesion?.id || null, sesion?.equipo_id || null, fecha, r.estado, rpe,
          r.estado === 'ausente' || r.estado === 'justificado' ? null : minutos, r.notas ? String(r.notas).slice(0, 300) : null, usuario.id],
      );
      guardados.push(rows[0]);
    }
  });
  return { guardados: guardados.length };
}

/** % de asistencia = (presente + tardanza) / (registros − justificados). */
function porcentajeAsistencia(filas) {
  const validas = filas.filter((f) => f.estado !== 'justificado');
  if (!validas.length) return null;
  return redondear((validas.filter((f) => f.estado === 'presente' || f.estado === 'tardanza').length / validas.length) * 100, 1);
}

async function filasAsistencia(alcance, { desde, hasta, deportista_id: dep, equipo_id: equipo } = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionDeportista('d', '$1', '$2'), 'd.activo'];
  if (desde) { valores.push(String(desde).slice(0, 10)); filtros.push(`a.fecha >= $${valores.length}::date`); }
  if (hasta) { valores.push(String(hasta).slice(0, 10)); filtros.push(`a.fecha <= $${valores.length}::date`); }
  if (Number(dep)) { valores.push(Number(dep)); filtros.push(`a.deportista_id = $${valores.length}`); }
  if (Number(equipo)) {
    valores.push(Number(equipo));
    filtros.push(`EXISTS (SELECT 1 FROM equipo_miembros em WHERE em.deportista_id = d.id AND em.equipo_id = $${valores.length})`);
  }
  const { rows } = await query(
    `SELECT a.*, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, d.nombre AS deportista, d.codigo,
            coalesce(a.minutos, s.duracion_min) AS minutos_efectivos
     FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id LEFT JOIN sesiones_entrenamiento s ON s.id = a.sesion_id
     WHERE ${filtros.join(' AND ')} ORDER BY a.fecha DESC, d.nombre LIMIT 20000`,
    valores,
  );
  return rows;
}

/** Estadísticas por deportista y globales, con carga semanal (sRPE). */
async function estadisticas(alcance, consulta = {}) {
  const filas = await filasAsistencia(alcance, consulta);
  const porDep = new Map();
  for (const f of filas) {
    if (!porDep.has(f.deportista_id)) porDep.set(f.deportista_id, { deportista_id: f.deportista_id, deportista: f.deportista, codigo: f.codigo, filas: [] });
    porDep.get(f.deportista_id).filas.push(f);
  }
  const deportistas = [...porDep.values()].map((x) => {
    const carga = x.filas.filter((f) => f.rpe_sesion !== null && f.minutos_efectivos).map((f) => f.rpe_sesion * f.minutos_efectivos);
    return {
      deportista_id: x.deportista_id, deportista: x.deportista, codigo: x.codigo,
      registros: x.filas.length,
      presentes: x.filas.filter((f) => f.estado === 'presente').length,
      tardanzas: x.filas.filter((f) => f.estado === 'tardanza').length,
      ausencias: x.filas.filter((f) => f.estado === 'ausente').length,
      justificadas: x.filas.filter((f) => f.estado === 'justificado').length,
      porcentaje: porcentajeAsistencia(x.filas),
      carga_total_srpe: carga.length ? carga.reduce((s, v) => s + v, 0) : null,
    };
  }).sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101));
  // Carga semanal (lunes como inicio de semana)
  const semanas = new Map();
  for (const f of filas) {
    if (f.rpe_sesion === null || !f.minutos_efectivos) continue;
    const d = new Date(`${f.fecha}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    semanas.set(k, (semanas.get(k) || 0) + f.rpe_sesion * f.minutos_efectivos);
  }
  return {
    registros: filas.length,
    porcentaje_global: porcentajeAsistencia(filas),
    deportistas,
    carga_semanal: [...semanas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semana, carga]) => ({ semana, carga })),
  };
}

// ---------------------------------------------------------------------------
// Plantillas (tipos de sesión)
// ---------------------------------------------------------------------------
async function listarPlantillas(alcance) {
  const { rows } = await query(
    `SELECT p.*, d.nombre AS deporte FROM plantillas_entrenamiento p LEFT JOIN deportes d ON d.id = p.deporte_id
     WHERE p.academia_id = $1 AND p.activo ORDER BY d.nombre NULLS FIRST, p.nombre`, [alcance.academia],
  );
  return rows;
}

async function crearPlantilla(alcance, datos = {}) {
  const d = validar({ nombre: texto('Nombre', 80, true), deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 }, total: texto('Total', 20), descripcion: texto('Descripción', 500) }, datos);
  await perteneceAcademia('deportes', d.deporte_id, alcance.academia, 'El deporte');
  const campos = Array.isArray(datos.campos) ? datos.campos.slice(0, 15).map((c) => String(c).slice(0, 30)) : [];
  try {
    const { rows } = await query(
      'INSERT INTO plantillas_entrenamiento (academia_id, deporte_id, nombre, campos, total, descripcion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [alcance.academia, d.deporte_id, d.nombre, JSON.stringify(campos), d.total, d.descripcion],
    );
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'Ya existe un tipo de sesión con ese nombre');
    throw error;
  }
}

module.exports = {
  ESTADOS_ASISTENCIA, listarSesiones, obtenerSesion, crearSesion, actualizarSesion, cerrarSesion, eliminarSesion,
  registrarAsistencia, filasAsistencia, estadisticas, porcentajeAsistencia, totales, listarPlantillas, crearPlantilla,
};
