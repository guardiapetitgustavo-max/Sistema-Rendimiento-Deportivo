const { Router } = require('express');
const servicio = require('./comercial.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con el módulo "comercial" y comercial.ver; escribir exige comercial.gestionar
const router = Router();
const gestionar = requierePermiso('comercial.gestionar');

router.get('/matriculas', async (req, res) => res.json(await servicio.listarMatriculas(req.alcance, req.query)));
router.post('/matriculas', gestionar, async (req, res) => res.status(201).json(await servicio.guardarMatricula(req.alcance, req.body)));
router.put('/matriculas/:id', gestionar, async (req, res) => res.json(await servicio.guardarMatricula(req.alcance, req.body, idValido(req.params.id))));

router.get('/pagos', async (req, res) => res.json(await servicio.listarPagos(req.alcance, req.query)));
router.get('/pagos/resumen', async (req, res) => res.json(await servicio.resumenPagos(req.alcance)));
router.post('/pagos', gestionar, async (req, res) => res.status(201).json(await servicio.guardarPago(req.alcance, req.usuario, req.body)));
router.put('/pagos/:id', gestionar, async (req, res) => res.json(await servicio.guardarPago(req.alcance, req.usuario, req.body, idValido(req.params.id))));
router.post('/cuotas', gestionar, async (req, res) => res.json(await servicio.generarCuotas(req.alcance, req.usuario, req.body)));

module.exports = router;
