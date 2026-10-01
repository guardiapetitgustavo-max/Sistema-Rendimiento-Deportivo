/**
 * Estado de la sesión compartido por todo el frontend: quién entró, en qué academia está,
 * con qué rol, qué permisos y qué módulos tiene activos. Los menús, las pantallas y los botones
 * se adaptan a esto (la API aplica las mismas reglas, así que ocultar algo aquí es solo comodidad).
 *
 * El administrador puede elegir un coach en la barra superior: se envía en la cabecera X-Coach (api.js).
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
export const academiaActual = () => usuario?.academia || null;
export const rolActual = () => usuario?.rol || null;
export const esAdmin = () => usuario?.rol === 'admin';
export const esSuperAdmin = () => Boolean(usuario?.es_super_admin);
export const puede = (permiso) => Boolean(usuario?.permisos?.includes(permiso));
export const moduloActivo = (clave) => Boolean(usuario?.academia?.modulos?.[clave]);

export const NOMBRE_ROL = { admin: 'Administrador', coach: 'Coach', deportista: 'Deportista', padre: 'Padre / madre' };

export function fijarUsuario(nuevo) {
  const cambioAcademia = usuario?.academia?.id !== nuevo?.academia?.id;
  usuario = nuevo;
  if (!esAdmin() || cambioAcademia) {
    coaches = [];
    if (cambioAcademia && usuario) elegirCoach(null);
  }
}

/** Pantalla de inicio según lo que el usuario puede hacer. */
export function rutaInicio() {
  if (puede('dashboard.ver')) return '/dashboard';
  if (puede('portal.ver')) return '/portal';
  if (esSuperAdmin() && !academiaActual()) return '/plataforma';
  return '/cuenta';
}

/** Coach elegido por el administrador (null = toda la academia). Para los demás siempre null. */
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

/** Guarda quiénes pueden tener deportistas (coaches y administradores activos) y descarta una elección que ya no existe. */
export function fijarCoaches(miembros) {
  coaches = miembros.filter((m) => m.activo && ['coach', 'admin'].includes(m.rol));
  if (coach && !coaches.some((c) => c.id === coach)) elegirCoach(null);
}

export const nombreCoach = (id) => coaches.find((c) => c.id === Number(id))?.nombre || '';
