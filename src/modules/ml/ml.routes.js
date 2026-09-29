const { Router } = require('express');
const servicio = require('./ml.service');
const { claveModelo } = require('../../middlewares/roles');

const router = Router();

router.get('/', async (req, res) => res.json(await servicio.estado(req.alcance, { clave: claveModelo(req) })));

router.post('/entrenar', async (req, res) => {
  const usarDemo = req.body?.usar_demo === true;
  res.json(await servicio.entrenar(req.alcance, { usarDemo, clave: claveModelo(req) }));
});

router.post('/predecir', async (req, res) => res.json(await servicio.predecirTodos(req.alcance, { clave: claveModelo(req) })));

module.exports = router;
