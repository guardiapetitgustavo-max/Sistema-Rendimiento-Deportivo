const { Router } = require('express');
const servicio = require('./cuenta.service');
const { iniciarSesion } = require('../../middlewares/sesion');
const { enviarDescarga } = require('../../utils/descarga');
const { hoyISO } = require('../../utils/valores');

const router = Router();

router.put('/perfil', async (req, res) => {
  const usuario = await servicio.actualizarPerfil(req.usuario.id, req.body);
  iniciarSesion(res, usuario); // renueva la sesión con el nombre actualizado
  res.json(usuario);
});

router.put('/password', async (req, res) => {
  await servicio.cambiarPassword(req.usuario.id, req.body);
  res.status(204).end();
});

router.get('/respaldo', async (req, res) => {
  const datos = await servicio.respaldo(req.usuario);
  enviarDescarga(res, Buffer.from(JSON.stringify(datos, null, 2)), `respaldo_sporteval_${hoyISO()}.json`, 'json');
});

router.post('/reiniciar', async (req, res) => res.json(await servicio.reiniciar(req.usuario.id, req.body?.confirmacion)));

module.exports = router;
