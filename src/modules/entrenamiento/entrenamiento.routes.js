const { Router } = require('express');
const servicio = require('./entrenamiento.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con entrenamientos.ver. Escritura de sesiones: entrenamientos.gestionar. Asistencia: asistencia.*
const router = Router();
const gestionar = requierePermiso('entrenamientos.gestionar');

router.get('/plantillas', async (req, res) => res.json(await servicio.listarPlantillas(req.alcance)));
router.post('/plantillas', requierePermiso('metodologia.configurar'), async (req, res) => res.status(201).json(await servicio.crearPlantilla(req.alcance, req.body)));

router.get('/sesiones', async (req, res) => res.json(await servicio.listarSesiones(req.alcance, req.query)));
router.get('/sesiones/:id', async (req, res) => res.json(await servicio.obtenerSesion(req.alcance, idValido(req.params.id))));
router.post('/sesiones', gestionar, async (req, res) => res.status(201).json(await servicio.crearSesion(req.alcance, req.usuario, req.body)));
router.put('/sesiones/:id', gestionar, async (req, res) => res.json(await servicio.actualizarSesion(req.alcance, idValido(req.params.id), req.body)));
router.post('/sesiones/:id/cerrar', gestionar, async (req, res) => res.json(await servicio.cerrarSesion(req.alcance, idValido(req.params.id), req.body)));
router.delete('/sesiones/:id', gestionar, async (req, res) => {
  await servicio.eliminarSesion(req.alcance, idValido(req.params.id));
  res.status(204).end();
});

module.exports = router;
