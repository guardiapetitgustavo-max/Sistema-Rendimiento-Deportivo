const { Router } = require('express');
const { idValido } = require('./validar');

/**
 * Rutas REST estándar para un recurso del coach autenticado:
 *   GET /  ·  GET /:id  ·  POST /  ·  PUT /:id  ·  DELETE /:id (baja lógica)
 * El servicio debe exponer listar, obtener, crear, actualizar y darDeBaja,
 * todos recibiendo el id del coach como primer argumento.
 */
function rutasCrud(servicio, router = Router()) {
  router.get('/', async (req, res) => res.json(await servicio.listar(req.usuario.id, req.query)));

  router.get('/:id', async (req, res) => res.json(await servicio.obtener(req.usuario.id, idValido(req.params.id))));

  router.post('/', async (req, res) => res.status(201).json(await servicio.crear(req.usuario.id, req.body)));

  router.put('/:id', async (req, res) =>
    res.json(await servicio.actualizar(req.usuario.id, idValido(req.params.id), req.body)));

  router.delete('/:id', async (req, res) => {
    await servicio.darDeBaja(req.usuario.id, idValido(req.params.id));
    res.status(204).end();
  });

  return router;
}

module.exports = { rutasCrud };
