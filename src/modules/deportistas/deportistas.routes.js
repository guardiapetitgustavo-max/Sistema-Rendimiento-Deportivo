const { rutasCrud } = require('../../utils/rutas-crud');
const { idValido } = require('../../utils/validar');
const { enviarDescarga } = require('../../utils/descarga');
const servicio = require('./deportistas.service');
const { obtenerPerfil } = require('./perfil.service');
const { generarRutina } = require('../rutinas/rutinas.service');
const { rutinaAPdf } = require('../reportes/exportar');

const router = rutasCrud(servicio);

router.get('/:id/perfil', async (req, res) => res.json(await obtenerPerfil(req.usuario.id, idValido(req.params.id))));

router.get('/:id/rutina', async (req, res) => {
  const dep = await servicio.cargarDeportista(req.usuario.id, idValido(req.params.id));
  res.json(generarRutina(dep));
});

router.get('/:id/rutina/pdf', async (req, res) => {
  const dep = await servicio.cargarDeportista(req.usuario.id, idValido(req.params.id));
  enviarDescarga(res, await rutinaAPdf(generarRutina(dep)), `rutina_${dep.codigo}.pdf`, 'pdf');
});

module.exports = router;
