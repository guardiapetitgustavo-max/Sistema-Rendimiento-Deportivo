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
           EXISTS (SELECT 1 FROM membresias mm WHERE mm.academia_id = a.id AND mm.usuario_id = $1 AND mm.activo) AS soy_miembro,
           (SELECT jsonb_build_object('id', su.id, 'plan', pl.clave, 'nombre', pl.nombre, 'estado', su.estado, 'inicio', su.inicio, 'fin', su.fin)
              FROM suscripciones su JOIN planes pl ON pl.id = su.plan_id WHERE su.academia_id = a.id AND su.actual) AS suscripcion
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
    const claveP = String(datos.plan || 'PRO').toUpperCase();
    const { rows: planes } = await cliente.query('SELECT id FROM planes WHERE clave = $1 AND activo', [claveP]);
    if (!planes.length) throw new HttpError(400, 'Plan no válido');
    await cliente.query("INSERT INTO suscripciones (academia_id, plan_id, estado) VALUES ($1, $2, $3)",
      [nueva.id, planes[0].id, datos.estado_suscripcion === 'prueba' ? 'prueba' : 'activa']);

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

// ---------------------------------------------------------------------------
// Planes SaaS, suscripciones y cobros de la plataforma (FASE 9)
// ---------------------------------------------------------------------------
const { MODULOS } = require('../../core/modulos');
const { RECURSOS, resumenUso } = require('../../core/limites');

async function listarPlanes() {
  const { rows } = await query(`SELECT p.*, (SELECT count(*)::int FROM suscripciones s WHERE s.plan_id = p.id AND s.actual) AS academias
    FROM planes p ORDER BY p.orden, p.id`);
  return { planes: rows, recursos: Object.fromEntries(Object.entries(RECURSOS).map(([k, v]) => [k, v.etiqueta])), modulos: MODULOS.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta })) };
}

/** Crea o modifica un plan. Los límites null = sin límite. */
async function guardarPlan(datos = {}) {
  const d = validar({
    clave: { tipo: 'texto', etiqueta: 'Clave', requerido: true, maxLargo: 20 },
    nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 60 },
    descripcion: { tipo: 'texto', etiqueta: 'Descripción', maxLargo: 300 },
    precio_mensual: { tipo: 'numero', etiqueta: 'Precio mensual', min: 0, max: 100000 },
    moneda: { tipo: 'texto', etiqueta: 'Moneda', maxLargo: 3 },
    orden: { tipo: 'entero', etiqueta: 'Orden', min: 0, max: 100 },
    activo: { tipo: 'booleano', etiqueta: 'Activo' },
  }, { activo: true, ...datos });
  const clave = d.clave.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const limites = {};
  for (const recurso of Object.keys(RECURSOS)) {
    const v = datos.limites?.[recurso];
    limites[recurso] = v === null || v === undefined || v === '' ? null : Math.max(0, Number(v));
    if (Number.isNaN(limites[recurso])) throw new HttpError(400, `Límite no válido: ${recurso}`);
  }
  const modulos = (Array.isArray(datos.modulos) ? datos.modulos : []).filter((m) => MODULOS.some((x) => x.clave === m));
  const { rows } = await query(
    `INSERT INTO planes (clave, nombre, descripcion, precio_mensual, moneda, limites, modulos, orden, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, precio_mensual = EXCLUDED.precio_mensual,
       moneda = EXCLUDED.moneda, limites = EXCLUDED.limites, modulos = EXCLUDED.modulos, orden = EXCLUDED.orden, activo = EXCLUDED.activo
     RETURNING *`,
    [clave, d.nombre, d.descripcion, d.precio_mensual ?? 0, (d.moneda || 'USD').toUpperCase(), JSON.stringify(limites), JSON.stringify(modulos), d.orden ?? 0, d.activo],
  );
  return rows[0];
}

/** Cambia el plan o el estado de la suscripción: la anterior se conserva en el historial (actual = false). */
async function cambiarSuscripcion(academiaId, datos = {}) {
  await academia(academiaId);
  const estado = datos.estado || 'activa';
  if (!['prueba', 'activa', 'vencida', 'suspendida', 'cancelada'].includes(estado)) throw new HttpError(400, 'Estado de suscripción no válido');
  const { rows: planes } = await query('SELECT id FROM planes WHERE clave = $1', [String(datos.plan || '').toUpperCase()]);
  if (!planes.length) throw new HttpError(400, 'Plan no válido');
  const fin = datos.fin ? validar({ fin: { tipo: 'fecha', etiqueta: 'Fin' } }, { fin: datos.fin }).fin : null;
  return transaccion(async (cliente) => {
    await cliente.query('UPDATE suscripciones SET actual = false WHERE academia_id = $1 AND actual', [academiaId]);
    const { rows } = await cliente.query(
      'INSERT INTO suscripciones (academia_id, plan_id, estado, fin, notas) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [academiaId, planes[0].id, estado, fin, datos.notas ? String(datos.notas).slice(0, 300) : null],
    );
    return rows[0];
  });
}

async function historialSuscripciones(academiaId) {
  const { rows } = await query(
    `SELECT s.*, to_char(s.inicio, 'YYYY-MM-DD') AS inicio, to_char(s.fin, 'YYYY-MM-DD') AS fin, p.clave AS plan, p.nombre AS plan_nombre, p.limites
     FROM suscripciones s JOIN planes p ON p.id = s.plan_id WHERE s.academia_id = $1 ORDER BY s.id DESC`, [academiaId],
  );
  const actual = rows.find((r) => r.actual);
  return { historial: rows, uso: await resumenUso(academiaId, actual?.limites || {}) };
}

async function registrarPagoPlataforma(usuarioId, academiaId, datos = {}) {
  await academia(academiaId);
  const d = validar({
    monto: { tipo: 'numero', etiqueta: 'Monto', requerido: true, min: 0 },
    moneda: { tipo: 'texto', etiqueta: 'Moneda', maxLargo: 3 },
    fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
    metodo: { tipo: 'texto', etiqueta: 'Método', maxLargo: 40 },
    referencia: { tipo: 'texto', etiqueta: 'Referencia', maxLargo: 80 },
  }, datos);
  const { rows } = await query(
    `INSERT INTO pagos_plataforma (academia_id, suscripcion_id, monto, moneda, fecha, metodo, referencia, registrado_por)
     VALUES ($1, (SELECT id FROM suscripciones WHERE academia_id = $1 AND actual), $2, $3, coalesce($4, CURRENT_DATE), $5, $6, $7) RETURNING *`,
    [academiaId, d.monto, (d.moneda || 'USD').toUpperCase(), d.fecha, d.metodo, d.referencia, usuarioId],
  );
  return rows[0];
}

async function pagosPlataforma() {
  const { rows } = await query(
    `SELECT p.*, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, a.nombre AS academia FROM pagos_plataforma p JOIN academias a ON a.id = p.academia_id
     ORDER BY p.fecha DESC, p.id DESC LIMIT 500`,
  );
  return rows;
}

module.exports = {
  resumen, listar, crear, actualizar, obtenerAcceso,
  listarPlanes, guardarPlan, cambiarSuscripcion, historialSuscripciones, registrarPagoPlataforma, pagosPlataforma,
};
