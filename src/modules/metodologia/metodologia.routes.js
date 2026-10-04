const { Router } = require('express');
const servicio = require('./metodologia.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');
const { TIPOS_RESULTADO, DIRECCIONES, MODOS } = require('../../domain/medicion');

// Lectura con metodologia.ver; cambios con metodologia.configurar (el coach no cambia la metodología salvo permiso)
const router = Router();
const configurar = requierePermiso('metodologia.configurar');

router.get('/catalogos', (req, res) => res.json({
  tipos_resultado: TIPOS_RESULTADO, direcciones: DIRECCIONES, modos: MODOS, capacidades: servicio.CAPACIDADES,
}));

for (const [ruta, cat] of [['metricas', servicio.metricas], ['pruebas', servicio.pruebas]]) {
  router.get(`/${ruta}`, async (req, res) => {
    if (ruta === 'pruebas' && req.query.deporte_id) {
      return res.json(await servicio.pruebasDeDeporte(req.alcance, Number(req.query.deporte_id)));
    }
    return res.json(await cat.listar(req.alcance, req.query));
  });
  router.get(`/${ruta}/:id`, async (req, res) => res.json(await cat.obtener(req.alcance, idValido(req.params.id))));
  router.post(`/${ruta}`, configurar, async (req, res) => res.status(201).json(await cat.crear(req.alcance, req.body)));
  router.put(`/${ruta}/:id`, configurar, async (req, res) => res.json(await cat.actualizar(req.alcance, idValido(req.params.id), req.body)));
  router.delete(`/${ruta}/:id`, configurar, async (req, res) => {
    await cat.darDeBaja(req.alcance, idValido(req.params.id));
    res.status(204).end();
  });
}

router.get('/plantillas', async (req, res) => res.json(await servicio.listarPlantillas(req.alcance, { historial: req.query.historial === 'true' })));
router.post('/plantillas', configurar, async (req, res) => res.status(201).json(await servicio.crearPlantilla(req.alcance, req.body, req.usuario)));
router.put('/plantillas/:id', configurar, async (req, res) =>
  res.json(await servicio.nuevaVersionPlantilla(req.alcance, idValido(req.params.id), req.body, req.usuario)));
router.delete('/plantillas/:id', configurar, async (req, res) => {
  await servicio.retirarPlantilla(req.alcance, idValido(req.params.id));
  res.status(204).end();
});

router.get('/scoring', async (req, res) => res.json(await servicio.listarScoring(req.alcance, { historial: req.query.historial === 'true' })));
router.post('/scoring', configurar, async (req, res) => res.status(201).json(await servicio.crearScoring(req.alcance, req.body, req.usuario)));
router.put('/scoring/:id', configurar, async (req, res) =>
  res.json(await servicio.nuevaVersionScoring(req.alcance, idValido(req.params.id), req.body, req.usuario)));

router.get('/reglas', async (req, res) => res.json(await servicio.listarReglas(req.alcance)));
router.put('/reglas/:tipo', configurar, async (req, res) => res.json(await servicio.guardarRegla(req.alcance, req.params.tipo, req.body)));

module.exports = router;
