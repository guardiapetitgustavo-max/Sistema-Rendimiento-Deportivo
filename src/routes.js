const { Router } = require('express');
const { requiereSesion } = require('./middlewares/sesion');
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
  const { rows } = await query("SELECT to_regclass('public.evaluaciones') IS NOT NULL AS lista");
  if (!rows[0].lista) throw new HttpError(500, 'La base de datos está vacía. Ejecuta sql/schema.sql en Supabase.');
  res.json({ estado: 'ok', base_de_datos: 'conectada' });
});
router.use('/auth', require('./modules/auth/auth.routes'));

// Protegidas: todo lo demás exige sesión
router.use(requiereSesion);
router.get('/dashboard', async (req, res) => res.json(await dashboard.obtener(req.usuario.id)));
router.use('/deportistas', require('./modules/deportistas/deportistas.routes'));
router.use('/evaluaciones', rutasCrud(evaluaciones));
router.use('/alimentacion', rutasCrud(alimentacion));
router.use('/importacion', require('./modules/importacion/importacion.routes'));
router.use('/ml', require('./modules/ml/ml.routes'));
router.use('/ia', require('./modules/ia/ia.routes'));
router.use('/reportes', require('./modules/reportes/reportes.routes'));
router.use('/cuenta', require('./modules/cuenta/cuenta.routes'));

module.exports = router;
