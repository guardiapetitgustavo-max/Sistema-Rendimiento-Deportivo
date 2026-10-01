const { Router } = require('express');
const servicio = require('./plataforma.service');
const auditoria = require('../../core/auditoria');
const { idValido } = require('../../utils/validar');

// Solo super administrador (ver routes.js). Cada acción queda en la auditoría de la academia afectada.
const router = Router();

const registrar = (req, accion, academia, detalle) => {
  req.res.locals.auditado = true;
  return auditoria.registrar({
    academia, usuario: req.usuario.id, accion: `plataforma:${accion}`, entidad: 'academias', entidadId: academia, detalle, ip: req.ip,
  });
};

router.get('/resumen', async (req, res) => res.json(await servicio.resumen()));

router.get('/academias', async (req, res) => res.json(await servicio.listar(req.usuario.id)));

router.post('/academias', async (req, res) => {
  const creada = await servicio.crear(req.body);
  await registrar(req, 'crear', creada.id, { nombre: creada.nombre, admin: creada.admin.correo });
  res.status(201).json(creada);
});

router.put('/academias/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const academia = await servicio.actualizar(id, req.body);
  await registrar(req, req.body?.estado ? `estado_${academia.estado}` : 'modificar', id, { nombre: academia.nombre, estado: academia.estado });
  res.json(academia);
});

router.post('/academias/:id/acceso', async (req, res) => {
  const id = idValido(req.params.id);
  await servicio.obtenerAcceso(req.usuario.id, id);
  await registrar(req, 'acceso_super_admin', id, { motivo: 'Acceso explícito del super administrador' });
  res.status(204).end();
});

module.exports = router;
