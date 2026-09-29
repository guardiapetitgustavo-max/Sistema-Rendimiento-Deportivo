/**
 * Estado de la sesión compartido por todo el frontend: el usuario que entró y, si es
 * administrador, el coach cuyos datos está viendo (null = todos los coaches).
 * El coach elegido se envía a la API en la cabecera X-Coach (ver api.js).
 */
const CLAVE_COACH = 'sporteval-coach';

let usuario = null;
let coaches = [];
let coach = leerGuardado();

function leerGuardado() {
  try {
    const valor = Number(window.localStorage.getItem(CLAVE_COACH));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

export const usuarioActual = () => usuario;
export const esAdmin = () => usuario?.rol === 'admin';

export function fijarUsuario(nuevo) {
  usuario = nuevo;
  if (!esAdmin()) {
    coaches = [];
    coach = null;
  }
}

/** Coach elegido por el administrador (null = todos). Para un coach siempre es null: la API usa su propio id. */
export const coachElegido = () => (esAdmin() ? coach : null);

export function elegirCoach(id) {
  coach = Number(id) || null;
  try {
    if (coach) window.localStorage.setItem(CLAVE_COACH, String(coach));
    else window.localStorage.removeItem(CLAVE_COACH);
  } catch {
    // Sin almacenamiento disponible: la elección dura solo mientras la página esté abierta
  }
}

export const listaCoaches = () => coaches;

/** Guarda la lista de cuentas que pueden tener deportistas y descarta una elección que ya no existe. */
export function fijarCoaches(lista) {
  coaches = lista.filter((c) => c.activo);
  if (coach && !coaches.some((c) => c.id === coach)) elegirCoach(null);
}

export const nombreCoach = (id) => coaches.find((c) => c.id === Number(id))?.nombre || '';
