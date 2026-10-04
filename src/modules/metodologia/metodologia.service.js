/**
 * Metodología de la academia (FASES 3, 5 y 6): métricas, pruebas, plantillas de evaluación (versionadas),
 * configuraciones de puntuación (versionadas, nunca se modifican: se reemplazan) y reglas de alerta.
 *
 * "No modificar silenciosamente el pasado": una métrica o prueba con resultados no puede cambiar su
 * unidad, dirección de mejora ni protocolo; para eso se crea una nueva.
 */
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { crearCatalogo } = require('../../core/catalogo');
const { TIPOS_RESULTADO, DIRECCIONES, MODOS, CRITERIOS_INTENTOS } = require('../../domain/medicion');
const { CAPACIDADES } = require('../../domain/plantillas-deporte');
const { REGLAS } = require('../../domain/reglas-alerta');

const texto = (etiqueta, maxLargo = 120, requerido = false) => ({ tipo: 'texto', etiqueta, maxLargo, requerido });
const claveDe = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);

function enLista(valor, lista, etiqueta) {
  if (!lista.includes(valor)) throw new HttpError(400, `${etiqueta} no válido: ${valor}`);
}

async function contarResultados(columna, id) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM resultados WHERE ${columna} = $1 AND activo`, [id]);
  return rows[0].n;
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------
const metricas = crearCatalogo({
  tabla: 'metricas',
  entidad: 'Métrica',
  esquema: {
    clave: texto('Clave', 50),
    nombre: texto('Nombre', 80, true),
    tipo_resultado: texto('Tipo de resultado', 20, true),
    unidad: texto('Unidad', 20, true),
    direccion_mejora: texto('Dirección de mejora', 20, true),
    rango_min: { tipo: 'numero', etiqueta: 'Rango objetivo mínimo' },
    rango_max: { tipo: 'numero', etiqueta: 'Rango objetivo máximo' },
    decimales: { tipo: 'entero', etiqueta: 'Decimales', min: 0, max: 4 },
    prioridad: { tipo: 'entero', etiqueta: 'Prioridad', min: 0, max: 100 },
  },
  orden: 'x.prioridad DESC, x.nombre',
  seleccion: 'SELECT x.*, (SELECT count(*)::int FROM resultados r WHERE r.metrica_id = x.id AND r.activo) AS resultados FROM metricas x',
  preparar: async (d, crudos, alcance, actual) => {
    enLista(d.tipo_resultado, TIPOS_RESULTADO, 'Tipo de resultado');
    enLista(d.direccion_mejora, DIRECCIONES, 'Dirección de mejora');
    if (d.direccion_mejora === 'TARGET_RANGE' && (d.rango_min === null && d.rango_max === null)) {
      throw new HttpError(400, 'Una métrica de rango objetivo necesita un mínimo, un máximo o ambos');
    }
    d.clave = actual?.clave || d.clave || claveDe(d.nombre);
    d.decimales = d.decimales ?? 2;
    d.prioridad = d.prioridad ?? 0;
    if (actual && (await contarResultados('metrica_id', actual.id))
      && ['tipo_resultado', 'unidad', 'direccion_mejora'].some((c) => d[c] !== actual[c])) {
      throw new HttpError(409, 'Esta métrica ya tiene resultados: no se puede cambiar su tipo, unidad ni dirección de mejora. Crea una métrica nueva.');
    }
    return d;
  },
});

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------
const PROTOCOLO = ['metrica_id', 'distancia_m', 'estilo', 'modo'];
const pruebas = crearCatalogo({
  tabla: 'pruebas',
  entidad: 'Prueba',
  esquema: {
    clave: texto('Clave', 50),
    nombre: texto('Nombre', 120, true),
    deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
    metrica_id: { tipo: 'entero', etiqueta: 'Métrica', requerido: true, min: 1 },
    capacidad: texto('Capacidad', 30, true),
    modo: texto('Modo', 20, true),
    distancia_m: { tipo: 'numero', etiqueta: 'Distancia (m)', min: 0.1, max: 200000 },
    estilo: texto('Estilo', 30),
    parcial_cada_m: { tipo: 'numero', etiqueta: 'Parcial cada (m)', min: 1, max: 10000 },
    intentos: { tipo: 'entero', etiqueta: 'Intentos', min: 1, max: 10 },
    criterio: texto('Criterio de intentos', 10),
    baremo_base: { tipo: 'numero', etiqueta: 'Valor de referencia (0 puntos)' },
    baremo_excelente: { tipo: 'numero', etiqueta: 'Valor de referencia (100 puntos)' },
    instrucciones: texto('Instrucciones', 1000),
  },
  referencias: { deporte_id: { tabla: 'deportes', etiqueta: 'El deporte' }, metrica_id: { tabla: 'metricas', etiqueta: 'La métrica' } },
  filtros: { metrica_id: 'metrica_id' },
  extras: ['campos'],
  orden: 'x.capacidad, x.nombre',
  seleccion: `SELECT x.*, m.nombre AS metrica, m.tipo_resultado, m.unidad, m.direccion_mejora, m.rango_min, m.rango_max, m.decimales,
    dp.nombre AS deporte, (SELECT count(*)::int FROM resultados r WHERE r.prueba_id = x.id AND r.activo) AS resultados
    FROM pruebas x JOIN metricas m ON m.id = x.metrica_id LEFT JOIN deportes dp ON dp.id = x.deporte_id`,
  preparar: async (d, crudos, alcance, actual) => {
    enLista(d.capacidad, Object.keys(CAPACIDADES), 'Capacidad');
    enLista(d.modo, MODOS, 'Modo');
    d.criterio = d.criterio || 'mejor';
    enLista(d.criterio, CRITERIOS_INTENTOS, 'Criterio de intentos');
    d.intentos = d.intentos || 1;
    d.clave = actual?.clave || d.clave || `${claveDe(d.nombre)}_${Date.now().toString(36).slice(-4)}`;
    if (d.baremo_base !== null && d.baremo_base === d.baremo_excelente) throw new HttpError(400, 'Los valores de referencia de 0 y 100 puntos deben ser distintos');
    if (crudos.campos !== undefined) {
      if (!Array.isArray(crudos.campos) || crudos.campos.some((c) => !c?.clave || !c?.etiqueta)) throw new HttpError(400, 'Formato de campos extra no válido');
      d.campos = JSON.stringify(crudos.campos.slice(0, 10).map((c) => ({ clave: claveDe(c.clave), etiqueta: String(c.etiqueta).slice(0, 60), tipo: ['numero', 'entero', 'texto'].includes(c.tipo) ? c.tipo : 'numero' })));
    } else {
      d.campos = JSON.stringify(actual?.campos || []);
    }
    if (actual && (await contarResultados('prueba_id', actual.id)) && PROTOCOLO.some((c) => (d[c] ?? null) !== (actual[c] ?? null))) {
      throw new HttpError(409, 'Esta prueba ya tiene resultados: no se puede cambiar su métrica, distancia, estilo ni modo (los resultados dejarían de ser comparables). Crea una prueba nueva.');
    }
    return d;
  },
});

/** Pruebas de un deporte: las suyas + las generales. */
async function pruebasDeDeporte(alcance, deporteId) {
  const lista = await pruebas.listar(alcance, {});
  return deporteId ? lista.filter((p) => p.deporte_id === deporteId || p.deporte_id === null) : lista;
}

// ---------------------------------------------------------------------------
// Plantillas de evaluación (versionadas)
// ---------------------------------------------------------------------------
const esquemaPlantilla = {
  nombre: texto('Nombre', 120, true),
  deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
  frecuencia_dias: { tipo: 'entero', etiqueta: 'Frecuencia (días)', min: 1, max: 365 },
};

async function validarPruebas(academia, ids, campo = 'pruebas') {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!lista.length) throw new HttpError(400, `La plantilla necesita al menos una prueba (${campo})`);
  const { rows } = await query('SELECT id FROM pruebas WHERE academia_id = $1 AND id = ANY($2::int[])', [academia, lista]);
  if (rows.length !== lista.length) throw new HttpError(400, 'Alguna prueba no existe en esta academia');
  return lista;
}

async function validarCategorias(academia, ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!lista.length) return [];
  const { rows } = await query('SELECT id FROM categorias WHERE academia_id = $1 AND id = ANY($2::int[])', [academia, lista]);
  if (rows.length !== lista.length) throw new HttpError(400, 'Alguna categoría no existe en esta academia');
  return lista;
}

async function listarPlantillas(alcance, { historial } = {}) {
  const { rows } = await query(
    `SELECT x.*, dp.nombre AS deporte, (SELECT count(*)::int FROM sesiones_evaluacion s WHERE s.plantilla_id = x.id) AS sesiones
     FROM plantillas_evaluacion x LEFT JOIN deportes dp ON dp.id = x.deporte_id
     WHERE x.academia_id = $1 ${historial ? '' : 'AND x.vigente'} ORDER BY x.nombre, x.version DESC`,
    [alcance.academia],
  );
  return rows;
}

async function crearPlantilla(alcance, datos, actor) {
  const d = validar(esquemaPlantilla, datos);
  if (d.deporte_id) {
    const { rows } = await query('SELECT 1 FROM deportes WHERE id = $1 AND academia_id = $2', [d.deporte_id, alcance.academia]);
    if (!rows.length) throw new HttpError(400, 'El deporte no existe en esta academia');
  }
  const ids = await validarPruebas(alcance.academia, datos.pruebas);
  const categorias = await validarCategorias(alcance.academia, datos.categorias);
  const { rows } = await query(
    `INSERT INTO plantillas_evaluacion (academia_id, deporte_id, nombre, pruebas, categorias, frecuencia_dias, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [alcance.academia, d.deporte_id, d.nombre, JSON.stringify(ids), JSON.stringify(categorias), d.frecuencia_dias, actor?.id ?? null],
  );
  return rows[0];
}

/** Editar = nueva versión. La anterior deja de estar vigente pero las sesiones que la usaron la conservan. */
async function nuevaVersionPlantilla(alcance, id, datos, actor) {
  const { rows: [actual] } = await query('SELECT * FROM plantillas_evaluacion WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
  if (!actual) throw noEncontrado('Plantilla');
  if (!actual.vigente) throw new HttpError(409, 'Solo se puede editar la versión vigente de la plantilla');
  const d = validar(esquemaPlantilla, { ...actual, ...datos });
  const ids = datos.pruebas !== undefined ? await validarPruebas(alcance.academia, datos.pruebas) : actual.pruebas;
  const categorias = datos.categorias !== undefined ? await validarCategorias(alcance.academia, datos.categorias) : actual.categorias;
  return transaccion(async (cliente) => {
    await cliente.query('UPDATE plantillas_evaluacion SET vigente = false WHERE id = $1', [id]);
    const { rows } = await cliente.query(
      `INSERT INTO plantillas_evaluacion (academia_id, deporte_id, grupo, version, nombre, pruebas, categorias, frecuencia_dias, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [alcance.academia, d.deporte_id, actual.grupo, actual.version + 1, d.nombre, JSON.stringify(ids), JSON.stringify(categorias), d.frecuencia_dias, actor?.id ?? null],
    );
    return rows[0];
  });
}

async function retirarPlantilla(alcance, id) {
  const { rowCount } = await query('UPDATE plantillas_evaluacion SET vigente = false WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
  if (!rowCount) throw noEncontrado('Plantilla');
}

// ---------------------------------------------------------------------------
// Puntuación (Performance Scoring Engine) versionada
// ---------------------------------------------------------------------------
async function validarScoring(academia, datos) {
  const d = validar({
    nombre: texto('Nombre', 120, true),
    deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
    categoria_id: { tipo: 'entero', etiqueta: 'Categoría', min: 1 },
    metodo: texto('Método', 10),
  }, datos);
  d.metodo = d.metodo || 'baremo';
  enLista(d.metodo, ['baremo', 'percentil'], 'Método');
  if (d.deporte_id) {
    const { rows } = await query('SELECT 1 FROM deportes WHERE id = $1 AND academia_id = $2', [d.deporte_id, academia]);
    if (!rows.length) throw new HttpError(400, 'El deporte no existe en esta academia');
  }
  if (d.categoria_id) {
    const { rows } = await query('SELECT 1 FROM categorias WHERE id = $1 AND academia_id = $2', [d.categoria_id, academia]);
    if (!rows.length) throw new HttpError(400, 'La categoría no existe en esta academia');
  }
  const pesos = datos.pesos || {};
  if (typeof pesos !== 'object' || Array.isArray(pesos)) throw new HttpError(400, 'Formato de pesos no válido');
  const limpios = {};
  for (const [capacidad, peso] of Object.entries(pesos)) {
    if (!(capacidad in CAPACIDADES)) throw new HttpError(400, `Capacidad desconocida en los pesos: ${capacidad}`);
    const n = Number(peso);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, `Peso no válido para ${capacidad} (0 a 100)`);
    if (n > 0) limpios[capacidad] = n;
  }
  if (!Object.keys(limpios).length) throw new HttpError(400, 'Asigna peso al menos a una capacidad');

  const baremos = {};
  const entrada = datos.baremos || {};
  const ids = Object.keys(entrada).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) {
    const { rows } = await query('SELECT id FROM pruebas WHERE academia_id = $1 AND id = ANY($2::int[])', [academia, ids]);
    if (rows.length !== ids.length) throw new HttpError(400, 'Algún baremo se refiere a una prueba que no existe en esta academia');
  }
  for (const id of ids) {
    const { base, excelente } = entrada[id] || {};
    const b = Number(base);
    const e = Number(excelente);
    if (!Number.isFinite(b) || !Number.isFinite(e) || b === e) throw new HttpError(400, `Baremo no válido para la prueba ${id}: base y excelente deben ser números distintos`);
    baremos[id] = { base: b, excelente: e };
  }
  return { ...d, pesos: limpios, baremos };
}

async function listarScoring(alcance, { historial } = {}) {
  const { rows } = await query(
    `SELECT x.*, dp.nombre AS deporte, c.nombre AS categoria, u.nombre AS creado_por_nombre,
            (SELECT count(*)::int FROM snapshots_rendimiento s WHERE s.scoring_id = x.id) AS calculos
     FROM configuraciones_scoring x LEFT JOIN deportes dp ON dp.id = x.deporte_id LEFT JOIN categorias c ON c.id = x.categoria_id
     LEFT JOIN usuarios u ON u.id = x.creado_por
     WHERE x.academia_id = $1 ${historial ? '' : 'AND x.vigente'} ORDER BY dp.nombre NULLS FIRST, c.nombre NULLS FIRST, x.version DESC`,
    [alcance.academia],
  );
  return rows;
}

async function crearScoring(alcance, datos, actor, reemplaza = null) {
  const d = await validarScoring(alcance.academia, datos);
  return transaccion(async (cliente) => {
    // Solo una configuración vigente por deporte y categoría
    const { rows: anteriores } = await cliente.query(
      `UPDATE configuraciones_scoring SET vigente = false
       WHERE academia_id = $1 AND vigente AND deporte_id IS NOT DISTINCT FROM $2 AND categoria_id IS NOT DISTINCT FROM $3
       RETURNING id, version`,
      [alcance.academia, d.deporte_id, d.categoria_id],
    );
    const version = Math.max(0, ...anteriores.map((a) => a.version), reemplaza?.version || 0) + 1;
    const { rows } = await cliente.query(
      `INSERT INTO configuraciones_scoring (academia_id, deporte_id, categoria_id, nombre, version, metodo, pesos, baremos, reemplaza_id, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [alcance.academia, d.deporte_id, d.categoria_id, d.nombre, version, d.metodo, JSON.stringify(d.pesos), JSON.stringify(d.baremos),
        reemplaza?.id ?? anteriores[0]?.id ?? null, actor?.id ?? null],
    );
    return rows[0];
  });
}

/** Cambiar la puntuación crea una versión nueva; los puntajes ya calculados conservan la suya. */
async function nuevaVersionScoring(alcance, id, datos, actor) {
  const { rows: [actual] } = await query('SELECT * FROM configuraciones_scoring WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
  if (!actual) throw noEncontrado('Configuración de puntuación');
  return crearScoring(alcance, {
    nombre: actual.nombre, deporte_id: actual.deporte_id, categoria_id: actual.categoria_id, metodo: actual.metodo,
    pesos: actual.pesos, baremos: actual.baremos, ...datos,
  }, actor, actual);
}

// ---------------------------------------------------------------------------
// Reglas de alerta
// ---------------------------------------------------------------------------
async function listarReglas(alcance) {
  const { rows } = await query('SELECT * FROM reglas_alerta WHERE academia_id = $1', [alcance.academia]);
  const guardadas = new Map(rows.map((r) => [r.tipo, r]));
  return Object.entries(REGLAS).map(([tipo, def]) => {
    const g = guardadas.get(tipo);
    return {
      tipo,
      nombre: def.nombre,
      descripcion: def.descripcion,
      parametros: { ...def.parametros, ...(g?.parametros || {}) },
      parametros_defecto: def.parametros,
      prioridad: g?.prioridad || def.prioridad,
      destinatarios: g?.destinatarios || ['coach', 'admin'],
      activa: g ? g.activa : true,
      version: g?.version || 0,
    };
  });
}

async function guardarRegla(alcance, tipo, datos = {}) {
  const def = REGLAS[tipo];
  if (!def) throw noEncontrado('Regla de alerta');
  const parametros = {};
  for (const [clave, defecto] of Object.entries(def.parametros)) {
    const valor = datos.parametros?.[clave];
    if (valor === undefined || valor === '') { parametros[clave] = defecto; continue; }
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, `Parámetro no válido: ${clave}`);
    parametros[clave] = n;
  }
  const prioridad = datos.prioridad || def.prioridad;
  enLista(prioridad, ['baja', 'media', 'alta'], 'Prioridad');
  const destinatarios = Array.isArray(datos.destinatarios) ? datos.destinatarios.filter((r) => ['coach', 'admin', 'profesional'].includes(r)) : ['coach', 'admin'];
  const { rows } = await query(
    `INSERT INTO reglas_alerta (academia_id, tipo, nombre, parametros, prioridad, destinatarios, activa)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (academia_id, tipo) DO UPDATE SET parametros = EXCLUDED.parametros, prioridad = EXCLUDED.prioridad,
       destinatarios = EXCLUDED.destinatarios, activa = EXCLUDED.activa, version = reglas_alerta.version + 1, actualizado_en = now()
     RETURNING *`,
    [alcance.academia, tipo, def.nombre, JSON.stringify(parametros), prioridad, JSON.stringify(destinatarios), datos.activa !== false],
  );
  return rows[0];
}

module.exports = {
  metricas, pruebas, pruebasDeDeporte,
  listarPlantillas, crearPlantilla, nuevaVersionPlantilla, retirarPlantilla,
  listarScoring, crearScoring, nuevaVersionScoring,
  listarReglas, guardarRegla,
  CAPACIDADES,
};
