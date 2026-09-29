const { Router } = require('express');
const servicio = require('./reportes.service');
const { aExcel, reporteAPdf } = require('./exportar');
const { enviarDescarga } = require('../../utils/descarga');
const { solicitudInvalida } = require('../../utils/http-error');
const { hoyISO } = require('../../utils/valores');

const router = Router();

router.get('/', async (req, res) => res.json(await servicio.resumen(req.usuario.id)));

router.get('/:tipo/:formato', async (req, res) => {
  const { tipo, formato } = req.params;
  if (!['excel', 'pdf'].includes(formato)) throw solicitudInvalida('Formato no soportado (usa excel o pdf)');

  const reporte = await servicio.generar(req.usuario.id, tipo, Number(req.query.deportista_id));
  const nombre = `reporte_${tipo}_${hoyISO()}`;
  const buffer = formato === 'excel'
    ? await aExcel([{ nombre: 'Reporte', ...reporte }])
    : await reporteAPdf(reporte);
  enviarDescarga(res, buffer, `${nombre}.${formato === 'excel' ? 'xlsx' : 'pdf'}`, formato);
});

module.exports = router;
