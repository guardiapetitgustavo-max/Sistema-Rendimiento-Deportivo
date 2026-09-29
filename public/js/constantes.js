/** Capacidades evaluadas (mismo orden que en la base de datos). */
export const CAPACIDADES = [
  { clave: 'velocidad', nombre: 'Velocidad', corto: 'Vel.' },
  { clave: 'resistencia', nombre: 'Resistencia', corto: 'Res.' },
  { clave: 'fuerza', nombre: 'Fuerza', corto: 'Fue.' },
  { clave: 'agilidad', nombre: 'Agilidad', corto: 'Agi.' },
  { clave: 'coordinacion', nombre: 'Coordinación', corto: 'Coord.' },
  { clave: 'tecnica', nombre: 'Técnica', corto: 'Téc.' },
  { clave: 'disciplina_score', nombre: 'Disciplina', corto: 'Disc.' },
  { clave: 'asistencia', nombre: 'Asistencia', corto: 'Asist.' },
];

/** Colores en hexadecimal de 6 dígitos (los gráficos les añaden transparencia). */
export const COLORES = {
  azul: '#1e3a8a',
  acento: '#4f7cff',
  claro: '#22d3ee',
  verde: '#22c55e',
  amarillo: '#f59e0b',
  rojo: '#ef4444',
  violeta: '#8b5cf6',
  lima: '#84cc16',
  gris: '#94a3b8',
};

export const COLOR_POR_NIVEL = { Alto: COLORES.verde, Medio: COLORES.amarillo, Bajo: COLORES.rojo };

export const PALETA_CAPACIDADES = [
  COLORES.acento, COLORES.claro, COLORES.violeta, COLORES.verde, COLORES.amarillo, COLORES.rojo, COLORES.lima, '#ec4899',
];
