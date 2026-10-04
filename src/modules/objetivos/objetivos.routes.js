const { Router } = require('express');
const servicio = require('./objetivos.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con objetivos.ver; crear/modificar exige objetivos.gestionar
const router = Router();
const gestionar = requierePermiso('objetivos.gestionar');

router.get('/', async (req, res) => res.json(await servicio.listar(req.alcance, req.query)));
router.get('/:id', async (req, res) => res.json(await servicio.obtener(req.alcance, idValido(req.params.id))));
router.post('/', gestionar, async (req, res) => res.status(201).json(await servicio.crear(req.alcance, req.usuario, req.body)));
router.put('/:id', gestionar, async (req, res) => res.json(await servicio.actualizar(req.alcance, idValido(req.params.id), req.body)));

module.exports = router;
