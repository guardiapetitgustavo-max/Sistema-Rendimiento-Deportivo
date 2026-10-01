/**
 * Catálogo de permisos (RBAC por academia).
 *
 * - El rol "admin" de una academia tiene siempre todos los permisos (salvo los "sinAdmin", que no aplican a él,
 *   como el portal personal del deportista).
 * - Cada permiso indica a qué roles se puede aplicar y su valor por defecto.
 * - Cada academia guarda solo sus excepciones en la tabla rol_permisos.
 * - Los permisos "soloAdmin" no se pueden conceder a otros roles (evita escaladas de privilegios).
 */
const ROLES_ACADEMIA = ['admin', 'coach', 'deportista', 'padre'];
const ROLES_CONFIGURABLES = ['coach', 'deportista', 'padre'];

const NOMBRE_ROL = { admin: 'Administrador', coach: 'Coach', deportista: 'Deportista', padre: 'Padre / madre' };

const PERMISOS = [
  // Operación deportiva (coach)
  { clave: 'dashboard.ver', grupo: 'Operación', etiqueta: 'Ver el dashboard y las alertas', roles: { coach: true } },
  { clave: 'deportistas.ver', grupo: 'Operación', etiqueta: 'Ver deportistas, perfiles y rutinas', roles: { coach: true } },
  { clave: 'deportistas.gestionar', grupo: 'Operación', etiqueta: 'Crear, editar y dar de baja deportistas', roles: { coach: true } },
  { clave: 'evaluaciones.ver', grupo: 'Operación', etiqueta: 'Ver evaluaciones', roles: { coach: true } },
  { clave: 'evaluaciones.gestionar', grupo: 'Operación', etiqueta: 'Registrar, editar y dar de baja evaluaciones', roles: { coach: true } },
  { clave: 'importacion.usar', grupo: 'Operación', etiqueta: 'Importar evaluaciones desde Excel', roles: { coach: true } },
  { clave: 'alimentacion.ver', grupo: 'Nutrición', etiqueta: 'Ver registros de alimentación', modulo: 'nutricion', roles: { coach: true } },
  { clave: 'alimentacion.gestionar', grupo: 'Nutrición', etiqueta: 'Registrar y editar alimentación', modulo: 'nutricion', roles: { coach: true } },
  { clave: 'ml.usar', grupo: 'Inteligencia', etiqueta: 'Entrenar el modelo y generar predicciones', modulo: 'ml', roles: { coach: true } },
  { clave: 'ia.usar', grupo: 'Inteligencia', etiqueta: 'Usar el asistente de IA', modulo: 'ia', roles: { coach: true } },
  { clave: 'reportes.ver', grupo: 'Seguimiento', etiqueta: 'Generar y descargar reportes', roles: { coach: true } },
  { clave: 'respaldo.descargar', grupo: 'Seguimiento', etiqueta: 'Descargar la copia de seguridad de sus datos', roles: { coach: true } },
  { clave: 'auditoria.ver', grupo: 'Administración', etiqueta: 'Consultar la auditoría de la academia', roles: { coach: false } },
  // Portal (deportista y padre): solo consulta, nunca modifican resultados oficiales
  { clave: 'portal.ver', grupo: 'Portal', etiqueta: 'Consultar su progreso (o el de sus hijos)', roles: { deportista: true, padre: true }, sinAdmin: true },
  // Solo administrador (no se pueden conceder a otros roles)
  { clave: 'usuarios.gestionar', grupo: 'Administración', etiqueta: 'Gestionar usuarios de la academia', soloAdmin: true },
  { clave: 'academia.configurar', grupo: 'Administración', etiqueta: 'Configurar la academia y sus módulos', soloAdmin: true },
  { clave: 'permisos.configurar', grupo: 'Administración', etiqueta: 'Configurar permisos por rol', soloAdmin: true },
];

const POR_CLAVE = new Map(PERMISOS.map((p) => [p.clave, p]));

const existe = (clave) => POR_CLAVE.has(clave);

/** ¿Se puede conceder o quitar este permiso a este rol desde la configuración de la academia? */
function configurable(clave, rol) {
  const permiso = POR_CLAVE.get(clave);
  return Boolean(permiso && !permiso.soloAdmin && ROLES_CONFIGURABLES.includes(rol) && rol in (permiso.roles || {}));
}

/**
 * Permisos efectivos de un rol en una academia.
 * @param {string} rol
 * @param {Object<string, boolean>} excepciones  filas de rol_permisos de esa academia y rol
 * @returns {string[]}
 */
function efectivos(rol, excepciones = {}) {
  if (rol === 'admin') return PERMISOS.filter((p) => !p.sinAdmin).map((p) => p.clave);
  if (!ROLES_CONFIGURABLES.includes(rol)) return [];
  return PERMISOS
    .filter((p) => configurable(p.clave, rol))
    .filter((p) => (p.clave in excepciones ? excepciones[p.clave] : p.roles[rol]))
    .map((p) => p.clave);
}

module.exports = {
  ROLES_ACADEMIA, ROLES_CONFIGURABLES, NOMBRE_ROL, PERMISOS, existe, configurable, efectivos,
};
