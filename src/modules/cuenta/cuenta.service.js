/**
 * Cuenta del coach: datos personales, contraseña, respaldo y reinicio de datos.
 */
const bcrypt = require('bcryptjs');
const { query, transaccion } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

const TABLAS_DEPORTIVAS = ['evaluaciones', 'alimentacion', 'predicciones'];

const publico = ({ id, nombre, correo, rol }) => ({ id, nombre, correo, rol });

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

  await query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [usuarioId, await bcrypt.hash(nueva, 10)]);
}

/** Copia completa de los datos del coach en JSON (incluye registros dados de baja). */
async function respaldo(usuario) {
  const { rows: listaDeportistas } = await query(
    'SELECT * FROM deportistas WHERE usuario_id = $1 ORDER BY id',
    [usuario.id],
  );
  const ids = listaDeportistas.map((d) => d.id);
  const tablas = await Promise.all(TABLAS_DEPORTIVAS.map((tabla) =>
    query(`SELECT * FROM ${tabla} WHERE deportista_id = ANY($1::int[]) ORDER BY id`, [ids])));

  return {
    generado_en: new Date().toISOString(),
    coach: { nombre: usuario.nombre, correo: usuario.correo },
    deportistas: listaDeportistas,
    ...Object.fromEntries(TABLAS_DEPORTIVAS.map((tabla, i) => [tabla, tablas[i].rows])),
  };
}

/**
 * Borra definitivamente todos los deportistas del coach (y en cascada sus
 * evaluaciones, alimentación y predicciones) y su modelo de ML. La cuenta se conserva.
 */
async function reiniciar(usuarioId, confirmacion) {
  if (confirmacion !== 'REINICIAR') {
    throw new HttpError(400, 'Escribe REINICIAR para confirmar el borrado de tus datos');
  }
  return transaccion(async (cliente) => {
    const { rowCount } = await cliente.query('DELETE FROM deportistas WHERE usuario_id = $1', [usuarioId]);
    await cliente.query('DELETE FROM modelos_ml WHERE usuario_id = $1', [usuarioId]);
    return { deportistas_borrados: rowCount };
  });
}

module.exports = { actualizarPerfil, cambiarPassword, respaldo, reiniciar };
