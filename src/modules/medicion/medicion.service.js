/**
 * Modo Medición (FASE 3): sesiones de evaluación, registro de resultados por intento, sincronización
 * sin conexión (idempotente), corrección auditada, cronómetro con dos dispositivos y Modo Piscina.
 *
 * Reglas que se cumplen aquí y no en la interfaz:
 * - Todo resultado guarda su fuente (MANUAL, PHONE, VIDEO, SENSOR, EXTERNAL_SYSTEM).
 * - Una estimación (p. ej. de video) nunca se marca como oficial.
 * - Corregir un resultado conserva el valor anterior en el propio registro (no se reescribe el pasado en silencio).
 * - El deportista debe estar dentro del alcance del coach; la prueba, en la academia.
 */
const crypto = require('node:crypto');
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO } = require('../../utils/valores');
const { condicionDeportista, deportistaEnAlcance, perteneceAcademia } = require('../../core/alcance');
const M = require('../../domain/medicion');

const texto = (etiqueta, maxLargo, requerido = false) => ({ tipo: 'texto', etiqueta, maxLargo, requerido });

// ---------------------------------------------------------------------------
// Sesiones de evaluación
// ---------------------------------------------------------------------------
const esquemaSesion = {
  nombre: texto('Nombre', 120, true),
  fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
  modo: texto('Modo', 20),
  deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
  categoria_id: { tipo: 'entero', etiqueta: 'Categoría', min: 1 },
  equipo_id: { tipo: 'entero', etiqueta: 'Equipo', min: 1 },
  instalacion_id: { tipo: 'entero', etiqueta: 'Instalación', min: 1 },
  plantilla_id: { tipo: 'entero', etiqueta: 'Plantilla', min: 1 },
  notas: texto('Notas', 1000),
};

/** Condición de visibilidad de una sesión: el admin ve todas; el coach las suyas o las de sus equipos. */
const condicionSesion = (alias, pA, pC) => `(${alias}.academia_id = ${pA} AND (${pC}::int IS NULL OR ${alias}.coach_id = ${pC}
  OR ${alias}.creado_por = ${pC} OR EXISTS (SELECT 1 FROM equipos e_ WHERE e_.id = ${alias}.equipo_id AND e_.coach_id = ${pC})))`;

async function listarSesiones(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionSesion('s', '$1', '$2')];
  if (consulta.estado) { valores.push(String(consulta.estado)); filtros.push(`s.estado = $${valores.length}`); }
  if (Number(consulta.deporte_id)) { valores.push(Number(consulta.deporte_id)); filtros.push(`s.deporte_id = $${valores.length}`); }
  const { rows } = await query(
    `SELECT s.*, dp.nombre AS deporte, c.nombre AS categoria, e.nombre AS equipo, i.nombre AS instalacion, u.nombre AS coach,
            (SELECT count(*)::int FROM resultados r WHERE r.sesion_id = s.id AND r.activo) AS resultados
     FROM sesiones_evaluacion s
     LEFT JOIN deportes dp ON dp.id = s.deporte_id LEFT JOIN categorias c ON c.id = s.categoria_id
     LEFT JOIN equipos e ON e.id = s.equipo_id LEFT JOIN instalaciones i ON i.id = s.instalacion_id
     LEFT JOIN usuarios u ON u.id = s.coach_id
     WHERE ${filtros.join(' AND ')} ORDER BY s.fecha DESC, s.id DESC LIMIT 200`,
    valores,
  );
  return rows;
}

async function cargarSesion(alcance, id, cliente = null) {
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  const { rows } = await ejecutar(`SELECT s.* FROM sesiones_evaluacion s WHERE s.id = $3 AND ${condicionSesion('s', '$1', '$2')}`, [alcance.academia, alcance.coach, id]);
  if (!rows.length) throw noEncontrado('Sesión de evaluación');
  return rows[0];
}

async function obtenerSesion(alcance, id) {
  const sesion = await cargarSesion(alcance, id);
  const resultados = await listarResultados(alcance, { sesion_id: id, limite: 2000 });
  let pruebas = [];
  if (sesion.plantilla_id) {
    const { rows } = await query('SELECT pruebas FROM plantillas_evaluacion WHERE id = $1 AND academia_id = $2', [sesion.plantilla_id, alcance.academia]);
    const ids = rows[0]?.pruebas || [];
    if (ids.length) {
      const r = await query(`SELECT p.*, m.tipo_resultado, m.unidad, m.direccion_mejora, m.decimales FROM pruebas p JOIN metricas m ON m.id = p.metrica_id
        WHERE p.academia_id = $1 AND p.id = ANY($2::int[])`, [alcance.academia, ids]);
      pruebas = ids.map((pid) => r.rows.find((p) => p.id === pid)).filter(Boolean);
    }
  }
  const { rows: inst } = sesion.instalacion_id
    ? await query('SELECT carriles, largo_m FROM instalaciones WHERE id = $1', [sesion.instalacion_id]) : { rows: [] };
  return { ...sesion, carriles: inst[0]?.carriles || null, pruebas, resultados };
}

async function crearSesion(alcance, usuario, datos) {
  const d = validar(esquemaSesion, datos);
  d.modo = d.modo || 'campo';
  if (!M.MODOS.includes(d.modo)) throw new HttpError(400, 'Modo de medición no válido');
  const refs = {
    deporte_id: ['deportes', 'El deporte'], categoria_id: ['categorias', 'La categoría'], equipo_id: ['equipos', 'El equipo'],
    instalacion_id: ['instalaciones', 'La instalación'], plantilla_id: ['plantillas_evaluacion', 'La plantilla'],
  };
  const filas = {};
  for (const [campo, [tabla, etiqueta]] of Object.entries(refs)) filas[campo] = await perteneceAcademia(tabla, d[campo], alcance.academia, etiqueta);
  if (filas.equipo_id && alcance.coach && filas.equipo_id.coach_id !== alcance.coach) throw new HttpError(403, 'Solo puedes crear sesiones para tus equipos');
  const condiciones = {};
  if (datos?.condiciones && typeof datos.condiciones === 'object') {
    for (const [k, v] of Object.entries(datos.condiciones).slice(0, 10)) condiciones[String(k).slice(0, 30)] = typeof v === 'number' ? v : String(v).slice(0, 80);
  }
  // En Modo Piscina el largo de la piscina forma parte del contexto (25 m y 50 m no son comparables)
  if (d.modo === 'piscina') {
    const largo = Number(condiciones.largo_piscina || filas.instalacion_id?.largo_m);
    if (![25, 50].includes(largo) && !(largo > 0)) throw new HttpError(400, 'En Modo Piscina indica el largo de la piscina (25 o 50 m) o elige una piscina');
    condiciones.largo_piscina = largo;
  }
  const { rows } = await query(
    `INSERT INTO sesiones_evaluacion (academia_id, nombre, fecha, modo, deporte_id, categoria_id, equipo_id, instalacion_id, plantilla_id,
       notas, condiciones, coach_id, creado_por)
     VALUES ($1, $2, coalesce($3, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [alcance.academia, d.nombre, d.fecha, d.modo, d.deporte_id, d.categoria_id, d.equipo_id, d.instalacion_id, d.plantilla_id,
      d.notas, JSON.stringify(condiciones), filas.equipo_id?.coach_id || alcance.coach || usuario.id, usuario.id],
  );
  return rows[0];
}

async function cerrarSesion(alcance, id) {
  await cargarSesion(alcance, id);
  const { rows } = await query("UPDATE sesiones_evaluacion SET estado = 'cerrada', cerrada_en = now() WHERE id = $1 RETURNING *", [id]);
  return rows[0];
}

async function reabrirSesion(alcance, id) {
  await cargarSesion(alcance, id);
  const { rows } = await query("UPDATE sesiones_evaluacion SET estado = 'abierta', cerrada_en = NULL WHERE id = $1 RETURNING *", [id]);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
async function cargarPrueba(academia, id, cliente = null) {
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  const { rows } = await ejecutar(
    `SELECT p.*, m.tipo_resultado, m.unidad, m.direccion_mejora, m.rango_min, m.rango_max, m.decimales, m.nombre AS metrica
     FROM pruebas p JOIN metricas m ON m.id = p.metrica_id WHERE p.id = $1 AND p.academia_id = $2 AND p.activo`,
    [id, academia],
  );
  if (!rows.length) throw new HttpError(400, 'La prueba no existe en esta academia');
  return rows[0];
}

/** Convierte el valor escrito al número que se guarda (los tiempos admiten 1:04.32). */
function valorNumerico(prueba, crudo) {
  let valor;
  try {
    valor = prueba.tipo_resultado === 'TIME' ? M.parsearTiempo(crudo) : Number(String(crudo ?? '').replace(',', '.'));
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  if (!M.esNumero(valor)) throw new HttpError(400, 'El valor del resultado es obligatorio y debe ser numérico');
  if (['TIME', 'DISTANCE', 'SPEED', 'PACE', 'COUNT', 'WEIGHT', 'HEIGHT', 'HEART_RATE'].includes(prueba.tipo_resultado) && valor < 0) {
    throw new HttpError(400, 'El valor no puede ser negativo');
  }
  if (prueba.tipo_resultado === 'TIME' && valor === 0) throw new HttpError(400, 'Un tiempo debe ser mayor que cero');
  if (prueba.tipo_resultado === 'RPE' && (valor < 0 || valor > 10)) throw new HttpError(400, 'El RPE va de 0 a 10');
  if (prueba.tipo_resultado === 'PERCENTAGE' && (valor < 0 || valor > 100)) throw new HttpError(400, 'El porcentaje va de 0 a 100');
  return M.redondear(valor, 4);
}

/** Valores derivados (velocidad, ritmo, eficiencia de brazada, tramos). Siempre marcados como calculados. */
function derivados(prueba, valor, datos, parciales) {
  const r = {};
  if (prueba.tipo_resultado === 'TIME' && prueba.distancia_m) {
    r.velocidad_ms = M.velocidadMs(prueba.distancia_m, valor);
    r.velocidad_kmh = M.velocidadKmh(prueba.distancia_m, valor);
    r.ritmo_100m_s = M.ritmoPor(prueba.distancia_m, valor, 100);
    if (prueba.distancia_m >= 1000) r.ritmo_km_s = M.ritmoPor(prueba.distancia_m, valor, 1000);
    const brazadas = Number(datos.brazadas);
    if (brazadas > 0) {
      r.distancia_por_brazada_m = M.distanciaPorBrazada(prueba.distancia_m, brazadas);
      r.frecuencia_brazada_min = M.frecuenciaBrazada(brazadas, valor);
    }
  }
  if (parciales?.length) r.tramos = M.tramos(parciales);
  return Object.keys(r).length ? r : null;
}

function limpiarDatosExtra(prueba, datos = {}) {
  const permitidas = new Set([...(prueba.campos || []).map((c) => c.clave), 'largo_piscina', 'brazadas', 'reaccion_s', 'viento_ms', 'estimado', 'observacion', 'gps', 'dificultad', 'incertidumbre_ms']);
  const limpio = {};
  for (const [k, v] of Object.entries(datos || {})) {
    if (!permitidas.has(k)) continue;
    if (k === 'gps' && v && typeof v === 'object') { limpio.gps = v; continue; }
    if (typeof v === 'boolean') limpio[k] = v;
    else if (v !== null && v !== '' && v !== undefined) limpio[k] = Number.isFinite(Number(v)) ? Number(v) : String(v).slice(0, 120);
  }
  return limpio;
}

const esquemaResultado = {
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', requerido: true, min: 1 },
  prueba_id: { tipo: 'entero', etiqueta: 'Prueba', requerido: true, min: 1 },
  sesion_id: { tipo: 'entero', etiqueta: 'Sesión', min: 1 },
  intento: { tipo: 'entero', etiqueta: 'Intento', min: 1, max: 50 },
  fecha: { tipo: 'fecha', etiqueta: 'Fecha' },
  notas: texto('Notas', 500),
  fuente_medicion: texto('Fuente de la medición', 20),
  carril: { tipo: 'entero', etiqueta: 'Carril', min: 1, max: 20 },
  clave_idempotencia: texto('Clave de sincronización', 80),
};

/**
 * Registra un intento. Devuelve el resultado guardado y su lectura (récord, variación, intento oficial).
 * @param {object} extra { dispositivo_id, cliente, fuente forzada }
 */
async function registrar(alcance, usuario, datos, extra = {}) {
  const d = validar(esquemaResultado, datos);
  const fuente = (extra.fuente || d.fuente_medicion || 'MANUAL').toUpperCase();
  if (!M.FUENTES_MEDICION.includes(fuente)) throw new HttpError(400, 'Fuente de medición no válida');

  if (d.clave_idempotencia) {
    const { rows } = await query('SELECT * FROM resultados WHERE academia_id = $1 AND clave_idempotencia = $2', [alcance.academia, d.clave_idempotencia]);
    if (rows.length) return { ...(await leerResultado(alcance, rows[0])), duplicado: true };
  }

  const deportista = await deportistaEnAlcance(alcance, d.deportista_id);
  const prueba = await cargarPrueba(alcance.academia, d.prueba_id);
  let sesion = null;
  if (d.sesion_id) {
    sesion = await cargarSesion(alcance, d.sesion_id);
    if (sesion.estado === 'cerrada') throw new HttpError(409, 'La sesión está cerrada: reábrela para añadir resultados');
  }
  const valor = valorNumerico(prueba, datos.valor);
  const extras = limpiarDatosExtra(prueba, datos.datos);
  if (sesion?.condiciones?.largo_piscina) extras.largo_piscina = sesion.condiciones.largo_piscina;
  if (prueba.modo === 'piscina' && !extras.largo_piscina) throw new HttpError(400, 'Indica el largo de la piscina (25 o 50 m): sin él el tiempo no es comparable');

  let parciales = null;
  if (Array.isArray(datos.parciales) && datos.parciales.length) {
    try {
      parciales = datos.parciales.slice(0, 200).map((p) => ({ m: Number(p.m), t: prueba.tipo_resultado === 'TIME' ? M.parsearTiempo(p.t) : Number(p.t) }));
    } catch (error) {
      throw new HttpError(400, `Parciales: ${error.message}`);
    }
    const errores = M.validarParciales(parciales, prueba.distancia_m, valor);
    if (errores.length) throw new HttpError(400, 'Revisa los parciales', errores);
  }
  const calculados = derivados(prueba, valor, extras, parciales);
  if (calculados) extras.derivados = calculados;
  // Una estimación (video, GPS de baja precisión…) nunca es un resultado oficial
  const oficial = !(fuente === 'VIDEO' || extras.estimado === true);

  let intento = d.intento;
  if (!intento) {
    const { rows } = await query(
      `SELECT coalesce(max(intento), 0) + 1 AS n FROM resultados WHERE deportista_id = $1 AND prueba_id = $2 AND activo
       AND ((sesion_id IS NULL AND $3::int IS NULL AND fecha = coalesce($4::date, CURRENT_DATE)) OR sesion_id = $3)`,
      [deportista.id, prueba.id, d.sesion_id, d.fecha],
    );
    intento = Math.min(50, rows[0].n);
  }

  try {
    const { rows } = await query(
      `INSERT INTO resultados (academia_id, deportista_id, sesion_id, prueba_id, metrica_id, deporte_id, categoria_id, equipo_id, coach_id,
         plantilla_id, intento, valor, unidad, fecha, hora, notas, fuente_medicion, dispositivo_id, oficial, carril, parciales, datos,
         clave_idempotencia, registrado_por)
       VALUES ($1, $2, $3, $4, $5, coalesce($6::int, $7::int), coalesce($8::int, $9::int), $10, coalesce($11::int, $12::int), $13, $14, $15, $16,
         coalesce($17::date, $18::date, CURRENT_DATE), localtime, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING *`,
      [alcance.academia, deportista.id, sesion?.id || null, prueba.id, prueba.metrica_id, prueba.deporte_id, deportista.deporte_id,
        sesion?.categoria_id || null, deportista.categoria_id, sesion?.equipo_id || null, sesion?.coach_id || null, deportista.usuario_id,
        sesion?.plantilla_id || null, intento, valor, prueba.unidad, d.fecha, sesion?.fecha || null, d.notas, fuente, extra.dispositivo_id || null,
        oficial, d.carril, parciales ? JSON.stringify(parciales) : null, JSON.stringify(extras), d.clave_idempotencia, usuario?.id || null],
    );
    return leerResultado(alcance, rows[0], prueba);
  } catch (error) {
    if (error.code === '23505' && d.clave_idempotencia) {
      const { rows } = await query('SELECT * FROM resultados WHERE academia_id = $1 AND clave_idempotencia = $2', [alcance.academia, d.clave_idempotencia]);
      return { ...(await leerResultado(alcance, rows[0])), duplicado: true };
    }
    throw error;
  }
}

/** Resultado + su lectura dentro de la historia COMPATIBLE del deportista en esa prueba. */
async function leerResultado(alcance, fila, prueba = null) {
  const p = prueba || await cargarPrueba(alcance.academia, fila.prueba_id);
  const { rows } = await query(
    `SELECT id, valor, fecha, unidad, datos, prueba_id, intento, sesion_id FROM resultados
     WHERE deportista_id = $1 AND prueba_id = $2 AND activo AND oficial AND (fecha < $3 OR (fecha = $3 AND id <= $4)) ORDER BY fecha, id`,
    [fila.deportista_id, fila.prueba_id, fila.fecha, fila.id],
  );
  const clave = M.claveComparacion(fila);
  const compatibles = rows.filter((r) => M.claveComparacion(r) === clave);
  const rango = { min: p.rango_min, max: p.rango_max };
  // Un día con varios intentos: el valor del día es el del criterio de la prueba
  const porDia = new Map();
  for (const r of compatibles) porDia.set(String(r.fecha), [...(porDia.get(String(r.fecha)) || []), r]);
  const diarios = [...porDia.entries()].map(([fecha, lista]) => ({
    fecha, prueba_id: fila.prueba_id, unidad: fila.unidad, datos: fila.datos,
    valor: M.consolidarIntentos(lista.map((x) => x.valor), p.criterio, p.direccion_mejora, rango),
  }));
  const evo = fila.oficial ? M.evolucion(diarios, p.direccion_mejora, rango) : null;
  const previas = compatibles.filter((r) => r.id !== fila.id).map((r) => r.valor);
  const mejorPrevio = M.mejorValor(previas, p.direccion_mejora, rango);
  // Control de calidad: un cambio de más del 25 % respecto a la mejor marca suele ser un error de registro
  const atipico = Boolean(M.esNumero(mejorPrevio) && Math.abs(M.variacion(mejorPrevio, fila.valor, p.direccion_mejora, rango)?.porcentaje ?? 0) > 25);
  return {
    ...fila,
    prueba: p.nombre,
    tipo_resultado: p.tipo_resultado,
    direccion_mejora: p.direccion_mejora,
    valor_texto: M.formatearValor(fila.valor, { tipo: p.tipo_resultado, unidad: p.unidad, decimales: p.decimales }),
    lectura: {
      record_personal: Boolean(fila.oficial && !atipico && previas.length && M.esMejor(fila.valor, mejorPrevio, p.direccion_mejora, rango) === true),
      primera_marca: fila.oficial && !previas.length,
      mejor_previo: mejorPrevio,
      desde_anterior: evo?.desde_anterior || null,
      mediciones_compatibles: diarios.length,
      oficial: fila.oficial,
      atipico,
    },
  };
}

/** Sincronización del modo sin conexión: cada elemento es independiente y la clave de idempotencia evita duplicados. */
async function registrarLote(alcance, usuario, lista) {
  if (!Array.isArray(lista) || !lista.length) throw new HttpError(400, 'No hay resultados para sincronizar');
  if (lista.length > 300) throw new HttpError(400, 'Sincroniza como máximo 300 resultados por envío');
  const salida = [];
  for (const item of lista) {
    try {
      const r = await registrar(alcance, usuario, item);
      salida.push({ clave_idempotencia: item?.clave_idempotencia || null, estado: r.duplicado ? 'duplicado' : 'guardado', id: r.id });
    } catch (error) {
      salida.push({ clave_idempotencia: item?.clave_idempotencia || null, estado: 'error', error: error.message, detalles: error.detalles });
    }
  }
  return {
    guardados: salida.filter((s) => s.estado === 'guardado').length,
    duplicados: salida.filter((s) => s.estado === 'duplicado').length,
    errores: salida.filter((s) => s.estado === 'error').length,
    detalle: salida,
  };
}

async function listarResultados(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = ['r.activo', condicionDeportista('d', '$1', '$2'), 'r.academia_id = $1'];
  for (const campo of ['deportista_id', 'prueba_id', 'sesion_id', 'deporte_id', 'categoria_id', 'equipo_id']) {
    const n = Number(consulta[campo]);
    if (Number.isInteger(n) && n > 0) { valores.push(n); filtros.push(`r.${campo} = $${valores.length}`); }
  }
  if (consulta.desde) { valores.push(String(consulta.desde).slice(0, 10)); filtros.push(`r.fecha >= $${valores.length}::date`); }
  if (consulta.hasta) { valores.push(String(consulta.hasta).slice(0, 10)); filtros.push(`r.fecha <= $${valores.length}::date`); }
  if (consulta.oficial === 'true') filtros.push('r.oficial');
  const limite = Math.min(Number(consulta.limite) || 500, 5000);
  const { rows } = await query(
    `SELECT r.*, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, d.nombre AS deportista, d.codigo, p.nombre AS prueba, m.tipo_resultado, m.direccion_mejora, m.decimales
     FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
     WHERE ${filtros.join(' AND ')} ORDER BY r.fecha DESC, r.id DESC LIMIT ${limite}`,
    valores,
  );
  return rows.map((r) => ({ ...r, valor_texto: M.formatearValor(r.valor, { tipo: r.tipo_resultado, unidad: r.unidad, decimales: r.decimales }) }));
}

async function cargarResultado(alcance, id) {
  const { rows } = await query(
    `SELECT r.* FROM resultados r JOIN deportistas d ON d.id = r.deportista_id
     WHERE r.id = $3 AND r.activo AND ${condicionDeportista('d', '$1', '$2')}`,
    [alcance.academia, alcance.coach, id],
  );
  if (!rows.length) throw noEncontrado('Resultado');
  return rows[0];
}

/** Corrige un resultado conservando el valor anterior, quién y por qué (exige un motivo). */
async function corregir(alcance, usuario, id, datos = {}) {
  const actual = await cargarResultado(alcance, id);
  const motivo = String(datos.motivo || '').trim();
  if (motivo.length < 3) throw new HttpError(400, 'Indica el motivo de la corrección');
  const prueba = await cargarPrueba(alcance.academia, actual.prueba_id);
  const valor = valorNumerico(prueba, datos.valor);
  const historial = Array.isArray(actual.datos?.correcciones) ? actual.datos.correcciones : [];
  const nuevosDatos = {
    ...actual.datos,
    correcciones: [...historial, { valor_anterior: actual.valor, valor_nuevo: valor, motivo: motivo.slice(0, 300), por: usuario.id, en: new Date().toISOString() }],
  };
  const { rows } = await query(
    `UPDATE resultados SET valor = $2, datos = $3, notas = coalesce($4, notas), actualizado_en = now() WHERE id = $1 RETURNING *`,
    [id, valor, JSON.stringify(nuevosDatos), datos.notas ? String(datos.notas).slice(0, 500) : null],
  );
  return leerResultado(alcance, rows[0], prueba);
}

async function anular(alcance, usuario, id, motivo) {
  const actual = await cargarResultado(alcance, id);
  const texto2 = String(motivo || '').trim();
  if (texto2.length < 3) throw new HttpError(400, 'Indica el motivo de la anulación');
  await query('UPDATE resultados SET activo = false, datos = $2, actualizado_en = now() WHERE id = $1', [
    id, JSON.stringify({ ...actual.datos, anulado: { motivo: texto2.slice(0, 300), por: usuario.id, en: new Date().toISOString() } }),
  ]);
}

// ---------------------------------------------------------------------------
// Cronómetro con dos dispositivos
// ---------------------------------------------------------------------------
const nuevoCodigo = () => crypto.randomInt(100000, 999999).toString();

async function crearCronometro(alcance, usuario, datos = {}) {
  const deportista = await deportistaEnAlcance(alcance, Number(datos.deportista_id));
  const prueba = await cargarPrueba(alcance.academia, Number(datos.prueba_id));
  if (prueba.tipo_resultado !== 'TIME') throw new HttpError(400, 'El cronómetro solo sirve para pruebas de tiempo');
  const sesionId = Number(datos.sesion_id) || null;
  if (sesionId) await cargarSesion(alcance, sesionId);
  for (let i = 0; i < 5; i += 1) {
    try {
      const { rows } = await query(
        `INSERT INTO cronometros (academia_id, codigo, sesion_id, prueba_id, deportista_id, intento, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [alcance.academia, nuevoCodigo(), sesionId, prueba.id, deportista.id, Number(datos.intento) || 1, usuario.id],
      );
      return { ...rows[0], deportista: deportista.nombre, prueba: prueba.nombre };
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }
  throw new HttpError(503, 'No se pudo generar un código de cronómetro, inténtalo de nuevo');
}

async function cronometroPorCodigo(alcance, codigo) {
  const { rows } = await query(
    `SELECT c.*, d.nombre AS deportista, p.nombre AS prueba FROM cronometros c
     JOIN deportistas d ON d.id = c.deportista_id JOIN pruebas p ON p.id = c.prueba_id
     WHERE c.academia_id = $1 AND c.codigo = $2 ORDER BY c.id DESC LIMIT 1`,
    [alcance.academia, String(codigo || '').trim()],
  );
  if (!rows.length) throw noEncontrado('Cronómetro');
  return rows[0];
}

/**
 * Marca la salida (dispositivo A) o la llegada (dispositivo B).
 * Cada dispositivo envía su marca en SU reloj y el desfase calculado con /medicion/hora, así la duración
 * se calcula en el reloj del servidor. La incertidumbre (ms) se guarda con el resultado.
 */
async function marcarCronometro(alcance, usuario, codigo, datos = {}) {
  const tipo = datos.tipo;
  if (!['salida', 'llegada', 'cancelar'].includes(tipo)) throw new HttpError(400, 'Tipo de marca no válido (salida, llegada o cancelar)');
  return transaccion(async (cliente) => {
    const { rows } = await cliente.query(
      "SELECT * FROM cronometros WHERE academia_id = $1 AND codigo = $2 AND estado IN ('esperando', 'en_curso') FOR UPDATE",
      [alcance.academia, String(codigo || '').trim()],
    );
    if (!rows.length) throw noEncontrado('Cronómetro activo');
    const c = rows[0];
    if (tipo === 'cancelar') {
      const r = await cliente.query("UPDATE cronometros SET estado = 'cancelado' WHERE id = $1 RETURNING *", [c.id]);
      return r.rows[0];
    }
    const marca = Number(datos.marca_ms);
    const desfase = Number(datos.desfase_ms) || 0;
    const incert = Math.max(0, Math.round(Number(datos.incertidumbre_ms) || 0));
    if (!Number.isFinite(marca)) throw new HttpError(400, 'Falta la marca de tiempo');
    const servidor = Math.round(marca + desfase);
    if (tipo === 'salida') {
      if (c.estado !== 'esperando') throw new HttpError(409, 'La salida ya fue marcada');
      const r = await cliente.query("UPDATE cronometros SET inicio_ms = $2, incertidumbre_ms = $3, estado = 'en_curso' WHERE id = $1 RETURNING *", [c.id, servidor, incert]);
      return r.rows[0];
    }
    if (c.estado !== 'en_curso') throw new HttpError(409, 'Primero hay que marcar la salida');
    const duracion = M.duracionDosDispositivos({ marca_ms: Number(c.inicio_ms), desfase_ms: 0 }, { marca_ms: servidor, desfase_ms: 0 });
    if (!duracion) throw new HttpError(400, 'La llegada no puede ser anterior a la salida');
    const incertidumbre = c.incertidumbre_ms + incert;
    const r = await cliente.query("UPDATE cronometros SET fin_ms = $2, incertidumbre_ms = $3, estado = 'terminado' WHERE id = $1 RETURNING *", [c.id, servidor, incertidumbre]);
    return { ...r.rows[0], segundos: duracion.segundos };
  }).then(async (c) => {
    if (c.estado !== 'terminado') return c;
    const resultado = await registrar(alcance, usuario, {
      deportista_id: c.deportista_id, prueba_id: c.prueba_id, sesion_id: c.sesion_id, intento: c.intento, valor: c.segundos,
      notas: `Cronómetro de dos dispositivos (±${c.incertidumbre_ms} ms)`, clave_idempotencia: `crono-${c.id}`,
      datos: { incertidumbre_ms: c.incertidumbre_ms },
    }, { fuente: 'PHONE' });
    await query('UPDATE cronometros SET resultado_id = $2 WHERE id = $1', [c.id, resultado.id]);
    return { ...c, resultado };
  });
}

module.exports = {
  listarSesiones, obtenerSesion, crearSesion, cerrarSesion, reabrirSesion,
  registrar, registrarLote, listarResultados, cargarResultado, leerResultado, corregir, anular,
  crearCronometro, cronometroPorCodigo, marcarCronometro, cargarPrueba, valorNumerico, hoyISO,
};
