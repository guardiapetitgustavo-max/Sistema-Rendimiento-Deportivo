const { solicitudInvalida } = require('./http-error');
const { esVacio, parsearNumero, parsearFecha } = require('./valores');

/**
 * Valida y limpia un objeto según un esquema declarativo.
 *
 * Reglas por campo:
 *   tipo: 'texto' | 'numero' | 'entero' | 'fecha' | 'booleano' | 'correo'
 *   etiqueta, requerido, min, max, maxLargo
 *
 * En modo `parcial` solo se procesan los campos presentes (útil al editar).
 * Devuelve { limpio, errores: [{ campo, etiqueta, mensaje }] } sin lanzar.
 */
function revisar(esquema, datos = {}, { parcial = false } = {}) {
  const limpio = {};
  const errores = [];

  for (const [campo, regla] of Object.entries(esquema)) {
    const etiqueta = regla.etiqueta || campo;
    const presente = Object.prototype.hasOwnProperty.call(datos, campo);
    if (parcial && !presente) continue;

    const valor = datos[campo];
    if (esVacio(valor)) {
      if (regla.requerido) errores.push({ campo, etiqueta, mensaje: 'es obligatorio' });
      else limpio[campo] = regla.tipo === 'booleano' ? false : null;
      continue;
    }

    try {
      limpio[campo] = convertir(regla, valor);
    } catch (error) {
      errores.push({ campo, etiqueta, mensaje: error.message });
    }
  }
  return { limpio, errores };
}

/** Igual que `revisar`, pero lanza un error 400 con la lista de problemas. */
function validar(esquema, datos, opciones) {
  const { limpio, errores } = revisar(esquema, datos, opciones);
  if (errores.length) {
    throw solicitudInvalida('Revisa los datos enviados', errores.map((e) => `${e.etiqueta}: ${e.mensaje}.`));
  }
  return limpio;
}

function convertir(regla, valor) {
  switch (regla.tipo) {
    case 'texto': {
      const texto = String(valor).trim();
      if (regla.maxLargo && texto.length > regla.maxLargo) {
        throw new Error(`máximo ${regla.maxLargo} caracteres`);
      }
      return texto;
    }
    case 'correo': {
      const correo = String(valor).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('no es un correo válido');
      return correo;
    }
    case 'numero':
    case 'entero': {
      const numero = parsearNumero(valor);
      if (regla.tipo === 'entero' && !Number.isInteger(numero)) throw new Error('debe ser un número entero');
      if (regla.min !== undefined && numero < regla.min) throw new Error(`debe ser mayor o igual a ${regla.min}`);
      if (regla.max !== undefined && numero > regla.max) throw new Error(`debe ser menor o igual a ${regla.max}`);
      return numero;
    }
    case 'fecha':
      try {
        return parsearFecha(valor);
      } catch {
        throw new Error('fecha inválida (usa DD/MM/AAAA)');
      }
    case 'booleano':
      return valor === true || valor === 'true' || valor === 'on' || valor === '1' || valor === 1;
    default:
      throw new Error(`tipo de campo desconocido: ${regla.tipo}`);
  }
}

/** Convierte un parámetro de ruta en id entero positivo o lanza 400. */
function idValido(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('Identificador inválido');
  return id;
}

module.exports = { revisar, validar, idValido };
