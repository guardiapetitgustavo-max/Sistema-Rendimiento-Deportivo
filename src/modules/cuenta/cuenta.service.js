/**
 * Cuenta del usuario: datos personales, contraseña, respaldo y reinicio de datos.
 * Cada coach puede cambiar su nombre y su contraseña; el correo y el rol solo los cambia el administrador.
 */
const bcrypt = require('bcryptjs');
const { query, transaccion } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

const TABLAS_DEPORTIVAS = ['evaluaciones', 'alimentacion', 'predicciones'];

const { publico } = require('../auth/auth.service');

async function actualizarPerfil(usuarioId, datos) {
  const { nombre } = validar({ nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 } }, datos);
  const { rows } = await query('UPDATE usuarios SET nombre = $2 WHERE id = $1 RETURNING *', [usuarioId, nombre]);
  if (!rows.length) throw new HttpError(401, 'La cuenta ya no existe');
  return publico(rows[0]);
}

async function cambiarPassword(usuarioId, datos) {
  const { actual, nueva } = validar({
    actual: { tipo: 'texto', etiqueta: 'Contraseña actual', requerido: true, maxLargo: 200 },
    nueva: { tipo: 'texto', etiqueta: 'Contraseña nueva', requerido: true, maxLargo: 200 },
  }, datos);
  if (nueva.length < 6) throw new HttpError(400, 'La contraseña nueva debe tener al menos 6 caracteres');
  if (datos.confirmar !== undefined && datos.confirmar !== nueva) throw new HttpError(400, 'Las contraseñas nuevas no coinciden');

  const { rows } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
  if (!rows.length) throw new HttpError(401, 'La cuenta ya no existe');
  if (!(await bcrypt.compare(actual, rows[0].password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta');

  if (await bcrypt.compare(nueva, rows[0].password_hash)) throw new HttpError(400, 'La contraseña nueva debe ser distinta de la actual');
  await query('UPDATE usuarios SET password_hash = $2, debe_cambiar_clave = false WHERE id = $1', [usuarioId, await bcrypt.hash(nueva, 10)]);
}

/**
 * Copia completa en JSON (incluye registros dados de baja) de los datos del alcance:
 * los del coach, o los de todos los coaches si el administrador está viendo a todos.
 */
async function respaldo(alcance, usuario) {
  const { rows: listaDeportistas } = await query(
    'SELECT * FROM deportistas WHERE academia_id = $1 AND ($2::int IS NULL OR usuario_id = $2) ORDER BY id',
    [alcance.academia, alcance.coach],
  );
  const ids = listaDeportistas.map((d) => d.id);
  const tablas = await Promise.all(TABLAS_DEPORTIVAS.map((tabla) =>
    query(`SELECT * FROM ${tabla} WHERE deportista_id = ANY($1::int[]) ORDER BY id`, [ids])));

  return {
    generado_en: new Date().toISOString(),
    generado_por: { nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    academia: usuario.academia?.nombre,
    alcance: alcance.coach ? 'un coach' : 'toda la academia',
    deportistas: listaDeportistas,
    ...Object.fromEntries(TABLAS_DEPORTIVAS.map((tabla, i) => [tabla, tablas[i].rows])),
  };
}

/**
 * Borra definitivamente todos los deportistas de un coach (y en cascada sus
 * evaluaciones, alimentación y predicciones) y su modelo de ML. La cuenta se conserva.
 * Solo lo puede hacer el administrador (ver cuenta.routes.js).
 */
async function reiniciar(alcance, confirmacion) {
  if (confirmacion !== 'REINICIAR') {
    throw new HttpError(400, 'Escribe REINICIAR para confirmar el borrado de los datos');
  }
  return transaccion(async (cliente) => {
    const { rowCount } = await cliente.query('DELETE FROM deportistas WHERE academia_id = $1 AND usuario_id = $2', [alcance.academia, alcance.coach]);
    await cliente.query('DELETE FROM modelos_ml WHERE academia_id = $1 AND usuario_id = $2', [alcance.academia, alcance.coach]);
    return { deportistas_borrados: rowCount };
  });
}

module.exports = { actualizarPerfil, cambiarPassword, respaldo, reiniciar };
