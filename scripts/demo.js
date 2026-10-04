/**
 * Crea (o recrea) la academia de demostración "Sport Academy Demo".
 * Uso: node scripts/demo.js   (usa DATABASE_URL del .env; ejecuta antes sql/schema.sql)
 */
require('dotenv').config();
const { crearDemo } = require('../src/demo/demo');
const { pool } = require('../src/db/pool');

crearDemo({ reiniciar: true })
  .then((r) => {
    console.log('Academia demo creada:', JSON.stringify(r, null, 2));
  })
  .catch((error) => {
    console.error('No se pudo crear la demo:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
