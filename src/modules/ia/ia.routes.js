const { Router } = require('express');
const servicio = require('./ia.service');
const { idValido } = require('../../utils/validar');

const router = Router();

router.post('/analizar', async (req, res) =>
  res.json(await servicio.analizarDeportista(req.usuario.id, idValido(req.body?.deportista_id))));

router.post('/resumen', async (req, res) => res.json(await servicio.resumenAcademia(req.usuario.id)));

router.post('/automatico', async (req, res) =>
  res.json(await servicio.modoAutomatico(req.usuario.id, { usarDemo: req.body?.usar_demo === true })));

module.exports = router;
