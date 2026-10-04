const { Router } = require('express');
const servicio = require('./nutricion.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con el módulo "nutricion" y alimentacion.ver; el perfil se edita con alimentacion.gestionar
// y las notas profesionales exigen además nutricion.orientar (se comprueba en el servicio).
const router = Router();

router.get('/deportistas/:id', async (req, res) => res.json(await servicio.perfil(req.alcance, idValido(req.params.id))));
router.put('/deportistas/:id', requierePermiso('alimentacion.gestionar'), async (req, res) =>
  res.json(await servicio.guardarPerfil(req.alcance, req.usuario, idValido(req.params.id), req.body)));

module.exports = router;
