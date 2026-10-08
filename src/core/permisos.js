/**
 * Catálogo de permisos (RBAC por academia).
 *
 * - El rol "admin" de una academia tiene siempre todos los permisos (salvo los "sinAdmin", que no aplican a él,
 *   como el portal personal del deportista).
 * - `roles` indica a qué roles se puede aplicar cada permiso y su valor por defecto (true / false).
 * - Cada academia guarda solo sus excepciones en la tabla rol_permisos.
 * - Los permisos "soloAdmin" no se pueden conceder a otros roles (evita escaladas de privilegios).
 * - Deportistas y padres NUNCA reciben permisos que modifiquen resultados oficiales.
 */
const ROLES_ACADEMIA = ['admin', 'coach', 'deportista', 'padre', 'profesional'];
const ROLES_CONFIGURABLES = ['coach', 'profesional', 'deportista', 'padre'];

const NOMBRE_ROL = {
  admin: 'Administrador', coach: 'Coach', deportista: 'Deportista', padre: 'Padre / madre', profesional: 'Profesional (nutrición, fisio…)',
};

const p = (clave, grupo, etiqueta, roles, extra = {}) => ({ clave, grupo, etiqueta, roles, ...extra });

const PERMISOS = [
  // Operación deportiva
  p('dashboard.ver', 'Operación', 'Ver el panel de inicio y las alertas', { coach: true, profesional: false }),
  p('deportistas.ver', 'Operación', 'Ver deportistas, perfiles y rutinas', { coach: true, profesional: true }),
  p('deportistas.gestionar', 'Operación', 'Crear, editar y dar de baja deportistas', { coach: true, profesional: false }),
  p('medicion.usar', 'Operación', 'Usar el Modo Medición y registrar resultados', { coach: true, profesional: false }),
  p('resultados.ver', 'Operación', 'Ver sesiones de evaluación y resultados', { coach: true, profesional: true }),
  p('resultados.gestionar', 'Operación', 'Crear sesiones, corregir y anular resultados', { coach: true, profesional: false }),
  p('evaluaciones.ver', 'Operación', 'Ver evaluaciones por observación (escala 0-100)', { coach: true, profesional: false }),
  p('evaluaciones.gestionar', 'Operación', 'Registrar y editar evaluaciones por observación', { coach: true, profesional: false }),
  p('importacion.usar', 'Operación', 'Importar evaluaciones desde Excel', { coach: true, profesional: false }),
  p('asistencia.ver', 'Operación', 'Ver asistencia', { coach: true, profesional: false }),
  p('asistencia.gestionar', 'Operación', 'Registrar asistencia', { coach: true, profesional: false }),
  p('entrenamientos.ver', 'Entrenamiento', 'Ver sesiones de entrenamiento', { coach: true, profesional: true }),
  p('entrenamientos.gestionar', 'Entrenamiento', 'Crear, editar y cerrar entrenamientos', { coach: true, profesional: false }),
  p('recuperacion.ver', 'Entrenamiento', 'Ver sueño, fatiga y recuperación', { coach: true, profesional: true }),
  p('recuperacion.registrar', 'Entrenamiento', 'Registrar recuperación de los deportistas', { coach: true, profesional: true }),
  p('lesiones.ver', 'Entrenamiento', 'Ver el registro de lesiones', { coach: true, profesional: true }),
  p('lesiones.gestionar', 'Entrenamiento', 'Registrar lesiones y dar el alta', { coach: true, profesional: true }),
  p('indicadores.ver', 'Rendimiento', 'Ver el panel de indicadores (carga, lesiones, rastreo, usabilidad, reportes y aceptación)', { coach: true, profesional: true }),
  p('objetivos.ver', 'Entrenamiento', 'Ver objetivos', { coach: true, profesional: true }),
  p('objetivos.gestionar', 'Entrenamiento', 'Crear y modificar objetivos', { coach: true, profesional: false }),
  p('rendimiento.ver', 'Rendimiento', 'Ver evolución, récords, rankings y comparativas', { coach: true, profesional: true }),
  p('alertas.ver', 'Rendimiento', 'Ver alertas', { coach: true, profesional: true }),
  p('alertas.gestionar', 'Rendimiento', 'Atender, resolver y descartar alertas', { coach: true, profesional: false }),
  p('videos.ver', 'Video', 'Ver videos y sus análisis', { coach: true, profesional: true }, { modulo: 'video' }),
  p('videos.subir', 'Video', 'Subir videos y pedir análisis', { coach: true, profesional: false }, { modulo: 'video' }),
  // Nutrición
  p('alimentacion.ver', 'Nutrición', 'Ver registros de alimentación', { coach: true, profesional: true }, { modulo: 'nutricion' }),
  p('alimentacion.gestionar', 'Nutrición', 'Registrar y editar alimentación', { coach: true, profesional: true }, { modulo: 'nutricion' }),
  p('nutricion.orientar', 'Nutrición', 'Gestionar el perfil nutricional y las notas profesionales', { coach: false, profesional: true }, { modulo: 'nutricion' }),
  // Inteligencia
  p('ml.usar', 'Inteligencia', 'Entrenar el modelo de ML y generar predicciones', { coach: true, profesional: false }, { modulo: 'ml' }),
  p('ia.usar', 'Inteligencia', 'Usar el asistente de IA', { coach: true, profesional: true }, { modulo: 'ia' }),
  p('ia.analizar', 'Inteligencia', 'Analizar deportistas y equipos con IA', { coach: true, profesional: true }, { modulo: 'ia_analisis' }),
  p('ia.360', 'Inteligencia', 'Ejecutar el análisis 360°', { coach: true, profesional: false }, { modulo: 'ia_360' }),
  p('recomendaciones.aprobar', 'Inteligencia', 'Aprobar recomendaciones para que las vea el deportista', { coach: true, profesional: true }),
  // Seguimiento
  p('reportes.ver', 'Seguimiento', 'Generar y descargar reportes', { coach: true, profesional: false }),
  p('respaldo.descargar', 'Seguimiento', 'Descargar la copia de seguridad de sus datos', { coach: true, profesional: false }),
  p('comunicados.ver', 'Comunicación', 'Ver comunicados de la academia', {
    coach: true, profesional: true, deportista: true, padre: true,
  }),
  p('comunicados.publicar', 'Comunicación', 'Publicar comunicados', { coach: false, profesional: false }),
  // Estructura y metodología (las configura el administrador; se pueden delegar)
  p('estructura.ver', 'Metodología', 'Ver deportes, categorías, equipos e instalaciones', { coach: true, profesional: true }),
  p('estructura.gestionar', 'Metodología', 'Gestionar sedes, deportes, categorías y equipos', { coach: false, profesional: false }),
  p('metodologia.ver', 'Metodología', 'Ver métricas, pruebas, plantillas y scoring', { coach: true, profesional: true }),
  p('metodologia.configurar', 'Metodología', 'Configurar métricas, pruebas, scoring y reglas de alerta', { coach: false, profesional: false }),
  // Comercial
  p('comercial.ver', 'Comercial', 'Ver matrículas y pagos', { coach: false }, { modulo: 'comercial' }),
  p('comercial.gestionar', 'Comercial', 'Registrar matrículas y pagos', { coach: false }, { modulo: 'comercial' }),
  p('auditoria.ver', 'Administración', 'Consultar la auditoría de la academia', { coach: false }),
  // Portal (deportista y padre): solo consulta y su propia información, nunca resultados oficiales
  p('portal.ver', 'Portal', 'Consultar su progreso (o el de sus hijos)', { deportista: true, padre: true }, { sinAdmin: true }),
  p('portal.asistencia', 'Portal', 'Ver su asistencia y horarios', { deportista: true, padre: true }, { sinAdmin: true }),
  p('portal.recuperacion', 'Portal', 'Registrar su propio sueño, fatiga y recuperación', { deportista: true }, { sinAdmin: true }),
  p('portal.nutricion', 'Portal', 'Registrar su propia alimentación', { deportista: true }, { sinAdmin: true, modulo: 'nutricion' }),
  p('portal.videos', 'Portal', 'Ver los videos que el coach le autorice', { deportista: true, padre: false }, { sinAdmin: true, modulo: 'video' }),
  p('portal.pagos', 'Portal', 'Ver matrícula y pagos', { deportista: false, padre: true }, { sinAdmin: true, modulo: 'comercial' }),
  // Solo administrador
  p('usuarios.gestionar', 'Administración', 'Gestionar usuarios de la academia', {}, { soloAdmin: true }),
  p('academia.configurar', 'Administración', 'Configurar la academia y sus módulos', {}, { soloAdmin: true }),
  p('permisos.configurar', 'Administración', 'Configurar permisos por rol', {}, { soloAdmin: true }),
  p('integraciones.gestionar', 'Administración', 'Gestionar dispositivos e integraciones', {}, { soloAdmin: true, modulo: 'integraciones' }),
];

const POR_CLAVE = new Map(PERMISOS.map((x) => [x.clave, x]));

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
  if (rol === 'admin') return PERMISOS.filter((x) => !x.sinAdmin).map((x) => x.clave);
  if (!ROLES_CONFIGURABLES.includes(rol)) return [];
  return PERMISOS
    .filter((x) => configurable(x.clave, rol))
    .filter((x) => (x.clave in excepciones ? excepciones[x.clave] : x.roles[rol]))
    .map((x) => x.clave);
}

module.exports = {
  ROLES_ACADEMIA, ROLES_CONFIGURABLES, NOMBRE_ROL, PERMISOS, existe, configurable, efectivos,
};
