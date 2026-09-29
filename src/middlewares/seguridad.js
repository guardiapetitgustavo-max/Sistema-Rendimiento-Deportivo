const crypto = require('crypto');
const { HttpError } = require('../utils/http-error');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF: toda petición que modifica datos debe traer la cabecera
 * `X-Requested-With: fetch`. Un formulario de otro sitio no puede enviarla,
 * y la cookie de sesión es SameSite=Lax.
 */
function proteccionCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method) || req.get('X-Requested-With') === 'fetch') return next();
  return next(new HttpError(403, 'Solicitud rechazada por seguridad'));
}

/**
 * Cabeceras HTTP que endurecen la aplicación (clickjacking, sniffing, fuga por referer).
 * La política CSP del frontend está en public/index.html.
 */
function cabecerasSeguridad(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  });
  next();
}

/** Identificador único por petición: aparece en los errores para poder rastrearlos. */
function idSolicitud(req, res, next) {
  req.id = crypto.randomBytes(4).toString('hex');
  res.set('X-Request-Id', req.id);
  next();
}

/** Las respuestas de la API nunca se guardan en caché (datos personales y siempre actuales). */
function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * Límite de peticiones por IP (ventana deslizante en memoria de cada instancia).
 * Frena abusos y bucles accidentales del navegador sin afectar el uso normal.
 */
function limitarPeticiones({ maximo = 300, ventanaMs = 60000 } = {}) {
  const registro = new Map();
  return (req, res, next) => {
    const ahora = Date.now();
    const clave = req.ip || 'desconocida';
    const marcas = (registro.get(clave) || []).filter((t) => ahora - t < ventanaMs);
    marcas.push(ahora);
    registro.set(clave, marcas);
    if (registro.size > 5000) registro.delete(registro.keys().next().value); // evita crecer sin límite
    if (marcas.length > maximo) {
      res.set('Retry-After', String(Math.ceil(ventanaMs / 1000)));
      return next(new HttpError(429, 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.'));
    }
    return next();
  };
}

module.exports = { proteccionCsrf, cabecerasSeguridad, idSolicitud, sinCache, limitarPeticiones };
