/**
 * Utilidades de medición en el navegador (mismas reglas que src/domain/medicion.js):
 * lectura de tiempos escritos a mano, formato de valores y textos de dirección de mejora.
 */
export function parsearTiempo(texto) {
  if (typeof texto === 'number') return texto;
  const limpio = String(texto ?? '').trim().replace(',', '.');
  if (!limpio) return null;
  if (/^\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
  const partes = limpio.split(':');
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d+(\.\d+)?$/.test(p))) throw new Error(`Tiempo no válido: "${texto}" (usa 4.82, 1:04.32 o 1:04:32)`);
  const n = partes.map(Number);
  if (n.slice(1).some((x) => x >= 60)) throw new Error('Minutos y segundos deben ser menores de 60');
  return partes.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
}

export function formatearTiempo(segundos, decimales = 2) {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return '—';
  if (segundos < 60) return `${segundos.toFixed(decimales)} s`;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = (segundos % 60).toFixed(decimales).padStart(decimales ? decimales + 3 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatearValor(valor, { tipo_resultado: tipo, unidad = '', decimales = 2 } = {}) {
  if (valor === null || valor === undefined) return '—';
  if (tipo === 'TIME') return formatearTiempo(valor, decimales);
  return `${Number(valor).toFixed(decimales).replace(/\.?0+$/, '') || '0'} ${unidad}`.trim();
}

export const TEXTO_DIRECCION = {
  LOWER_IS_BETTER: 'Menos es mejor', HIGHER_IS_BETTER: 'Más es mejor', TARGET_RANGE: 'Dentro de un rango', CUSTOM: 'Sin dirección',
};
export const TEXTO_FUENTE = {
  MANUAL: 'Manual', PHONE: 'Teléfono', VIDEO: 'Video (estimado)', SENSOR: 'Sensor', EXTERNAL_SYSTEM: 'Sistema externo',
};
export const CAPACIDADES = {
  velocidad: 'Velocidad', resistencia: 'Resistencia', fuerza: 'Fuerza', potencia: 'Potencia', agilidad: 'Agilidad',
  flexibilidad: 'Flexibilidad / movilidad', tecnica: 'Técnica', otra: 'Otra',
};

/** Variación con signo legible ("mejora 5.9 %" / "empeora 2.1 %"). */
export function textoVariacion(v) {
  if (!v || v.porcentaje === null || v.porcentaje === undefined) return '';
  if (v.porcentaje === 0) return 'igual';
  return `${v.porcentaje > 0 ? 'mejora' : 'empeora'} ${Math.abs(v.porcentaje)} %`;
}

/** Identificador único para sincronizar sin duplicar (modo sin conexión). */
export const claveUnica = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
