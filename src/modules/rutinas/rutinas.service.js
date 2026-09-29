/**
 * Generador de rutinas semanales según la disciplina y la última evaluación.
 * Especificidad: deporte concreto → familia de deportes → plantilla general.
 * Es una guía de apoyo, no una indicación médica.
 */
const { NOMBRE_CAPACIDAD, capitalizar, clasificar, nivelDe, puntajes } = require('../../domain/rendimiento');
const { POR_DEPORTE, POR_CATEGORIA, GENERICA, REFUERZO } = require('./rutinas.data');

function detectarPlantilla(disciplina) {
  const texto = (disciplina || '').toLowerCase().trim();
  if (!texto) return { plantilla: GENERICA, origen: 'generica' };
  const coincide = (p) => p.claves.some((clave) => texto.includes(clave));
  const deporte = POR_DEPORTE.find(coincide);
  if (deporte) return { plantilla: deporte, origen: 'deporte' };
  const categoria = POR_CATEGORIA.find(coincide);
  if (categoria) return { plantilla: categoria, origen: 'categoria' };
  return { plantilla: GENERICA, origen: 'generica' };
}

function recomendaciones(nivel, debiles) {
  const lista = [];
  if (nivel === 'Bajo') {
    lista.push('Empezar con volumen e intensidad moderados y progresar de a pocos para evitar lesiones y favorecer la adherencia.');
  } else if (nivel === 'Medio') {
    lista.push('Mantener la base aeróbica y añadir trabajo específico de las capacidades intermedias para dar el salto a rendimiento alto.');
  } else if (nivel === 'Alto') {
    lista.push('Optimizar la intensidad y cuidar la recuperación; usar sus fortalezas como base para competir y liderar en su categoría.');
  }
  if (debiles.length) {
    lista.push(`Dar prioridad al refuerzo de: ${debiles.slice(0, 3).map((c) => NOMBRE_CAPACIDAD[c]).join(', ')} (ver bloque de refuerzo).`);
  }
  lista.push('Complementar con el registro de alimentación e hidratación para relacionar nutrición, descanso y rendimiento.');
  lista.push('Esta rutina es una guía de apoyo generada con los datos evaluados; no es una indicación médica. El criterio del coach tiene prioridad.');
  return lista;
}

/** Rutina personalizada para un deportista resumido (con su última evaluación). */
function generarRutina(dep) {
  const { plantilla, origen } = detectarPlantilla(dep.disciplina);
  const ultima = dep.ultima_evaluacion;
  const nivel = nivelDe(ultima?.puntuacion_general) || 'Sin evaluar';
  const debiles = ultima ? clasificar(puntajes(ultima)).debiles.map(([c]) => c) : [];

  return {
    deportista: { id: dep.id, nombre: dep.nombre, codigo: dep.codigo },
    disciplina: dep.disciplina || 'General',
    enfoque: plantilla.nombre,
    origen,
    nivel,
    bloques: plantilla.bloques,
    refuerzos: debiles.slice(0, 4).map((c) => {
      const [ejercicio, dosis, nota] = REFUERZO[c];
      return { capacidad: capitalizar(NOMBRE_CAPACIDAD[c]), ejercicio, dosis, nota };
    }),
    recomendaciones: recomendaciones(nivel, debiles),
  };
}

module.exports = { generarRutina };
