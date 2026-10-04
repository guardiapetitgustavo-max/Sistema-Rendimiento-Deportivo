const express = require('express');
const servicio = require('./video.service');
const env = require('../../config/env');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Montado con el módulo "video" y videos.ver; subir/editar exige videos.subir
const router = express.Router();
const subir = requierePermiso('videos.subir');

router.get('/estado', async (req, res) => res.json({
  almacenamiento: env.almacenamiento.proveedor, max_mb: env.almacenamiento.maxMb,
  analisis_automatico: Boolean(req.usuario.academia.modulos.video_ia), worker: await servicio.estadoWorker(),
}));
router.get('/', async (req, res) => res.json(await servicio.listar(req.alcance, req.query)));
router.get('/comparar', async (req, res) =>
  res.json(await servicio.comparar(req.alcance, req.usuario, idValido(req.query.a), idValido(req.query.b))));
router.get('/:id', async (req, res) => res.json(await servicio.cargar(req.alcance, idValido(req.params.id))));
router.get('/:id/url', async (req, res) => res.json(await servicio.reproducir(req.alcance, req.usuario, idValido(req.params.id))));
router.post('/', subir, async (req, res) => res.status(201).json(await servicio.crear(req.alcance, req.usuario, req.body)));
router.post('/:id/confirmar', subir, async (req, res) => res.json(await servicio.confirmar(req.alcance, req.usuario, idValido(req.params.id))));
router.post('/:id/observaciones', subir, async (req, res) =>
  res.status(201).json(await servicio.observar(req.alcance, req.usuario, idValido(req.params.id), req.body?.observaciones)));
router.put('/:id', subir, async (req, res) => res.json(await servicio.actualizar(req.alcance, idValido(req.params.id), req.body)));
router.delete('/:id', subir, async (req, res) => {
  await servicio.eliminar(req.alcance, idValido(req.params.id));
  res.status(204).end();
});

// Solo almacenamiento local (desarrollo/pruebas): subir y servir el archivo a través de la API
router.put('/:id/archivo', subir, express.raw({ type: () => true, limit: `${env.almacenamiento.maxMb}mb` }), async (req, res) => {
  await servicio.subirLocal(req.alcance, idValido(req.params.id), req.body);
  res.status(204).end();
});
router.get('/:id/archivo', async (req, res) => {
  const { ruta, mime } = await servicio.archivoLocal(req.alcance, idValido(req.params.id));
  res.type(mime).sendFile(ruta);
});

module.exports = router;
