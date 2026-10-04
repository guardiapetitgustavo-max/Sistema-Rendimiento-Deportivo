const { Router } = require('express');
const servicio = require('./portal.service');
const comercial = require('../comercial/comercial.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso, requiereModulo } = require('../../middlewares/roles');
const { trasRegistrar } = require('../inteligencia/motor-alertas');

// Exige el permiso portal.ver (deportista y padre, ver routes.js). Consulta + registro de SU recuperación/alimentación.
const router = Router();

router.get('/deportistas', async (req, res) => res.json(await servicio.listar(req.usuario)));
router.get('/deportistas/:id', async (req, res) => res.json(await servicio.perfil(req.usuario, idValido(req.params.id))));
router.get('/deportistas/:id/seguimiento', async (req, res) => res.json(await servicio.seguimiento(req.usuario, idValido(req.params.id))));

router.post('/recuperacion', requierePermiso('portal.recuperacion'), async (req, res) => {
  const r = await servicio.registrarRecuperacion(req.usuario, req.body);
  await trasRegistrar(req.usuario, [r.deportista_id]);
  res.json(r);
});
router.post('/alimentacion', requiereModulo('nutricion'), requierePermiso('portal.nutricion'), async (req, res) =>
  res.status(201).json(await servicio.registrarAlimentacion(req.usuario, req.body)));

router.get('/videos', requiereModulo('video'), requierePermiso('portal.videos'), async (req, res) => res.json(await servicio.videos(req.usuario)));
router.get('/videos/:id/url', requiereModulo('video'), requierePermiso('portal.videos'), async (req, res) =>
  res.json(await servicio.urlVideo(req.usuario, idValido(req.params.id))));

router.get('/pagos', requiereModulo('comercial'), requierePermiso('portal.pagos'), async (req, res) => res.json(await servicio.pagos(req.usuario)));
router.get('/comunicados', async (req, res) => res.json(await comercial.listarComunicados(req.usuario)));

module.exports = router;
