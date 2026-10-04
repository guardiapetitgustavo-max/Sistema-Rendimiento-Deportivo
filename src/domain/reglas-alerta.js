/**
 * Catálogo de reglas de alerta. Cada academia activa/desactiva cada regla y ajusta sus umbrales.
 * Los textos explican el motivo con los datos concretos que la generaron.
 */
const REGLAS = {
  caida_rendimiento: {
    nombre: 'Caída del rendimiento',
    descripcion: 'La última marca de una prueba empeora respecto a la mejor marca personal más de un porcentaje.',
    parametros: { porcentaje: 5 },
    prioridad: 'alta',
  },
  mejora_importante: {
    nombre: 'Mejora importante',
    descripcion: 'La última marca mejora a la anterior más de un porcentaje.',
    parametros: { porcentaje: 5 },
    prioridad: 'baja',
  },
  record_personal: {
    nombre: 'Récord personal',
    descripcion: 'El deportista supera su mejor marca en una prueba.',
    parametros: {},
    prioridad: 'baja',
  },
  baja_asistencia: {
    nombre: 'Baja asistencia',
    descripcion: 'La asistencia de los últimos días está por debajo del porcentaje mínimo.',
    parametros: { porcentaje: 75, dias: 30, minimo_registros: 4 },
    prioridad: 'media',
  },
  evaluacion_pendiente: {
    nombre: 'Evaluación pendiente',
    descripcion: 'El deportista no tiene mediciones desde hace más días de los indicados.',
    parametros: { dias: 60 },
    prioridad: 'baja',
  },
  fatiga_repetida: {
    nombre: 'Fatiga repetida',
    descripcion: 'Fatiga reportada igual o mayor al umbral varios días seguidos.',
    parametros: { umbral: 8, dias_consecutivos: 3 },
    prioridad: 'alta',
  },
  sueno_insuficiente: {
    nombre: 'Sueño insuficiente',
    descripcion: 'Promedio de horas de sueño por debajo del mínimo en los últimos días registrados.',
    parametros: { horas: 7, dias: 5 },
    prioridad: 'media',
  },
  dolor_reportado: {
    nombre: 'Dolor reportado',
    descripcion: 'El deportista reporta dolor con intensidad igual o mayor al umbral (no es un diagnóstico).',
    parametros: { intensidad: 6 },
    prioridad: 'alta',
  },
  valor_atipico: {
    nombre: 'Valor atípico',
    descripcion: 'Un resultado difiere de la mejor marca más de un porcentaje: probable error de registro. No cuenta como récord ni como caída hasta revisarlo.',
    parametros: { porcentaje: 25 },
    prioridad: 'media',
  },
  objetivo_vencido: {
    nombre: 'Objetivo vencido',
    descripcion: 'Un objetivo activo pasó su fecha límite sin alcanzarse.',
    parametros: {},
    prioridad: 'media',
  },
};

module.exports = { REGLAS };
