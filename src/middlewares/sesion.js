const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { HttpError } = require('../utils/http-error');

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
  const token = jwt.sign(
    { sub: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    env.jwtSecret,
    { expiresIn: `${env.sesionHoras}h` },
  );
  res.cookie(COOKIE_SESION, token, opcionesCookie());
}

function cerrarSesion(res) {
  const { maxAge, ...opciones } = opcionesCookie();
  res.clearCookie(COOKIE_SESION, opciones);
}

/** Devuelve los datos del coach si la cookie de sesión es válida; si no, null. */
function leerSesion(req) {
  const token = req.cookies?.[COOKIE_SESION];
  if (!token) return null;
  try {
    const datos = jwt.verify(token, env.jwtSecret);
    return { id: Number(datos.sub), nombre: datos.nombre, correo: datos.correo, rol: datos.rol };
  } catch {
    return null;
  }
}

/** Exige una sesión válida y deja los datos del coach en req.usuario. */
function requiereSesion(req, res, next) {
  const usuario = leerSesion(req);
  if (!usuario) {
    if (req.cookies?.[COOKIE_SESION]) cerrarSesion(res);
    return next(new HttpError(401, 'Tu sesión expiró o no has iniciado sesión'));
  }
  req.usuario = usuario;
  return next();
}

module.exports = { iniciarSesion, cerrarSesion, leerSesion, requiereSesion };
