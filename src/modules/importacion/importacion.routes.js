const { Router } = require('express');
const multer = require('multer');
const servicio = require('./importacion.service');
const { enviarDescarga } = require('../../utils/descarga');
const { solicitudInvalida } = require('../../utils/http-error');

const router = Router();

// En memoria: Vercel no tiene disco persistente. Límite por debajo de los 4.5 MB de Vercel.
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });

router.get('/plantilla', async (req, res) => {
  enviarDescarga(res, await servicio.plantilla(), 'plantilla_evaluaciones.xlsx', 'excel');
});

router.post('/previsualizar', subida.single('archivo'), async (req, res) => {
  if (!req.file) throw solicitudInvalida('Selecciona un archivo Excel (.xlsx)');
  if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) throw solicitudInvalida('El archivo debe tener extensión .xlsx');
  res.json(await servicio.previsualizar(req.file.buffer));
});

router.post('/confirmar', async (req, res) => res.status(201).json(await servicio.importar(req.usuario.id, req.body)));

module.exports = router;
