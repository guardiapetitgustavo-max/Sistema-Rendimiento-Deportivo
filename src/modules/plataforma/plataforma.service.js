/**
 * Plataforma (super administrador): crea y administra academias.
 *
 * El super admin ve cifras de uso de cada academia, pero NO sus datos deportivos privados.
 * Para operar dentro de una academia necesita un acceso explícito (membresía), que queda auditado.
 */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

const esquemaAcademia = {
  nombre: { tipo: 'texto', etiqueta: 'Nombre de la academia', requerido: true, maxLargo: 120 },
  admin_nombre: { tipo: 'texto', etiqueta: 'Nombre del administrador', requerido: true, maxLargo: 120 },
  admin_correo: { tipo: 'correo', etiqueta: 'Correo del administrador', requerido: true },
};

function slugDe(nombre) {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'academia';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => letras[b % letras.length]).join('');
}

async function resumen() {
  const { rows } = await query(`
    SELECT (SELECT count(*) FROM academias)::int                               AS academias,
           (SELECT count(*) FROM academias WHERE estado = 'activa')::int       AS academias_activas,
           (SELECT count(*) FROM usuarios)::int                                AS usuarios,
           (SELECT count(*) FROM deportistas WHERE activo)::int                AS deportistas,
           (SELECT count(*) FROM evaluaciones WHERE activa)::int               AS evaluaciones,
           (SELECT count(*) FROM usuarios WHERE ultimo_acceso >= now() - interval '7 days')::int AS activos_7_dias`);
  return rows[0];
}

/** Academias con cifras de uso (solo conteos, nunca datos personales de deportistas). */
async function listar(superAdminId) {
  const { rows } = await query(`
    SELECT a.id, a.nombre, a.slug, a.estado, a.creado_en,
           count(*) FILTER (WHERE m.rol = 'admin')::int      AS administradores,
           count(*) FILTER (WHERE m.rol = 'coach')::int      AS coaches,
           count(*) FILTER (WHERE m.rol = 'deportista')::int AS cuentas_deportista,
           count(*) FILTER (WHERE m.rol = 'padre')::int      AS cuentas_padre,
           (SELECT count(*)::int FROM deportistas d WHERE d.academia_id = a.id AND d.activo) AS deportistas,
           (SELECT count(e.id)::int FROM evaluaciones e JOIN deportistas d ON d.id = e.deportista_id
             WHERE d.academia_id = a.id AND e.activa) AS evaluaciones,
           (SELECT max(u.ultimo_acceso) FROM membresias mm JOIN usuarios u ON u.id = mm.usuario_id
             WHERE mm.academia_id = a.id) AS ultima_actividad,
           (SELECT string_agg(u.correo, ', ' ORDER BY u.correo) FROM membresias mm JOIN usuarios u ON u.id = mm.usuario_id
             WHERE mm.academia_id = a.id AND mm.rol = 'admin') AS correos_admin,
           EXISTS (SELECT 1 FROM membresias mm WHERE mm.academia_id = a.id AND mm.usuario_id = $1 AND mm.activo) AS soy_miembro
    FROM academias a LEFT JOIN membresias m ON m.academia_id = a.id
    GROUP BY a.id
    ORDER BY a.creado_en DESC`, [superAdminId]);
  return rows;
}

async function academia(id) {
  const { rows } = await query('SELECT id, nombre, estado FROM academias WHERE id = $1', [id]);
  if (!rows.length) throw noEncontrado('Academia');
  return rows[0];
}

/** Crea una academia con su configuración y su primer administrador. */
async function crear(datos) {
  const d = validar(esquemaAcademia, datos);
  return transaccion(async (cliente) => {
    const { rows: [nueva] } = await cliente.query(
      'INSERT INTO academias (nombre, slug) VALUES ($1, $2) RETURNING id, nombre, slug, estado',
      [d.nombre, slugDe(d.nombre)],
    );
    await cliente.query('INSERT INTO academia_config (academia_id) VALUES ($1)', [nueva.id]);

    const { rows: existentes } = await cliente.query('SELECT id FROM usuarios WHERE correo = $1', [d.admin_correo]);
    let adminId = existentes[0]?.id;
    let clave = null;
    if (!adminId) {
      clave = datos.admin_password ? String(datos.admin_password).trim() : claveTemporal();
      if (clave.length < 6) throw new HttpError(400, 'La contraseña del administrador debe tener al menos 6 caracteres');
      const { rows } = await cliente.query(
        'INSERT INTO usuarios (nombre, correo, password_hash, debe_cambiar_clave) VALUES ($1, $2, $3, true) RETURNING id',
        [d.admin_nombre, d.admin_correo, await bcrypt.hash(clave, 10)],
      );
      adminId = rows[0].id;
    }
    await cliente.query("INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')", [adminId, nueva.id]);
    return {
      ...nueva, admin: { id: adminId, nombre: d.admin_nombre, correo: d.admin_correo }, cuenta_existente: !clave, clave_temporal: clave,
    };
  });
}

async function actualizar(id, datos = {}) {
  await academia(id);
  const d = validar({
    nombre: { tipo: 'texto', etiqueta: 'Nombre', maxLargo: 120 },
    estado: { tipo: 'texto', etiqueta: 'Estado' },
  }, datos, { parcial: true });
  if (d.estado && !['activa', 'suspendida'].includes(d.estado)) throw new HttpError(400, 'El estado debe ser "activa" o "suspendida"');
  if ('nombre' in d && !d.nombre) throw new HttpError(400, 'El nombre es obligatorio');
  const { rows } = await query(
    'UPDATE academias SET nombre = COALESCE($2, nombre), estado = COALESCE($3, estado) WHERE id = $1 RETURNING id, nombre, slug, estado',
    [id, d.nombre ?? null, d.estado ?? null],
  );
  return rows[0];
}

/** Acceso explícito del super admin a una academia (como administrador). Queda en su auditoría. */
async function obtenerAcceso(superAdminId, id) {
  await academia(id);
  await query(
    `INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')
     ON CONFLICT (usuario_id, academia_id) DO UPDATE SET activo = true`,
    [superAdminId, id],
  );
}

module.exports = {
  resumen, listar, crear, actualizar, obtenerAcceso,
};
