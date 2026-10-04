const { Router } = require('express');
const servicio = require('./medicion.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');
const { trasRegistrar } = require('../inteligencia/motor-alertas');

/**
 * Montado con resultados.ver (lectura). Registrar exige medicion.usar; corregir/anular y gestionar sesiones,
 * resultados.gestionar. Deportistas y padres no tienen ninguno de estos permisos.
 */
const router = Router();
const medir = requierePermiso('medicion.usar');
const gestionar = requierePermiso('resultados.gestionar');

// Reloj del servidor para sincronizar dispositivos (cronómetro de dos teléfonos)
router.get('/hora', (req, res) => res.json({ servidor: Date.now() }));

router.get('/sesiones', async (req, res) => res.json(await servicio.listarSesiones(req.alcance, req.query)));
router.get('/sesiones/:id', async (req, res) => res.json(await servicio.obtenerSesion(req.alcance, idValido(req.params.id))));
router.post('/sesiones', medir, async (req, res) => res.status(201).json(await servicio.crearSesion(req.alcance, req.usuario, req.body)));
router.post('/sesiones/:id/cerrar', medir, async (req, res) => res.json(await servicio.cerrarSesion(req.alcance, idValido(req.params.id))));
router.post('/sesiones/:id/reabrir', gestionar, async (req, res) => res.json(await servicio.reabrirSesion(req.alcance, idValido(req.params.id))));

router.get('/resultados', async (req, res) => res.json(await servicio.listarResultados(req.alcance, req.query)));
router.post('/resultados', medir, async (req, res) => {
  const r = await servicio.registrar(req.alcance, req.usuario, req.body);
  if (!r.duplicado) await trasRegistrar(req.usuario, [r.deportista_id]);
  res.status(r.duplicado ? 200 : 201).json(r);
});
router.post('/resultados/lote', medir, async (req, res) => {
  const r = await servicio.registrarLote(req.alcance, req.usuario, req.body?.resultados);
  if (r.guardados) await trasRegistrar(req.usuario, (req.body.resultados || []).map((x) => Number(x?.deportista_id)));
  res.json(r);
});
router.put('/resultados/:id', gestionar, async (req, res) => res.json(await servicio.corregir(req.alcance, req.usuario, idValido(req.params.id), req.body)));
router.delete('/resultados/:id', gestionar, async (req, res) => {
  await servicio.anular(req.alcance, req.usuario, idValido(req.params.id), req.body?.motivo || req.query.motivo);
  res.status(204).end();
});

router.post('/cronometros', medir, async (req, res) => res.status(201).json(await servicio.crearCronometro(req.alcance, req.usuario, req.body)));
router.get('/cronometros/:codigo', medir, async (req, res) => res.json(await servicio.cronometroPorCodigo(req.alcance, req.params.codigo)));
router.post('/cronometros/:codigo/marca', medir, async (req, res) =>
  res.json(await servicio.marcarCronometro(req.alcance, req.usuario, req.params.codigo, req.body)));

module.exports = router;
