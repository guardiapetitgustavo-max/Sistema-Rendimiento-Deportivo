/**
 * Módulos que cada academia puede activar o desactivar.
 *
 * Un módulo está ACTIVO solo si se cumplen las tres condiciones:
 *   1. está disponible en esta instalación (p. ej. el video necesita almacenamiento configurado),
 *   2. lo incluye el plan contratado por la academia,
 *   3. la academia no lo desactivó en su configuración.
 * Así nunca se presenta como operativa una función que no puede funcionar.
 */
const env = require('../config/env');

const MODULOS = [
  { clave: 'nutricion', etiqueta: 'Nutrición', descripcion: 'Alimentación, hidratación, horarios y orientación general (no clínica).', defecto: true },
  { clave: 'ml', etiqueta: 'Machine Learning', descripcion: 'Modelo que clasifica el nivel con las evaluaciones por observación.', defecto: true },
  { clave: 'ia', etiqueta: 'Asistente IA', descripcion: 'Preguntas en lenguaje natural sobre los datos reales de la academia.', defecto: true },
  { clave: 'ia_analisis', etiqueta: 'Análisis IA', descripcion: 'Análisis de deportistas y equipos con tendencias, fortalezas y recomendaciones.', defecto: true },
  { clave: 'ia_360', etiqueta: 'Análisis 360°', descripcion: 'Rendimiento + entrenamiento + asistencia + recuperación + objetivos + video + nutrición.', defecto: true },
  { clave: 'ia_alertas', etiqueta: 'Alertas automáticas', descripcion: 'Reglas de alerta configurables por la academia.', defecto: true },
  {
    clave: 'video', etiqueta: 'Video', descripcion: 'Subida, archivo y comparación de videos por deportista y prueba.', defecto: true,
    requisito: () => env.almacenamiento.configurado, falta: 'Falta configurar el almacenamiento de videos (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).',
  },
  {
    clave: 'video_ia', etiqueta: 'Análisis de video (visión por computadora)', descripcion: 'Análisis automático con modelos reales; si no hay modelo para un movimiento muestra "ANÁLISIS NO DISPONIBLE".', defecto: true,
    requisito: () => env.almacenamiento.configurado, falta: 'Requiere el módulo de video y el servicio de análisis (worker).',
  },
  { clave: 'comercial', etiqueta: 'Matrículas y pagos', descripcion: 'Matrículas, cuotas, pagos y vencimientos de los deportistas.', defecto: true },
  { clave: 'integraciones', etiqueta: 'Integraciones', descripcion: 'API para fotocélulas, GPS, wearables y sistemas de cronometraje.', defecto: true },
];

const POR_CLAVE = new Map(MODULOS.map((m) => [m.clave, m]));
const disponible = (clave) => {
  const m = POR_CLAVE.get(clave);
  return Boolean(m && (!m.requisito || m.requisito()));
};

/**
 * Estado efectivo de todos los módulos.
 * @param {object} guardados  configuración de la academia { clave: boolean }
 * @param {string[]|null} delPlan  módulos que incluye el plan (null = sin restricción)
 */
function efectivos(guardados = {}, delPlan = null) {
  return Object.fromEntries(MODULOS.map((m) => {
    if (!disponible(m.clave)) return [m.clave, false];
    if (Array.isArray(delPlan) && !delPlan.includes(m.clave)) return [m.clave, false];
    return [m.clave, typeof guardados?.[m.clave] === 'boolean' ? guardados[m.clave] : m.defecto];
  }));
}

/** Catálogo para la pantalla de configuración, con el motivo cuando un módulo no se puede activar. */
function catalogo(delPlan = null) {
  return MODULOS.map((m) => {
    let motivo = null;
    if (!disponible(m.clave)) motivo = m.falta;
    else if (Array.isArray(delPlan) && !delPlan.includes(m.clave)) motivo = 'No incluido en el plan actual de la academia.';
    return {
      clave: m.clave, etiqueta: m.etiqueta, descripcion: m.descripcion, disponible: !motivo, motivo,
    };
  });
}

const existe = (clave) => POR_CLAVE.has(clave);

module.exports = {
  MODULOS, efectivos, catalogo, existe, disponible,
};
