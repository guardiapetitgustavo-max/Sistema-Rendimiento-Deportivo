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

module.exports = router;
