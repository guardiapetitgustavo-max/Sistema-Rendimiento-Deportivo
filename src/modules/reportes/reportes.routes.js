const { Router } = require('express');
const servicio = require('./reportes.service');
const { aExcel, reporteAPdf } = require('./exportar');
const { enviarDescarga } = require('../../utils/descarga');
const { solicitudInvalida } = require('../../utils/http-error');
const { hoyISO } = require('../../utils/valores');
const { verificarLimite } = require('../../core/limites');
const { registrar } = require('../../core/auditoria');
const { idValido } = require('../../utils/validar');
const usoReportes = require('./uso.service');

const router = Router();

router.get('/', async (req, res) => res.json(await servicio.resumen(req.alcance)));

router.get('/:tipo/:formato', async (req, res) => {
  const { tipo, formato } = req.params;
  if (!['excel', 'pdf'].includes(formato)) throw solicitudInvalida('Formato no soportado (usa excel o pdf)');

  await verificarLimite(req.usuario, 'reportes_mes');
  const aca = req.usuario.academia;
  const inicio = Date.now();
  let buffer;
  try {
    const reporte = await servicio.generar(req.alcance, tipo, Number(req.query.deportista_id));
    const marca = { nombre: aca.config?.nombre_comercial || aca.nombre, color: aca.config?.color_primario };
    buffer = formato === 'excel'
      ? await aExcel([{ nombre: 'Reporte', ...reporte }])
      : await reporteAPdf(reporte, marca);
  } catch (error) {
    // Indicador "efectividad de los reportes": también cuentan los intentos que fallaron
    await usoReportes.registrar({ academia: aca.id, usuario: req.usuario.id, tipo, formato, exito: false, duracionMs: Date.now() - inicio, error: error.message });
    throw error;
  }
  const uso = await usoReportes.registrar({ academia: aca.id, usuario: req.usuario.id, tipo, formato, exito: true, duracionMs: Date.now() - inicio });
  // Cada descarga cuenta para el límite mensual del plan y queda en la auditoría
  await registrar({ academia: aca.id, usuario: req.usuario.id, accion: 'reporte', entidad: 'reportes', detalle: { tipo, formato }, ip: req.ip });
  if (uso) res.set('X-Reporte-Id', String(uso.id));
  enviarDescarga(res, buffer, `reporte_${tipo}_${hoyISO()}.${formato === 'excel' ? 'xlsx' : 'pdf'}`, formato);
});

// Valoración opcional del reporte recién descargado (utilidad 1-5 y si ayudó a tomar una decisión)
router.put('/uso/:id/valoracion', async (req, res) =>
  res.json(await usoReportes.valorar(req.usuario, idValido(req.params.id), req.body)));

module.exports = router;
