const { Router } = require('express');
const { idValido } = require('./validar');

/**
 * Rutas REST estándar para un recurso:
 *   GET /  ·  GET /:id  ·  POST /  ·  PUT /:id  ·  DELETE /:id (baja lógica)
 * El servicio debe exponer listar, obtener, crear, actualizar y darDeBaja. Todos reciben
 * como primer argumento el alcance (req.alcance: id del coach, o null = todos, solo admin)
 * y crear/actualizar reciben además el usuario de la sesión (para permisos de administrador).
 */
function rutasCrud(servicio, router = Router()) {
  router.get('/', async (req, res) => res.json(await servicio.listar(req.alcance, req.query)));

  router.get('/:id', async (req, res) => res.json(await servicio.obtener(req.alcance, idValido(req.params.id))));

  router.post('/', async (req, res) => res.status(201).json(await servicio.crear(req.alcance, req.body, req.usuario)));

  router.put('/:id', async (req, res) =>
    res.json(await servicio.actualizar(req.alcance, idValido(req.params.id), req.body, req.usuario)));

  router.delete('/:id', async (req, res) => {
    await servicio.darDeBaja(req.alcance, idValido(req.params.id));
    res.status(204).end();
  });

  return router;
}

module.exports = { rutasCrud };
