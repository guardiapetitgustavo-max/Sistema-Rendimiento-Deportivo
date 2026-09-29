const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rutas = require('./routes');
const {
  cabecerasSeguridad, proteccionCsrf, idSolicitud, sinCache, limitarPeticiones,
} = require('./middlewares/seguridad');
const { rutaNoEncontrada, manejadorErrores } = require('./middlewares/errores');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // Vercel está detrás de un proxy: IP real del cliente
app.use(idSolicitud);
app.use(cabecerasSeguridad);

app.use('/api', sinCache, limitarPeticiones(), express.json({ limit: '2mb' }), cookieParser(), proteccionCsrf, rutas);
app.use('/api', rutaNoEncontrada);

// Frontend estático (en Vercel lo sirve su CDN; aquí sirve para desarrollo local)
const publico = path.join(__dirname, '..', 'public');
app.use('/vendor', express.static(path.join(publico, 'vendor'), { maxAge: '30d', immutable: true }));
app.use(express.static(publico));

app.use(manejadorErrores);

module.exports = app;
