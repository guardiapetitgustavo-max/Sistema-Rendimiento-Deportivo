/**
 * Conversión y formato de valores que llegan de formularios o de Excel.
 * Todas las fechas se manejan como texto ISO 'AAAA-MM-DD'.
 */
const ZONA_HORARIA = process.env.APP_TIMEZONE || 'America/Lima';

/** Fecha de hoy en la zona horaria de la academia, como 'AAAA-MM-DD'. */
function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

function esVacio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

/** Convierte '12,5', '80%', 75 → número. Devuelve null si está vacío; lanza si es inválido. */
function parsearNumero(valor) {
  if (esVacio(valor)) return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('no es un número válido');
    return valor;
  }
  const texto = String(valor).trim().replace(',', '.').replace(/%$/, '');
  const numero = Number(texto);
  if (texto === '' || !Number.isFinite(numero)) throw new Error('no es un número válido');
  return numero;
}

const esFechaReal = (a, m, d) => {
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
};
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Acepta Date, 'AAAA-MM-DD', 'AAAA/MM/DD', 'DD/MM/AAAA', 'DD-MM-AAAA' y 'DD/MM/AA'.
 * Devuelve 'AAAA-MM-DD', null si está vacío, o lanza si no es una fecha válida.
 */
function parsearFecha(valor) {
  if (esVacio(valor)) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error('fecha inválida');
    return iso(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  }
  const texto = String(valor).trim();
  let a;
  let m;
  let d;
  let partes = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (partes) {
    [a, m, d] = partes.slice(1).map(Number);
  } else if ((partes = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/))) {
    [d, m, a] = partes.slice(1).map(Number);
    if (a < 100) a += 2000;
  } else {
    throw new Error('fecha inválida');
  }
  if (!esFechaReal(a, m, d)) throw new Error('fecha inválida');
  return iso(a, m, d);
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
function formatearFecha(isoTexto) {
  if (!isoTexto) return '';
  const [a, m, d] = String(isoTexto).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const redondear = (valor, decimales = 1) =>
  valor === null || valor === undefined ? null : Number(Number(valor).toFixed(decimales));

module.exports = { hoyISO, esVacio, parsearNumero, parsearFecha, formatearFecha, redondear };
