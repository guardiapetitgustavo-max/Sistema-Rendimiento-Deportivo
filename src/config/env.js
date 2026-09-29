require('dotenv').config({ quiet: true });

const esProduccion = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const env = {
  esProduccion,
  puerto: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DB_SSL !== 'false',
  jwtSecret: process.env.JWT_SECRET || (esProduccion ? null : 'clave-solo-para-desarrollo-local'),
  sesionHoras: Number(process.env.SESION_HORAS) || 8,
  ia: {
    proveedor: (process.env.IA_PROVIDER || 'local').toLowerCase(),
    openaiKey: (process.env.OPENAI_API_KEY || '').trim(),
    openaiModelo: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

const faltantes = [];
if (!env.databaseUrl) faltantes.push('DATABASE_URL');
if (!env.jwtSecret) faltantes.push('JWT_SECRET');
if (env.esProduccion && env.jwtSecret && env.jwtSecret.length < 32) {
  console.warn('⚠️  JWT_SECRET es corto: usa al menos 32 caracteres aleatorios.');
}
if (faltantes.length) {
  console.error(`⚠️  Faltan variables de entorno: ${faltantes.join(', ')}. Revisa .env.example.`);
}

env.faltantes = faltantes;

module.exports = env;
