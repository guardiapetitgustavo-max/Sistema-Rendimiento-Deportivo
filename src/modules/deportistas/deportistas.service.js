const { query } = require('../../db/pool');
const { noEncontrado, HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { resumirDeportista } = require('../../domain/rendimiento');
const { condicionDeportista, perteneceAcademia } = require('../../core/alcance');
const { verificarLimite } = require('../../core/limites');
const { edad: edadDesde } = require('../../domain/medicion');

const esquema = {
  codigo: { tipo: 'texto', etiqueta: 'Código', requerido: true, maxLargo: 30 },
  nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 },
  apellidos: { tipo: 'texto', etiqueta: 'Apellidos', maxLargo: 120 },
  edad: { tipo: 'entero', etiqueta: 'Edad', min: 4, max: 100 },
  fecha_nacimiento: { tipo: 'fecha', etiqueta: 'Fecha de nacimiento' },
  sexo: { tipo: 'texto', etiqueta: 'Sexo', maxLargo: 1 },
  categoria: { tipo: 'texto', etiqueta: 'Categoría', maxLargo: 50 },
  disciplina: { tipo: 'texto', etiqueta: 'Disciplina', maxLargo: 80 },
  deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
  posicion_id: { tipo: 'entero', etiqueta: 'Posición', min: 1 },
  categoria_id: { tipo: 'entero', etiqueta: 'Categoría', min: 1 },
  altura_cm: { tipo: 'numero', etiqueta: 'Altura (cm)', min: 50, max: 250 },
  peso_kg: { tipo: 'numero', etiqueta: 'Peso (kg)', min: 10, max: 250 },
  objetivo_general: { tipo: 'texto', etiqueta: 'Objetivo', maxLargo: 400 },
};
const { codigo, ...esquemaEdicion } = esquema; // el código no se edita
const COLUMNAS_FICHA = Object.keys(esquemaEdicion);
// Las listas no traen la foto (se sirve aparte): con 30 deportistas serían varios MB por petición
const COLUMNAS_LISTA = `d.id, d.academia_id, d.usuario_id, d.cuenta_id, d.codigo, d.nombre, d.apellidos, d.edad, d.fecha_nacimiento,
  d.sexo, d.categoria, d.disciplina, d.deporte_id, d.posicion_id, d.categoria_id, d.altura_cm, d.peso_kg, d.objetivo_general,
  d.activo, d.fecha_registro, (d.foto IS NOT NULL) AS tiene_foto`;
const FOTO_VALIDA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Completa la ficha: comprueba que deporte, posición y categoría sean de la academia, calcula la edad
 * desde la fecha de nacimiento y rellena los textos de categoría y disciplina para las pantallas antiguas.
 */
async function completarFicha(alcance, d, datos) {
  if (d.sexo && !['F', 'M', 'X'].includes(d.sexo)) throw new HttpError(400, 'Sexo: usa F, M o X');
  const deporte = await perteneceAcademia('deportes', d.deporte_id, alcance.academia, 'El deporte');
  const posicion = await perteneceAcademia('posiciones', d.posicion_id, alcance.academia, 'La posición');
  const categoria = await perteneceAcademia('categorias', d.categoria_id, alcance.academia, 'La categoría');
  if (posicion && deporte && posicion.deporte_id !== deporte.id) throw new HttpError(400, 'La posición no corresponde al deporte elegido');
  if (d.fecha_nacimiento) d.edad = edadDesde(d.fecha_nacimiento) ?? d.edad;
  if (categoria) d.categoria = categoria.nombre;
  if (deporte && !d.disciplina) d.disciplina = deporte.nombre;
  if (datos.foto !== undefined) {
    if (!datos.foto) d.foto = null;
    else if (typeof datos.foto !== 'string' || !FOTO_VALIDA.test(datos.foto) || datos.foto.length > 220000) {
      throw new HttpError(400, 'La foto debe ser una imagen PNG, JPG o WEBP de hasta 150 KB');
    } else d.foto = datos.foto;
  }
  return d;
}

/** Reemplaza los equipos del deportista (solo equipos de la academia). */
async function asignarEquipos(alcance, deportistaId, equipos) {
  if (!Array.isArray(equipos)) return;
  const ids = [...new Set(equipos.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length) {
    const { rows } = await query('SELECT id FROM equipos WHERE academia_id = $1 AND id = ANY($2::int[])', [alcance.academia, ids]);
    if (rows.length !== ids.length) throw new HttpError(400, 'Algún equipo no existe en esta academia');
  }
  await query(
    'DELETE FROM equipo_miembros em USING equipos e WHERE e.id = em.equipo_id AND e.academia_id = $1 AND em.deportista_id = $2 AND NOT (em.equipo_id = ANY($3::int[]))',
    [alcance.academia, deportistaId, ids],
  );
  if (ids.length) {
    await query('INSERT INTO equipo_miembros (equipo_id, deportista_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING', [ids, deportistaId]);
  }
}

/**
 * Carga los deportistas activos con sus evaluaciones activas (orden cronológico)
 * y el resumen calculado de cada uno. Es la base de dashboard, alertas, reportes, IA y ML.
 *
 * `alcance` = { academia, coach }: siempre dentro de UNA academia; coach null = toda la academia.
 */
async function cargarAcademia(alcance, { deportistaId = null } = {}) {
  const { rows: deportistas } = await query(
    `SELECT ${COLUMNAS_LISTA}, u.nombre AS coach FROM deportistas d JOIN usuarios u ON u.id = d.usuario_id
     WHERE ${condicionDeportista('d', '$1', '$2')} AND d.activo
       AND ($3::int IS NULL OR d.id = $3)
     ORDER BY d.nombre`,
    [alcance.academia, alcance.coach, deportistaId],
  );
  if (!deportistas.length) return [];

  const { rows: evaluaciones } = await query(
    `SELECT * FROM evaluaciones
     WHERE activa AND deportista_id = ANY($1::int[])
     ORDER BY fecha, id`,
    [deportistas.map((d) => d.id)],
  );

  const porDeportista = new Map(deportistas.map((d) => [d.id, []]));
  for (const ev of evaluaciones) porDeportista.get(ev.deportista_id).push(ev);

  return deportistas.map((d) => resumirDeportista({ ...d, evaluaciones: porDeportista.get(d.id) }));
}

async function cargarDeportista(alcance, id) {
  const [deportista] = await cargarAcademia(alcance, { deportistaId: id });
  if (!deportista) throw noEncontrado('Deportista');
  return deportista;
}

const normalizar = (texto) => (texto || '').trim().toLowerCase();

async function listar(alcance, { q = '', categoria = '', disciplina = '' } = {}) {
  const academia = await cargarAcademia(alcance);
  const buscar = normalizar(q);

  const datos = academia
    .filter((d) => !buscar || normalizar(d.nombre).includes(buscar) || normalizar(d.codigo).includes(buscar))
    .filter((d) => !categoria || d.categoria === categoria)
    .filter((d) => !disciplina || d.disciplina === disciplina)
    .map(({ evaluaciones, historial_puntajes: historial, ...resto }) => resto);

  const unicos = (campo) => [...new Set(academia.map((d) => d[campo]).filter(Boolean))].sort();
  return { datos, categorias: unicos('categoria'), disciplinas: unicos('disciplina') };
}

/** Deportista activo dentro del alcance (protege contra acceso a datos de otra academia u otro coach). */
async function obtener(alcance, id) {
  const { rows } = await query(
    `SELECT * FROM deportistas d WHERE d.id = $1 AND ${condicionDeportista('d', '$2', '$3')} AND d.activo`,
    [id, alcance.academia, alcance.coach],
  );
  if (!rows.length) throw noEncontrado('Deportista');
  return rows[0];
}

/**
 * Coach dueño de un deportista. Un coach siempre es el dueño de lo que crea; el
 * administrador puede indicar `coach_id` (obligatorio si está viendo a todos los coaches).
 */
async function coachDestino(alcance, datos, actor, { requerido = true } = {}) {
  const pedido = actor?.rol === 'admin' && datos.coach_id ? Number(datos.coach_id) : null;
  const coachId = pedido || alcance.coach;
  if (!coachId) {
    if (!requerido) return null;
    throw new HttpError(400, 'Elige el coach al que pertenece el deportista');
  }
  if (pedido) {
    // El coach debe pertenecer a ESTA academia (nunca se asigna a alguien de otra)
    const { rows } = await query(
      `SELECT 1 FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.usuario_id = $1 AND m.academia_id = $2 AND m.rol IN ('coach', 'admin') AND m.activo AND u.activo`,
      [pedido, alcance.academia],
    );
    if (!rows.length) throw new HttpError(400, 'El coach elegido no pertenece a la academia o está desactivado');
  }
  return coachId;
}

async function crear(alcance, datos, actor) {
  const d = await completarFicha(alcance, validar(esquema, datos), datos);
  const coachId = await coachDestino(alcance, datos, actor);
  if (actor?.academia) await verificarLimite(actor, 'deportistas');
  // El código es único en toda la academia
  const { rows: existentes } = await query(
    'SELECT id, activo, usuario_id FROM deportistas WHERE academia_id = $1 AND codigo = $2',
    [alcance.academia, d.codigo],
  );
  if (existentes[0]?.activo) throw new HttpError(409, `Ya existe un deportista con el código "${d.codigo}" en la academia`);

  if (existentes[0]) {
    // Estaba dado de baja: se reactiva conservando todo su historial (con el coach que lo registra)
    const columnas = COLUMNAS_FICHA.filter((c) => c in d);
    const { rows } = await query(
      `UPDATE deportistas SET ${columnas.map((c, i) => `${c} = $${i + 3}`).join(', ')}, usuario_id = $2, activo = true
       WHERE id = $1 RETURNING *`,
      [existentes[0].id, coachId, ...columnas.map((c) => d[c])],
    );
    await asignarEquipos(alcance, rows[0].id, datos.equipos);
    return { ...rows[0], reactivado: true };
  }

  const columnas = ['codigo', ...COLUMNAS_FICHA, ...(d.foto !== undefined ? ['foto'] : [])].filter((c) => c in d);
  const { rows } = await query(
    `INSERT INTO deportistas (academia_id, usuario_id, ${columnas.join(', ')})
     VALUES ($1, $2, ${columnas.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING *`,
    [alcance.academia, coachId, ...columnas.map((c) => d[c])],
  );
  await asignarEquipos(alcance, rows[0].id, datos.equipos);
  return rows[0];
}

async function actualizar(alcance, id, datos, actor) {
  const actual = await obtener(alcance, id);
  // Lo que no se envía se conserva (permite editar solo algunos datos de la ficha)
  const base = Object.fromEntries(COLUMNAS_FICHA.map((c) => [c, actual[c]]));
  const d = await completarFicha(alcance, validar(esquemaEdicion, { ...base, ...datos }), datos);
  // Solo el administrador puede pasar un deportista a otro coach de la academia
  const coachId = (await coachDestino({ ...alcance, coach: null }, datos, actor, { requerido: false })) || actual.usuario_id;
  const columnas = [...COLUMNAS_FICHA, ...(d.foto !== undefined ? ['foto'] : [])];
  const { rows } = await query(
    `UPDATE deportistas SET ${columnas.map((c, i) => `${c} = $${i + 3}`).join(', ')}, usuario_id = $2
     WHERE id = $1 RETURNING *`,
    [id, coachId, ...columnas.map((c) => d[c] ?? null)],
  );
  await asignarEquipos(alcance, id, datos.equipos);
  return rows[0];
}

/** Baja lógica: deja de mostrarse pero conserva su historial. */
/** Foto del deportista (data URL guardada) como imagen. */
async function foto(alcance, id) {
  const dep = await obtener(alcance, id);
  const [, tipo, base64] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dep.foto || '') || [];
  if (!tipo) throw noEncontrado('Foto');
  return { tipo, contenido: Buffer.from(base64, 'base64') };
}

async function darDeBaja(alcance, id) {
  await obtener(alcance, id);
  await query('UPDATE deportistas SET activo = false WHERE id = $1', [id]);
}

module.exports = {
  esquema, COLUMNAS_LISTA, cargarAcademia, cargarDeportista, listar, obtener, crear, actualizar, darDeBaja, foto, asignarEquipos,
};
