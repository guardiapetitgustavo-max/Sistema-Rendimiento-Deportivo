/**
 * Importación de evaluaciones desde Excel en dos pasos:
 * 1) previsualizar: lee y valida el archivo, sin guardar nada.
 * 2) importar: vuelve a validar los registros confirmados y los guarda en una transacción.
 * Así no se necesitan archivos temporales en el servidor (compatible con Vercel).
 */
const { transaccion } = require('../../db/pool');
const { HttpError, solicitudInvalida } = require('../../utils/http-error');
const { revisar } = require('../../utils/validar');
const { formatearFecha, hoyISO } = require('../../utils/valores');
const deportistas = require('../deportistas/deportistas.service');
const evaluaciones = require('../evaluaciones/evaluaciones.service');
const { aExcel } = require('../reportes/exportar');
const { CAMPOS, leerExcel } = require('./excel.lector');

const MAX_REGISTROS = 5000;
const ESQUEMA_FILA = { ...deportistas.esquema, ...evaluaciones.esquema };

/** Valida una fila. Devuelve { registro } o { errores: [{columna, mensaje}] }. */
function validarFila(datos) {
  const { limpio, errores } = revisar(ESQUEMA_FILA, datos);
  if (errores.length) return { errores: errores.map((e) => ({ columna: e.etiqueta, mensaje: e.mensaje })) };
  return { registro: { ...limpio, fecha: limpio.fecha || hoyISO() } };
}

const paraMostrar = (valor) => (valor instanceof Date ? formatearFecha(valor.toISOString()) : valor ?? '');

async function previsualizar(buffer) {
  let lectura;
  try {
    lectura = await leerExcel(buffer);
  } catch (error) {
    throw solicitudInvalida(`No se pudo leer el archivo: ${error.message}`);
  }
  const { campos, extras, filas } = lectura;

  const faltantes = ['codigo', 'nombre'].filter((c) => !campos.includes(c));
  if (faltantes.length) {
    throw solicitudInvalida('El archivo no tiene las columnas obligatorias', faltantes.map((c) => `Falta la columna "${c}"`));
  }
  if (filas.length > MAX_REGISTROS) throw solicitudInvalida(`El archivo supera el máximo de ${MAX_REGISTROS} filas`);

  const registros = [];
  const errores = [];
  for (const { numero, datos } of filas) {
    const resultado = validarFila(datos);
    if (resultado.registro) registros.push(resultado.registro);
    else resultado.errores.forEach((e) => errores.push({ fila: numero, ...e }));
  }

  return {
    columnas_detectadas: campos,
    columnas_extra: extras,
    total_filas: filas.length,
    filas_validas: registros.length,
    filas_con_error: new Set(errores.map((e) => e.fila)).size,
    errores,
    vista_previa: filas.slice(0, 100).map(({ numero, datos }) => ({
      fila: numero,
      ...Object.fromEntries(campos.map((c) => [c, paraMostrar(datos[c])])),
    })),
    registros,
  };
}

/**
 * Guarda los registros confirmados. Crea deportistas nuevos, actualiza los
 * existentes, reactiva a los dados de baja que reaparecen y, si se pide, da de
 * baja a los que no están en el archivo (conservando su historial).
 */
async function importar(alcance, { registros, baja_ausentes: bajaAusentes = false } = {}) {
  const { academia, coach } = alcance; // coach concreto (obligatorio): dueño de los deportistas importados
  if (!Array.isArray(registros) || !registros.length) throw solicitudInvalida('No hay registros para importar');
  if (registros.length > MAX_REGISTROS) throw solicitudInvalida(`Máximo ${MAX_REGISTROS} registros por importación`);

  const validados = registros.map((r, i) => {
    const resultado = validarFila(r);
    if (!resultado.registro) throw new HttpError(400, `El registro ${i + 1} no es válido. Vuelve a subir el archivo.`);
    return resultado.registro;
  });

  // El último registro de cada código define los datos personales del deportista
  const porCodigo = new Map(validados.map((r) => [r.codigo, r]));

  return transaccion(async (cliente) => {
    const { rows: previos } = await cliente.query(
      'SELECT codigo, activo, usuario_id FROM deportistas WHERE academia_id = $1 AND codigo = ANY($2::text[])',
      [academia, [...porCodigo.keys()]],
    );
    // Un código activo de otro coach no se toma: evitaría "robar" deportistas ajenos
    const ajenos = previos.filter((p) => p.activo && p.usuario_id !== coach).map((p) => p.codigo);
    if (ajenos.length) {
      throw new HttpError(409, `Estos códigos ya pertenecen a deportistas de otro coach de la academia: ${ajenos.slice(0, 10).join(', ')}`);
    }
    const estadoPrevio = new Map(previos.map((p) => [p.codigo, p.activo]));

    const ids = new Map();
    for (const r of porCodigo.values()) {
      const { rows } = await cliente.query(
        `INSERT INTO deportistas (academia_id, usuario_id, codigo, nombre, edad, categoria, disciplina)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (academia_id, codigo) DO UPDATE SET
           usuario_id = EXCLUDED.usuario_id,
           nombre = EXCLUDED.nombre,
           edad = COALESCE(EXCLUDED.edad, deportistas.edad),
           categoria = COALESCE(EXCLUDED.categoria, deportistas.categoria),
           disciplina = COALESCE(EXCLUDED.disciplina, deportistas.disciplina),
           activo = true
         RETURNING id`,
        [academia, coach, r.codigo, r.nombre, r.edad, r.categoria, r.disciplina],
      );
      ids.set(r.codigo, rows[0].id);
    }

    await evaluaciones.insertarVarias(cliente, validados.map((r) => ({
      deportistaId: ids.get(r.codigo), datos: r, origen: 'excel',
    })));

    let dadosDeBaja = 0;
    if (bajaAusentes === true) {
      const { rowCount } = await cliente.query(
        `UPDATE deportistas SET activo = false
         WHERE academia_id = $1 AND usuario_id = $2 AND activo AND NOT (codigo = ANY($3::text[]))`,
        [academia, coach, [...porCodigo.keys()]],
      );
      dadosDeBaja = rowCount;
    }

    const resumen = {
      deportistas: porCodigo.size,
      nuevos: [...porCodigo.keys()].filter((c) => !estadoPrevio.has(c)).length,
      reactivados: [...porCodigo.keys()].filter((c) => estadoPrevio.get(c) === false).length,
      evaluaciones: validados.length,
      dados_de_baja: dadosDeBaja,
    };
    resumen.mensaje = `Importación completada: ${resumen.deportistas} deportistas (${resumen.nuevos} nuevos) `
      + `y ${resumen.evaluaciones} evaluaciones registradas.`
      + (resumen.reactivados ? ` ${resumen.reactivados} reactivado(s) con su historial.` : '')
      + (resumen.dados_de_baja ? ` ${resumen.dados_de_baja} ausente(s) dado(s) de baja (su información se conserva).` : '');
    return resumen;
  });
}

/** Plantilla de ejemplo con la estructura esperada y una hoja de instrucciones. */
function plantilla() {
  const descripcion = {
    codigo: 'Código único del deportista (obligatorio)',
    nombre: 'Nombre completo (obligatorio)',
    edad: 'Edad en años (4 a 100)',
    categoria: 'Ej: Sub-15, Sub-16, Sub-17, Libre',
    disciplina: 'Ej: Fútbol, Vóley, Básquet, Atletismo',
    fecha: 'Fecha DD/MM/AAAA (si falta, se usa la fecha de hoy)',
    disciplina_score: 'Puntaje de disciplina/comportamiento 0-100',
    asistencia: 'Porcentaje de asistencia 0-100',
    puntuacion_general: 'Opcional: si se deja vacía se calcula el promedio',
    observaciones: 'Opcional: comentarios del coach',
  };
  return aExcel([
    {
      nombre: 'Evaluaciones',
      columnas: CAMPOS,
      filas: [
        ['DEP-001', 'Juan Pérez Ramos', 15, 'Sub-16', 'Fútbol', '05/03/2026', 78, 72, 70, 80, 75, 74, 85, 95, null, 'Buena técnica de carrera'],
        ['DEP-002', 'María Quispe Huamán', 14, 'Sub-15', 'Vóley', '05/03/2026', 70, 68, 65, 78, 88, 82, 90, 100, null, 'Destaca en coordinación'],
        ['DEP-003', 'Luis Torres Salas', 16, 'Sub-17', 'Básquet', '05/03/2026', 82, 60, 75, 70, 72, 68, 78, 88, null, 'Mejorar resistencia aeróbica'],
      ],
    },
    {
      nombre: 'Instrucciones',
      columnas: ['Campo', 'Descripción'],
      filas: CAMPOS.map((c) => [c, descripcion[c] || 'Puntaje 0-100 por observación directa']),
    },
  ]);
}

module.exports = { previsualizar, importar, plantilla };
