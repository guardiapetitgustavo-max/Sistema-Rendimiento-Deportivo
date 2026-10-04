/**
 * Usuarios de una academia (lo gestiona su administrador). No hay registro público.
 *
 * Una persona (usuarios) puede pertenecer a varias academias (membresias), con un rol en cada una.
 * Por eso, lo que es de la PERSONA (nombre, correo, contraseña) solo lo cambia el administrador si esa
 * cuenta pertenece únicamente a su academia: así el administrador de una academia nunca puede tomar
 * el control de una cuenta que también se usa en otra.
 */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { verificarLimite } = require('../../core/limites');
const { validar } = require('../../utils/validar');
const { ROLES_ACADEMIA } = require('../../core/permisos');

const MIN_CLAVE = 6;

const esquemaCuenta = {
  nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 },
  correo: { tipo: 'correo', etiqueta: 'Correo', requerido: true },
  rol: { tipo: 'texto', etiqueta: 'Rol' },
  activo: { tipo: 'booleano', etiqueta: 'Activo' },
};

function validarRol(rol) {
  if (rol && !ROLES_ACADEMIA.includes(rol)) throw new HttpError(400, 'El rol debe ser administrador, coach, profesional, deportista o padre');
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

/** Miembro de la academia con los datos de su cuenta. */
async function miembro(academia, usuarioId) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.correo, u.es_super_admin, u.debe_cambiar_clave, u.ultimo_acceso, u.creado_en,
            m.rol, m.activo,
            (SELECT count(*)::int FROM membresias o WHERE o.usuario_id = u.id AND o.academia_id <> $1) AS otras_academias
     FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.academia_id = $1 AND m.usuario_id = $2`,
    [academia, usuarioId],
  );
  if (!rows.length) throw noEncontrado('Usuario');
  return rows[0];
}

/** ¿Puede el administrador de esta academia cambiar la identidad (nombre, correo, clave) de esta cuenta? */
function puedeCambiarIdentidad(actor, cuenta) {
  if (cuenta.es_super_admin && !actor.es_super_admin) return false;
  return cuenta.otras_academias === 0 || actor.es_super_admin;
}

/** Evita dejar la academia sin ningún administrador activo. */
async function protegerUltimoAdmin(academia, usuarioId) {
  const { rows } = await query(
    "SELECT count(*)::int AS total FROM membresias WHERE academia_id = $1 AND rol = 'admin' AND activo AND usuario_id <> $2",
    [academia, usuarioId],
  );
  if (!rows[0].total) throw new HttpError(400, 'La academia debe tener al menos un administrador activo');
}

async function resumen(academia) {
  const { rows } = await query(`
    SELECT
      (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'coach')::int              AS coaches,
      (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'coach' AND activo)::int   AS coaches_activos,
      (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'admin')::int              AS administradores,
      (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'deportista')::int         AS cuentas_deportista,
      (SELECT count(*) FROM membresias WHERE academia_id = $1 AND rol = 'padre')::int              AS cuentas_padre,
      (SELECT count(*) FROM deportistas WHERE academia_id = $1 AND activo)::int                    AS deportistas,
      (SELECT count(*) FROM deportistas WHERE academia_id = $1 AND NOT activo)::int                AS deportistas_inactivos,
      (SELECT count(*) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
        WHERE d.academia_id = $1 AND e.activa AND d.activo)::int                                   AS evaluaciones,
      (SELECT count(*) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
        WHERE d.academia_id = $1 AND e.activa AND d.activo AND e.fecha >= current_date - 30)::int  AS evaluaciones_30_dias,
      (SELECT round(avg(e.puntuacion_general)::numeric, 1) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
        WHERE d.academia_id = $1 AND e.activa AND d.activo)::float                                 AS promedio_general,
      (SELECT count(*) FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.academia_id = $1 AND u.ultimo_acceso >= now() - interval '7 days')::int            AS activos_7_dias`,
  [academia]);
  return rows[0];
}

/** Todos los miembros de la academia con su actividad y sus vínculos (deportista / hijos). */
async function listar(academia) {
  const { rows } = await query(`
    SELECT u.id, u.nombre, u.correo, u.es_super_admin, u.debe_cambiar_clave, u.ultimo_acceso, u.creado_en,
           m.rol, m.activo,
           (SELECT count(*)::int FROM membresias o WHERE o.usuario_id = u.id AND o.academia_id <> $1) AS otras_academias,
           (SELECT count(*)::int FROM deportistas d WHERE d.academia_id = $1 AND d.usuario_id = u.id AND d.activo) AS deportistas,
           (SELECT count(e.id)::int FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
             WHERE d.academia_id = $1 AND d.usuario_id = u.id AND e.activa AND d.activo) AS evaluaciones,
           (SELECT max(e.fecha) FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
             WHERE d.academia_id = $1 AND d.usuario_id = u.id AND e.activa AND d.activo) AS ultima_evaluacion,
           (SELECT round(avg(e.puntuacion_general)::numeric, 1)::float FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
             WHERE d.academia_id = $1 AND d.usuario_id = u.id AND e.activa AND d.activo) AS promedio,
           CASE m.rol
             WHEN 'deportista' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'codigo', d.codigo)), '[]')
                                     FROM deportistas d WHERE d.academia_id = $1 AND d.cuenta_id = u.id)
             WHEN 'padre' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'codigo', d.codigo)), '[]')
                                FROM tutores t JOIN deportistas d ON d.id = t.deportista_id
                                WHERE d.academia_id = $1 AND t.usuario_id = u.id)
             ELSE '[]'::jsonb
           END AS vinculos
    FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.academia_id = $1
    ORDER BY array_position(ARRAY['admin', 'coach', 'profesional', 'deportista', 'padre'], m.rol), m.activo DESC, u.nombre`,
  [academia]);
  return rows;
}

/**
 * Vincula una cuenta de deportista con su ficha (una) o una cuenta de padre con sus hijos (varias).
 * Solo fichas de ESTA academia.
 */
async function vincular(cliente, academia, cuenta, ids = []) {
  const lista = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (cuenta.rol === 'deportista' && lista.length > 1) throw new HttpError(400, 'Una cuenta de deportista se vincula con una sola ficha');
  if (lista.length) {
    const { rows } = await cliente.query('SELECT id FROM deportistas WHERE academia_id = $1 AND id = ANY($2::int[])', [academia, lista]);
    if (rows.length !== lista.length) throw new HttpError(400, 'Alguna ficha de deportista no existe en esta academia');
  }

  // Limpia vínculos anteriores de esta cuenta en esta academia
  await cliente.query('UPDATE deportistas SET cuenta_id = NULL WHERE academia_id = $1 AND cuenta_id = $2', [academia, cuenta.id]);
  await cliente.query(
    'DELETE FROM tutores t USING deportistas d WHERE d.id = t.deportista_id AND d.academia_id = $1 AND t.usuario_id = $2',
    [academia, cuenta.id],
  );
  if (!lista.length) return;

  if (cuenta.rol === 'deportista') {
    const { rows } = await cliente.query('SELECT cuenta_id FROM deportistas WHERE id = $1', [lista[0]]);
    if (rows[0].cuenta_id && rows[0].cuenta_id !== cuenta.id) throw new HttpError(409, 'Esa ficha ya está vinculada a otra cuenta de deportista');
    await cliente.query('UPDATE deportistas SET cuenta_id = $2 WHERE id = $1', [lista[0], cuenta.id]);
  } else if (cuenta.rol === 'padre') {
    await cliente.query(
      'INSERT INTO tutores (usuario_id, deportista_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
      [cuenta.id, lista],
    );
  } else {
    throw new HttpError(400, 'Solo las cuentas de deportista o de padre se vinculan con fichas');
  }
}

/**
 * Crea un miembro. Si el correo ya tiene cuenta (en otra academia), solo se le da acceso a esta
 * academia con su contraseña de siempre; si es nuevo, se genera una contraseña temporal.
 */
async function crear(academia, datos, usuario = null) {
  const d = validar(esquemaCuenta, datos);
  const rol = validarRol(d.rol);
  if (rol === 'coach' && usuario) await verificarLimite(usuario, 'coaches');

  return transaccion(async (cliente) => {
    const { rows: existentes } = await cliente.query('SELECT id FROM usuarios WHERE correo = $1', [d.correo]);
    let usuarioId = existentes[0]?.id;
    let clave = null;

    if (usuarioId) {
      const { rows: yaMiembro } = await cliente.query('SELECT 1 FROM membresias WHERE usuario_id = $1 AND academia_id = $2', [usuarioId, academia]);
      if (yaMiembro.length) throw new HttpError(409, 'Esa persona ya pertenece a esta academia');
    } else {
      clave = claveValida(datos.password);
      const { rows } = await cliente.query(
        `INSERT INTO usuarios (nombre, correo, password_hash, debe_cambiar_clave) VALUES ($1, $2, $3, true) RETURNING id`,
        [d.nombre, d.correo, await bcrypt.hash(clave, 10)],
      );
      usuarioId = rows[0].id;
    }

    await cliente.query('INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, $3)', [usuarioId, academia, rol]);
    if (['deportista', 'padre'].includes(rol) && datos.deportistas) {
      await vincular(cliente, academia, { id: usuarioId, rol }, datos.deportistas);
    }
    const { rows } = await cliente.query(
      `SELECT u.id, u.nombre, u.correo, u.debe_cambiar_clave, m.rol, m.activo
       FROM usuarios u JOIN membresias m ON m.usuario_id = u.id AND m.academia_id = $2 WHERE u.id = $1`,
      [usuarioId, academia],
    );
    return { ...rows[0], cuenta_existente: !clave, clave_temporal: clave };
  });
}

async function actualizar(actor, academia, id, datos) {
  const actual = await miembro(academia, id);
  const d = validar(esquemaCuenta, { ...actual, ...datos });
  const rol = validarRol(d.rol);
  const activo = datos.activo === undefined ? actual.activo : d.activo;

  if (id === actor.id && (rol !== actual.rol || !activo)) {
    throw new HttpError(400, 'No puedes cambiar tu propio rol ni desactivar tu propio acceso');
  }
  if (actual.rol === 'admin' && actual.activo && (rol !== 'admin' || !activo)) await protegerUltimoAdmin(academia, id);
  const cambiaIdentidad = d.nombre !== actual.nombre || d.correo !== actual.correo;
  if (cambiaIdentidad && !puedeCambiarIdentidad(actor, actual)) {
    throw new HttpError(403, 'Esta cuenta también se usa en otra academia: su nombre y correo solo los cambia la propia persona o el super administrador');
  }

  return transaccion(async (cliente) => {
    if (cambiaIdentidad) {
      await cliente.query('UPDATE usuarios SET nombre = $2, correo = $3 WHERE id = $1', [id, d.nombre, d.correo]);
    }
    await cliente.query('UPDATE membresias SET rol = $3, activo = $4 WHERE usuario_id = $1 AND academia_id = $2', [id, academia, rol, activo]);
    if (rol !== actual.rol) await vincular(cliente, academia, { id, rol: 'otro' }, []); // al cambiar de rol se limpian los vínculos
    if (['deportista', 'padre'].includes(rol) && datos.deportistas !== undefined) {
      await vincular(cliente, academia, { id, rol }, datos.deportistas);
    }
    return { ...(await miembroCon(cliente, academia, id)) };
  });
}

async function miembroCon(cliente, academia, id) {
  const { rows } = await cliente.query(
    `SELECT u.id, u.nombre, u.correo, u.debe_cambiar_clave, m.rol, m.activo
     FROM usuarios u JOIN membresias m ON m.usuario_id = u.id AND m.academia_id = $2 WHERE u.id = $1`,
    [id, academia],
  );
  return rows[0];
}

/** Pone una contraseña nueva (o una temporal generada) y obliga a cambiarla al entrar. */
async function restablecerClave(actor, academia, id, datos = {}) {
  if (id === actor.id) throw new HttpError(400, 'Para cambiar tu propia contraseña usa "Mi cuenta"');
  const cuenta = await miembro(academia, id);
  if (!puedeCambiarIdentidad(actor, cuenta)) {
    throw new HttpError(403, 'Esta cuenta también se usa en otra academia: su contraseña solo la cambia la propia persona o el super administrador');
  }
  const clave = claveValida(datos.password);
  await query('UPDATE usuarios SET password_hash = $2, debe_cambiar_clave = true WHERE id = $1', [id, await bcrypt.hash(clave, 10)]);
  await query('DELETE FROM intentos_login WHERE clave LIKE $1', [`%::${cuenta.correo}`]);
  return { clave_temporal: clave };
}

/** Pasa todos los deportistas (con su historial) de un coach a otro de la misma academia. */
async function transferir(academia, id, datos = {}) {
  const destino = Number(datos.destino_id);
  if (!Number.isInteger(destino) || destino === id) throw new HttpError(400, 'Elige un coach de destino distinto');
  await miembro(academia, id);
  const receptor = await miembro(academia, destino);
  if (!receptor.activo || !['coach', 'admin'].includes(receptor.rol)) {
    throw new HttpError(400, 'El destino debe ser un coach o administrador activo de la academia');
  }
  return transaccion(async (cliente) => {
    const { rowCount } = await cliente.query(
      'UPDATE deportistas SET usuario_id = $3 WHERE academia_id = $1 AND usuario_id = $2',
      [academia, id, destino],
    );
    await cliente.query('DELETE FROM modelos_ml WHERE academia_id = $1 AND usuario_id = $2', [academia, id]);
    return { deportistas_transferidos: rowCount, destino: receptor.nombre };
  });
}

/**
 * Quita a la persona de la academia. Si era coach con deportistas, primero hay que transferirlos.
 * Si no pertenece a ninguna otra academia (y no es super admin), su cuenta se elimina.
 */
async function eliminar(actor, academia, id) {
  if (id === actor.id) throw new HttpError(400, 'No puedes quitarte de la academia a ti mismo');
  const cuenta = await miembro(academia, id);
  const { rows } = await query('SELECT count(*)::int AS total FROM deportistas WHERE academia_id = $1 AND usuario_id = $2', [academia, id]);
  if (rows[0].total) {
    throw new HttpError(409, `Esta cuenta tiene ${rows[0].total} deportista(s) a su cargo. Transfiérelos a otro coach o desactiva la cuenta.`);
  }
  if (cuenta.rol === 'admin' && cuenta.activo) await protegerUltimoAdmin(academia, id);

  await transaccion(async (cliente) => {
    await vincular(cliente, academia, { id, rol: 'otro' }, []);
    await cliente.query('DELETE FROM modelos_ml WHERE academia_id = $1 AND usuario_id = $2', [academia, id]);
    await cliente.query('DELETE FROM membresias WHERE academia_id = $1 AND usuario_id = $2', [academia, id]);
    if (cuenta.otras_academias === 0 && !cuenta.es_super_admin) {
      await cliente.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
  });
}

module.exports = {
  resumen, listar, crear, actualizar, restablecerClave, transferir, eliminar,
};
