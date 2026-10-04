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

// Planes, suscripciones y cobros
router.get('/planes', async (req, res) => res.json(await servicio.listarPlanes()));
router.post('/planes', async (req, res) => {
  req.res.locals.auditado = true;
  const plan = await servicio.guardarPlan(req.body);
  await auditoria.registrar({ usuario: req.usuario.id, accion: 'plataforma:plan', entidad: 'planes', entidadId: plan.id, detalle: { clave: plan.clave }, ip: req.ip });
  res.json(plan);
});
router.get('/academias/:id/suscripcion', async (req, res) => res.json(await servicio.historialSuscripciones(idValido(req.params.id))));
router.post('/academias/:id/suscripcion', async (req, res) => {
  const id = idValido(req.params.id);
  const s = await servicio.cambiarSuscripcion(id, req.body);
  await registrar(req, 'suscripcion', id, { plan: req.body?.plan, estado: s.estado });
  res.status(201).json(s);
});
router.get('/pagos', async (req, res) => res.json(await servicio.pagosPlataforma()));
router.post('/academias/:id/pagos', async (req, res) => {
  const id = idValido(req.params.id);
  const p = await servicio.registrarPagoPlataforma(req.usuario.id, id, req.body);
  await registrar(req, 'pago', id, { monto: p.monto, moneda: p.moneda });
  res.status(201).json(p);
});

// Academia de demostración ("Sport Academy Demo") con datos realistas para probar todo el sistema
router.post('/demo', async (req, res) => {
  const { crearDemo } = require('../../demo/demo');
  const r = await crearDemo({ superAdminId: req.usuario.id });
  await registrar(req, 'demo', r.academia_id, { deportistas: r.deportistas });
  res.status(201).json(r);
});

module.exports = router;
