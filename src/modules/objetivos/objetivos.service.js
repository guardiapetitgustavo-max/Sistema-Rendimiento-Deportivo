/**
 * Objetivos (FASE 4) de un deportista, equipo o categoría. El progreso se CALCULA con los datos reales:
 * - rendimiento: mejor marca oficial y compatible en la prueba desde la fecha de inicio,
 * - asistencia: % de asistencia desde la fecha de inicio,
 * - entrenamiento: número de sesiones asistidas desde la fecha de inicio.
 * Al consultar se actualiza el estado (alcanzado / vencido) y se guarda la fecha en que se alcanzó.
 */
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { condicionDeportista, deportistaEnAlcance, perteneceAcademia } = require('../../core/alcance');
const M = require('../../domain/medicion');
const { hoyISO } = require('../../utils/valores');

const esquema = {
  tipo: { tipo: 'texto', etiqueta: 'Tipo', requerido: true, maxLargo: 20 },
  descripcion: { tipo: 'texto', etiqueta: 'Descripción', requerido: true, maxLargo: 300 },
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', min: 1 },
  equipo_id: { tipo: 'entero', etiqueta: 'Equipo', min: 1 },
  categoria_id: { tipo: 'entero', etiqueta: 'Categoría', min: 1 },
  prueba_id: { tipo: 'entero', etiqueta: 'Prueba', min: 1 },
  valor_objetivo: { tipo: 'numero', etiqueta: 'Valor objetivo' },
  fecha_inicio: { tipo: 'fecha', etiqueta: 'Fecha de inicio' },
  fecha_limite: { tipo: 'fecha', etiqueta: 'Fecha límite' },
};
const TIPOS = ['rendimiento', 'entrenamiento', 'asistencia'];

/** Progreso de 0 a 100 desde el valor inicial hasta el objetivo, en la dirección de mejora. */
function progreso(inicial, actual, objetivo, direccion) {
  if (!M.esNumero(actual) || !M.esNumero(objetivo)) return null;
  const alcanzado = direccion === 'LOWER_IS_BETTER' ? actual <= objetivo : actual >= objetivo;
  if (alcanzado) return 100;
  if (!M.esNumero(inicial) || inicial === objetivo) return 0;
  return M.redondear(Math.max(0, Math.min(99.9, ((actual - inicial) / (objetivo - inicial)) * 100)), 1);
}

async function medirRendimiento(o) {
  const { rows } = await query(
    `SELECT r.valor, r.datos, r.unidad, r.prueba_id, m.direccion_mejora, m.rango_min, m.rango_max FROM resultados r JOIN metricas m ON m.id = r.metrica_id
     WHERE r.deportista_id = $1 AND r.prueba_id = $2 AND r.activo AND r.oficial AND r.fecha >= $3 ORDER BY r.fecha, r.id`,
    [o.deportista_id, o.prueba_id, o.fecha_inicio],
  );
  if (!rows.length) return { actual: null, direccion: null };
  // Solo resultados del mismo contexto que el último (p. ej. mismo largo de piscina)
  const clave = M.claveComparacion(rows.at(-1));
  const lista = rows.filter((r) => M.claveComparacion(r) === clave);
  const direccion = rows[0].direccion_mejora;
  return { actual: M.mejorValor(lista.map((r) => r.valor), direccion, { min: rows[0].rango_min, max: rows[0].rango_max }), direccion };
}

async function medirAsistencia(o, tipo) {
  const { rows } = await query(
    `SELECT a.estado FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
     WHERE a.fecha >= $1 AND d.activo AND (a.deportista_id = $2 OR (a.deportista_id IS NOT NULL AND $3::int IS NOT NULL
       AND EXISTS (SELECT 1 FROM equipo_miembros em WHERE em.deportista_id = d.id AND em.equipo_id = $3))
       OR ($4::int IS NOT NULL AND d.categoria_id = $4)) AND d.academia_id = $5`,
    [o.fecha_inicio, o.deportista_id, o.equipo_id, o.categoria_id, o.academia_id],
  );
  if (tipo === 'entrenamiento') return rows.filter((r) => r.estado === 'presente' || r.estado === 'tardanza').length;
  const validas = rows.filter((r) => r.estado !== 'justificado');
  return validas.length ? M.redondear((validas.filter((r) => r.estado !== 'ausente').length / validas.length) * 100, 1) : null;
}

/** Calcula el progreso y actualiza el estado si corresponde (alcanzado o vencido). */
async function evaluar(o) {
  let actual = null;
  let direccion = 'HIGHER_IS_BETTER';
  if (o.tipo === 'rendimiento' && o.prueba_id && o.deportista_id) ({ actual, direccion } = await medirRendimiento(o));
  else if (o.tipo !== 'rendimiento') actual = await medirAsistencia(o, o.tipo);
  direccion = direccion || 'HIGHER_IS_BETTER';
  const pct = progreso(o.valor_inicial, actual, o.valor_objetivo, direccion);
  let { estado } = o;
  let alcanzadoEn = o.alcanzado_en;
  if (estado === 'activo' && pct === 100) { estado = 'alcanzado'; alcanzadoEn = hoyISO(); }
  else if (estado === 'activo' && o.fecha_limite && o.fecha_limite < hoyISO()) estado = 'vencido';
  if (estado !== o.estado) await query('UPDATE objetivos SET estado = $2, alcanzado_en = $3 WHERE id = $1', [o.id, estado, alcanzadoEn]);
  return {
    ...o, estado, alcanzado_en: alcanzadoEn, valor_actual: actual, progreso: pct, direccion,
    sin_datos: actual === null,
  };
}

const SELECT = `SELECT o.*, to_char(o.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(o.fecha_limite, 'YYYY-MM-DD') AS fecha_limite,
  to_char(o.alcanzado_en, 'YYYY-MM-DD') AS alcanzado_en, d.nombre AS deportista, e.nombre AS equipo, c.nombre AS categoria, p.nombre AS prueba, m.unidad
  FROM objetivos o LEFT JOIN deportistas d ON d.id = o.deportista_id LEFT JOIN equipos e ON e.id = o.equipo_id
  LEFT JOIN categorias c ON c.id = o.categoria_id LEFT JOIN pruebas p ON p.id = o.prueba_id LEFT JOIN metricas m ON m.id = p.metrica_id`;

/** Visibles: los de sus deportistas, sus equipos o (admin) todos. */
const condicionVisible = `o.academia_id = $1 AND ($2::int IS NULL
  OR (o.deportista_id IS NOT NULL AND ${condicionDeportista('d', '$1', '$2')})
  OR e.coach_id = $2 OR (o.deportista_id IS NULL AND o.equipo_id IS NULL))`;

async function listar(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionVisible];
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`o.deportista_id = $${valores.length}`); }
  if (consulta.estado) { valores.push(String(consulta.estado)); filtros.push(`o.estado = $${valores.length}`); }
  const { rows } = await query(`${SELECT} WHERE ${filtros.join(' AND ')} ORDER BY o.estado, o.fecha_limite NULLS LAST, o.id DESC LIMIT 500`, valores);
  const salida = [];
  for (const o of rows) salida.push(await evaluar(o));
  return salida;
}

async function cargar(alcance, id) {
  const { rows } = await query(`${SELECT} WHERE o.id = $3 AND ${condicionVisible}`, [alcance.academia, alcance.coach, id]);
  if (!rows.length) throw noEncontrado('Objetivo');
  return rows[0];
}

async function crear(alcance, usuario, datos) {
  const d = validar(esquema, datos);
  if (!TIPOS.includes(d.tipo)) throw new HttpError(400, 'Tipo de objetivo no válido');
  if (!d.deportista_id && !d.equipo_id && !d.categoria_id) throw new HttpError(400, 'El objetivo debe ser de un deportista, un equipo o una categoría');
  if (d.deportista_id) await deportistaEnAlcance(alcance, d.deportista_id);
  const equipo = await perteneceAcademia('equipos', d.equipo_id, alcance.academia, 'El equipo');
  if (equipo && alcance.coach && equipo.coach_id !== alcance.coach) throw new HttpError(403, 'Solo puedes fijar objetivos de tus equipos');
  await perteneceAcademia('categorias', d.categoria_id, alcance.academia, 'La categoría');
  if (d.tipo === 'rendimiento') {
    if (!d.deportista_id || !d.prueba_id) throw new HttpError(400, 'Un objetivo de rendimiento necesita un deportista y una prueba');
    await perteneceAcademia('pruebas', d.prueba_id, alcance.academia, 'La prueba');
  } else d.prueba_id = null;
  if (!M.esNumero(d.valor_objetivo)) throw new HttpError(400, 'Indica el valor objetivo');
  if (d.tipo === 'asistencia' && (d.valor_objetivo <= 0 || d.valor_objetivo > 100)) throw new HttpError(400, 'El objetivo de asistencia es un % entre 1 y 100');
  d.fecha_inicio = d.fecha_inicio || hoyISO();
  if (d.fecha_limite && d.fecha_limite < d.fecha_inicio) throw new HttpError(400, 'La fecha límite no puede ser anterior al inicio');
  // Valor inicial = la mejor marca compatible hasta hoy (punto de partida del progreso)
  let inicial = null;
  if (d.tipo === 'rendimiento') ({ actual: inicial } = await medirRendimiento({ ...d, fecha_inicio: '1900-01-01' }));
  if (M.esNumero(datos.valor_inicial)) inicial = Number(datos.valor_inicial);
  const { rows } = await query(
    `INSERT INTO objetivos (academia_id, deportista_id, equipo_id, categoria_id, tipo, prueba_id, descripcion, valor_objetivo, valor_inicial,
       fecha_inicio, fecha_limite, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [alcance.academia, d.deportista_id, d.equipo_id, d.categoria_id, d.tipo, d.prueba_id, d.descripcion, d.valor_objetivo, inicial,
      d.fecha_inicio, d.fecha_limite, usuario.id],
  );
  return evaluar(await cargar(alcance, rows[0].id));
}

/** Solo se modifican descripción, fecha límite y estado (cancelar/reactivar); el valor objetivo queda fijo. */
async function actualizar(alcance, id, datos = {}) {
  const o = await cargar(alcance, id);
  const d = validar({ descripcion: esquema.descripcion, fecha_limite: esquema.fecha_limite }, { descripcion: o.descripcion, fecha_limite: o.fecha_limite, ...datos });
  let { estado } = o;
  if (datos.estado === 'cancelado') estado = 'cancelado';
  if (datos.estado === 'activo' && ['cancelado', 'vencido'].includes(o.estado)) estado = 'activo';
  await query('UPDATE objetivos SET descripcion = $2, fecha_limite = $3, estado = $4 WHERE id = $1', [id, d.descripcion, d.fecha_limite, estado]);
  return evaluar(await cargar(alcance, id));
}

async function obtener(alcance, id) {
  return evaluar(await cargar(alcance, id));
}

module.exports = { TIPOS, listar, obtener, crear, actualizar, evaluar, progreso };
