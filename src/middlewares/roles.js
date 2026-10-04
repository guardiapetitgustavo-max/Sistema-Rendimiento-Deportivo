/**
 * Autorización: academia activa, permisos (RBAC), módulos y alcance de los datos.
 *
 * req.alcance = { academia, coach }
 *   academia → id de la academia activa: TODA consulta de datos deportivos filtra por él.
 *   coach    → coach cuyos datos se ven. Un coach solo ve lo suyo; el administrador elige uno
 *              en la barra superior (cabecera X-Coach) o null para ver toda la academia.
 */
const { HttpError } = require('../utils/http-error');

const esAdmin = (usuario) => usuario?.rol === 'admin';
const tienePermiso = (usuario, clave) => Boolean(usuario?.permisos?.includes(clave));

/** Exige pertenecer a una academia activa (no suspendida). */
function requiereAcademia(req, res, next) {
  if (req.usuario.academia) return next();
  if (req.usuario.academia_suspendida) {
    return next(new HttpError(403, 'Tu academia está suspendida. Contacta con el responsable de la plataforma.'));
  }
  return next(new HttpError(403, 'Tu cuenta no pertenece a ninguna academia activa'));
}

function definirAlcance(req, res, next) {
  const { usuario } = req;
  let coach = usuario.id;
  // El profesional (nutrición, fisioterapia…) atiende a toda la academia: ve todos los deportistas,
  // pero solo puede hacer lo que le permitan sus permisos (por defecto no modifica resultados).
  if (usuario.rol === 'profesional') coach = null;
  if (esAdmin(usuario)) {
    const pedido = Number(req.get('x-coach'));
    coach = Number.isInteger(pedido) && pedido > 0 ? pedido : null;
  }
  req.alcance = { academia: usuario.academia.id, coach };
  return next();
}

function requierePermiso(clave) {
  return (req, res, next) => (tienePermiso(req.usuario, clave)
    ? next()
    : next(new HttpError(403, 'No tienes permiso para esta acción. Pídeselo al administrador de tu academia.')));
}

/** Lecturas (GET) exigen el permiso de ver; el resto, el de gestionar. */
function permisoSegunMetodo(ver, gestionar) {
  return (req, res, next) => requierePermiso(req.method === 'GET' || req.method === 'HEAD' ? ver : gestionar)(req, res, next);
}

function requiereModulo(clave) {
  return (req, res, next) => (req.usuario.academia?.modulos?.[clave]
    ? next()
    : next(new HttpError(403, 'Este módulo está desactivado en tu academia')));
}

function requiereAdmin(req, res, next) {
  if (!esAdmin(req.usuario)) return next(new HttpError(403, 'Solo el administrador de la academia puede hacer esto'));
  return next();
}

function requiereSuperAdmin(req, res, next) {
  if (!req.usuario?.es_super_admin) return next(new HttpError(403, 'Solo el super administrador de la plataforma puede hacer esto'));
  return next();
}

/** Clave del modelo de ML: el coach elegido, o el propio administrador si ve toda la academia. */
const claveModelo = (req) => req.alcance.coach ?? req.usuario.id;

/** Coach concreto sobre el que se trabaja; exige elegir uno cuando el administrador ve a todos. */
function coachDeTrabajo(req, accion) {
  if (req.alcance.coach) return req.alcance.coach;
  throw new HttpError(400, `Para ${accion}, elige primero un coach en el selector de la barra superior`);
}

module.exports = {
  esAdmin, tienePermiso, requiereAcademia, definirAlcance, requierePermiso, permisoSegunMetodo, requiereModulo,
  requiereAdmin, requiereSuperAdmin, claveModelo, coachDeTrabajo,
};
