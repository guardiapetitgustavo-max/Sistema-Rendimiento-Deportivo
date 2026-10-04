const { Router } = require('express');
const servicio = require('./estructura.service');
const { idValido } = require('../../utils/validar');
const { requierePermiso } = require('../../middlewares/roles');

// Lectura con estructura.ver; escritura con estructura.gestionar (administrador o quien lo tenga delegado)
const router = Router();
const gestionar = requierePermiso('estructura.gestionar');

/** CRUD estándar de un catálogo con permisos de lectura / escritura. */
function catalogo(ruta, cat, { crear } = {}) {
  router.get(`/${ruta}`, async (req, res) => res.json(await cat.listar(req.alcance, req.query)));
  router.get(`/${ruta}/:id`, async (req, res) => res.json(await cat.obtener(req.alcance, idValido(req.params.id))));
  router.post(`/${ruta}`, gestionar, async (req, res) => res.status(201).json(await (crear ? crear(req) : cat.crear(req.alcance, req.body))));
  router.put(`/${ruta}/:id`, gestionar, async (req, res) => res.json(await cat.actualizar(req.alcance, idValido(req.params.id), req.body)));
  router.delete(`/${ruta}/:id`, gestionar, async (req, res) => {
    await cat.darDeBaja(req.alcance, idValido(req.params.id));
    res.status(204).end();
  });
}

router.get('/resumen', async (req, res) => res.json(await servicio.resumen(req.alcance)));
router.get('/plantillas', (req, res) => res.json(servicio.plantillasDisponibles()));
router.post('/deportes/plantilla', gestionar, async (req, res) =>
  res.status(201).json(await servicio.activarPlantilla(req.alcance, String(req.body?.clave || ''), req.usuario)));

// Los equipos de un coach: el coach ve solo los suyos
router.get('/equipos', async (req, res) => res.json(await servicio.listarEquipos(req.alcance, req.query)));
router.get('/equipos/:id/miembros', async (req, res) => res.json(await servicio.miembros(req.alcance, idValido(req.params.id))));
// El coach de un equipo puede gestionar sus miembros; el resto de cambios, quien tenga estructura.gestionar
router.put('/equipos/:id/miembros', async (req, res) =>
  res.json(await servicio.asignarMiembros(req.alcance, idValido(req.params.id), req.body?.deportistas)));

catalogo('sedes', servicio.sedes, { crear: (req) => servicio.crearSede(req.alcance, req.body, req.usuario) });
catalogo('instalaciones', servicio.instalaciones);
catalogo('deportes', servicio.deportes);
catalogo('disciplinas', servicio.disciplinas);
catalogo('posiciones', servicio.posiciones);
catalogo('categorias', servicio.categorias);
catalogo('equipos', servicio.equipos);

module.exports = router;
