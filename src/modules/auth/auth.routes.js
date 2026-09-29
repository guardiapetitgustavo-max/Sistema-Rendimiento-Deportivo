const { Router } = require('express');
const servicio = require('./auth.service');
const { iniciarSesion, cerrarSesion, leerSesion } = require('../../middlewares/sesion');

const router = Router();

router.post('/registro', async (req, res) => {
  const usuario = await servicio.registrar(req.body);
  iniciarSesion(res, usuario);
  res.status(201).json(usuario);
});

router.post('/login', async (req, res) => {
  const usuario = await servicio.autenticar(req.body, req.ip);
  iniciarSesion(res, usuario);
  res.json(usuario);
});

router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.status(204).end();
});

// Sin sesión responde null (no es un error: simplemente no ha iniciado sesión)
router.get('/sesion', (req, res) => res.json(leerSesion(req)));

module.exports = router;
