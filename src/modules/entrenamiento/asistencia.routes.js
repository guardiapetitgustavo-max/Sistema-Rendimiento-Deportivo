const { Router } = require('express');
const servicio = require('./entrenamiento.service');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con asistencia.ver; registrar exige asistencia.gestionar
const router = Router();

router.get('/', async (req, res) => res.json(await servicio.filasAsistencia(req.alcance, req.query)));
router.get('/estadisticas', async (req, res) => res.json(await servicio.estadisticas(req.alcance, req.query)));
router.post('/', requierePermiso('asistencia.gestionar'), async (req, res) => res.json(await servicio.registrarAsistencia(req.alcance, req.usuario, req.body)));

module.exports = router;
