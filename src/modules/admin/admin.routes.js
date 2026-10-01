const { Router } = require('express');
const servicio = require('./admin.service');
const { idValido } = require('../../utils/validar');

// Usuarios de la academia activa. Exige el permiso usuarios.gestionar (solo administrador, ver routes.js)
const router = Router();
const academia = (req) => req.usuario.academia.id;

router.get('/resumen', async (req, res) => res.json(await servicio.resumen(academia(req))));

router.get('/usuarios', async (req, res) => res.json(await servicio.listar(academia(req))));

router.post('/usuarios', async (req, res) => res.status(201).json(await servicio.crear(academia(req), req.body)));

router.put('/usuarios/:id', async (req, res) =>
  res.json(await servicio.actualizar(req.usuario, academia(req), idValido(req.params.id), req.body)));

router.post('/usuarios/:id/password', async (req, res) =>
  res.json(await servicio.restablecerClave(req.usuario, academia(req), idValido(req.params.id), req.body)));

router.post('/usuarios/:id/transferir', async (req, res) =>
  res.json(await servicio.transferir(academia(req), idValido(req.params.id), req.body)));

router.delete('/usuarios/:id', async (req, res) => {
  await servicio.eliminar(req.usuario, academia(req), idValido(req.params.id));
  res.status(204).end();
});

module.exports = router;
