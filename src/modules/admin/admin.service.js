/**
 * Administración de cuentas. Solo el administrador crea coaches (no hay registro público),
 * puede editarlos, desactivarlos, restablecer su contraseña, mover sus deportistas a otro
 * coach y ver estadísticas de toda la academia.
 */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

const ROLES = ['coach', 'admin'];
const MIN_CLAVE = 6;

const esquemaCuenta = {
  nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 },
  correo: { tipo: 'correo', etiqueta: 'Correo', requerido: true },
  rol: { tipo: 'texto', etiqueta: 'Rol' },
  activo: { tipo: 'booleano', etiqueta: 'Activo' },
};

const COLUMNAS_PUBLICAS = 'id, nombre, correo, rol, activo, debe_cambiar_clave, ultimo_acceso, creado_en';

function validarRol(rol) {
  if (rol && !ROLES.includes(rol)) throw new HttpError(400, 'El rol debe ser "coach" o "admin"');
  return rol || 'coach';
}

/** Contraseña temporal legible (sin caracteres que se confundan como 0/O o 1/l). */
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => letras[b % letras.length]).join('');
}

function claveValida(password) {
  const clave = String(password ?? '').trim();
  if (!clave) return claveTemporal();
  if (clave.length < MIN_CLAVE) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
  if (clave.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga');
  return clave;
}

async function cuenta(id) {
  const { rows } = await query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [id]);
  if (!rows.length) throw noEncontrado('Usuario');
  return rows[0];
}

/** Evita dejar el sistema sin ningún administrador activo. */
async function protegerUltimoAdmin(id) {
  const { rows } = await query("SELECT count(*)::int AS total FROM usuarios WHERE rol = 'admin' AND activo AND id <> $1", [id]);
  if (!rows[0].total) throw new HttpError(400, 'Debe quedar al menos un administrador activo');
}

async function resumen() {
  const { rows } = await query(`
    SELECT
      (SELECT count(*) FROM usuarios WHERE rol = 'coach')::int                   AS coaches,
      (SELECT count(*) FROM usuarios WHERE rol = 'coach' AND activo)::int        AS coaches_activos,
      (SELECT count(*) FROM usuarios WHERE rol = 'admin')::int                   AS administradores,
      (SELECT count(*) FROM deportistas WHERE activo)::int                       AS deportistas,
      (SELECT count(*) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
        WHERE e.activa AND d.activo)::int                                        AS evaluaciones,
      (SELECT count(*) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
        WHERE e.activa AND d.activo AND e.fecha >= current_date - 30)::int       AS evaluaciones_30_dias,
      (SELECT round(avg(e.puntuacion_general)::numeric, 1) FROM evaluaciones e
        JOIN deportistas d ON d.id = e.deportista_id WHERE e.activa AND d.activo)::float AS promedio_general,
      (SELECT count(*) FROM usuarios WHERE ultimo_acceso >= now() - interval '7 days')::int AS activos_7_dias`);
  return rows[0];
}

/** Todas las cuentas con la actividad de cada una. */
async function listar() {
  const { rows } = await query(`
    SELECT u.id, u.nombre, u.correo, u.rol, u.activo, u.debe_cambiar_clave, u.ultimo_acceso, u.creado_en,
           count(DISTINCT d.id) FILTER (WHERE d.activo)::int                   AS deportistas,
           count(e.id) FILTER (WHERE e.activa AND d.activo)::int               AS evaluaciones,
           max(e.fecha) FILTER (WHERE e.activa AND d.activo)                   AS ultima_evaluacion,
           round(avg(e.puntuacion_general) FILTER (WHERE e.activa AND d.activo)::numeric, 1)::float AS promedio
    FROM usuarios u
    LEFT JOIN deportistas d  ON d.usuario_id = u.id
    LEFT JOIN evaluaciones e ON e.deportista_id = d.id
    GROUP BY u.id
    ORDER BY u.rol, u.activo DESC, u.nombre`);
  return rows;
}

/** Crea una cuenta. Si no se indica contraseña se genera una temporal y se devuelve una sola vez. */
async function crear(datos) {
  const d = validar(esquemaCuenta, datos);
  const rol = validarRol(d.rol);
  const clave = claveValida(datos.password);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, correo, password_hash, rol, debe_cambiar_clave)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (correo) DO NOTHING
     RETURNING ${COLUMNAS_PUBLICAS}`,
    [d.nombre, d.correo, await bcrypt.hash(clave, 10), rol],
  );
  if (!rows.length) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  return { ...rows[0], clave_temporal: clave };
}

async function actualizar(actor, id, datos) {
  const actual = await cuenta(id);
  const d = validar(esquemaCuenta, { ...actual, ...datos });
  const rol = validarRol(d.rol);
  const activo = datos.activo === undefined ? actual.activo : d.activo;

  if (id === actor.id && (rol !== actual.rol || !activo)) {
    throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
  }
  if (actual.rol === 'admin' && actual.activo && (rol !== 'admin' || !activo)) await protegerUltimoAdmin(id);

  const { rows } = await query(
    `UPDATE usuarios SET nombre = $2, correo = $3, rol = $4, activo = $5 WHERE id = $1
     RETURNING ${COLUMNAS_PUBLICAS}`,
    [id, d.nombre, d.correo, rol, activo],
  );
  return rows[0];
}

/** Pone una contraseña nueva (o una temporal generada) y obliga a cambiarla al entrar. */
async function restablecerClave(actor, id, datos = {}) {
  if (id === actor.id) throw new HttpError(400, 'Para cambiar tu propia contraseña usa "Mi cuenta"');
  const usuario = await cuenta(id);
  const clave = claveValida(datos.password);
  await query('UPDATE usuarios SET password_hash = $2, debe_cambiar_clave = true WHERE id = $1', [id, await bcrypt.hash(clave, 10)]);
  await query('DELETE FROM intentos_login WHERE clave LIKE $1', [`%::${usuario.correo}`]);
  return { clave_temporal: clave };
}

/** Pasa todos los deportistas (con su historial) de un coach a otro. */
async function transferir(id, datos = {}) {
  const destino = Number(datos.destino_id);
  if (!Number.isInteger(destino) || destino === id) throw new HttpError(400, 'Elige un coach de destino distinto');
  await cuenta(id);
  const receptor = await cuenta(destino);
  if (!receptor.activo) throw new HttpError(400, 'El coach de destino está desactivado');

  return transaccion(async (cliente) => {
    const { rows: choques } = await cliente.query(
      `SELECT o.codigo FROM deportistas o JOIN deportistas d ON d.codigo = o.codigo
       WHERE o.usuario_id = $1 AND d.usuario_id = $2`,
      [id, destino],
    );
    if (choques.length) {
      throw new HttpError(409, `El coach de destino ya tiene deportistas con estos códigos: ${choques.map((c) => c.codigo).slice(0, 10).join(', ')}`);
    }
    const { rowCount } = await cliente.query('UPDATE deportistas SET usuario_id = $2 WHERE usuario_id = $1', [id, destino]);
    await cliente.query('DELETE FROM modelos_ml WHERE usuario_id = $1', [id]);
    return { deportistas_transferidos: rowCount, destino: receptor.nombre };
  });
}

/** Elimina una cuenta sin deportistas. Con datos, primero hay que transferirlos o desactivar la cuenta. */
async function eliminar(actor, id) {
  if (id === actor.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta');
  const usuario = await cuenta(id);
  const { rows } = await query('SELECT count(*)::int AS total FROM deportistas WHERE usuario_id = $1', [id]);
  if (rows[0].total) {
    throw new HttpError(409, `Esta cuenta tiene ${rows[0].total} deportista(s). Transfiérelos a otro coach o desactiva la cuenta.`);
  }
  if (usuario.rol === 'admin' && usuario.activo) await protegerUltimoAdmin(id);
  await query('DELETE FROM usuarios WHERE id = $1', [id]);
}

module.exports = {
  ROLES, resumen, listar, crear, actualizar, restablecerClave, transferir, eliminar,
};
