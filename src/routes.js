/**
 * Mapa de la API. Cada grupo declara aquí, de forma visible, lo que exige:
 * sesión → academia activa → módulo activado → permiso del rol.
 */
const { Router } = require('express');
const { requiereSesion } = require('./middlewares/sesion');
const {
  requiereAcademia, definirAlcance, requierePermiso: permiso, permisoSegunMetodo: leerOGestionar,
  requiereModulo: modulo, requiereSuperAdmin,
} = require('./middlewares/roles');
const { auditarEscrituras } = require('./core/auditoria');
const { rutasCrud } = require('./utils/rutas-crud');
const { query } = require('./db/pool');
const env = require('./config/env');
const { HttpError } = require('./utils/http-error');
const dashboard = require('./modules/dashboard/dashboard.service');
const evaluaciones = require('./modules/evaluaciones/evaluaciones.service');
const alimentacion = require('./modules/alimentacion/alimentacion.service');

const router = Router();

// Públicas
router.get('/salud', async (req, res) => {
  if (env.faltantes.length) throw new HttpError(500, `Faltan variables de entorno: ${env.faltantes.join(', ')}`);
  const { rows } = await query("SELECT to_regclass('public.membresias') IS NOT NULL AS lista");
  if (!rows[0].lista) throw new HttpError(500, 'La base de datos no está actualizada. Ejecuta sql/schema.sql en Supabase.');
  res.json({ estado: 'ok', base_de_datos: 'conectada' });
});
router.use('/auth', require('./modules/auth/auth.routes'));

// Dispositivos externos: autenticados con su propia clave de API (no usan la sesión ni cookies)
router.use('/integraciones/api', require('./modules/integraciones/integraciones.routes').publica);

// Tareas programadas (Vercel Cron): exigen "Authorization: Bearer CRON_SECRET"
router.get('/tareas/diarias', async (req, res) => {
  if (!env.cronSecret || req.get('authorization') !== `Bearer ${env.cronSecret}`) throw new HttpError(401, 'No autorizado');
  res.json(await require('./modules/tareas/tareas.service').diarias());
});

// Todo lo demás exige sesión, y toda escritura queda auditada
router.use(requiereSesion, auditarEscrituras);
router.use('/cuenta', require('./modules/cuenta/cuenta.routes'));
router.use('/plataforma', requiereSuperAdmin, require('./modules/plataforma/plataforma.routes'));

// Dentro de la academia activa: req.alcance = { academia, coach }
router.use(requiereAcademia, definirAlcance);
router.use('/academia', require('./modules/academia/academia.routes'));
router.use('/admin', permiso('usuarios.gestionar'), require('./modules/admin/admin.routes'));
router.use('/portal', permiso('portal.ver'), require('./modules/portal/portal.routes'));

router.get('/dashboard', permiso('dashboard.ver'), async (req, res) => res.json(await dashboard.obtener(req.alcance)));
router.use('/deportistas', leerOGestionar('deportistas.ver', 'deportistas.gestionar'), require('./modules/deportistas/deportistas.routes'));
router.use('/evaluaciones', leerOGestionar('evaluaciones.ver', 'evaluaciones.gestionar'), rutasCrud(evaluaciones));
router.use('/alimentacion', modulo('nutricion'), leerOGestionar('alimentacion.ver', 'alimentacion.gestionar'), rutasCrud(alimentacion));
router.use('/importacion', permiso('importacion.usar'), require('./modules/importacion/importacion.routes'));
router.use('/ml', modulo('ml'), permiso('ml.usar'), require('./modules/ml/ml.routes'));
router.use('/ia', modulo('ia'), permiso('ia.usar'), require('./modules/ia/ia.routes'));
router.use('/reportes', permiso('reportes.ver'), require('./modules/reportes/reportes.routes'));

// Fases 2-10
const comercial = require('./modules/comercial/comercial.service');
const inteligencia = require('./modules/inteligencia/inteligencia.service');

router.use('/estructura', permiso('estructura.ver'), require('./modules/estructura/estructura.routes'));
router.use('/metodologia', permiso('metodologia.ver'), require('./modules/metodologia/metodologia.routes'));
router.use('/medicion', permiso('resultados.ver'), require('./modules/medicion/medicion.routes'));
router.use('/entrenamientos', permiso('entrenamientos.ver'), require('./modules/entrenamiento/entrenamiento.routes'));
router.use('/asistencia', permiso('asistencia.ver'), require('./modules/entrenamiento/asistencia.routes'));
router.use('/recuperacion', permiso('recuperacion.ver'), require('./modules/recuperacion/recuperacion.routes'));
router.use('/objetivos', permiso('objetivos.ver'), require('./modules/objetivos/objetivos.routes'));
router.use('/rendimiento', permiso('rendimiento.ver'), require('./modules/rendimiento/rendimiento.routes'));
router.use('/inteligencia', require('./modules/inteligencia/inteligencia.routes'));
router.use('/videos', modulo('video'), permiso('videos.ver'), require('./modules/video/video.routes'));
router.use('/nutricion', modulo('nutricion'), permiso('alimentacion.ver'), require('./modules/nutricion/nutricion.routes'));
router.use('/comercial', modulo('comercial'), permiso('comercial.ver'), require('./modules/comercial/comercial.routes'));
router.use('/integraciones', modulo('integraciones'), permiso('integraciones.gestionar'), require('./modules/integraciones/integraciones.routes').gestion);

// Comunicados: los ve cada rol según su destino; publicar exige comunicados.publicar
router.get('/comunicados', permiso('comunicados.ver'), async (req, res) =>
  res.json(await comercial.listarComunicados(req.usuario, { todos: req.usuario.permisos.includes('comunicados.publicar') })));
router.post('/comunicados', permiso('comunicados.publicar'), async (req, res) =>
  res.status(201).json(await comercial.publicarComunicado(req.alcance, req.usuario, req.body)));
router.delete('/comunicados/:id', permiso('comunicados.publicar'), async (req, res) => {
  await comercial.retirarComunicado(req.alcance, Number(req.params.id));
  res.status(204).end();
});

// Notificaciones personales (cualquier usuario de la academia)
router.get('/notificaciones', async (req, res) => res.json(await inteligencia.notificaciones(req.usuario)));
router.post('/notificaciones/leidas', async (req, res) => {
  await inteligencia.marcarLeidas(req.usuario, req.body?.ids);
  res.status(204).end();
});

module.exports = router;
