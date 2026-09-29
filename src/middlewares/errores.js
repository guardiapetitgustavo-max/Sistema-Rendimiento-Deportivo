const { HttpError } = require('../utils/http-error');

function rutaNoEncontrada(req, res, next) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/** Traduce errores técnicos (PostgreSQL, red, archivos) a respuestas claras para el usuario. */
function traducir(err) {
  if (err instanceof HttpError) return err;
  if (err.type === 'entity.parse.failed') return new HttpError(400, 'Los datos enviados no tienen un formato válido');
  if (err.type === 'entity.too.large') return new HttpError(413, 'Los datos enviados son demasiado grandes');
  if (err.code === 'LIMIT_FILE_SIZE') return new HttpError(413, 'El archivo supera el tamaño máximo permitido (4 MB)');
  if (typeof err.code === 'string' && err.code.startsWith('LIMIT_')) return new HttpError(400, 'El archivo enviado no es válido');

  switch (err.code) {
    case '23505': return new HttpError(409, 'Ya existe un registro con esos datos');
    case '23503': return new HttpError(409, 'El registro está relacionado con otros datos y no se puede modificar así');
    case '42P01':
    case '42703':
      return new HttpError(500, 'La base de datos no está preparada. Ejecuta el archivo sql/schema.sql en Supabase.');
    case '57014': return new HttpError(504, 'La operación tardó demasiado. Inténtalo con menos datos.');
    case '53300': return new HttpError(503, 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.');
    default: break;
  }
  if (typeof err.code === 'string' && /^2[23]/.test(err.code)) {
    return new HttpError(400, 'Los datos no cumplen las reglas de la base de datos');
  }
  if (/Query read timeout/i.test(err.message || '')) return new HttpError(504, 'La operación tardó demasiado. Inténtalo de nuevo.');
  return null;
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  const conocido = traducir(err);
  if (conocido) {
    if (conocido.status >= 500) {
      console.error(JSON.stringify({ nivel: 'error', referencia: req.id, ruta: `${req.method} ${req.originalUrl}`, codigo: err.code, mensaje: err.message }));
    }
    return res.status(conocido.status).json({ error: conocido.message, detalles: conocido.detalles, referencia: req.id });
  }
  console.error(JSON.stringify({
    nivel: 'error', referencia: req.id, ruta: `${req.method} ${req.originalUrl}`, mensaje: err.message, pila: err.stack,
  }));
  return res.status(500).json({
    error: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
    referencia: req.id,
  });
}

module.exports = { rutaNoEncontrada, manejadorErrores };
