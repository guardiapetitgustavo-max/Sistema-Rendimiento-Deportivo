const { Router } = require('express');
const servicio = require('./ia.service');
const { idValido } = require('../../utils/validar');
const { claveModelo } = require('../../middlewares/roles');

const router = Router();

router.post('/analizar', async (req, res) =>
  res.json(await servicio.analizarDeportista(req.alcance, idValido(req.body?.deportista_id))));

router.post('/resumen', async (req, res) => res.json(await servicio.resumenAcademia(req.alcance)));

router.post('/automatico', async (req, res) =>
  res.json(await servicio.modoAutomatico(req.alcance, { usarDemo: req.body?.usar_demo === true, clave: claveModelo(req) })));

module.exports = router;
