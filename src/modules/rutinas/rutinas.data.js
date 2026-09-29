/**
 * Plantillas de rutinas de entrenamiento.
 * Cada ejercicio: [nombre, dosis (series x reps/duración), descanso, objetivo].
 */
const dia = (nombre, enfoque, ejercicios) => ({ dia: nombre, enfoque, ejercicios });

/** Rutinas para deportes concretos. `claves`: palabras que identifican al deporte. */
const POR_DEPORTE = [
  {
    nombre: 'Fútbol',
    claves: ['futbol', 'fútbol', 'soccer', 'futbolito'],
    bloques: [
      dia('Lunes', 'Fuerza tren inferior + técnica', [
        ['Sentadilla con salto', '4 x 8', '90 s', 'Potencia de piernas'],
        ['Conducción de balón en zigzag', '4 x 20 m', '60 s', 'Control en movimiento'],
        ['Pase y recepción en pareja', '3 x 12 pases', '45 s', 'Precisión de pase'],
      ]),
      dia('Miércoles', 'Resistencia y agilidad', [
        ['Intervalos 4 x 800 m', '4 x 800 m', '2 min', 'Aeróbico intenso'],
        ['Cambios de dirección con estímulo', '5 x 6 conos', '60 s', 'Agilidad reactiva'],
        ['Escalera de coordinación', '4 x 1 ida', '45 s', 'Frecuencia de paso'],
      ]),
      dia('Viernes', 'Velocidad y definición', [
        ['Sprints 10-30 m', '6 x 30 m', 'rec. completa', 'Velocidad máxima'],
        ['Definición al arco', '3 x 8 tiros', '60 s', 'Precisión de remate'],
        ['Rondo 4 v 1', '3 x 5 min', '90 s', 'Técnica bajo presión'],
      ]),
    ],
  },
  {
    nombre: 'Vóley',
    claves: ['voley', 'vóley', 'voleibol', 'volley'],
    bloques: [
      dia('Lunes', 'Fuerza y salto', [
        ['Salto vertical con sentadilla', '4 x 8', '90 s', 'Potencia de salto'],
        ['Remate con armador', '4 x 10', '60 s', 'Técnica de ataque'],
        ['Plancha + press de hombro', '3 x 40 s / 3 x 10', '60 s', 'Estabilidad'],
      ]),
      dia('Miércoles', 'Coordinación y defensa', [
        ['Recepción de saque', '4 x 12', '45 s', 'Control de antebrazos'],
        ['Desplazamientos defensivos', '5 x 6 m', '45 s', 'Lectura y reacción'],
        ['Voleo de dedos a objetivo', '3 x 15', '45 s', 'Coordinación óculo-manual'],
      ]),
      dia('Viernes', 'Juego real y agilidad', [
        ['Partido condicionado', '3 x 10 min', '2 min', 'Táctica'],
        ['Agilidad en cancha (conos)', '4 x circuito', '60 s', 'Cambios rápidos'],
        ['Saque de precisión', '3 x 10 saques', '60 s', 'Consistencia'],
      ]),
    ],
  },
  {
    nombre: 'Básquet',
    claves: ['basquet', 'básquet', 'basket', 'basquetbol', 'baloncesto'],
    bloques: [
      dia('Lunes', 'Fuerza y tiro', [
        ['Sentadilla + press', '4 x 10', '75 s', 'Fuerza global'],
        ['Tiro en posiciones (5 puntos)', '3 x 10 tiros', '45 s', 'Mecánica de tiro'],
        ['Dribbling con dos manos', '4 x 30 s', '45 s', 'Control de balón'],
      ]),
      dia('Miércoles', 'Resistencia y agilidad', [
        ['Suicidios (líneas)', '5 x serie', '90 s', 'Resistencia anaeróbica'],
        ['Defensa lateral', '4 x 6 m', '45 s', 'Agilidad defensiva'],
        ['Pick and roll simulado', '3 x 8', '60 s', 'Lectura táctica'],
      ]),
      dia('Viernes', 'Velocidad y juego', [
        ['Contraataque 2-1', '4 x cancha', '60 s', 'Velocidad + finalización'],
        ['Partido 3 v 3', '3 x 8 min', '2 min', 'Aplicación real'],
      ]),
    ],
  },
  {
    nombre: 'Atletismo',
    claves: ['atletismo', 'running', 'carrera', 'pista', 'maraton', 'maratón'],
    bloques: [
      dia('Lunes', 'Velocidad y técnica de carrera', [
        ['Sprints 30-60 m', '6 x 60 m', 'rec. completa', 'Velocidad máxima'],
        ['Skipping y talones', '4 x 20 m', '60 s', 'Técnica de carrera'],
        ['Salidas de tacos', '5 x 10 m', '90 s', 'Aceleración'],
      ]),
      dia('Miércoles', 'Resistencia', [
        ['Series 5 x 1000 m', '5 x 1000 m', '2 min', 'Umbral aeróbico'],
        ['Carrera continua', '20-30 min', '-', 'Base aeróbica'],
      ]),
      dia('Viernes', 'Fuerza y potencia', [
        ['Multisaltos', '4 x 8', '90 s', 'Potencia de piernas'],
        ['Fuerza funcional (peso corporal)', '3 circuitos', '60 s', 'Estabilidad'],
      ]),
    ],
  },
  {
    nombre: 'Tenis',
    claves: ['tenis', 'tennis'],
    bloques: [
      dia('Lunes', 'Técnica de golpes', [
        ['Drive y revés cruzado', '4 x 20 bolas', '45 s', 'Consistencia'],
        ['Saque + primer golpe', '3 x 12 saques', '60 s', 'Precisión'],
        ['Volea y smash', '3 x 15', '45 s', 'Juego de red'],
      ]),
      dia('Miércoles', 'Agilidad y resistencia', [
        ['Desplazamientos laterales', '5 x 6 m', '45 s', 'Agilidad en pista'],
        ['Intervalos 6 x 400 m', '6 x 400 m', '90 s', 'Resistencia específica'],
      ]),
      dia('Viernes', 'Juego y velocidad', [
        ['Puntos dirigidos', '3 x 10 min', '2 min', 'Táctica'],
        ['Sprints cortos 5-10 m', '6 x 10 m', 'rec. completa', 'Explosividad'],
      ]),
    ],
  },
  {
    nombre: 'Natación',
    claves: ['natacion', 'natación', 'swim'],
    bloques: [
      dia('Lunes', 'Técnica de nado', [
        ['Estilo libre (drills)', '6 x 50 m', '30 s', 'Eficiencia de brazada'],
        ['Patada con tabla', '4 x 50 m', '30 s', 'Propulsión'],
      ]),
      dia('Miércoles', 'Resistencia aeróbica', [
        ['Series 8 x 100 m', '8 x 100 m', '45 s', 'Capacidad aeróbica'],
        ['Nado continuo', '1000 m', '-', 'Base'],
      ]),
      dia('Viernes', 'Velocidad y virajes', [
        ['Sprints 4 x 25 m', '4 x 25 m', 'rec. completa', 'Velocidad'],
        ['Virajes y salidas', '6 x práctica', '60 s', 'Técnica'],
      ]),
    ],
  },
];

/**
 * Rutinas por familia de deportes: cubren CUALQUIER disciplina que no tenga
 * plantilla propia (ciclismo, karate, bádminton, golf, gimnasia, etc.).
 */
const POR_CATEGORIA = [
  {
    nombre: 'Deporte de resistencia',
    claves: ['ciclismo', 'triatlon', 'triatlón', 'remo', 'esqui de fondo', 'esquí de fondo', 'pedestrismo', 'fondo'],
    bloques: [
      dia('Lunes', 'Capacidad aeróbica', [
        ['Trabajo continuo a ritmo estable', '40-60 min', '-', 'Zona 2 aeróbica'],
        ['Fuerza funcional (core y tren inferior)', '3 circuitos', '60 s', 'Prevención'],
      ]),
      dia('Miércoles', 'Umbral y series', [
        ['Series de umbral', '5 x 1000 m', '90 s', 'Ritmo sostenido'],
        ['Técnica específica', '4 x 10 min', '60 s', 'Eficiencia'],
      ]),
      dia('Viernes', 'Resistencia de velocidad', [
        ['Intervalos intensos', '8 x 400 m', '2 min', 'VO2 máx'],
        ['Fuerza y pliometría ligera', '4 x 10', '75 s', 'Economía de movimiento'],
      ]),
    ],
  },
  {
    nombre: 'Deporte acuático',
    claves: ['acuatico', 'acuático', 'waterpolo', 'clavados', 'nado sincronizado', 'surf', 'vela', 'kayak', 'canotaje'],
    bloques: [
      dia('Lunes', 'Técnica de nado', [
        ['Drills técnicos del estilo', '6 x 50 m', '30 s', 'Eficiencia'],
        ['Trabajo con tabla/pull buoy', '4 x 50 m', '30 s', 'Propulsión'],
      ]),
      dia('Miércoles', 'Resistencia aeróbica', [
        ['Series de fondo', '8 x 100 m', '45 s', 'Capacidad aeróbica'],
        ['Nado continuo', '1000 m', '-', 'Base'],
      ]),
      dia('Viernes', 'Velocidad y virajes', [
        ['Sprints', '4 x 25 m', 'rec. completa', 'Velocidad'],
        ['Virajes y salidas', '6 x práctica', '60 s', 'Técnica'],
      ]),
    ],
  },
  {
    nombre: 'Deporte de combate',
    claves: ['boxeo', 'karate', 'kárate', 'judo', 'yudo', 'taekwondo', 'lucha', 'wrestling', 'mma', 'kung fu', 'aikido', 'esgrima', 'kickboxing'],
    bloques: [
      dia('Lunes', 'Técnica y potencia', [
        ['Técnica específica (golpes/proyecciones)', '5 x 3 min', '90 s', 'Precisión'],
        ['Fuerza explosiva', '4 x 6', '2 min', 'Potencia'],
      ]),
      dia('Miércoles', 'Resistencia de combate', [
        ['Rounds de sparring condicionado', '6 x 3 min', '1 min', 'Específico'],
        ['Circuito metabólico', '4 rondas', '90 s', 'Capacidad anaeróbica'],
      ]),
      dia('Viernes', 'Velocidad y agilidad', [
        ['Trabajo de velocidad de reacción', '6 x 20 s', 'rec. completa', 'Velocidad'],
        ['Agilidad y desplazamientos', '5 x circuito', '60 s', 'Movilidad'],
      ]),
    ],
  },
  {
    nombre: 'Deporte de raqueta / pala',
    claves: ['badminton', 'bádminton', 'padel', 'pádel', 'squash', 'ping pong', 'tenis de mesa', 'fronton', 'frontón', 'raquetbol'],
    bloques: [
      dia('Lunes', 'Técnica de golpes', [
        ['Golpes básicos en repetición', '4 x 20 bolas', '45 s', 'Consistencia'],
        ['Juego de pies específico', '4 x 30 s', '45 s', 'Posicionamiento'],
      ]),
      dia('Miércoles', 'Agilidad y resistencia', [
        ['Desplazamientos laterales y en abanico', '5 x 6 m', '45 s', 'Agilidad en pista'],
        ['Intervalos cortos', '6 x 400 m', '90 s', 'Resistencia específica'],
      ]),
      dia('Viernes', 'Juego y velocidad', [
        ['Puntos/partido dirigido', '3 x 10 min', '2 min', 'Táctica'],
        ['Sprints cortos de reacción', '6 x 10 m', 'rec. completa', 'Explosividad'],
      ]),
    ],
  },
  {
    nombre: 'Deporte de precisión',
    claves: ['tiro', 'arqueria', 'arquería', 'golf', 'billar', 'dardos', 'bowling', 'bolos', 'precision', 'precisión'],
    bloques: [
      dia('Lunes', 'Técnica y control', [
        ['Práctica técnica de precisión', '5 x 10 min', '2 min', 'Repetición del gesto'],
        ['Estabilidad y control postural', '3 x 40 s', '45 s', 'Core'],
      ]),
      dia('Miércoles', 'Concentración y rutina', [
        ['Simulación de competencia', '3 x serie', '3 min', 'Bajo presión'],
        ['Ejercicios de respiración y enfoque', '3 x 5 min', '-', 'Control mental'],
      ]),
      dia('Viernes', 'Fuerza específica', [
        ['Fuerza de tren superior/estabilizadores', '4 x 10', '75 s', 'Sostén'],
        ['Movilidad y coordinación fina', '3 x 10 min', '60 s', 'Control'],
      ]),
    ],
  },
  {
    nombre: 'Deporte artístico / de expresión',
    claves: ['gimnasia', 'patinaje', 'danza', 'ballet', 'nado artistico', 'nado artístico', 'expresion', 'expresión'],
    bloques: [
      dia('Lunes', 'Técnica y flexibilidad', [
        ['Elementos técnicos por bloques', '4 x serie', '90 s', 'Precisión'],
        ['Flexibilidad y movilidad', '3 x 10 min', '-', 'Rango articular'],
      ]),
      dia('Miércoles', 'Fuerza y control', [
        ['Fuerza de core y estabilizadores', '4 x 12', '60 s', 'Control corporal'],
        ['Equilibrio y coordinación', '3 x circuito', '60 s', 'Propiocepción'],
      ]),
      dia('Viernes', 'Resistencia y rutina completa', [
        ['Rutina/coreografía completa', '3 x pasada', '3 min', 'Resistencia específica'],
        ['Trabajo de expresión y ritmo', '3 x 10 min', '-', 'Calidad'],
      ]),
    ],
  },
  {
    nombre: 'Deporte de fuerza / potencia',
    claves: ['halterofilia', 'pesas', 'powerlifting', 'crossfit', 'lanzamiento', 'bala', 'disco', 'jabalina', 'fuerza', 'rugby', 'football americano'],
    bloques: [
      dia('Lunes', 'Fuerza máxima', [
        ['Ejercicio principal (sentadilla/press/peso muerto)', '5 x 5', '3 min', 'Alta carga'],
        ['Accesorios de empuje', '3 x 8', '90 s', 'Equilibrio muscular'],
      ]),
      dia('Miércoles', 'Potencia', [
        ['Levantamientos olímpicos o derivados', '5 x 3', '3 min', 'Velocidad de barra'],
        ['Multisaltos', '4 x 8', '90 s', 'Potencia de piernas'],
      ]),
      dia('Viernes', 'Fuerza resistencia', [
        ['Circuito de accesorios', '4 x 12', '60 s', 'Hipertrofia funcional'],
        ['Core y estabilidad', '3 x 40 s', '45 s', 'Transferencia'],
      ]),
    ],
  },
  {
    nombre: 'Deporte de equipo',
    claves: ['hockey', 'beisbol', 'béisbol', 'softbol', 'balonmano', 'handball', 'futsal', 'cricket', 'korfbal'],
    bloques: [
      dia('Lunes', 'Fuerza y técnica', [
        ['Fuerza funcional global', '4 x 8', '90 s', 'Base de potencia'],
        ['Técnica individual por estaciones', '4 x 10 min', '60 s', 'Gesto deportivo'],
      ]),
      dia('Miércoles', 'Resistencia y agilidad', [
        ['Juego reducido condicionado', '4 x 8 min', '2 min', 'Específico'],
        ['Cambios de dirección con estímulo', '5 x circuito', '60 s', 'Agilidad reactiva'],
      ]),
      dia('Viernes', 'Velocidad y táctica', [
        ['Sprints con balón/elemento', '6 x 20 m', 'rec. completa', 'Explosividad'],
        ['Situaciones tácticas de juego', '3 x 10 min', '90 s', 'Toma de decisiones'],
      ]),
    ],
  },
];

const GENERICA = {
  nombre: 'Entrenamiento general',
  bloques: [
    dia('Lunes', 'Fuerza funcional', [
      ['Sentadilla / zancadas', '4 x 10', '75 s', 'Tren inferior'],
      ['Flexiones + remo', '3 x 12', '60 s', 'Tren superior'],
      ['Plancha', '3 x 40 s', '45 s', 'Core'],
    ]),
    dia('Miércoles', 'Resistencia y agilidad', [
      ['Carrera continua', '20-30 min', '-', 'Aeróbico'],
      ['Cambios de dirección', '5 x 6 conos', '60 s', 'Agilidad'],
    ]),
    dia('Viernes', 'Velocidad y técnica', [
      ['Sprints progresivos', '6 x 30 m', 'rec. completa', 'Velocidad'],
      ['Trabajo técnico del deporte', '3 x 10 min', '90 s', 'Especificidad'],
    ]),
  ],
};

/** Ejercicio extra por capacidad débil: [ejercicio, dosis, objetivo]. */
const REFUERZO = {
  velocidad: ['Sprints cortos con recuperación completa', '6 x 20-30 m', 'Velocidad máxima'],
  resistencia: ['Intervalos aeróbicos progresivos', '4 x 800 m', 'Capacidad aeróbica'],
  fuerza: ['Fuerza funcional con progresión de carga', '3-4 x 8-10', 'Fuerza base'],
  agilidad: ['Drills de cambio de dirección reactivos', '5 x circuito', 'Agilidad'],
  coordinacion: ['Coordinación óculo-manual/podal con escalera', '4 x 1 ida', 'Coordinación'],
  tecnica: ['Trabajo técnico analítico con corrección', '3 x 12', 'Técnica'],
  disciplina_score: ['Seguimiento de hábitos y puntualidad', 'semanal', 'Disciplina'],
  asistencia: ['Plan de asistencia con aviso a la familia', 'semanal', 'Asistencia'],
};

module.exports = { POR_DEPORTE, POR_CATEGORIA, GENERICA, REFUERZO };
