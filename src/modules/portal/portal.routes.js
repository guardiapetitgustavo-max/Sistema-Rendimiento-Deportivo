const { Router } = require('express');
const servicio = require('./portal.service');
const { idValido } = require('../../utils/validar');

// Exige el permiso portal.ver (deportista y padre, ver routes.js). Solo lectura.
const router = Router();

router.get('/deportistas', async (req, res) => res.json(await servicio.listar(req.usuario)));

router.get('/deportistas/:id', async (req, res) => res.json(await servicio.perfil(req.usuario, idValido(req.params.id))));

module.exports = router;
