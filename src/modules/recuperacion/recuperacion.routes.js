const { Router } = require('express');
const servicio = require('./recuperacion.service');
const { requierePermiso } = require('../../middlewares/roles');
const { trasRegistrar } = require('../inteligencia/motor-alertas');

// Montado con recuperacion.ver; registrar exige recuperacion.registrar
const router = Router();

router.get('/', async (req, res) => res.json(await servicio.listar(req.alcance, req.query)));
router.post('/', requierePermiso('recuperacion.registrar'), async (req, res) => {
  const r = await servicio.registrarStaff(req.alcance, req.usuario, req.body);
  await trasRegistrar(req.usuario, [r.deportista_id]);
  res.json(r);
});

module.exports = router;
