const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { HttpError } = require('../utils/http-error');
const { query } = require('../db/pool');

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

function iniciarSesion(res, usuario) {
  // El token solo identifica al usuario; rol y nombre se leen siempre de la base
  const token = jwt.sign(
    { sub: usuario.id },
    env.jwtSecret,
    { expiresIn: `${env.sesionHoras}h` },
  );
  res.cookie(COOKIE_SESION, token, opcionesCookie());
}

function cerrarSesion(res) {
  const { maxAge, ...opciones } = opcionesCookie();
  res.clearCookie(COOKIE_SESION, opciones);
}

/** Datos del token de sesión si la cookie es válida; si no, null (no consulta la base). */
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
 * Usuario de la sesión, leído de la base en cada petición: así un cambio de rol,
 * de nombre o una desactivación hecha por el administrador se aplica al instante.
 */
async function leerSesion(req) {
  const datos = leerToken(req);
  if (!datos) return null;
  const { rows } = await query(
    'SELECT id, nombre, correo, rol, debe_cambiar_clave FROM usuarios WHERE id = $1 AND activo',
    [Number(datos.sub)],
  );
  return rows[0] || null;
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

module.exports = { iniciarSesion, cerrarSesion, leerSesion, requiereSesion };
