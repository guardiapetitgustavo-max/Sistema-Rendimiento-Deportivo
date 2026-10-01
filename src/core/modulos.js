/**
 * Módulos que cada academia puede activar o desactivar.
 * "disponible: false" = todavía no implementado: se muestra como "Próximamente" y siempre está apagado
 * (no se presentan funciones inexistentes como si funcionaran).
 */
const MODULOS = [
  { clave: 'nutricion', etiqueta: 'Nutrición', descripcion: 'Registro de alimentación, hidratación y descanso.', disponible: true, defecto: true },
  { clave: 'ml', etiqueta: 'Machine Learning', descripcion: 'Modelo que clasifica el nivel de rendimiento con los datos de la academia.', disponible: true, defecto: true },
  { clave: 'ia', etiqueta: 'Asistente IA', descripcion: 'Análisis de deportistas, resumen de la academia y modo automático.', disponible: true, defecto: true },
  { clave: 'ia_360', etiqueta: 'Análisis 360°', descripcion: 'Análisis integral de rendimiento, entrenamiento, asistencia y recuperación.', disponible: false, fase: 6 },
  { clave: 'ia_alertas', etiqueta: 'Alertas IA configurables', descripcion: 'Reglas de alerta definidas por la academia.', disponible: false, fase: 6 },
  { clave: 'video', etiqueta: 'Video', descripcion: 'Subida y archivo de videos por deportista y prueba.', disponible: false, fase: 7 },
  { clave: 'video_ia', etiqueta: 'Análisis de video (visión por computadora)', descripcion: 'Postura, trayectoria y técnica con modelos reales.', disponible: false, fase: 7 },
];

const POR_CLAVE = new Map(MODULOS.map((m) => [m.clave, m]));

/** Estado efectivo de todos los módulos a partir de la configuración guardada. */
function efectivos(guardados = {}) {
  return Object.fromEntries(MODULOS.map((m) => [
    m.clave,
    m.disponible ? (typeof guardados[m.clave] === 'boolean' ? guardados[m.clave] : m.defecto) : false,
  ]));
}

const existe = (clave) => POR_CLAVE.has(clave);
const disponible = (clave) => Boolean(POR_CLAVE.get(clave)?.disponible);

module.exports = { MODULOS, efectivos, existe, disponible };
