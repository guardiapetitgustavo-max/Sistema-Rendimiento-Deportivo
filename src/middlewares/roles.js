/**
 * Roles y alcance de los datos.
 *
 *   coach → req.alcance = su propio id (solo ve y edita lo suyo).
 *   admin → req.alcance = el coach que eligió en la barra superior (cabecera X-Coach),
 *           o null para ver a todos los coaches a la vez.
 */
const { HttpError } = require('../utils/http-error');

const esAdmin = (usuario) => usuario?.rol === 'admin';

function definirAlcance(req, res, next) {
  if (!esAdmin(req.usuario)) {
    req.alcance = req.usuario.id;
    return next();
  }
  const pedido = Number(req.get('x-coach'));
  req.alcance = Number.isInteger(pedido) && pedido > 0 ? pedido : null;
  return next();
}

function requiereAdmin(req, res, next) {
  if (!esAdmin(req.usuario)) return next(new HttpError(403, 'Solo un administrador puede hacer esto'));
  return next();
}

/** Clave con la que se guarda el modelo de ML: el coach elegido, o el propio admin si ve a todos. */
const claveModelo = (req) => req.alcance ?? req.usuario.id;

/** Coach concreto sobre el que se trabaja; exige elegir uno cuando el admin ve a todos. */
function coachDeTrabajo(req, accion) {
  if (req.alcance) return req.alcance;
  throw new HttpError(400, `Para ${accion}, elige primero un coach en el selector de la barra superior`);
}

module.exports = { esAdmin, definirAlcance, requiereAdmin, claveModelo, coachDeTrabajo };
