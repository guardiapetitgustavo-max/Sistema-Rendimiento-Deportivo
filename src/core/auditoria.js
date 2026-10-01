/**
 * Auditoría: registra eventos importantes (inicios de sesión, altas, cambios, bajas, configuración,
 * análisis de IA…). Nunca guarda contraseñas ni el cuerpo completo de las peticiones.
 */
const { query } = require('../db/pool');

const ACCION_POR_METODO = { POST: 'crear', PUT: 'modificar', PATCH: 'modificar', DELETE: 'eliminar' };

/** Inserta un evento. Un fallo de auditoría se registra en el log, pero no rompe la operación. */
async function registrar({ academia = null, usuario = null, accion, entidad = null, entidadId = null, detalle = null, ip = null }) {
  try {
    await query(
      `INSERT INTO auditoria (academia_id, usuario_id, accion, entidad, entidad_id, detalle, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [academia, usuario, accion, entidad, entidadId === null ? null : String(entidadId), detalle ? JSON.stringify(detalle) : null, ip],
    );
  } catch (error) {
    console.error(JSON.stringify({ nivel: 'error', origen: 'auditoria', accion, mensaje: error.message }));
  }
}

/** "/deportistas/12/rutina" → { entidad: 'deportistas', entidadId: '12', subruta: 'rutina' } */
function describirRuta(ruta) {
  const partes = ruta.split('?')[0].split('/').filter(Boolean);
  if (partes[0] === 'admin') partes.shift(); // /admin/usuarios/5 → entidad "usuarios"
  const entidad = partes[0] || null;
  const entidadId = partes.find((p) => /^\d+$/.test(p)) || null;
  const subruta = partes.slice(1).filter((p) => !/^\d+$/.test(p)).join('/') || null;
  return { entidad, entidadId, subruta };
}

/**
 * Middleware: toda escritura correcta (POST/PUT/PATCH/DELETE con respuesta < 400) de un usuario con
 * academia queda registrada. Se escribe ANTES de enviar la respuesta, porque en Vercel la función
 * puede congelarse justo después de responder.
 */
function auditarEscrituras(req, res, next) {
  const accion = ACCION_POR_METODO[req.method];
  if (!accion || !req.usuario?.academia) return next();

  // La ruta se toma ahora: dentro de los sub-routers Express la recorta (p. ej. '/deportistas/5' → '/5')
  const { entidad, entidadId, subruta } = describirRuta(req.path);
  const rutaCompleta = req.baseUrl + req.path;
  // Guarda el id del registro creado (si la respuesta lo trae) para enlazar el evento
  const jsonOriginal = res.json;
  res.json = function jsonAuditado(cuerpo) {
    if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) && cuerpo.id !== undefined) res.locals.idAfectado = cuerpo.id;
    return jsonOriginal.call(res, cuerpo);
  };
  const finOriginal = res.end;
  res.end = function finAuditado(...args) {
    res.end = finOriginal;
    // Si la ruta ya registró un evento más descriptivo (res.locals.auditado), no se duplica
    if (res.statusCode >= 400 || res.locals.auditado) return finOriginal.apply(res, args);
    registrar({
      academia: req.usuario.academia.id,
      usuario: req.usuario.id,
      accion: subruta || accion, // p. ej. "crear", "modificar", "eliminar", "entrenar", "password", "transferir"
      entidad,
      entidadId: entidadId ?? res.locals.idAfectado ?? null,
      detalle: { metodo: req.method, ruta: rutaCompleta, estado: res.statusCode, ...(req.alcance?.coach && req.usuario.rol === 'admin' ? { coach: req.alcance.coach } : {}) },
      ip: req.ip,
    }).finally(() => finOriginal.apply(res, args));
    return res;
  };
  return next();
}

module.exports = { registrar, auditarEscrituras, describirRuta };
