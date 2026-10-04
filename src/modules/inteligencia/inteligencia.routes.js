const { Router } = require('express');
const servicio = require('./inteligencia.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso, requiereModulo } = require('../../middlewares/roles');

// Montado tras la sesión y la academia; cada ruta declara su permiso y su módulo.
const router = Router();

// Alertas
router.get('/alertas', requierePermiso('alertas.ver'), async (req, res) => res.json(await servicio.listarAlertas(req.alcance, req.query)));
router.put('/alertas/:id', requierePermiso('alertas.gestionar'), async (req, res) =>
  res.json(await servicio.cambiarEstadoAlerta(req.alcance, idValido(req.params.id), req.body?.estado)));
router.post('/alertas/evaluar', requiereModulo('ia_alertas'), requierePermiso('alertas.gestionar'), async (req, res) =>
  res.json(await servicio.evaluarAlertas(req.alcance.academia)));

// Análisis
router.post('/analisis/deportistas/:id', requiereModulo('ia_analisis'), requierePermiso('ia.analizar'), async (req, res) =>
  res.status(201).json(await servicio.analizarDeportista(req.alcance, req.usuario, idValido(req.params.id), 'deportista')));
router.post('/analisis/deportistas/:id/360', requiereModulo('ia_360'), requierePermiso('ia.360'), async (req, res) =>
  res.status(201).json(await servicio.analizarDeportista(req.alcance, req.usuario, idValido(req.params.id), '360')));
router.post('/analisis/equipos/:id', requiereModulo('ia_analisis'), requierePermiso('ia.analizar'), async (req, res) =>
  res.status(201).json(await servicio.analizarEquipo(req.alcance, req.usuario, idValido(req.params.id))));
router.get('/analisis', requierePermiso('ia.analizar'), async (req, res) => res.json(await servicio.historialAnalisis(req.alcance, req.query)));
router.get('/analisis/:id', requierePermiso('ia.analizar'), async (req, res) => res.json(await servicio.obtenerAnalisis(req.alcance, idValido(req.params.id))));

// Recomendaciones: las aprueba una persona antes de que las vea el deportista
router.get('/recomendaciones', requierePermiso('ia.analizar'), async (req, res) => res.json(await servicio.listarRecomendaciones(req.alcance, req.query)));
router.put('/recomendaciones/:id', requierePermiso('recomendaciones.aprobar'), async (req, res) =>
  res.json(await servicio.revisarRecomendacion(req.alcance, req.usuario, idValido(req.params.id), req.body)));

// Asistente
router.post('/preguntar', requiereModulo('ia'), requierePermiso('ia.usar'), async (req, res) =>
  res.json(await servicio.preguntar(req.alcance, req.usuario, req.body?.pregunta)));

module.exports = router;
