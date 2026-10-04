/**
 * Almacenamiento de archivos (videos) con dos adaptadores:
 * - supabase: Supabase Storage con URLs FIRMADAS y de corta duración (el bucket debe ser PRIVADO).
 *   El navegador sube el archivo directamente a Supabase (Vercel no admite cuerpos grandes).
 * - local: carpeta del servidor, solo para desarrollo y pruebas (nunca en producción).
 * Las rutas siempre empiezan por academias/{id}/ para aislar a cada academia.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');
const { HttpError } = require('../utils/http-error');

const cfg = () => env.almacenamiento;
const MIME_VIDEO = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };

function exigirConfigurado() {
  if (!cfg().configurado) throw new HttpError(503, 'El almacenamiento de videos no está configurado (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).');
}

function nuevaRuta(academia, mime) {
  const ext = MIME_VIDEO[mime];
  if (!ext) throw new HttpError(400, 'Formato de video no admitido (usa MP4, MOV, WEBM o M4V)');
  return `academias/${academia}/videos/${crypto.randomUUID()}.${ext}`;
}

const rutaSegura = (ruta) => {
  if (!/^academias\/\d+\/videos\/[0-9a-f-]{36}\.(mp4|mov|webm|m4v)$/.test(ruta)) throw new HttpError(400, 'Ruta de archivo no válida');
  return ruta;
};

async function supabase(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${cfg().supabaseUrl}/storage/v1${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${cfg().supabaseClave}`, apikey: cfg().supabaseClave, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => '');
    throw new HttpError(502, `El almacenamiento respondió ${respuesta.status}. ${texto.slice(0, 120)}`);
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

/** URL para que el navegador suba el archivo (PUT). */
async function urlSubida(ruta) {
  exigirConfigurado();
  rutaSegura(ruta);
  if (cfg().proveedor === 'supabase') {
    const r = await supabase('POST', `/object/upload/sign/${cfg().bucket}/${ruta}`);
    return { metodo: 'PUT', url: `${cfg().supabaseUrl}/storage/v1${r.url}`, cabeceras: { 'x-upsert': 'false' } };
  }
  return { metodo: 'PUT', url: null, local: true }; // la interfaz sube a /api/videos/:id/archivo
}

/** URL temporal (10 min) para reproducir el archivo. */
async function urlLectura(ruta, segundos = 600) {
  exigirConfigurado();
  rutaSegura(ruta);
  if (cfg().proveedor === 'supabase') {
    const r = await supabase('POST', `/object/sign/${cfg().bucket}/${ruta}`, { expiresIn: segundos });
    return `${cfg().supabaseUrl}/storage/v1${r.signedURL}`;
  }
  return null; // local: se sirve por /api/videos/:id/archivo (con sesión y permiso)
}

async function existe(ruta) {
  rutaSegura(ruta);
  if (cfg().proveedor === 'supabase') {
    const r = await fetch(`${cfg().supabaseUrl}/storage/v1/object/info/authenticated/${cfg().bucket}/${ruta}`, {
      headers: { Authorization: `Bearer ${cfg().supabaseClave}`, apikey: cfg().supabaseClave }, signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    return Boolean(r?.ok);
  }
  return fs.existsSync(rutaLocal(ruta));
}

async function eliminar(ruta) {
  rutaSegura(ruta);
  if (cfg().proveedor === 'supabase') {
    await supabase('DELETE', `/object/${cfg().bucket}`, { prefixes: [ruta] }).catch(() => null);
    return;
  }
  fs.rmSync(rutaLocal(ruta), { force: true });
}

// ---- adaptador local (desarrollo y pruebas)
function rutaLocal(ruta) {
  const base = path.resolve(cfg().carpetaLocal);
  const destino = path.resolve(base, rutaSegura(ruta));
  if (!destino.startsWith(base + path.sep)) throw new HttpError(400, 'Ruta de archivo no válida');
  return destino;
}

function guardarLocal(ruta, buffer) {
  if (cfg().proveedor !== 'local') throw new HttpError(400, 'La subida directa solo existe en el modo de almacenamiento local');
  const destino = rutaLocal(ruta);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
}

function leerLocal(ruta) {
  if (cfg().proveedor !== 'local') throw new HttpError(400, 'Solo disponible en el modo de almacenamiento local');
  return rutaLocal(ruta);
}

module.exports = {
  MIME_VIDEO, nuevaRuta, urlSubida, urlLectura, existe, eliminar, guardarLocal, leerLocal, exigirConfigurado,
  proveedor: () => cfg().proveedor,
};
