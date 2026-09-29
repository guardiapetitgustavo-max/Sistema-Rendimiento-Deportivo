/**
 * Random Forest Classifier implementado en JavaScript puro (sin dependencias),
 * para que el modelo se pueda entrenar dentro de una función serverless de Vercel
 * y guardarse como JSON en la base de datos.
 *
 * - Árboles CART con índice de Gini.
 * - Bootstrap de muestras y subconjunto aleatorio de variables en cada división (√n).
 * - Probabilidad por clase = promedio de las hojas de todos los árboles.
 * - Importancia de variables = disminución media de impureza (igual que scikit-learn).
 */

/** Generador pseudoaleatorio con semilla (mulberry32): resultados reproducibles. */
function crearAleatorio(semilla = 42) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar(lista, aleatorio) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function gini(conteos, total) {
  if (!total) return 0;
  let suma = 0;
  for (const c of conteos) suma += (c / total) ** 2;
  return 1 - suma;
}

function contarClases(indices, y, nClases) {
  const conteos = new Array(nClases).fill(0);
  for (const i of indices) conteos[y[i]] += 1;
  return conteos;
}

/** Busca la mejor división (variable + umbral) entre las variables candidatas. */
function mejorDivision(indices, X, y, nClases, variables) {
  const total = indices.length;
  const giniPadre = gini(contarClases(indices, y, nClases), total);
  let mejor = null;

  for (const f of variables) {
    const ordenados = [...indices].sort((a, b) => X[a][f] - X[b][f]);
    const izquierda = new Array(nClases).fill(0);
    const derecha = contarClases(ordenados, y, nClases);

    for (let k = 0; k < total - 1; k += 1) {
      const clase = y[ordenados[k]];
      izquierda[clase] += 1;
      derecha[clase] -= 1;
      const actual = X[ordenados[k]][f];
      const siguiente = X[ordenados[k + 1]][f];
      if (actual === siguiente) continue;

      const nIzq = k + 1;
      const nDer = total - nIzq;
      const disminucion = total * giniPadre - nIzq * gini(izquierda, nIzq) - nDer * gini(derecha, nDer);
      if (disminucion > 1e-12 && (!mejor || disminucion > mejor.disminucion)) {
        mejor = { f, umbral: (actual + siguiente) / 2, disminucion };
      }
    }
  }
  return mejor;
}

function construirArbol(indices, X, y, config, profundidad, importancias, aleatorio) {
  const conteos = contarClases(indices, y, config.nClases);
  const hoja = () => ({ p: conteos.map((c) => Number((c / indices.length).toFixed(4))) });
  const esPura = conteos.filter((c) => c > 0).length <= 1;
  if (esPura || profundidad >= config.profundidadMax || indices.length < config.minMuestrasDivision) return hoja();

  const candidatas = barajar(config.variables, aleatorio).slice(0, config.variablesPorDivision);
  const division = mejorDivision(indices, X, y, config.nClases, candidatas);
  if (!division) return hoja();

  importancias[division.f] += division.disminucion;
  const izq = indices.filter((i) => X[i][division.f] <= division.umbral);
  const der = indices.filter((i) => X[i][division.f] > division.umbral);
  return {
    f: division.f,
    t: Number(division.umbral.toFixed(4)),
    l: construirArbol(izq, X, y, config, profundidad + 1, importancias, aleatorio),
    r: construirArbol(der, X, y, config, profundidad + 1, importancias, aleatorio),
  };
}

/**
 * Entrena el bosque. X: matriz de números, y: etiquetas (texto).
 * Devuelve un objeto JSON serializable: { clases, arboles, importancias }.
 */
function entrenar(X, y, { arboles = 100, profundidadMax = 8, minMuestrasDivision = 2, semilla = 42 } = {}) {
  const aleatorio = crearAleatorio(semilla);
  const clases = [...new Set(y)].sort();
  const yIndice = y.map((etiqueta) => clases.indexOf(etiqueta));
  const nVariables = X[0].length;
  const config = {
    nClases: clases.length,
    profundidadMax,
    minMuestrasDivision,
    variables: [...Array(nVariables).keys()],
    variablesPorDivision: Math.max(1, Math.round(Math.sqrt(nVariables))),
  };

  const importanciaTotal = new Array(nVariables).fill(0);
  const bosque = [];
  for (let a = 0; a < arboles; a += 1) {
    const muestra = Array.from({ length: X.length }, () => Math.floor(aleatorio() * X.length));
    const importancias = new Array(nVariables).fill(0);
    bosque.push(construirArbol(muestra, X, yIndice, config, 0, importancias, aleatorio));
    const suma = importancias.reduce((s, v) => s + v, 0);
    if (suma > 0) importancias.forEach((v, i) => { importanciaTotal[i] += v / suma; });
  }

  const sumaTotal = importanciaTotal.reduce((s, v) => s + v, 0) || 1;
  return { clases, arboles: bosque, importancias: importanciaTotal.map((v) => v / sumaTotal) };
}

function recorrer(nodo, x) {
  let actual = nodo;
  while (!actual.p) actual = x[actual.f] <= actual.t ? actual.l : actual.r;
  return actual.p;
}

/** Probabilidad de cada clase para una fila de variables: { clase: probabilidad 0-1 }. */
function predecirProbabilidades(modelo, x) {
  const suma = new Array(modelo.clases.length).fill(0);
  for (const arbol of modelo.arboles) recorrer(arbol, x).forEach((p, i) => { suma[i] += p; });
  return Object.fromEntries(modelo.clases.map((c, i) => [c, suma[i] / modelo.arboles.length]));
}

function predecir(modelo, x) {
  const probabilidades = predecirProbabilidades(modelo, x);
  const [clase, probabilidad] = Object.entries(probabilidades).sort((a, b) => b[1] - a[1])[0];
  return { clase, probabilidad, probabilidades };
}

/** División entrenamiento/prueba estratificada por clase (como scikit-learn). */
function dividirEstratificado(y, proporcionPrueba = 0.25, semilla = 42) {
  const aleatorio = crearAleatorio(semilla);
  const porClase = new Map();
  y.forEach((etiqueta, i) => porClase.set(etiqueta, [...(porClase.get(etiqueta) || []), i]));

  const entrenamiento = [];
  const prueba = [];
  for (const indices of porClase.values()) {
    const mezclados = barajar(indices, aleatorio);
    const nPrueba = mezclados.length >= 2 ? Math.max(1, Math.round(mezclados.length * proporcionPrueba)) : 0;
    prueba.push(...mezclados.slice(0, nPrueba));
    entrenamiento.push(...mezclados.slice(nPrueba));
  }
  return { entrenamiento, prueba };
}

/** Exactitud y precisión / sensibilidad / F1 por clase. */
function evaluar(reales, predichas, clases) {
  const aciertos = reales.filter((r, i) => r === predichas[i]).length;
  const porClase = {};
  for (const clase of clases) {
    const vp = reales.filter((r, i) => r === clase && predichas[i] === clase).length;
    const predichasClase = predichas.filter((p) => p === clase).length;
    const soporte = reales.filter((r) => r === clase).length;
    const precision = predichasClase ? vp / predichasClase : 0;
    const sensibilidad = soporte ? vp / soporte : 0;
    const f1 = precision + sensibilidad ? (2 * precision * sensibilidad) / (precision + sensibilidad) : 0;
    porClase[clase] = { precision, sensibilidad, f1, soporte };
  }
  return { exactitud: reales.length ? aciertos / reales.length : 0, porClase };
}

module.exports = { crearAleatorio, entrenar, predecir, dividirEstratificado, evaluar };
