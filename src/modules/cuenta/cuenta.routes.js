const { Router } = require('express');
const servicio = require('./cuenta.service');
const {
  requiereAcademia, definirAlcance, requiereAdmin, requierePermiso, coachDeTrabajo,
} = require('../../middlewares/roles');
const { enviarDescarga } = require('../../utils/descarga');
const { hoyISO } = require('../../utils/valores');

const router = Router();

router.put('/perfil', async (req, res) => res.json(await servicio.actualizarPerfil(req.usuario.id, req.body)));

router.put('/password', async (req, res) => {
  await servicio.cambiarPassword(req.usuario.id, req.body);
  res.status(204).end();
});

// Datos personales y contraseña: cualquier usuario. Respaldo y reinicio: dentro de su academia.
router.get('/respaldo', requiereAcademia, definirAlcance, requierePermiso('respaldo.descargar'), async (req, res) => {
  const datos = await servicio.respaldo(req.alcance, req.usuario);
  enviarDescarga(res, Buffer.from(JSON.stringify(datos, null, 2)), `respaldo_sporteval_${hoyISO()}.json`, 'json');
});

// Borrado definitivo: solo el administrador, y sobre un coach concreto
router.post('/reiniciar', requiereAcademia, definirAlcance, requiereAdmin, async (req, res) =>
  res.json(await servicio.reiniciar({ academia: req.alcance.academia, coach: coachDeTrabajo(req, 'reiniciar datos') }, req.body?.confirmacion)));

module.exports = router;
