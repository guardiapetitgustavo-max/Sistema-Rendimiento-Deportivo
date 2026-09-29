const { Router } = require('express');
const servicio = require('./admin.service');
const { idValido } = require('../../utils/validar');

// Todas estas rutas exigen rol de administrador (ver routes.js)
const router = Router();

router.get('/resumen', async (req, res) => res.json(await servicio.resumen()));

router.get('/usuarios', async (req, res) => res.json(await servicio.listar()));

router.post('/usuarios', async (req, res) => res.status(201).json(await servicio.crear(req.body)));

router.put('/usuarios/:id', async (req, res) =>
  res.json(await servicio.actualizar(req.usuario, idValido(req.params.id), req.body)));

router.post('/usuarios/:id/password', async (req, res) =>
  res.json(await servicio.restablecerClave(req.usuario, idValido(req.params.id), req.body)));

router.post('/usuarios/:id/transferir', async (req, res) =>
  res.json(await servicio.transferir(idValido(req.params.id), req.body)));

router.delete('/usuarios/:id', async (req, res) => {
  await servicio.eliminar(req.usuario, idValido(req.params.id));
  res.status(204).end();
});

module.exports = router;
