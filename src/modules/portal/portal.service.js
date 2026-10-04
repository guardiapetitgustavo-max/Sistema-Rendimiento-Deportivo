/**
 * Portal del deportista y del padre/madre: SOLO lectura y SOLO de las fichas vinculadas a su cuenta
 * (deportistas.cuenta_id para el deportista, tutores para el padre). Nunca modifican resultados oficiales.
 */
const { query } = require('../../db/pool');
const { noEncontrado } = require('../../utils/http-error');
const deportistas = require('../deportistas/deportistas.service');
const { obtenerPerfil } = require('../deportistas/perfil.service');

async function idsVinculados(usuario) {
  const academia = usuario.academia.id;
  const { rows } = usuario.rol === 'padre'
    ? await query(
      `SELECT d.id FROM tutores t JOIN deportistas d ON d.id = t.deportista_id
       WHERE t.usuario_id = $1 AND d.academia_id = $2 AND d.activo`,
      [usuario.id, academia],
    )
    : await query('SELECT id FROM deportistas WHERE cuenta_id = $1 AND academia_id = $2 AND activo', [usuario.id, academia]);
  return rows.map((r) => r.id);
}

async function listar(usuario) {
  const ids = await idsVinculados(usuario);
  if (!ids.length) return [];
  const academia = await deportistas.cargarAcademia({ academia: usuario.academia.id, coach: null });
  return academia
    .filter((d) => ids.includes(d.id))
    .map(({
      id, codigo, nombre, categoria, disciplina, edad, coach, total_evaluaciones: total, promedio_general: promedio, nivel, ultima_evaluacion: ultima,
    }) => ({
      id, codigo, nombre, categoria, disciplina, edad, coach, total_evaluaciones: total, promedio_general: promedio, nivel, ultima_fecha: ultima?.fecha || null,
    }));
}

/**
 * Perfil de consulta de una ficha vinculada. No incluye predicciones de ML ni recomendaciones
 * automáticas: se mostrarán al deportista cuando exista la autorización del coach (FASE 6).
 */
async function perfil(usuario, id) {
  if (!(await idsVinculados(usuario)).includes(id)) throw noEncontrado('Deportista');
  const completo = await obtenerPerfil({ academia: usuario.academia.id, coach: null }, id);
  const {
    prediccion, recomendacion, alimentacion, ...visible
  } = completo;
  return visible;
}

// ---------------------------------------------------------------------------
// Portal ampliado (fases 4-9). Siempre limitado a las fichas vinculadas a la cuenta.
// ---------------------------------------------------------------------------
const { HttpError } = require('../../utils/http-error');
const rendimiento = require('../rendimiento/rendimiento.service');
const recuperacion = require('../recuperacion/recuperacion.service');
const alimentacion = require('../alimentacion/alimentacion.service');
const video = require('../video/video.service');
const M = require('../../domain/medicion');

async function exigirVinculo(usuario, id) {
  const ids = await idsVinculados(usuario);
  if (!ids.includes(id)) throw noEncontrado('Deportista');
  return ids;
}
const alcanceDe = (usuario) => ({ academia: usuario.academia.id, coach: null });

/** Seguimiento del deportista: evolución, récords, asistencia, objetivos y recomendaciones APROBADAS. */
async function seguimiento(usuario, id) {
  await exigirVinculo(usuario, id);
  const alcance = alcanceDe(usuario);
  const [evolucion, asistencia, objetivos, recomendaciones, records, recu] = await Promise.all([
    rendimiento.evolucionDeportista(alcance, id),
    query(`SELECT a.estado, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, s.objetivo, to_char(s.hora, 'HH24:MI') AS hora FROM asistencia a
           LEFT JOIN sesiones_entrenamiento s ON s.id = a.sesion_id WHERE a.deportista_id = $1 ORDER BY a.fecha DESC LIMIT 60`, [id]),
    query(`SELECT o.id, o.tipo, o.descripcion, o.estado, o.valor_objetivo, to_char(o.fecha_limite, 'YYYY-MM-DD') AS fecha_limite, p.nombre AS prueba
           FROM objetivos o LEFT JOIN pruebas p ON p.id = o.prueba_id WHERE o.deportista_id = $1 AND o.estado <> 'cancelado' ORDER BY o.estado, o.fecha_limite`, [id]),
    query(`SELECT id, categoria, texto, revisado_en FROM recomendaciones WHERE deportista_id = $1 AND estado = 'aprobada' ORDER BY revisado_en DESC LIMIT 20`, [id]),
    query(`SELECT titulo, motivo, to_char(creado_en, 'YYYY-MM-DD') AS fecha FROM alertas WHERE deportista_id = $1 AND visible_deportista ORDER BY creado_en DESC LIMIT 10`, [id]),
    query("SELECT *, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM recuperacion WHERE deportista_id = $1 AND fecha >= CURRENT_DATE - 30 ORDER BY recuperacion.fecha DESC", [id]),
  ]);
  const validas = asistencia.rows.filter((a) => a.estado !== 'justificado');
  return {
    evolucion: evolucion.map(({ serie, ...e }) => ({ ...e, serie })),
    asistencia: {
      registros: asistencia.rows,
      porcentaje: validas.length ? M.redondear((validas.filter((a) => a.estado !== 'ausente').length / validas.length) * 100, 1) : null,
    },
    objetivos: objetivos.rows,
    recomendaciones: recomendaciones.rows,
    logros: records.rows,
    recuperacion: { registros: recu.rows, resumen: recuperacion.resumen(recu.rows, 7) },
  };
}

/** El deportista registra su propia recuperación (nunca resultados oficiales). */
async function registrarRecuperacion(usuario, datos) {
  if (usuario.rol !== 'deportista') throw new HttpError(403, 'Solo el deportista registra su propia recuperación');
  return recuperacion.registrarPropio(usuario, datos);
}

async function registrarAlimentacion(usuario, datos = {}) {
  if (usuario.rol !== 'deportista') throw new HttpError(403, 'Solo el deportista registra su propia alimentación');
  const { rows } = await query('SELECT id FROM deportistas WHERE cuenta_id = $1 AND academia_id = $2 AND activo', [usuario.id, usuario.academia.id]);
  if (!rows.length) throw new HttpError(403, 'Tu cuenta no está vinculada a una ficha de deportista');
  return alimentacion.insertar(rows[0].id, datos, 'deportista', usuario.id);
}

async function videos(usuario) {
  return video.delPortal(usuario, await idsVinculados(usuario));
}

async function urlVideo(usuario, id) {
  return video.reproducirPortal(usuario, await idsVinculados(usuario), id);
}

/** Padre/madre: matrícula y pagos de sus hijos (solo lectura). */
async function pagos(usuario) {
  const ids = await idsVinculados(usuario);
  if (!ids.length) return [];
  await query("UPDATE pagos SET estado = 'vencido' WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE AND deportista_id = ANY($1::int[])", [ids]);
  const { rows } = await query(
    `SELECT p.id, p.concepto, p.monto, p.moneda, p.estado, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
            to_char(p.fecha_pago, 'YYYY-MM-DD') AS fecha_pago, d.nombre AS deportista
     FROM pagos p JOIN deportistas d ON d.id = p.deportista_id WHERE p.deportista_id = ANY($1::int[]) AND p.estado <> 'anulado'
     ORDER BY p.fecha_vencimiento DESC LIMIT 200`, [ids],
  );
  return rows;
}

module.exports = {
  listar, perfil, idsVinculados, seguimiento, registrarRecuperacion, registrarAlimentacion, videos, urlVideo, pagos,
};
