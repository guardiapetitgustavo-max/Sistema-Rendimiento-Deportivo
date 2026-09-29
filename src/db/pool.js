const { Pool, types } = require('pg');
const env = require('../config/env');
const { HttpError } = require('../utils/http-error');

// DATE se devuelve como texto 'AAAA-MM-DD' para evitar desfases de zona horaria
types.setTypeParser(types.builtins.DATE, (valor) => valor);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  max: 3, // Vercel es serverless: pocas conexiones por instancia (usar el pooler de Supabase)
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000, // no quedarse colgado si la base no responde
  query_timeout: 25000, // ninguna consulta puede bloquear la función más de 25 s
});

// Un cliente inactivo que pierde la conexión no debe tumbar el proceso
pool.on('error', (error) => console.error(JSON.stringify({ nivel: 'error', origen: 'pool', mensaje: error.message })));

/** Errores al CONECTAR (la consulta nunca llegó a ejecutarse): es seguro reintentar. */
const CODIGOS_CONEXION = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P03', '53300', '08001', '08006']);
const esErrorDeConexion = (error) =>
  CODIGOS_CONEXION.has(error.code) || /timeout exceeded when trying to connect|Connection terminated/i.test(error.message);

const esperar = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Obtiene un cliente del pool con hasta 3 intentos y espera progresiva. */
async function conectar() {
  for (let intento = 1; ; intento += 1) {
    try {
      return await pool.connect();
    } catch (error) {
      if (['28P01', '28000', '3D000'].includes(error.code)) {
        console.error(JSON.stringify({ nivel: 'error', origen: 'pool', codigo: error.code, mensaje: error.message }));
        throw new HttpError(500, 'No se pudo entrar a la base de datos: revisa la variable DATABASE_URL (usuario, contraseña y nombre).');
      }
      if (!esErrorDeConexion(error) || intento >= 3) {
        console.error(JSON.stringify({ nivel: 'error', origen: 'pool', codigo: error.code, mensaje: error.message }));
        throw new HttpError(503, 'La base de datos no está disponible en este momento. Inténtalo de nuevo en unos segundos.');
      }
      await esperar(300 * intento);
    }
  }
}

/** Ejecuta una consulta. Solo se reintenta la conexión, nunca la consulta (evita duplicados). */
async function query(sql, params) {
  const cliente = await conectar();
  try {
    return await cliente.query(sql, params);
  } finally {
    cliente.release();
  }
}

/** Ejecuta `fn(cliente)` dentro de una transacción: o se guarda todo, o nada. */
async function transaccion(fn) {
  const cliente = await conectar();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, query, transaccion };
