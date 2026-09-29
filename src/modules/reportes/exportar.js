/**
 * Exportación de reportes tabulares a Excel (.xlsx) y PDF.
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { formatearFecha, hoyISO } = require('../../utils/valores');

const COLOR_PRIMARIO = '#19376d';
const COLOR_FILA_ALTERNA = '#eef3fb';
const ACADEMIA = 'SportEval AI · Academia Deportiva';

/** Libro Excel con una hoja por cada { titulo, columnas, filas } recibido. */
async function aExcel(hojas) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SportEval AI';
  for (const { nombre, columnas, filas } of hojas) {
    const hoja = libro.addWorksheet(nombre.slice(0, 31));
    hoja.addRow(columnas);
    filas.forEach((fila) => hoja.addRow(fila));
    const cabecera = hoja.getRow(1);
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19376D' } };
    hoja.columns.forEach((columna, i) => {
      const largo = Math.max(String(columnas[i]).length, ...filas.map((f) => String(f[i] ?? '').length));
      columna.width = Math.min(60, Math.max(10, largo + 2));
    });
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Crea un documento PDF y devuelve una promesa con el Buffer final. */
function crearPdf(opciones, dibujar) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, ...opciones });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    dibujar(doc);
    doc.end();
  });
}

function encabezado(doc, titulo, subtitulo) {
  doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(16).text(ACADEMIA);
  doc.fontSize(12).text(titulo);
  doc.fillColor('#555555').font('Helvetica').fontSize(8)
    .text(`Generado el ${formatearFecha(hoyISO())}. ${subtitulo}`);
  doc.moveDown(0.8);
}

/** Dibuja una tabla con cabecera repetida en cada página y filas con ajuste de texto. */
function tabla(doc, columnas, filas, { tamano = 7.5 } = {}) {
  const x0 = doc.page.margins.left;
  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const largo = columnas.map((c, i) => Math.max(String(c).length, ...filas.map((f) => String(f[i] ?? '').length)));
  const pesos = largo.map((l) => Math.min(Math.max(l, 4), 40));
  const total = pesos.reduce((s, p) => s + p, 0);
  const anchos = pesos.map((p) => (p / total) * ancho);
  const relleno = 3;

  const altoFila = (celdas, fuente) => {
    doc.font(fuente).fontSize(tamano);
    return Math.max(...celdas.map((c, i) => doc.heightOfString(String(c ?? ''), { width: anchos[i] - 2 * relleno }))) + 2 * relleno;
  };

  const dibujarFila = (celdas, { fuente = 'Helvetica', fondo = null, colorTexto = '#222222' } = {}) => {
    const alto = altoFila(celdas, fuente);
    if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (fuente === 'Helvetica') dibujarCabecera();
    }
    const y = doc.y;
    let x = x0;
    celdas.forEach((celda, i) => {
      if (fondo) doc.rect(x, y, anchos[i], alto).fill(fondo);
      doc.rect(x, y, anchos[i], alto).lineWidth(0.4).stroke('#b0b7c3');
      doc.fillColor(colorTexto).font(fuente).fontSize(tamano)
        .text(String(celda ?? ''), x + relleno, y + relleno, { width: anchos[i] - 2 * relleno });
      x += anchos[i];
    });
    doc.x = x0;
    doc.y = y + alto;
  };

  function dibujarCabecera() {
    dibujarFila(columnas, { fuente: 'Helvetica-Bold', fondo: COLOR_PRIMARIO, colorTexto: '#ffffff' });
  }

  dibujarCabecera();
  filas.forEach((fila, i) => dibujarFila(fila, { fondo: i % 2 ? COLOR_FILA_ALTERNA : null }));
  doc.moveDown(0.8);
}

function reporteAPdf({ titulo, columnas, filas }) {
  return crearPdf({ layout: 'landscape' }, (doc) => {
    encabezado(doc, titulo, 'Documento de apoyo al entrenamiento basado en observación directa. No constituye diagnóstico médico.');
    if (filas.length) tabla(doc, columnas, filas);
    else doc.font('Helvetica').fontSize(10).fillColor('#222222').text('No hay datos para este reporte.');
  });
}

function rutinaAPdf(rutina) {
  return crearPdf({}, (doc) => {
    const { deportista } = rutina;
    encabezado(
      doc,
      `Rutina de entrenamiento: ${deportista.nombre} (${deportista.codigo})`,
      `Disciplina: ${rutina.disciplina} · Enfoque: ${rutina.enfoque} · Nivel actual: ${rutina.nivel}. `
        + 'Guía de apoyo; no es una indicación médica.',
    );
    const subtitulo = (texto) => doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(10).text(texto).moveDown(0.3);
    const vineta = (texto) => doc.fillColor('#222222').font('Helvetica').fontSize(9).text(`• ${texto}`).moveDown(0.2);

    for (const bloque of rutina.bloques) {
      subtitulo(`${bloque.dia}: ${bloque.enfoque}`);
      tabla(doc, ['Ejercicio', 'Dosis', 'Descanso', 'Objetivo'], bloque.ejercicios, { tamano: 8.5 });
    }
    if (rutina.refuerzos.length) {
      subtitulo('Refuerzo de aspectos por mejorar');
      rutina.refuerzos.forEach((r) => vineta(`${r.capacidad}: ${r.ejercicio} (${r.dosis}). ${r.nota}.`));
      doc.moveDown(0.5);
    }
    subtitulo('Recomendaciones');
    rutina.recomendaciones.forEach(vineta);
  });
}

module.exports = { aExcel, reporteAPdf, rutinaAPdf };
