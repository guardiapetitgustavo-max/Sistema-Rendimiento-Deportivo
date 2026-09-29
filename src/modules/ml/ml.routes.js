const { Router } = require('express');
const servicio = require('./ml.service');

const router = Router();

router.get('/', async (req, res) => res.json(await servicio.estado(req.usuario.id)));

router.post('/entrenar', async (req, res) => {
  const usarDemo = req.body?.usar_demo === true;
  res.json(await servicio.entrenar(req.usuario.id, { usarDemo }));
});

router.post('/predecir', async (req, res) => res.json(await servicio.predecirTodos(req.usuario.id)));

module.exports = router;
