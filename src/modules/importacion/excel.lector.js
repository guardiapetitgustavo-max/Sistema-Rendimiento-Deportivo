/**
 * Lectura de Excel (.xlsx): reconoce los encabezados del coach (con tildes,
 * mayúsculas o alias) y los convierte al nombre interno de cada campo.
 */
const ExcelJS = require('exceljs');
const { CAPACIDADES } = require('../../domain/rendimiento');

const CAMPOS = [
  'codigo', 'nombre', 'edad', 'categoria', 'disciplina', 'fecha',
  ...CAPACIDADES, 'puntuacion_general', 'observaciones',
];

const ALIAS = {
  cod: 'codigo', code: 'codigo', codigo_deportista: 'codigo',
  nombres: 'nombre', name: 'nombre', nombre_completo: 'nombre', nombre_apellido: 'nombre',
  anos: 'edad', age: 'edad',
  categoria_edad: 'categoria', category: 'categoria',
  disciplina_deportiva: 'disciplina', deporte: 'disciplina', sport: 'disciplina',
  fecha_evaluacion: 'fecha', fecha_de_evaluacion: 'fecha', date: 'fecha',
  velocidad_score: 'velocidad', resistencia_score: 'resistencia', fuerza_score: 'fuerza',
  agilidad_score: 'agilidad', coordinacion_score: 'coordinacion', tecnica_score: 'tecnica',
  disciplina_puntaje: 'disciplina_score', puntaje_disciplina: 'disciplina_score',
  asistencia_pct: 'asistencia', asistencia_porcentaje: 'asistencia',
  puntuacion: 'puntuacion_general', puntaje_general: 'puntuacion_general',
  puntuacion_final: 'puntuacion_general', score_general: 'puntuacion_general',
  observacion: 'observaciones', comentarios: 'observaciones', comentario: 'observaciones',
};

/** 'Fecha de Evaluación' → 'fecha_de_evaluacion' */
function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function campoDe(encabezado) {
  const normal = normalizarEncabezado(encabezado);
  const campo = ALIAS[normal] || normal;
  return CAMPOS.includes(campo) ? campo : null;
}

/** Valor "plano" de una celda de ExcelJS (fórmulas, texto enriquecido, enlaces). */
function valorCelda(valor) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date || typeof valor !== 'object') return valor;
  if ('result' in valor) return valorCelda(valor.result);
  if (Array.isArray(valor.richText)) return valor.richText.map((p) => p.text).join('');
  if ('text' in valor) return valor.text;
  return null;
}

/**
 * Lee la primera hoja. Devuelve { campos, extras, filas } donde cada fila es
 * { numero (fila real de Excel), datos: {campo: valor} }.
 */
async function leerExcel(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error('el archivo no tiene hojas');

  const columnas = [];
  const extras = [];
  hoja.getRow(1).eachCell((celda, indice) => {
    const texto = valorCelda(celda.value);
    const campo = campoDe(texto);
    if (campo && !columnas.some((c) => c.campo === campo)) columnas.push({ indice, campo });
    else if (texto !== null && String(texto).trim()) extras.push(String(texto));
  });

  const filas = [];
  hoja.eachRow((fila, numero) => {
    if (numero === 1) return;
    const datos = {};
    for (const { indice, campo } of columnas) datos[campo] = valorCelda(fila.getCell(indice).value);
    const tieneDatos = Object.values(datos).some((v) => v !== null && String(v).trim() !== '');
    if (tieneDatos) filas.push({ numero, datos });
  });

  return { campos: columnas.map((c) => c.campo), extras, filas };
}

module.exports = { CAMPOS, leerExcel };
