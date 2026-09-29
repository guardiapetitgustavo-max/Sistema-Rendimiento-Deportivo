class HttpError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

const noEncontrado = (que = 'Recurso') => new HttpError(404, `${que} no encontrado`);
const solicitudInvalida = (mensaje, detalles) => new HttpError(400, mensaje, detalles);

module.exports = { HttpError, noEncontrado, solicitudInvalida };
