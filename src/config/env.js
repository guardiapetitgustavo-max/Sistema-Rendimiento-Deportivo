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
  // Almacenamiento de videos: Supabase Storage (producción) o una carpeta local (solo desarrollo y pruebas)
  almacenamiento: {
    supabaseUrl: (process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    supabaseClave: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    bucket: (process.env.SUPABASE_BUCKET || 'videos').trim(),
    carpetaLocal: esProduccion ? '' : (process.env.ALMACENAMIENTO_LOCAL || '').trim(),
    maxMb: Number(process.env.VIDEO_MAX_MB) || 200,
  },
  // Tareas programadas (Vercel Cron envía "Authorization: Bearer CRON_SECRET")
  cronSecret: (process.env.CRON_SECRET || '').trim(),
};
env.almacenamiento.proveedor = env.almacenamiento.supabaseUrl && env.almacenamiento.supabaseClave
  ? 'supabase' : (env.almacenamiento.carpetaLocal ? 'local' : null);
env.almacenamiento.configurado = Boolean(env.almacenamiento.proveedor);

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
