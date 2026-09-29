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
 * Carga los deportistas activos del coach con sus evaluaciones activas
 * (orden cronológico) y el resumen calculado de cada uno.
 * Es la base de dashboard, alertas, reportes, IA y ML.
 */
async function cargarAcademia(usuarioId, { deportistaId = null } = {}) {
  const { rows: deportistas } = await query(
    `SELECT * FROM deportistas
     WHERE usuario_id = $1 AND activo AND ($2::int IS NULL OR id = $2)
     ORDER BY nombre`,
    [usuarioId, deportistaId],
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

async function cargarDeportista(usuarioId, id) {
  const [deportista] = await cargarAcademia(usuarioId, { deportistaId: id });
  if (!deportista) throw noEncontrado('Deportista');
  return deportista;
}

const normalizar = (texto) => (texto || '').trim().toLowerCase();

async function listar(usuarioId, { q = '', categoria = '', disciplina = '' } = {}) {
  const academia = await cargarAcademia(usuarioId);
  const buscar = normalizar(q);

  const datos = academia
    .filter((d) => !buscar || normalizar(d.nombre).includes(buscar) || normalizar(d.codigo).includes(buscar))
    .filter((d) => !categoria || d.categoria === categoria)
    .filter((d) => !disciplina || d.disciplina === disciplina)
    .map(({ evaluaciones, historial_puntajes: historial, ...resto }) => resto);

  const unicos = (campo) => [...new Set(academia.map((d) => d[campo]).filter(Boolean))].sort();
  return { datos, categorias: unicos('categoria'), disciplinas: unicos('disciplina') };
}

/** Deportista activo del coach (protege contra acceso a datos de otro coach). */
async function obtener(usuarioId, id) {
  const { rows } = await query(
    'SELECT * FROM deportistas WHERE id = $1 AND usuario_id = $2 AND activo',
    [id, usuarioId],
  );
  if (!rows.length) throw noEncontrado('Deportista');
  return rows[0];
}

async function crear(usuarioId, datos) {
  const d = validar(esquema, datos);
  const { rows: existentes } = await query(
    'SELECT id, activo FROM deportistas WHERE usuario_id = $1 AND codigo = $2',
    [usuarioId, d.codigo],
  );
  if (existentes[0]?.activo) throw new HttpError(409, `Ya existe un deportista con el código "${d.codigo}"`);

  if (existentes[0]) {
    // Estaba dado de baja: se reactiva conservando todo su historial
    const { rows } = await query(
      `UPDATE deportistas SET nombre = $2, edad = $3, categoria = $4, disciplina = $5, activo = true
       WHERE id = $1 RETURNING *`,
      [existentes[0].id, d.nombre, d.edad, d.categoria, d.disciplina],
    );
    return { ...rows[0], reactivado: true };
  }

  const { rows } = await query(
    `INSERT INTO deportistas (usuario_id, codigo, nombre, edad, categoria, disciplina)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [usuarioId, d.codigo, d.nombre, d.edad, d.categoria, d.disciplina],
  );
  return rows[0];
}

async function actualizar(usuarioId, id, datos) {
  await obtener(usuarioId, id);
  const d = validar(esquemaEdicion, datos);
  const { rows } = await query(
    `UPDATE deportistas SET nombre = $2, edad = $3, categoria = $4, disciplina = $5
     WHERE id = $1 RETURNING *`,
    [id, d.nombre, d.edad, d.categoria, d.disciplina],
  );
  return rows[0];
}

/** Baja lógica: deja de mostrarse pero conserva su historial. */
async function darDeBaja(usuarioId, id) {
  await obtener(usuarioId, id);
  await query('UPDATE deportistas SET activo = false WHERE id = $1', [id]);
}

module.exports = {
  esquema, cargarAcademia, cargarDeportista, listar, obtener, crear, actualizar, darDeBaja,
};
