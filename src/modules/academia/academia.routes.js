const { Router } = require('express');
const servicio = require('./academia.service');
const { requierePermiso } = require('../../middlewares/roles');
const auditoria = require('../../core/auditoria');

// Siempre sobre la academia activa del usuario
const router = Router();
const academia = (req) => req.usuario.academia.id;

// Cualquier miembro ve los datos públicos de su academia y su logo (branding)
router.get('/', async (req, res) => res.json(await servicio.obtener(academia(req))));

router.get('/logo', async (req, res) => {
  const { tipo, contenido } = await servicio.logo(academia(req));
  res.set('Cache-Control', 'private, max-age=300').type(tipo).send(contenido);
});

router.put('/', requierePermiso('academia.configurar'), async (req, res) => {
  const { academia: datos, cambios } = await servicio.actualizar(academia(req), req.body);
  res.locals.auditado = true;
  if (cambios.length) {
    await auditoria.registrar({
      academia: academia(req), usuario: req.usuario.id, accion: 'configurar', entidad: 'academia', entidadId: academia(req), detalle: { cambios }, ip: req.ip,
    });
  }
  res.json(datos);
});

router.get('/permisos', requierePermiso('permisos.configurar'), async (req, res) => res.json(await servicio.obtenerPermisos(academia(req))));

router.put('/permisos', requierePermiso('permisos.configurar'), async (req, res) => {
  const cambios = req.body?.cambios;
  const resultado = await servicio.guardarPermisos(academia(req), cambios);
  res.locals.auditado = true;
  await auditoria.registrar({
    academia: academia(req), usuario: req.usuario.id, accion: 'configurar_permisos', entidad: 'rol_permisos', detalle: { cambios }, ip: req.ip,
  });
  res.json(resultado);
});

router.get('/auditoria', requierePermiso('auditoria.ver'), async (req, res) => res.json(await servicio.auditoria(academia(req), req.query)));

module.exports = router;
