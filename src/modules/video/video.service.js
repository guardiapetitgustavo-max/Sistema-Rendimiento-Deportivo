/**
 * Video (FASE 7): subida a almacenamiento privado con URL firmada, archivo por deportista/prueba,
 * comparación A/B, observaciones del coach y análisis asíncrono por un worker externo.
 *
 * El análisis automático SOLO existe si hay un modelo real para ese movimiento y el worker está activo;
 * en otro caso se muestra "ANÁLISIS NO DISPONIBLE". Se separa siempre lo medido, lo estimado y lo observado.
 */
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { condicionDeportista, deportistaEnAlcance, perteneceAcademia } = require('../../core/alcance');
const { verificarLimite } = require('../../core/limites');
const { registrar: auditar } = require('../../core/auditoria');
const almacenamiento = require('../../core/almacenamiento');
const env = require('../../config/env');

const NO_DISPONIBLE = 'ANÁLISIS NO DISPONIBLE';
const LATIDO_MAX_MIN = 10;

const esquema = {
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', requerido: true, min: 1 },
  titulo: { tipo: 'texto', etiqueta: 'Título', requerido: true, maxLargo: 120 },
  tipo_movimiento: { tipo: 'texto', etiqueta: 'Movimiento', maxLargo: 40 },
  prueba_id: { tipo: 'entero', etiqueta: 'Prueba', min: 1 },
  fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
  mime: { tipo: 'texto', etiqueta: 'Tipo de archivo', requerido: true, maxLargo: 40 },
  tamano_bytes: { tipo: 'entero', etiqueta: 'Tamaño', requerido: true, min: 1 },
  notas: { tipo: 'texto', etiqueta: 'Notas', maxLargo: 1000 },
  visible_deportista: { tipo: 'booleano', etiqueta: 'Visible para el deportista' },
};

/** Estado del servicio de análisis (worker) según su último latido. */
async function estadoWorker() {
  const { rows } = await query("SELECT *, (now() - ultima_senal) < make_interval(mins => $1) AS activo FROM servicios_estado WHERE nombre = 'worker-video'", [LATIDO_MAX_MIN]);
  const fila = rows[0];
  return {
    activo: Boolean(fila?.activo), ultima_senal: fila?.ultima_senal || null, version: fila?.version || null,
    movimientos: fila?.detalle?.movimientos || [],
  };
}

const SELECT = `SELECT v.*, to_char(v.fecha, 'YYYY-MM-DD') AS fecha, d.nombre AS deportista, p.nombre AS prueba,
  (SELECT row_to_json(a) FROM (SELECT x.id, x.disponible, x.modelo, x.version, x.medidos, x.estimaciones, x.mensaje, x.creado_en
     FROM analisis_video x WHERE x.video_id = v.id AND x.modelo IS DISTINCT FROM 'coach' ORDER BY x.id DESC LIMIT 1) a) AS analisis,
  (SELECT coalesce(json_agg(o ORDER BY o.id), '[]') FROM (SELECT x.id, x.observaciones, x.creado_en FROM analisis_video x
     WHERE x.video_id = v.id AND x.modelo = 'coach') o) AS observaciones
  FROM videos v JOIN deportistas d ON d.id = v.deportista_id LEFT JOIN pruebas p ON p.id = v.prueba_id`;

async function listar(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = ['v.activo', 'v.subido', condicionDeportista('d', '$1', '$2')];
  for (const c of ['deportista_id', 'prueba_id']) {
    if (Number(consulta[c])) { valores.push(Number(consulta[c])); filtros.push(`v.${c} = $${valores.length}`); }
  }
  const { rows } = await query(`${SELECT} WHERE ${filtros.join(' AND ')} ORDER BY v.fecha DESC, v.id DESC LIMIT 300`, valores);
  return rows;
}

async function cargar(alcance, id, { incluirPendientes = false } = {}) {
  const { rows } = await query(`${SELECT} WHERE v.id = $3 AND v.activo ${incluirPendientes ? '' : 'AND v.subido'} AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach, id]);
  if (!rows.length) throw noEncontrado('Video');
  return rows[0];
}

/** Paso 1: registra el video y devuelve la URL firmada para subirlo. */
async function crear(alcance, usuario, datos) {
  almacenamiento.exigirConfigurado();
  const d = validar(esquema, datos);
  const maxBytes = env.almacenamiento.maxMb * 1048576;
  if (d.tamano_bytes > maxBytes) throw new HttpError(400, `El video supera el máximo de ${env.almacenamiento.maxMb} MB`);
  const dep = await deportistaEnAlcance(alcance, d.deportista_id);
  if (d.prueba_id) await perteneceAcademia('pruebas', d.prueba_id, alcance.academia, 'La prueba');
  await verificarLimite(usuario, 'videos');
  await verificarLimite(usuario, 'almacenamiento_mb', d.tamano_bytes / 1048576);
  const ruta = almacenamiento.nuevaRuta(alcance.academia, d.mime);
  const { rows } = await query(
    `INSERT INTO videos (academia_id, deportista_id, deporte_id, prueba_id, tipo_movimiento, titulo, fecha, proveedor, ruta, mime, tamano_bytes,
       visible_deportista, notas, subido_por)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, CURRENT_DATE), $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [alcance.academia, dep.id, dep.deporte_id, d.prueba_id, d.tipo_movimiento || 'general', d.titulo, d.fecha, almacenamiento.proveedor(), ruta,
      d.mime, d.tamano_bytes, d.visible_deportista, d.notas, usuario.id],
  );
  const subida = await almacenamiento.urlSubida(ruta);
  return { id: rows[0].id, subida: subida.local ? { ...subida, url: `/api/videos/${rows[0].id}/archivo` } : subida };
}

/** Paso 2: tras subirlo, se confirma; si hay análisis automático se encola el trabajo. */
async function confirmar(alcance, usuario, id) {
  const v = await cargar(alcance, id, { incluirPendientes: true });
  if (v.subido) return v;
  if (!(await almacenamiento.existe(v.ruta))) throw new HttpError(409, 'El archivo todavía no se ha subido');
  await query('UPDATE videos SET subido = true WHERE id = $1', [id]);
  const moduloIa = usuario.academia?.modulos?.video_ia;
  const worker = await estadoWorker();
  if (moduloIa) {
    await query("INSERT INTO trabajos (academia_id, tipo, payload) VALUES ($1, 'analisis_video', $2)", [alcance.academia, JSON.stringify({ video_id: id })]);
    await query("UPDATE videos SET estado = 'PENDING' WHERE id = $1", [id]);
  } else {
    await query(`INSERT INTO analisis_video (video_id, academia_id, disponible, mensaje) VALUES ($1, $2, false, $3)`,
      [id, alcance.academia, `${NO_DISPONIBLE}: el análisis automático de video no está activado en esta academia.`]);
    await query("UPDATE videos SET estado = 'COMPLETED' WHERE id = $1", [id]);
  }
  return { ...(await cargar(alcance, id)), worker_activo: worker.activo };
}

/** Subida directa al servidor (solo en almacenamiento local de desarrollo). */
async function subirLocal(alcance, id, buffer) {
  const v = await cargar(alcance, id, { incluirPendientes: true });
  if (v.subido) throw new HttpError(409, 'El video ya se subió');
  if (!buffer?.length) throw new HttpError(400, 'Archivo vacío');
  if (buffer.length > env.almacenamiento.maxMb * 1048576) throw new HttpError(400, 'Archivo demasiado grande');
  almacenamiento.guardarLocal(v.ruta, buffer);
}

/** URL temporal para reproducir; cada acceso queda en la auditoría. */
async function reproducir(alcance, usuario, id) {
  const v = await cargar(alcance, id);
  await auditar({ academia: alcance.academia, usuario: usuario.id, accion: 'ver_video', entidad: 'videos', entidadId: id });
  const url = await almacenamiento.urlLectura(v.ruta);
  return { url: url || `/api/videos/${id}/archivo`, expira_en_s: 600 };
}

async function archivoLocal(alcance, id) {
  const v = await cargar(alcance, id);
  return { ruta: almacenamiento.leerLocal(v.ruta), mime: v.mime };
}

async function observar(alcance, usuario, id, texto) {
  await cargar(alcance, id);
  const obs = String(texto || '').trim();
  if (obs.length < 3) throw new HttpError(400, 'Escribe la observación');
  await query("INSERT INTO analisis_video (video_id, academia_id, disponible, modelo, observaciones, mensaje) VALUES ($1, $2, false, 'coach', $3, $4)",
    [id, alcance.academia, obs.slice(0, 2000), `Observación de ${usuario.nombre}`]);
  return cargar(alcance, id);
}

async function actualizar(alcance, id, datos = {}) {
  await cargar(alcance, id);
  const d = validar({ titulo: esquema.titulo, notas: esquema.notas, visible_deportista: esquema.visible_deportista }, datos, { parcial: true });
  const campos = Object.keys(d);
  if (!campos.length) return cargar(alcance, id);
  await query(`UPDATE videos SET ${campos.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...campos.map((c) => d[c])]);
  return cargar(alcance, id);
}

/** Comparación A/B: mismo deportista o misma prueba/movimiento (comparar cosas distintas no tiene sentido). */
async function comparar(alcance, usuario, idA, idB) {
  const [a, b] = [await cargar(alcance, idA), await cargar(alcance, idB)];
  const compatibles = a.deportista_id === b.deportista_id || (a.prueba_id && a.prueba_id === b.prueba_id) || a.tipo_movimiento === b.tipo_movimiento;
  if (!compatibles) throw new HttpError(400, 'Solo se comparan videos del mismo deportista, de la misma prueba o del mismo movimiento');
  const [ua, ub] = [await reproducir(alcance, usuario, idA), await reproducir(alcance, usuario, idB)];
  return { a: { ...a, url: ua.url }, b: { ...b, url: ub.url } };
}

async function eliminar(alcance, id) {
  const v = await cargar(alcance, id, { incluirPendientes: true });
  await query('UPDATE videos SET activo = false WHERE id = $1', [id]);
  await almacenamiento.eliminar(v.ruta).catch(() => null);
}

/** Portal del deportista: solo los videos que el coach marcó como visibles. */
async function delPortal(usuario, deportistaIds) {
  if (!deportistaIds.length) return [];
  const { rows } = await query(`${SELECT} WHERE v.activo AND v.subido AND v.visible_deportista AND v.academia_id = $1 AND v.deportista_id = ANY($2::int[])
    ORDER BY v.fecha DESC LIMIT 100`, [usuario.academia.id, deportistaIds]);
  return rows;
}

async function reproducirPortal(usuario, deportistaIds, id) {
  const { rows } = await query('SELECT * FROM videos WHERE id = $1 AND academia_id = $2 AND activo AND subido AND visible_deportista AND deportista_id = ANY($3::int[])',
    [id, usuario.academia.id, deportistaIds]);
  if (!rows.length) throw noEncontrado('Video');
  await auditar({ academia: usuario.academia.id, usuario: usuario.id, accion: 'ver_video', entidad: 'videos', entidadId: id });
  return { url: (await almacenamiento.urlLectura(rows[0].ruta)) || null, expira_en_s: 600 };
}

module.exports = {
  NO_DISPONIBLE, estadoWorker, listar, cargar, crear, confirmar, subirLocal, reproducir, archivoLocal, observar, actualizar, comparar, eliminar,
  delPortal, reproducirPortal,
};
