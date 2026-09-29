const { Router } = require('express');
const servicio = require('./auth.service');
const { iniciarSesion, cerrarSesion, leerSesion } = require('../../middlewares/sesion');

const router = Router();

// No hay registro público: las cuentas de los coaches las crea el administrador.

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
router.get('/sesion', async (req, res) => {
  const usuario = await leerSesion(req);
  res.json(usuario ? servicio.publico(usuario) : null);
});

module.exports = router;
