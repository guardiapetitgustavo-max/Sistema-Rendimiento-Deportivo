/**
 * Registro de lesiones (FASE 11). Es SEGUIMIENTO deportivo, no un historial clínico: guarda lo necesario para
 * calcular la incidencia por 1000 h de exposición, los días de baja y la gravedad (consenso de Fuller et al., 2006).
 */
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO } = require('../../utils/valores');
const { condicionDeportista, deportistaEnAlcance } = require('../../core/alcance');
const I = require('../../domain/indicadores');

const TIPOS = ['muscular', 'ligamentosa', 'tendinosa', 'osea', 'articular', 'contusion', 'otra'];
const MECANISMOS = ['contacto', 'sin_contacto', 'sobreuso'];
const CONTEXTOS = ['entrenamiento', 'competencia', 'otro'];

const esquema = {
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', requerido: true, min: 1 },
  fecha_inicio: { tipo: 'fecha', etiqueta: 'Fecha de la lesión', requerido: true },
  fecha_alta: { tipo: 'fecha', etiqueta: 'Fecha de alta' },
  zona: { tipo: 'texto', etiqueta: 'Zona del cuerpo', requerido: true, maxLargo: 80 },
  tipo: { tipo: 'texto', etiqueta: 'Tipo', maxLargo: 20 },
  mecanismo: { tipo: 'texto', etiqueta: 'Mecanismo', maxLargo: 20 },
  contexto: { tipo: 'texto', etiqueta: 'Contexto', maxLargo: 20 },
  recurrente: { tipo: 'booleano', etiqueta: 'Recurrente' },
  descripcion: { tipo: 'texto', etiqueta: 'Descripción', maxLargo: 500 },
};

function revisarValores(d) {
  if (d.tipo && !TIPOS.includes(d.tipo)) throw new HttpError(400, `Tipo no válido (usa: ${TIPOS.join(', ')})`);
  if (d.mecanismo && !MECANISMOS.includes(d.mecanismo)) throw new HttpError(400, `Mecanismo no válido (usa: ${MECANISMOS.join(', ')})`);
  if (d.contexto && !CONTEXTOS.includes(d.contexto)) throw new HttpError(400, `Contexto no válido (usa: ${CONTEXTOS.join(', ')})`);
  const hoy = hoyISO();
  if (d.fecha_inicio && d.fecha_inicio > hoy) throw new HttpError(400, 'La fecha de la lesión no puede ser futura');
  if (d.fecha_alta && d.fecha_alta > hoy) throw new HttpError(400, 'La fecha de alta no puede ser futura');
  if (d.fecha_alta && d.fecha_inicio && d.fecha_alta < d.fecha_inicio) throw new HttpError(400, 'El alta no puede ser anterior a la lesión');
}

/** Añade días de baja y gravedad calculados. */
function enriquecer(l, hoy = hoyISO()) {
  const dias = I.diasBaja(l, hoy);
  return { ...l, dias_baja: dias, en_curso: !l.fecha_alta, gravedad: l.fecha_alta ? I.gravedad(dias) : null, gravedad_minima: I.gravedad(dias) };
}

const SELECT = `SELECT l.*, to_char(l.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(l.fecha_alta, 'YYYY-MM-DD') AS fecha_alta,
  d.nombre AS deportista, d.codigo FROM lesiones l JOIN deportistas d ON d.id = l.deportista_id`;

async function listar(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = ['l.activo', 'd.activo', `l.academia_id = $1`, condicionDeportista('d', '$1', '$2')];
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`l.deportista_id = $${valores.length}`); }
  if (consulta.estado === 'en_curso') filtros.push('l.fecha_alta IS NULL');
  if (consulta.estado === 'alta') filtros.push('l.fecha_alta IS NOT NULL');
  const { rows } = await query(`${SELECT} WHERE ${filtros.join(' AND ')} ORDER BY l.fecha_inicio DESC, l.id DESC LIMIT 2000`, valores);
  return rows.map((l) => enriquecer(l));
}

async function obtener(alcance, id) {
  const { rows } = await query(
    `${SELECT} WHERE l.id = $3 AND l.activo AND ${condicionDeportista('d', '$1', '$2')}`, [alcance.academia, alcance.coach, id],
  );
  if (!rows.length) throw noEncontrado('Lesión');
  return enriquecer(rows[0]);
}

async function crear(alcance, datos = {}, usuario = null) {
  const d = validar(esquema, datos);
  revisarValores(d);
  const dep = await deportistaEnAlcance(alcance, d.deportista_id);
  const { rows } = await query(
    `INSERT INTO lesiones (academia_id, deportista_id, fecha_inicio, fecha_alta, zona, tipo, mecanismo, contexto, recurrente, descripcion, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [alcance.academia, dep.id, d.fecha_inicio, d.fecha_alta, d.zona, d.tipo || 'otra', d.mecanismo, d.contexto || 'entrenamiento', d.recurrente, d.descripcion, usuario?.id ?? null],
  );
  return obtener(alcance, rows[0].id);
}

async function actualizar(alcance, id, datos = {}) {
  const actual = await obtener(alcance, id);
  const { deportista_id: _ignorado, ...resto } = esquema;
  const d = validar(resto, datos, { parcial: true });
  if ('tipo' in d && !d.tipo) d.tipo = 'otra';
  if ('contexto' in d && !d.contexto) d.contexto = 'entrenamiento';
  revisarValores({ ...actual, ...d });
  const campos = Object.keys(d);
  if (!campos.length) return actual;
  await query(
    `UPDATE lesiones SET ${campos.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [id, ...campos.map((c) => d[c])],
  );
  return obtener(alcance, id);
}

async function darDeBaja(alcance, id) {
  await obtener(alcance, id);
  await query('UPDATE lesiones SET activo = false WHERE id = $1', [id]);
}

module.exports = {
  TIPOS, MECANISMOS, CONTEXTOS, listar, obtener, crear, actualizar, darDeBaja, enriquecer,
};
