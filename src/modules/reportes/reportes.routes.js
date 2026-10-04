const { Router } = require('express');
const servicio = require('./reportes.service');
const { aExcel, reporteAPdf } = require('./exportar');
const { enviarDescarga } = require('../../utils/descarga');
const { solicitudInvalida } = require('../../utils/http-error');
const { hoyISO } = require('../../utils/valores');
const { verificarLimite } = require('../../core/limites');
const { registrar } = require('../../core/auditoria');

const router = Router();

router.get('/', async (req, res) => res.json(await servicio.resumen(req.alcance)));

router.get('/:tipo/:formato', async (req, res) => {
  const { tipo, formato } = req.params;
  if (!['excel', 'pdf'].includes(formato)) throw solicitudInvalida('Formato no soportado (usa excel o pdf)');

  await verificarLimite(req.usuario, 'reportes_mes');
  const reporte = await servicio.generar(req.alcance, tipo, Number(req.query.deportista_id));
  const nombre = `reporte_${tipo}_${hoyISO()}`;
  const aca = req.usuario.academia;
  const marca = { nombre: aca.config?.nombre_comercial || aca.nombre, color: aca.config?.color_primario };
  const buffer = formato === 'excel'
    ? await aExcel([{ nombre: 'Reporte', ...reporte }])
    : await reporteAPdf(reporte, marca);
  // Cada descarga cuenta para el límite mensual del plan y queda en la auditoría
  await registrar({ academia: aca.id, usuario: req.usuario.id, accion: 'reporte', entidad: 'reportes', detalle: { tipo, formato }, ip: req.ip });
  enviarDescarga(res, buffer, `${nombre}.${formato === 'excel' ? 'xlsx' : 'pdf'}`, formato);
});

module.exports = router;
