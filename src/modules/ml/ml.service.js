/**
 * Machine Learning: entrena un Random Forest que clasifica el nivel de
 * rendimiento (Bajo / Medio / Alto) a partir de las 8 capacidades evaluadas.
 * Cada coach tiene su propio modelo, guardado como JSON en la tabla modelos_ml.
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { redondear } = require('../../utils/valores');
const {
  CAPACIDADES, NIVELES, esCompleta, nivelDe, puntajes, puntuacionDe,
} = require('../../domain/rendimiento');
const deportistas = require('../deportistas/deportistas.service');
const { generarRecomendacion } = require('../ia/reglas');
const bosque = require('./random-forest');

const MIN_REGISTROS_REALES = 15;
const CONFIG_MODELO = { arboles: 100, profundidadMax: 8, semilla: 42 };

const filaDe = (evaluacion) => CAPACIDADES.map((c) => evaluacion[c]);

/** Evaluaciones completas del coach: X = capacidades, y = nivel según la puntuación. */
function datasetReal(academia) {
  const X = [];
  const y = [];
  for (const ev of academia.flatMap((d) => d.evaluaciones)) {
    const nivel = esCompleta(ev) ? nivelDe(puntuacionDe(ev)) : null;
    if (nivel) {
      X.push(filaDe(ev));
      y.push(nivel);
    }
  }
  return { X, y };
}

/**
 * DATOS FICTICIOS DE DEMOSTRACIÓN (no son deportistas reales). Solo se usan si el
 * coach lo permite y todavía no hay suficientes evaluaciones reales.
 */
function datasetDemo(cantidad = 150, semilla = 42) {
  const aleatorio = bosque.crearAleatorio(semilla);
  const normal = (media, desviacion) => {
    const u = 1 - aleatorio();
    const v = aleatorio();
    return media + desviacion * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const X = [];
  const y = [];
  for (let i = 0; i < cantidad; i += 1) {
    const latente = 20 + aleatorio() * 75;
    const fila = CAPACIDADES.map(() => Math.min(100, Math.max(0, normal(latente, 10))));
    X.push(fila);
    y.push(nivelDe(fila.reduce((s, v) => s + v, 0) / fila.length));
  }
  return { X, y };
}

/**
 * Los modelos se guardan por "clave": el id del coach, o el del administrador cuando
 * entrena con los datos de todos los coaches (alcance null).
 */
async function cargarModelo(alcance, clave) {
  const { rows } = await query('SELECT modelo, info FROM modelos_ml WHERE academia_id = $1 AND usuario_id = $2', [alcance.academia, clave]);
  return rows[0] || null;
}

async function entrenar(alcance, { usarDemo = false, clave } = {}) {
  const academia = await deportistas.cargarAcademia(alcance);
  const real = datasetReal(academia);
  let { X, y } = real;
  const esDemo = X.length < MIN_REGISTROS_REALES;

  if (esDemo) {
    if (!usarDemo) {
      throw new HttpError(400, `Solo hay ${X.length} evaluaciones completas. Se necesitan al menos `
        + `${MIN_REGISTROS_REALES} para entrenar, o activa la opción de datos de demostración.`);
    }
    const demo = datasetDemo();
    X = [...X, ...demo.X];
    y = [...y, ...demo.y];
  }

  if (new Set(y).size < 2) {
    throw new HttpError(400, 'Los datos solo contienen un nivel de rendimiento. '
      + 'Registra evaluaciones más variadas o activa los datos de demostración.');
  }

  const { entrenamiento, prueba } = bosque.dividirEstratificado(y, 0.25, CONFIG_MODELO.semilla);
  const modelo = bosque.entrenar(entrenamiento.map((i) => X[i]), entrenamiento.map((i) => y[i]), CONFIG_MODELO);
  const reales = prueba.map((i) => y[i]);
  const predichas = prueba.map((i) => bosque.predecir(modelo, X[i]).clase);
  const metricas = bosque.evaluar(reales, predichas, modelo.clases);

  const info = {
    entrenado_en: new Date().toISOString(),
    total_registros: X.length,
    registros_reales: real.X.length,
    registros_prueba: prueba.length,
    exactitud_pct: redondear(metricas.exactitud * 100),
    metricas_por_clase: metricas.porClase,
    importancia_variables: Object.fromEntries(CAPACIDADES.map((c, i) => [c, redondear(modelo.importancias[i], 4)])),
    clases: modelo.clases,
    es_demo: esDemo,
  };

  await query(
    `INSERT INTO modelos_ml (academia_id, usuario_id, modelo, info, entrenado_en) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (academia_id, usuario_id) DO UPDATE SET modelo = EXCLUDED.modelo, info = EXCLUDED.info, entrenado_en = now()`,
    [alcance.academia, clave, JSON.stringify(modelo), JSON.stringify(info)],
  );
  return info;
}

/** Genera una predicción por deportista usando su última evaluación completa. */
async function predecirTodos(alcance, { clave } = {}) {
  const guardado = await cargarModelo(alcance, clave);
  if (!guardado) throw new HttpError(400, 'Primero debes entrenar el modelo de Machine Learning.');
  const { modelo, info } = guardado;

  const academia = await deportistas.cargarAcademia(alcance);
  const filas = [];
  let sinDatos = 0;

  for (const dep of academia) {
    const evaluacion = [...dep.evaluaciones].reverse().find(esCompleta);
    if (!evaluacion) {
      sinDatos += 1;
      continue;
    }
    const resultado = bosque.predecir(modelo, filaDe(evaluacion));
    const scores = puntajes(evaluacion);
    filas.push([
      dep.id,
      puntuacionDe(evaluacion),
      resultado.clase,
      redondear(resultado.probabilidad * 100),
      JSON.stringify(Object.fromEntries(Object.entries(resultado.probabilidades).map(([k, v]) => [k, redondear(v * 100)]))),
      generarRecomendacion(scores),
      JSON.stringify(scores),
      info.es_demo,
    ]);
  }

  if (filas.length) {
    const columnas = 8;
    await query(
      `INSERT INTO predicciones (deportista_id, rendimiento_predicho, nivel, confianza, probabilidades,
                                 recomendacion, variables, modelo_demo)
       VALUES ${filas.map((_, i) => `(${Array.from({ length: columnas }, (__, j) => `$${i * columnas + j + 1}`).join(', ')})`).join(', ')}`,
      filas.flat(),
    );
  }

  return {
    procesados: filas.length,
    sin_datos_completos: sinDatos,
    es_demo: info.es_demo,
    mensaje: `Predicciones generadas para ${filas.length} deportista(s).`
      + (sinDatos ? ` ${sinDatos} sin evaluación completa.` : ''),
  };
}

/** Última predicción de cada deportista activo del coach. */
async function ultimasPredicciones(alcance, { deportistaId = null, limite = 50 } = {}) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (p.deportista_id) p.*, d.codigo, d.nombre, d.categoria
       FROM predicciones p JOIN deportistas d ON d.id = p.deportista_id
       WHERE d.academia_id = $1 AND ($2::int IS NULL OR d.usuario_id = $2) AND d.activo AND ($3::int IS NULL OR d.id = $3)
       ORDER BY p.deportista_id, p.fecha DESC, p.id DESC
     ) ultimas ORDER BY fecha DESC LIMIT $4`,
    [alcance.academia, alcance.coach, deportistaId, limite],
  );
  return rows;
}

async function estado(alcance, { clave } = {}) {
  const [guardado, academia, predicciones] = await Promise.all([
    query('SELECT info FROM modelos_ml WHERE academia_id = $1 AND usuario_id = $2', [alcance.academia, clave]),
    deportistas.cargarAcademia(alcance),
    ultimasPredicciones(alcance, { limite: 20 }),
  ]);
  return {
    info: guardado.rows[0]?.info || null,
    total_evaluaciones: academia.reduce((s, d) => s + d.total_evaluaciones, 0),
    evaluaciones_completas: datasetReal(academia).X.length,
    minimo_requerido: MIN_REGISTROS_REALES,
    niveles: NIVELES,
    predicciones,
  };
}

module.exports = { MIN_REGISTROS_REALES, entrenar, predecirTodos, ultimasPredicciones, estado };
