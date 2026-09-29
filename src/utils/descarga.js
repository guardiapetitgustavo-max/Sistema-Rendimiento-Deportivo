const MIME = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json',
};

/** Envía un archivo para descargar con el tipo MIME según la extensión. */
function enviarDescarga(res, buffer, nombre, formato) {
  const seguro = nombre.normalize('NFD').replace(/[^\w.-]+/g, '_');
  res.set({
    'Content-Type': MIME[formato],
    'Content-Disposition': `attachment; filename="${seguro}"`,
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
}

module.exports = { enviarDescarga };
