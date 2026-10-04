const { Router } = require('express');
const servicio = require('./rendimiento.service');
const { idValido } = require('../../utils/validar');

// Montado con rendimiento.ver (solo lectura; el cálculo del puntaje guarda una foto con su versión de scoring)
const router = Router();

router.get('/panel', async (req, res) => res.json(await servicio.panel(req.alcance)));
router.get('/ranking', async (req, res) => res.json(await servicio.ranking(req.alcance, req.query)));
router.get('/comparar', async (req, res) => res.json(await servicio.comparar(req.alcance, String(req.query.ids || '').split(','))));
router.get('/equipos/:id', async (req, res) => res.json(await servicio.resumenEquipo(req.alcance, idValido(req.params.id))));
router.get('/deportistas/:id/evolucion', async (req, res) => res.json(await servicio.evolucionDeportista(req.alcance, idValido(req.params.id))));
router.get('/deportistas/:id/puntaje', async (req, res) => res.json(await servicio.puntaje(req.alcance, idValido(req.params.id), {
  fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : undefined,
  scoringId: Number(req.query.scoring_id) || null,
})));
router.get('/deportistas/:id/puntajes', async (req, res) => res.json(await servicio.historialPuntajes(req.alcance, idValido(req.params.id))));

module.exports = router;
