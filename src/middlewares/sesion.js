/**
 * Sesión: cookie HttpOnly con un JWT que solo identifica al usuario y la academia activa.
 * Todo lo demás (rol, permisos, módulos, estado de la academia) se lee de la base en cada
 * petición, así cualquier cambio del administrador o del super admin se aplica al instante.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { HttpError } = require('../utils/http-error');
const { query } = require('../db/pool');
const permisos = require('../core/permisos');
const modulos = require('../core/modulos');

const COOKIE_SESION = 'sesion';

function opcionesCookie() {
  return {
    httpOnly: true, // JavaScript del navegador no puede leerla
    sameSite: 'lax',
    secure: env.esProduccion, // solo HTTPS en producción
    path: '/',
    maxAge: env.sesionHoras * 60 * 60 * 1000,
  };
}

/** Emite la cookie. `academiaId` es la academia activa preferida (se valida en cada petición). */
function iniciarSesion(res, usuario, academiaId = null) {
  const token = jwt.sign(
    { sub: usuario.id, aca: academiaId || undefined },
    env.jwtSecret,
    { expiresIn: `${env.sesionHoras}h` },
  );
  res.cookie(COOKIE_SESION, token, opcionesCookie());
}

function cerrarSesion(res) {
  const { maxAge, ...opciones } = opcionesCookie();
  res.clearCookie(COOKIE_SESION, opciones);
}

function leerToken(req) {
  const token = req.cookies?.[COOKIE_SESION];
  if (!token) return null;
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Usuario y contexto de academia. Usa la academia del token si la membresía sigue activa y la
 * academia no está suspendida; si no, la primera academia válida del usuario.
 */
async function cargarContexto(usuarioId, academiaPreferida = null) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.correo, u.es_super_admin, u.debe_cambiar_clave,
            m.rol, a.id AS academia_id, a.nombre AS academia_nombre, a.slug AS academia_slug,
            to_jsonb(c) - 'academia_id' - 'actualizado_en' - 'logo' AS config, (c.logo IS NOT NULL) AS tiene_logo,
            (SELECT coalesce(jsonb_object_agg(rp.permiso, rp.permitido), '{}'::jsonb)
               FROM rol_permisos rp WHERE rp.academia_id = a.id AND rp.rol = m.rol) AS excepciones,
            EXISTS (SELECT 1 FROM membresias ms JOIN academias s ON s.id = ms.academia_id
                    WHERE ms.usuario_id = u.id AND ms.activo AND s.estado = 'suspendida') AS tiene_suspendida
     FROM usuarios u
     LEFT JOIN LATERAL (
       SELECT mm.rol, mm.academia_id FROM membresias mm JOIN academias aa ON aa.id = mm.academia_id
       WHERE mm.usuario_id = u.id AND mm.activo AND aa.estado = 'activa'
       ORDER BY (mm.academia_id = $2) DESC, mm.academia_id
       LIMIT 1
     ) m ON true
     LEFT JOIN academias a ON a.id = m.academia_id
     LEFT JOIN academia_config c ON c.academia_id = a.id
     WHERE u.id = $1 AND u.activo`,
    [usuarioId, academiaPreferida || 0],
  );
  const fila = rows[0];
  if (!fila) return null;

  const usuario = {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    es_super_admin: fila.es_super_admin,
    debe_cambiar_clave: fila.debe_cambiar_clave,
    rol: fila.rol || null,
    academia: null,
    permisos: [],
    academia_suspendida: !fila.academia_id && fila.tiene_suspendida,
  };
  if (fila.academia_id) {
    const { modulos: guardados, ...config } = fila.config || {};
    usuario.academia = {
      id: fila.academia_id,
      nombre: fila.academia_nombre,
      slug: fila.academia_slug,
      config: { ...config, tiene_logo: fila.tiene_logo }, // el logo se sirve aparte (GET /academia/logo)
      modulos: modulos.efectivos(guardados),
    };
    usuario.permisos = permisos.efectivos(fila.rol, fila.excepciones);
  }
  return usuario;
}

async function leerSesion(req) {
  const datos = leerToken(req);
  if (!datos) return null;
  return cargarContexto(Number(datos.sub), Number(datos.aca) || null);
}

/** Exige una sesión válida de una cuenta activa y deja sus datos en req.usuario. */
async function requiereSesion(req, res, next) {
  const usuario = await leerSesion(req);
  if (!usuario) {
    if (req.cookies?.[COOKIE_SESION]) cerrarSesion(res);
    throw new HttpError(401, 'Tu sesión expiró o no has iniciado sesión');
  }
  req.usuario = usuario;
  return next();
}

module.exports = {
  iniciarSesion, cerrarSesion, leerSesion, cargarContexto, requiereSesion,
};
