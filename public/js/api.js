/**
 * Cliente de la API a prueba de fallos:
 * - Tiempo máximo por petición (no se queda "cargando" para siempre).
 * - Reintentos automáticos de lecturas ante cortes de red o servidor ocupado.
 * - Mensajes claros para cada tipo de error y cabecera anti-CSRF.
 */
import { coachElegido } from './sesion.js';

export class ErrorApi extends Error {
  constructor(status, mensaje, detalles = [], referencia = null) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
    this.referencia = referencia;
  }
}

const TIEMPO_MAXIMO_MS = 45000;
const ESTADOS_REINTENTABLES = new Set([502, 503, 504]);
const esperar = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const MENSAJES_ESTADO = {
  413: 'Los datos o el archivo son demasiado grandes',
  429: 'Demasiadas solicitudes seguidas. Espera un momento',
  502: 'El servidor no respondió correctamente. Inténtalo de nuevo',
  503: 'El servicio no está disponible en este momento. Inténtalo en unos segundos',
  504: 'El servidor tardó demasiado en responder. Inténtalo de nuevo',
};

async function unaVez(metodo, ruta, cuerpo) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  const opciones = {
    method: metodo,
    headers: { 'X-Requested-With': 'fetch', Accept: 'application/json' },
    credentials: 'same-origin',
    signal: control.signal,
  };
  // Administrador: la API trabaja con los datos del coach elegido en la barra superior
  if (coachElegido()) opciones.headers['X-Coach'] = String(coachElegido());
  if (cuerpo instanceof FormData) {
    opciones.body = cuerpo;
  } else if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  try {
    return await fetch(`/api${ruta}`, opciones);
  } catch (error) {
    if (error.name === 'AbortError') throw new ErrorApi(0, 'El servidor tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo');
    throw new ErrorApi(0, navigator.onLine === false
      ? 'No tienes conexión a internet'
      : 'No se pudo conectar con el servidor. Revisa tu conexión');
  } finally {
    clearTimeout(temporizador);
  }
}

/** Solo las lecturas (GET) se reintentan: nunca se repite algo que pueda guardar dos veces. */
async function conReintentos(metodo, ruta, cuerpo) {
  const intentos = metodo === 'GET' ? 3 : 1;
  for (let intento = 1; ; intento += 1) {
    try {
      const respuesta = await unaVez(metodo, ruta, cuerpo);
      if (intento < intentos && ESTADOS_REINTENTABLES.has(respuesta.status)) {
        await esperar(500 * intento);
        continue;
      }
      return respuesta;
    } catch (error) {
      if (intento >= intentos) throw error;
      await esperar(500 * intento);
    }
  }
}

async function errorDesde(respuesta) {
  const datos = await respuesta.json().catch(() => ({}));
  const mensaje = datos.error || MENSAJES_ESTADO[respuesta.status] || 'Ocurrió un error inesperado';
  return new ErrorApi(respuesta.status, mensaje, Array.isArray(datos.detalles) ? datos.detalles : [], datos.referencia || null);
}

async function solicitar(metodo, ruta, cuerpo) {
  const respuesta = await conReintentos(metodo, ruta, cuerpo);
  if (respuesta.status === 204) return null;
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('sesion-expirada'));
    }
    throw await errorDesde(respuesta);
  }
  try {
    return await respuesta.json();
  } catch {
    throw new ErrorApi(respuesta.status, 'La respuesta del servidor no es válida. Recarga la página');
  }
}

/** Convierte un objeto en query string, omitiendo valores vacíos. */
export function consulta(params = {}) {
  const limpio = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);
  return limpio.length ? `?${new URLSearchParams(limpio)}` : '';
}

export const api = {
  get: (ruta) => solicitar('GET', ruta),
  post: (ruta, cuerpo = {}) => solicitar('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => solicitar('PUT', ruta, cuerpo),
  delete: (ruta) => solicitar('DELETE', ruta),

  /** Descarga un archivo (Excel, PDF, JSON) y lo guarda con el nombre que indica el servidor. */
  async descargar(ruta) {
    const respuesta = await conReintentos('GET', ruta);
    if (!respuesta.ok) throw await errorDesde(respuesta);
    const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') || '')?.[1] || 'archivo';
    const url = URL.createObjectURL(await respuesta.blob());
    const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
