const { Router } = require('express');
const servicio = require('./auth.service');
const {
  iniciarSesion, cerrarSesion, leerSesion, cargarContexto, requiereSesion,
} = require('../../middlewares/sesion');
const auditoria = require('../../core/auditoria');
const { idValido } = require('../../utils/validar');
const { HttpError } = require('../../utils/http-error');

const router = Router();

// No hay registro público: las cuentas las crea el administrador de cada academia
// (y las academias, el super administrador de la plataforma).

router.post('/login', async (req, res) => {
  const usuario = await servicio.autenticar(req.body, req.ip);
  const contexto = await cargarContexto(usuario.id);
  // Sin academia activa (y sin ser super admin) no hay nada que hacer dentro de la plataforma
  if (!contexto.academia && !contexto.es_super_admin) {
    throw new HttpError(403, contexto.academia_suspendida
      ? 'Tu academia está suspendida. Contacta con el responsable de la plataforma.'
      : 'Tu cuenta está desactivada o no pertenece a ninguna academia. Contacta a tu administrador.');
  }
  iniciarSesion(res, usuario, contexto.academia?.id);
  await auditoria.registrar({
    academia: contexto.academia?.id ?? null, usuario: usuario.id, accion: 'login', entidad: 'usuarios', entidadId: usuario.id, ip: req.ip,
  });
  res.json(await servicio.datosSesion(contexto));
});

router.post('/logout', async (req, res) => {
  const usuario = await leerSesion(req).catch(() => null);
  if (usuario) {
    await auditoria.registrar({ academia: usuario.academia?.id ?? null, usuario: usuario.id, accion: 'logout', entidad: 'usuarios', entidadId: usuario.id, ip: req.ip });
  }
  cerrarSesion(res);
  res.status(204).end();
});

// Sin sesión responde null (no es un error: simplemente no ha iniciado sesión)
router.get('/sesion', async (req, res) => {
  const usuario = await leerSesion(req);
  res.json(usuario ? await servicio.datosSesion(usuario) : null);
});

// Cambiar la academia activa (para quien pertenece a varias)
router.post('/academia', requiereSesion, async (req, res) => {
  const academiaId = idValido(req.body?.academia_id);
  await servicio.puedeEntrar(req.usuario.id, academiaId);
  iniciarSesion(res, req.usuario, academiaId);
  await auditoria.registrar({ academia: academiaId, usuario: req.usuario.id, accion: 'cambio_academia', entidad: 'academias', entidadId: academiaId, ip: req.ip });
  res.json(await servicio.datosSesion(await cargarContexto(req.usuario.id, academiaId)));
});

module.exports = router;
