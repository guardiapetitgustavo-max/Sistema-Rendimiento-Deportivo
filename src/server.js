// Servidor para desarrollo local: npm run dev
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./db/pool');

const registrar = (tipo) => (error) =>
  console.error(JSON.stringify({ nivel: 'fatal', tipo, mensaje: error?.message, pila: error?.stack }));
process.on('unhandledRejection', registrar('unhandledRejection'));
process.on('uncaughtException', registrar('uncaughtException'));

const servidor = app.listen(env.puerto, () => {
  console.log(`✅ SportEval AI corriendo en http://localhost:${env.puerto}`);
});

// Apagado ordenado: termina las peticiones en curso y cierra las conexiones a la base
function apagar() {
  servidor.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
