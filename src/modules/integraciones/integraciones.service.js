/**
 * Integraciones (FASE 10): dispositivos externos (fotocélulas, GPS, wearables, cronometraje) que envían
 * mediciones por API con una clave propia. La clave solo se muestra al crearla; se guarda su SHA-256.
 * Las mediciones entran como resultados con fuente SENSOR o EXTERNAL_SYSTEM y respetan la idempotencia.
 */
const crypto = require('node:crypto');
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const medicion = require('../medicion/medicion.service');
const M = require('../../domain/medicion');
const I = require('../../domain/indicadores');

const TIPOS = ['fotocelula', 'gps', 'wearable', 'cronometraje', 'pulsometro', 'otro'];
const hash = (clave) => crypto.createHash('sha256').update(clave).digest('hex');

async function listar(alcance) {
  const { rows } = await query(
    `SELECT d.id, d.nombre, d.tipo, d.prefijo, d.activo, d.ultimo_uso, d.creado_en, u.nombre AS creado_por,
            (SELECT count(*)::int FROM resultados r WHERE r.dispositivo_id = d.id) AS mediciones
     FROM dispositivos d LEFT JOIN usuarios u ON u.id = d.creado_por WHERE d.academia_id = $1 ORDER BY d.activo DESC, d.nombre`,
    [alcance.academia],
  );
  return rows;
}

async function crear(alcance, usuario, datos = {}) {
  const d = validar({ nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 80 }, tipo: { tipo: 'texto', etiqueta: 'Tipo', requerido: true, maxLargo: 20 } }, datos);
  if (!TIPOS.includes(d.tipo)) throw new HttpError(400, 'Tipo de dispositivo no válido');
  const clave = `sk_dev_${crypto.randomBytes(24).toString('base64url')}`;
  const { rows } = await query(
    'INSERT INTO dispositivos (academia_id, nombre, tipo, clave_hash, prefijo, creado_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, tipo, prefijo',
    [alcance.academia, d.nombre, d.tipo, hash(clave), clave.slice(0, 12), usuario.id],
  );
  return { ...rows[0], clave, aviso: 'Guarda esta clave ahora: no se volverá a mostrar.' };
}

async function desactivar(alcance, id) {
  const { rowCount } = await query('UPDATE dispositivos SET activo = false WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
  if (!rowCount) throw noEncontrado('Dispositivo');
}

/** Autentica un dispositivo por su clave (cabecera Authorization: Bearer sk_dev_…). */
async function autenticar(cabecera) {
  const clave = String(cabecera || '').replace(/^Bearer\s+/i, '').trim();
  if (!clave.startsWith('sk_dev_')) throw new HttpError(401, 'Falta la clave del dispositivo');
  const { rows } = await query(
    `SELECT d.*, a.estado AS academia_estado FROM dispositivos d JOIN academias a ON a.id = d.academia_id WHERE d.clave_hash = $1`, [hash(clave)],
  );
  const disp = rows[0];
  if (!disp || !disp.activo) throw new HttpError(401, 'Clave de dispositivo no válida o desactivada');
  if (disp.academia_estado !== 'activa') throw new HttpError(403, 'La academia está suspendida');
  const { rows: mod } = await query(
    `SELECT (pl.modulos ? 'integraciones') AS incluido, coalesce((c.modulos->>'integraciones')::boolean, true) AS activo
     FROM suscripciones s JOIN planes pl ON pl.id = s.plan_id LEFT JOIN academia_config c ON c.academia_id = s.academia_id
     WHERE s.academia_id = $1 AND s.actual`, [disp.academia_id],
  );
  if (mod[0] && (!mod[0].incluido || !mod[0].activo)) throw new HttpError(403, 'El módulo de integraciones no está activo en la academia');
  await query('UPDATE dispositivos SET ultimo_uso = now() WHERE id = $1', [disp.id]);
  return disp;
}

async function resolver(academia, tabla, id, clave, etiqueta, columnaClave = 'clave') {
  if (Number(id)) return Number(id);
  if (!clave) throw new HttpError(400, `Indica ${etiqueta}`);
  const { rows } = await query(`SELECT id FROM ${tabla} WHERE academia_id = $1 AND ${columnaClave} = $2`, [academia, String(clave)]);
  if (!rows.length) throw new HttpError(400, `${etiqueta} "${clave}" no existe en la academia`);
  return rows[0].id;
}

/** Una medición enviada por un dispositivo. Acepta { deportista_codigo | deportista_id, prueba_clave | prueba_id, valor, gps[] … }. */
async function recibirMedicion(disp, cuerpo = {}) {
  const academia = disp.academia_id;
  const deportistaId = await resolver(academia, 'deportistas', cuerpo.deportista_id, cuerpo.deportista_codigo, 'el deportista', 'codigo');
  const pruebaId = await resolver(academia, 'pruebas', cuerpo.prueba_id, cuerpo.prueba_clave, 'la prueba');
  const datos = { ...(cuerpo.datos || {}) };
  let { valor } = cuerpo;
  if (Array.isArray(cuerpo.gps) && cuerpo.gps.length) {
    if (cuerpo.gps.length > 20000) throw new HttpError(400, 'Trayectoria GPS demasiado larga');
    const prueba = await medicion.cargarPrueba(academia, pruebaId);
    const inicio = process.hrtime.bigint();
    const resumen = M.resumenGps(cuerpo.gps);
    if (!resumen) throw new HttpError(400, 'La trayectoria GPS no tiene puntos válidos');
    // Indicador "rendimiento del rastreo de movimiento": calidad de la trayectoria y tiempo de procesamiento
    const referencia = Number(cuerpo.distancia_referencia_m) > 0 ? Number(cuerpo.distancia_referencia_m) : (prueba.distancia_m || null);
    const calidad = I.calidadGps(cuerpo.gps, { distanciaReferencia: referencia });
    if (calidad) calidad.procesamiento_ms = Number((process.hrtime.bigint() - inicio) / 1000n) / 1000;
    datos.gps = { ...resumen, calidad };
    if (valor === undefined || valor === null) {
      if (prueba.tipo_resultado === 'DISTANCE') valor = prueba.unidad === 'km' ? resumen.distancia_m / 1000 : resumen.distancia_m;
      else if (prueba.tipo_resultado === 'TIME') valor = resumen.duracion_s;
      else if (prueba.tipo_resultado === 'SPEED') valor = resumen.velocidad_kmh;
      else if (prueba.tipo_resultado === 'HEART_RATE') valor = resumen.fc_media;
    }
  }
  const fuente = ['cronometraje', 'otro'].includes(disp.tipo) ? 'EXTERNAL_SYSTEM' : 'SENSOR';
  return medicion.registrar({ academia, coach: null }, null, {
    deportista_id: deportistaId, prueba_id: pruebaId, valor, fecha: cuerpo.fecha, intento: cuerpo.intento, notas: cuerpo.notas,
    clave_idempotencia: cuerpo.clave_idempotencia ? `dev${disp.id}:${String(cuerpo.clave_idempotencia).slice(0, 60)}` : null,
    parciales: cuerpo.parciales, carril: cuerpo.carril, datos,
  }, { fuente, dispositivo_id: disp.id });
}

async function recibirLote(disp, lista) {
  if (!Array.isArray(lista) || !lista.length || lista.length > 500) throw new HttpError(400, 'Envía entre 1 y 500 mediciones');
  const salida = [];
  for (const item of lista) {
    try {
      const r = await recibirMedicion(disp, item);
      salida.push({ estado: r.duplicado ? 'duplicado' : 'guardado', id: r.id });
    } catch (error) {
      salida.push({ estado: 'error', error: error.message });
    }
  }
  return { recibidas: lista.length, guardadas: salida.filter((s) => s.estado === 'guardado').length, detalle: salida };
}

module.exports = { TIPOS, listar, crear, desactivar, autenticar, recibirMedicion, recibirLote, hash };
