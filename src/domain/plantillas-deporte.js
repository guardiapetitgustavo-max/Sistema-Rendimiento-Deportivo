/**
 * Catálogo de PLANTILLAS de deporte (Sport Configuration Engine).
 *
 * Esto NO es lógica fija de ningún deporte: son puntos de partida. Cuando una academia activa un deporte
 * se COPIAN a su configuración (deportes, disciplinas, posiciones, métricas, pruebas, plantillas) y desde
 * ahí la academia los modifica, desactiva o crea los suyos. El código nunca pregunta "¿es fútbol?".
 *
 * Los baremos {base, excelente} son referencias orientativas para normalizar a 0-100 (base = 0 puntos,
 * excelente = 100). Cada academia debe ajustarlos a su metodología y a la edad de sus categorías.
 */

const CAPACIDADES = {
  velocidad: 'Velocidad',
  resistencia: 'Resistencia',
  fuerza: 'Fuerza',
  potencia: 'Potencia',
  agilidad: 'Agilidad',
  flexibilidad: 'Flexibilidad / movilidad',
  tecnica: 'Técnica',
  otra: 'Otra',
};

/** Métricas: qué se mide, en qué unidad y cómo se mejora. */
const METRICAS = {
  tiempo: { nombre: 'Tiempo', tipo: 'TIME', unidad: 's', direccion: 'LOWER_IS_BETTER', decimales: 2 },
  distancia_m: { nombre: 'Distancia', tipo: 'DISTANCE', unidad: 'm', direccion: 'HIGHER_IS_BETTER', decimales: 2 },
  distancia_cm: { nombre: 'Distancia (cm)', tipo: 'DISTANCE', unidad: 'cm', direccion: 'HIGHER_IS_BETTER', decimales: 1 },
  altura_cm: { nombre: 'Altura de salto', tipo: 'HEIGHT', unidad: 'cm', direccion: 'HIGHER_IS_BETTER', decimales: 1 },
  repeticiones: { nombre: 'Repeticiones', tipo: 'COUNT', unidad: 'rep', direccion: 'HIGHER_IS_BETTER', decimales: 0 },
  aciertos: { nombre: 'Aciertos', tipo: 'COUNT', unidad: 'aciertos', direccion: 'HIGHER_IS_BETTER', decimales: 0 },
  nivel: { nombre: 'Nivel alcanzado', tipo: 'SCORE', unidad: 'nivel', direccion: 'HIGHER_IS_BETTER', decimales: 1 },
  puntuacion: { nombre: 'Puntuación', tipo: 'SCORE', unidad: 'pts', direccion: 'HIGHER_IS_BETTER', decimales: 2 },
  velocidad_kmh: { nombre: 'Velocidad', tipo: 'SPEED', unidad: 'km/h', direccion: 'HIGHER_IS_BETTER', decimales: 1 },
  potencia_w: { nombre: 'Potencia', tipo: 'CUSTOM', unidad: 'W', direccion: 'HIGHER_IS_BETTER', decimales: 0 },
  frecuencia_cardiaca: { nombre: 'Frecuencia cardíaca', tipo: 'HEART_RATE', unidad: 'lpm', direccion: 'CUSTOM', decimales: 0 },
  rpe: { nombre: 'Esfuerzo percibido (RPE)', tipo: 'RPE', unidad: '/10', direccion: 'CUSTOM', decimales: 0 },
  frecuencia_brazada: { nombre: 'Frecuencia de brazada', tipo: 'CUSTOM', unidad: 'ciclos/min', direccion: 'TARGET_RANGE', decimales: 1, rango: { min: 40, max: 55 } },
  angulo: { nombre: 'Ángulo', tipo: 'ANGLE', unidad: '°', direccion: 'HIGHER_IS_BETTER', decimales: 0 },
  peso: { nombre: 'Peso corporal', tipo: 'WEIGHT', unidad: 'kg', direccion: 'CUSTOM', decimales: 1 },
};

const t = (clave, nombre, capacidad, extra = {}) => ({ clave, nombre, capacidad, metrica: 'tiempo', ...extra });

/** Pruebas físicas generales, útiles en casi cualquier deporte. */
const PRUEBAS_GENERALES = [
  t('sprint_10m', 'Velocidad 10 m', 'velocidad', { modo: 'campo', distancia_m: 10, intentos: 2, baremo: { base: 2.6, excelente: 1.7 } }),
  t('sprint_20m', 'Velocidad 20 m', 'velocidad', { modo: 'campo', distancia_m: 20, intentos: 2, baremo: { base: 4.2, excelente: 2.9 } }),
  t('sprint_30m', 'Velocidad 30 m', 'velocidad', { modo: 'campo', distancia_m: 30, intentos: 2, baremo: { base: 6.0, excelente: 4.0 } }),
  t('sprint_40m', 'Velocidad 40 m', 'velocidad', { modo: 'campo', distancia_m: 40, intentos: 2, baremo: { base: 7.4, excelente: 5.0 } }),
  { clave: 'cooper', nombre: 'Test de Cooper (12 min)', capacidad: 'resistencia', metrica: 'distancia_m', modo: 'pista', baremo: { base: 1600, excelente: 3200 } },
  { clave: 'beep_test', nombre: 'Course Navette (Beep test)', capacidad: 'resistencia', metrica: 'nivel', modo: 'cancha', baremo: { base: 3, excelente: 13 } },
  { clave: 'yoyo_ir1', nombre: 'Yo-Yo Intermitente Nivel 1', capacidad: 'resistencia', metrica: 'distancia_m', modo: 'campo', baremo: { base: 200, excelente: 2400 } },
  { clave: 'flexiones_1min', nombre: 'Flexiones de brazos (1 min)', capacidad: 'fuerza', metrica: 'repeticiones', modo: 'gimnasio', baremo: { base: 5, excelente: 60 } },
  { clave: 'dominadas', nombre: 'Dominadas máximas', capacidad: 'fuerza', metrica: 'repeticiones', modo: 'gimnasio', baremo: { base: 0, excelente: 20 } },
  { clave: 'sentadillas_1min', nombre: 'Sentadillas (1 min)', capacidad: 'fuerza', metrica: 'repeticiones', modo: 'gimnasio', baremo: { base: 15, excelente: 60 } },
  { clave: 'salto_vertical', nombre: 'Salto vertical (CMJ)', capacidad: 'potencia', metrica: 'altura_cm', modo: 'gimnasio', intentos: 3, baremo: { base: 20, excelente: 65 } },
  { clave: 'salto_horizontal', nombre: 'Salto horizontal a pies juntos', capacidad: 'potencia', metrica: 'distancia_cm', modo: 'gimnasio', intentos: 3, baremo: { base: 120, excelente: 280 } },
  t('t_test', 'Agilidad T-Test', 'agilidad', { modo: 'cancha', intentos: 2, baremo: { base: 14, excelente: 8.5 } }),
  t('illinois', 'Agilidad Illinois', 'agilidad', { modo: 'campo', intentos: 2, baremo: { base: 21, excelente: 14.5 } }),
  t('pro_agility', 'Agilidad 5-10-5', 'agilidad', { modo: 'cancha', intentos: 2, baremo: { base: 6.5, excelente: 4.3 } }),
  { clave: 'sit_and_reach', nombre: 'Flexibilidad Sit and Reach', capacidad: 'flexibilidad', metrica: 'distancia_cm', modo: 'gimnasio', intentos: 2, baremo: { base: -10, excelente: 40 } },
];

// Natación: distancia × estilo. Baremos aproximados por distancia (estilo libre en piscina de 25 m).
const BAREMO_LIBRE = { 25: [24, 11], 50: [55, 24], 100: [120, 52], 200: [260, 115], 400: [540, 245], 800: [1100, 510], 1500: [2100, 980] };
const FACTOR_ESTILO = { libre: 1, espalda: 1.1, pecho: 1.22, mariposa: 1.08, combinado: 1.12 };
const NOMBRE_ESTILO = { libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho', mariposa: 'Mariposa', combinado: 'Combinado' };
function pruebaNatacion(distancia, estilo) {
  const [base, excelente] = BAREMO_LIBRE[distancia];
  const f = FACTOR_ESTILO[estilo];
  return t(`nat_${distancia}_${estilo}`, `${distancia} m ${NOMBRE_ESTILO[estilo]}`, distancia <= 100 ? 'velocidad' : 'resistencia', {
    modo: 'piscina',
    distancia_m: distancia,
    estilo,
    parcial_cada_m: distancia >= 100 ? 25 : null,
    campos: [{ clave: 'brazadas', etiqueta: 'Brazadas (ciclos)', tipo: 'entero' }, { clave: 'reaccion_s', etiqueta: 'Tiempo de reacción (s)', tipo: 'numero' }],
    baremo: { base: Math.round(base * f * 10) / 10, excelente: Math.round(excelente * f * 10) / 10 },
  });
}
const PRUEBAS_NATACION = [
  ...[25, 50, 100, 200, 400, 800, 1500].map((d) => pruebaNatacion(d, 'libre')),
  ...['espalda', 'pecho', 'mariposa'].flatMap((e) => [50, 100, 200].map((d) => pruebaNatacion(d, e))),
  pruebaNatacion(200, 'combinado'),
  pruebaNatacion(400, 'combinado'),
  t('nat_viraje_15m', 'Viraje (5 m antes a 10 m después)', 'tecnica', { modo: 'piscina', distancia_m: 15, baremo: { base: 12, excelente: 6.5 } }),
  { clave: 'nat_frecuencia_50', nombre: 'Frecuencia de brazada en 50 m libre', capacidad: 'tecnica', metrica: 'frecuencia_brazada', modo: 'piscina', distancia_m: 50 },
];

const PRUEBAS_AGUAS_ABIERTAS = [
  t('oa_1km', 'Aguas abiertas 1 km', 'resistencia', { modo: 'aguas_abiertas', distancia_m: 1000, campos: [{ clave: 'temperatura_agua', etiqueta: 'Temperatura del agua (°C)', tipo: 'numero' }, { clave: 'condiciones', etiqueta: 'Condiciones (oleaje, corriente)', tipo: 'texto' }], baremo: { base: 1500, excelente: 750 } }),
  t('oa_1500m', 'Aguas abiertas 1,5 km', 'resistencia', { modo: 'aguas_abiertas', distancia_m: 1500, baremo: { base: 2300, excelente: 1150 } }),
  t('oa_5km', 'Aguas abiertas 5 km', 'resistencia', { modo: 'aguas_abiertas', distancia_m: 5000, baremo: { base: 7800, excelente: 3900 } }),
];

const PRUEBAS_ATLETISMO = [
  t('atl_60m', '60 m lisos', 'velocidad', { modo: 'pista', distancia_m: 60, baremo: { base: 10.5, excelente: 7.0 } }),
  t('atl_100m', '100 m lisos', 'velocidad', { modo: 'pista', distancia_m: 100, baremo: { base: 16.5, excelente: 10.8 } }),
  t('atl_200m', '200 m lisos', 'velocidad', { modo: 'pista', distancia_m: 200, baremo: { base: 35, excelente: 22 } }),
  t('atl_400m', '400 m lisos', 'resistencia', { modo: 'pista', distancia_m: 400, parcial_cada_m: 100, baremo: { base: 85, excelente: 50 } }),
  t('atl_800m', '800 m', 'resistencia', { modo: 'pista', distancia_m: 800, parcial_cada_m: 200, baremo: { base: 200, excelente: 115 } }),
  t('atl_1500m', '1500 m', 'resistencia', { modo: 'pista', distancia_m: 1500, parcial_cada_m: 400, baremo: { base: 420, excelente: 240 } }),
  t('atl_3000m', '3000 m', 'resistencia', { modo: 'pista', distancia_m: 3000, parcial_cada_m: 400, baremo: { base: 900, excelente: 520 } }),
  { clave: 'atl_salto_largo', nombre: 'Salto largo', capacidad: 'potencia', metrica: 'distancia_m', modo: 'pista', intentos: 3, baremo: { base: 2.5, excelente: 7.0 } },
  { clave: 'atl_salto_alto', nombre: 'Salto alto', capacidad: 'potencia', metrica: 'altura_cm', modo: 'pista', intentos: 3, baremo: { base: 100, excelente: 210 } },
  { clave: 'atl_bala', nombre: 'Lanzamiento de bala', capacidad: 'fuerza', metrica: 'distancia_m', modo: 'pista', intentos: 3, baremo: { base: 4, excelente: 17 } },
];

const ENTRENAMIENTO = {
  natacion: {
    nombre: 'Sesión de natación',
    campos: [
      { clave: 'series', etiqueta: 'Series', tipo: 'entero' },
      { clave: 'repeticiones', etiqueta: 'Repeticiones', tipo: 'entero' },
      { clave: 'distancia_m', etiqueta: 'Metros por repetición', tipo: 'numero' },
      { clave: 'estilo', etiqueta: 'Estilo', tipo: 'opcion', opciones: ['Libre', 'Espalda', 'Pecho', 'Mariposa', 'Combinado', 'Patada', 'Técnica'] },
      { clave: 'salida', etiqueta: 'Tiempo de salida (p. ej. 1:30)', tipo: 'texto' },
      { clave: 'descanso_s', etiqueta: 'Descanso (s)', tipo: 'entero' },
    ],
    total: 'metros', // metros totales = series × repeticiones × metros
  },
  atletismo: {
    nombre: 'Sesión de atletismo',
    campos: [
      { clave: 'distancia_m', etiqueta: 'Distancia (m)', tipo: 'numero' },
      { clave: 'series', etiqueta: 'Series', tipo: 'entero' },
      { clave: 'repeticiones', etiqueta: 'Repeticiones', tipo: 'entero' },
      { clave: 'ritmo', etiqueta: 'Ritmo objetivo (p. ej. 4:30/km)', tipo: 'texto' },
      { clave: 'descanso_s', etiqueta: 'Descanso (s)', tipo: 'entero' },
    ],
    total: 'metros',
  },
  equipo: {
    nombre: 'Sesión de deporte de equipo',
    campos: [
      { clave: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'numero' },
      { clave: 'intensidad', etiqueta: 'Intensidad (1-10)', tipo: 'entero' },
      { clave: 'jugadores', etiqueta: 'Formato (p. ej. 5 vs 5)', tipo: 'texto' },
    ],
    total: 'minutos',
  },
  fuerza: {
    nombre: 'Sesión de fuerza / gimnasio',
    campos: [
      { clave: 'series', etiqueta: 'Series', tipo: 'entero' },
      { clave: 'repeticiones', etiqueta: 'Repeticiones', tipo: 'entero' },
      { clave: 'carga_kg', etiqueta: 'Carga (kg)', tipo: 'numero' },
      { clave: 'descanso_s', etiqueta: 'Descanso (s)', tipo: 'entero' },
    ],
    total: 'series',
  },
  resistencia: {
    nombre: 'Sesión de resistencia (ciclismo, remo, triatlón)',
    campos: [
      { clave: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'numero' },
      { clave: 'distancia_m', etiqueta: 'Distancia (m)', tipo: 'numero' },
      { clave: 'zona', etiqueta: 'Zona de intensidad (1-5)', tipo: 'entero' },
      { clave: 'cadencia', etiqueta: 'Cadencia / ritmo', tipo: 'texto' },
    ],
    total: 'minutos',
  },
  tecnica: {
    nombre: 'Sesión técnica',
    campos: [
      { clave: 'repeticiones', etiqueta: 'Repeticiones', tipo: 'entero' },
      { clave: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'numero' },
      { clave: 'enfoque', etiqueta: 'Enfoque técnico', tipo: 'texto' },
    ],
    total: 'minutos',
  },
};

const generales = (...claves) => claves;

/** Plantillas de deporte. `pruebas` puede referirse a pruebas generales por clave o definir pruebas propias. */
const DEPORTES = {
  futbol: {
    nombre: 'Fútbol', modo: 'campo', entrenamiento: ['equipo', 'fuerza'], disciplinas: ['Fútbol 11', 'Fútbol 7'],
    posiciones: ['Portero', 'Defensa central', 'Lateral', 'Mediocampista', 'Extremo', 'Delantero'],
    pruebas: [...generales('sprint_10m', 'sprint_30m', 'yoyo_ir1', 'salto_vertical', 't_test', 'illinois'),
      t('fut_slalom', 'Conducción en slalom (20 m)', 'tecnica', { modo: 'campo', distancia_m: 20, intentos: 2, baremo: { base: 9, excelente: 5 } }),
      { clave: 'fut_pase', nombre: 'Precisión de pase (de 10)', capacidad: 'tecnica', metrica: 'aciertos', modo: 'campo', baremo: { base: 2, excelente: 10 } }],
    pesos: { velocidad: 25, resistencia: 25, potencia: 15, agilidad: 15, tecnica: 20 },
    movimientos: ['sprint', 'carrera', 'salto', 'tiro'],
  },
  futbol_sala: {
    nombre: 'Fútbol sala', modo: 'cancha', entrenamiento: ['equipo', 'fuerza'], disciplinas: ['Futsal'],
    posiciones: ['Portero', 'Cierre', 'Ala', 'Pívot'],
    pruebas: generales('sprint_10m', 'sprint_20m', 'beep_test', 'pro_agility', 'salto_vertical'),
    pesos: { velocidad: 30, resistencia: 25, agilidad: 25, potencia: 20 },
    movimientos: ['sprint', 'carrera'],
  },
  basquet: {
    nombre: 'Básquet', modo: 'cancha', entrenamiento: ['equipo', 'fuerza'], disciplinas: ['Básquet 5x5', 'Básquet 3x3'],
    posiciones: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'],
    pruebas: [...generales('sprint_20m', 'beep_test', 'salto_vertical', 't_test'),
      t('bas_lane_agility', 'Lane agility', 'agilidad', { modo: 'cancha', intentos: 2, baremo: { base: 15, excelente: 10.5 } }),
      { clave: 'bas_tiros_libres', nombre: 'Tiros libres (de 10)', capacidad: 'tecnica', metrica: 'aciertos', modo: 'cancha', baremo: { base: 2, excelente: 10 } }],
    pesos: { velocidad: 20, resistencia: 20, potencia: 25, agilidad: 20, tecnica: 15 },
    movimientos: ['salto', 'carrera'],
  },
  voley: {
    nombre: 'Vóley', modo: 'cancha', entrenamiento: ['equipo', 'fuerza'], disciplinas: ['Vóley sala', 'Vóley playa'],
    posiciones: ['Armador', 'Opuesto', 'Central', 'Receptor punta', 'Líbero'],
    pruebas: [...generales('salto_vertical', 't_test', 'sprint_10m'),
      { clave: 'vol_alcance_bloqueo', nombre: 'Alcance en bloqueo', capacidad: 'potencia', metrica: 'altura_cm', modo: 'cancha', intentos: 3, baremo: { base: 230, excelente: 330 } },
      { clave: 'vol_alcance_ataque', nombre: 'Alcance en ataque', capacidad: 'potencia', metrica: 'altura_cm', modo: 'cancha', intentos: 3, baremo: { base: 240, excelente: 345 } },
      t('vol_93639', 'Agilidad 9-3-6-3-9', 'agilidad', { modo: 'cancha', intentos: 2, baremo: { base: 10, excelente: 6.5 } })],
    pesos: { potencia: 35, agilidad: 25, velocidad: 20, tecnica: 20 },
    movimientos: ['salto', 'remate'],
  },
  atletismo: {
    nombre: 'Atletismo', modo: 'pista', entrenamiento: ['atletismo', 'fuerza'], disciplinas: ['Velocidad', 'Medio fondo', 'Fondo', 'Saltos', 'Lanzamientos'],
    posiciones: [],
    pruebas: [...PRUEBAS_ATLETISMO, ...generales('salto_vertical', 'cooper')],
    pesos: { velocidad: 35, resistencia: 30, potencia: 25, fuerza: 10 },
    movimientos: ['carrera', 'zancada', 'salto', 'sprint'],
  },
  natacion: {
    nombre: 'Natación', modo: 'piscina', entrenamiento: ['natacion', 'fuerza'], disciplinas: ['Velocidad', 'Fondo', 'Estilos'],
    posiciones: [],
    pruebas: PRUEBAS_NATACION,
    pesos: { velocidad: 40, resistencia: 40, tecnica: 20 },
    movimientos: ['posicion_corporal', 'brazada', 'viraje', 'salida'],
  },
  aguas_abiertas: {
    nombre: 'Natación en aguas abiertas', modo: 'aguas_abiertas', entrenamiento: ['natacion', 'resistencia'], disciplinas: ['1 km', '5 km', '10 km'],
    posiciones: [],
    pruebas: [...PRUEBAS_AGUAS_ABIERTAS, pruebaNatacion(400, 'libre'), pruebaNatacion(1500, 'libre')],
    pesos: { resistencia: 70, velocidad: 20, tecnica: 10 },
    movimientos: ['brazada', 'trayectoria'],
  },
  waterpolo: {
    nombre: 'Waterpolo', modo: 'piscina', entrenamiento: ['natacion', 'equipo'], disciplinas: ['Waterpolo'],
    posiciones: ['Portero', 'Boya', 'Defensa de boya', 'Extremo', 'Lateral'],
    pruebas: [pruebaNatacion(50, 'libre'), pruebaNatacion(200, 'libre'),
      t('wp_20m_cabeza', '20 m crol con cabeza arriba', 'velocidad', { modo: 'piscina', distancia_m: 20, baremo: { base: 18, excelente: 9.5 } }),
      { clave: 'wp_salto', nombre: 'Salto fuera del agua', capacidad: 'potencia', metrica: 'altura_cm', modo: 'piscina', intentos: 3, baremo: { base: 20, excelente: 75 } },
      { clave: 'wp_lanzamiento', nombre: 'Velocidad de lanzamiento', capacidad: 'potencia', metrica: 'velocidad_kmh', modo: 'piscina', intentos: 3, baremo: { base: 30, excelente: 75 } }],
    pesos: { velocidad: 30, resistencia: 30, potencia: 25, tecnica: 15 },
    movimientos: ['brazada', 'lanzamiento'],
  },
  saltos: {
    nombre: 'Saltos ornamentales', modo: 'piscina', entrenamiento: ['tecnica', 'fuerza'], disciplinas: ['Trampolín 1 m', 'Trampolín 3 m', 'Plataforma'],
    posiciones: [],
    pruebas: [{ clave: 'sal_puntuacion', nombre: 'Salto (puntuación)', capacidad: 'tecnica', metrica: 'puntuacion', modo: 'piscina', campos: [{ clave: 'altura', etiqueta: 'Altura (m)', tipo: 'numero' }, { clave: 'dificultad', etiqueta: 'Grado de dificultad', tipo: 'numero' }, { clave: 'ejecucion', etiqueta: 'Ejecución (0-10)', tipo: 'numero' }], baremo: { base: 10, excelente: 90 } },
      ...generales('salto_vertical', 'sit_and_reach')],
    pesos: { tecnica: 60, potencia: 25, flexibilidad: 15 },
    movimientos: ['ejecucion', 'entrada_agua'],
  },
  remo: {
    nombre: 'Remo', modo: 'personalizado', entrenamiento: ['resistencia', 'fuerza'], disciplinas: ['Single', 'Doble', 'Ergómetro'],
    posiciones: [],
    pruebas: [t('rem_500', '500 m en ergómetro', 'velocidad', { modo: 'gimnasio', distancia_m: 500, baremo: { base: 140, excelente: 85 } }),
      t('rem_2000', '2000 m en ergómetro', 'resistencia', { modo: 'gimnasio', distancia_m: 2000, parcial_cada_m: 500, baremo: { base: 600, excelente: 380 } }),
      { clave: 'rem_potencia', nombre: 'Potencia media 2000 m', capacidad: 'potencia', metrica: 'potencia_w', modo: 'gimnasio', baremo: { base: 120, excelente: 450 } }],
    pesos: { resistencia: 50, velocidad: 25, potencia: 25 },
    movimientos: ['palada'],
  },
  ciclismo: {
    nombre: 'Ciclismo', modo: 'personalizado', entrenamiento: ['resistencia', 'fuerza'], disciplinas: ['Ruta', 'Pista', 'Montaña'],
    posiciones: [],
    pruebas: [{ clave: 'cic_ftp', nombre: 'Potencia umbral (FTP 20 min)', capacidad: 'resistencia', metrica: 'potencia_w', modo: 'personalizado', baremo: { base: 120, excelente: 380 } },
      t('cic_crono_10km', 'Contrarreloj 10 km', 'resistencia', { modo: 'personalizado', distancia_m: 10000, baremo: { base: 1500, excelente: 780 } }),
      t('cic_sprint_200', 'Sprint 200 m lanzado', 'velocidad', { modo: 'pista', distancia_m: 200, baremo: { base: 16, excelente: 10.5 } })],
    pesos: { resistencia: 60, velocidad: 25, potencia: 15 },
    movimientos: ['pedaleo'],
  },
  triatlon: {
    nombre: 'Triatlón', modo: 'personalizado', entrenamiento: ['natacion', 'resistencia', 'atletismo'], disciplinas: ['Sprint', 'Olímpico'],
    posiciones: [],
    pruebas: [pruebaNatacion(400, 'libre'),
      t('tri_bici_20km', 'Ciclismo 20 km', 'resistencia', { modo: 'personalizado', distancia_m: 20000, baremo: { base: 3000, excelente: 1680 } }),
      t('tri_carrera_5km', 'Carrera 5 km', 'resistencia', { modo: 'pista', distancia_m: 5000, parcial_cada_m: 1000, baremo: { base: 1800, excelente: 960 } })],
    pesos: { resistencia: 80, velocidad: 20 },
    movimientos: ['carrera', 'brazada', 'pedaleo'],
  },
  tenis: {
    nombre: 'Tenis', modo: 'cancha', entrenamiento: ['tecnica', 'fuerza'], disciplinas: ['Individual', 'Dobles'],
    posiciones: [],
    pruebas: [{ clave: 'ten_saque', nombre: 'Velocidad de saque', capacidad: 'potencia', metrica: 'velocidad_kmh', modo: 'cancha', intentos: 5, baremo: { base: 90, excelente: 200 } },
      { clave: 'ten_precision', nombre: 'Precisión de saque (de 20)', capacidad: 'tecnica', metrica: 'aciertos', modo: 'cancha', baremo: { base: 4, excelente: 20 } },
      t('ten_spider', 'Spider test', 'agilidad', { modo: 'cancha', intentos: 2, baremo: { base: 22, excelente: 15 } }), ...generales('sprint_10m')],
    pesos: { tecnica: 35, agilidad: 25, potencia: 25, velocidad: 15 },
    movimientos: ['saque', 'golpe'],
  },
  gimnasia: {
    nombre: 'Gimnasia', modo: 'gimnasio', entrenamiento: ['tecnica', 'fuerza'], disciplinas: ['Artística', 'Rítmica', 'Trampolín'],
    posiciones: [],
    pruebas: [{ clave: 'gim_rutina', nombre: 'Rutina (nota D + E)', capacidad: 'tecnica', metrica: 'puntuacion', modo: 'gimnasio', campos: [{ clave: 'nota_d', etiqueta: 'Nota D (dificultad)', tipo: 'numero' }, { clave: 'nota_e', etiqueta: 'Nota E (ejecución)', tipo: 'numero' }], baremo: { base: 6, excelente: 15 } },
      { clave: 'gim_split', nombre: 'Apertura (split)', capacidad: 'flexibilidad', metrica: 'angulo', modo: 'gimnasio', baremo: { base: 120, excelente: 180 } },
      ...generales('sit_and_reach', 'dominadas', 'salto_vertical')],
    pesos: { tecnica: 50, flexibilidad: 25, fuerza: 15, potencia: 10 },
    movimientos: ['movimiento', 'posicion', 'ejecucion'],
  },
};

const GENERALES_POR_CLAVE = new Map(PRUEBAS_GENERALES.map((p) => [p.clave, p]));

/** Pruebas completas de una plantilla de deporte (resolviendo las referencias a pruebas generales). */
function pruebasDe(claveDeporte) {
  const deporte = DEPORTES[claveDeporte];
  if (!deporte) return [];
  return deporte.pruebas.map((p) => (typeof p === 'string' ? GENERALES_POR_CLAVE.get(p) : p)).filter(Boolean);
}

/** Lista para el panel: clave, nombre y resumen de cada plantilla. */
function listarPlantillas() {
  return Object.entries(DEPORTES).map(([clave, d]) => ({
    clave, nombre: d.nombre, modo: d.modo, disciplinas: d.disciplinas, posiciones: d.posiciones, total_pruebas: pruebasDe(clave).length,
  }));
}

module.exports = {
  CAPACIDADES, METRICAS, PRUEBAS_GENERALES, DEPORTES, ENTRENAMIENTO, pruebasDe, listarPlantillas,
};
