const { query } = require('../../db/pool');
const { noEncontrado, HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { resumirDeportista } = require('../../domain/rendimiento');

const esquema = {
  codigo: { tipo: 'texto', etiqueta: 'Código', requerido: true, maxLargo: 30 },
  nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 },
  edad: { tipo: 'entero', etiqueta: 'Edad', min: 4, max: 100 },
  categoria: { tipo: 'texto', etiqueta: 'Categoría', maxLargo: 50 },
  disciplina: { tipo: 'texto', etiqueta: 'Disciplina', maxLargo: 80 },
};
const { codigo, ...esquemaEdicion } = esquema; // el código no se edita

/**
 * Carga los deportistas activos con sus evaluaciones activas (orden cronológico)
 * y el resumen calculado de cada uno. Es la base de dashboard, alertas, reportes, IA y ML.
 *
 * `alcance` = { academia, coach }: siempre dentro de UNA academia; coach null = toda la academia.
 */
async function cargarAcademia(alcance, { deportistaId = null } = {}) {
  const { rows: deportistas } = await query(
    `SELECT d.*, u.nombre AS coach FROM deportistas d JOIN usuarios u ON u.id = d.usuario_id
     WHERE d.academia_id = $1 AND ($2::int IS NULL OR d.usuario_id = $2) AND d.activo
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
    'SELECT * FROM deportistas WHERE id = $1 AND academia_id = $2 AND ($3::int IS NULL OR usuario_id = $3) AND activo',
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
  const d = validar(esquema, datos);
  const coachId = await coachDestino(alcance, datos, actor);
  // El código es único en toda la academia
  const { rows: existentes } = await query(
    'SELECT id, activo, usuario_id FROM deportistas WHERE academia_id = $1 AND codigo = $2',
    [alcance.academia, d.codigo],
  );
  if (existentes[0]?.activo) throw new HttpError(409, `Ya existe un deportista con el código "${d.codigo}" en la academia`);

  if (existentes[0]) {
    // Estaba dado de baja: se reactiva conservando todo su historial (con el coach que lo registra)
    const { rows } = await query(
      `UPDATE deportistas SET nombre = $2, edad = $3, categoria = $4, disciplina = $5, usuario_id = $6, activo = true
       WHERE id = $1 RETURNING *`,
      [existentes[0].id, d.nombre, d.edad, d.categoria, d.disciplina, coachId],
    );
    return { ...rows[0], reactivado: true };
  }

  const { rows } = await query(
    `INSERT INTO deportistas (academia_id, usuario_id, codigo, nombre, edad, categoria, disciplina)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [alcance.academia, coachId, d.codigo, d.nombre, d.edad, d.categoria, d.disciplina],
  );
  return rows[0];
}

async function actualizar(alcance, id, datos, actor) {
  const actual = await obtener(alcance, id);
  const d = validar(esquemaEdicion, datos);
  // Solo el administrador puede pasar un deportista a otro coach de la academia
  const coachId = (await coachDestino({ ...alcance, coach: null }, datos, actor, { requerido: false })) || actual.usuario_id;
  const { rows } = await query(
    `UPDATE deportistas SET nombre = $2, edad = $3, categoria = $4, disciplina = $5, usuario_id = $6
     WHERE id = $1 RETURNING *`,
    [id, d.nombre, d.edad, d.categoria, d.disciplina, coachId],
  );
  return rows[0];
}

/** Baja lógica: deja de mostrarse pero conserva su historial. */
async function darDeBaja(alcance, id) {
  await obtener(alcance, id);
  await query('UPDATE deportistas SET activo = false WHERE id = $1', [id]);
}

module.exports = {
  esquema, cargarAcademia, cargarDeportista, listar, obtener, crear, actualizar, darDeBaja,
};
