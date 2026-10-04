/**
 * Pruebas unitarias de la lógica del sistema (no necesitan base de datos).
 * Ejecutar: npm test
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { parsearFecha, parsearNumero, formatearFecha } = require('../src/utils/valores');
const { validar, revisar, idValido } = require('../src/utils/validar');
const rendimiento = require('../src/domain/rendimiento');
const bosque = require('../src/modules/ml/random-forest');
const { generarRutina } = require('../src/modules/rutinas/rutinas.service');
const { alertasDe } = require('../src/modules/alertas/alertas.service');
const reglas = require('../src/modules/ia/reglas');
const { leerExcel } = require('../src/modules/importacion/excel.lector');
const { manejadorErrores } = require('../src/middlewares/errores');
const { HttpError } = require('../src/utils/http-error');

const evaluacion = (valores, extra = {}) => ({
  ...Object.fromEntries(rendimiento.CAPACIDADES.map((c, i) => [c, valores[i] ?? null])),
  puntuacion_general: null,
  fecha: '2026-03-01',
  ...extra,
});

describe('valores', () => {
  test('convierte fechas en distintos formatos', () => {
    assert.equal(parsearFecha('05/03/2026'), '2026-03-05');
    assert.equal(parsearFecha('2026-03-05'), '2026-03-05');
    assert.equal(parsearFecha('5-3-26'), '2026-03-05');
    assert.equal(parsearFecha(new Date(Date.UTC(2026, 2, 5))), '2026-03-05');
    assert.equal(parsearFecha(''), null);
  });

  test('rechaza fechas imposibles', () => {
    assert.throws(() => parsearFecha('31/02/2026'));
    assert.throws(() => parsearFecha('hola'));
  });

  test('convierte números con coma y porcentaje', () => {
    assert.equal(parsearNumero('12,5'), 12.5);
    assert.equal(parsearNumero('80%'), 80);
    assert.equal(parsearNumero(null), null);
    assert.throws(() => parsearNumero('abc'));
  });

  test('formatea fechas para mostrar', () => assert.equal(formatearFecha('2026-03-05'), '05/03/2026'));
});

describe('validación', () => {
  const esquema = {
    nombre: { tipo: 'texto', requerido: true, maxLargo: 5 },
    edad: { tipo: 'entero', min: 4, max: 100 },
    correo: { tipo: 'correo' },
  };

  test('limpia y convierte datos válidos', () => {
    assert.deepEqual(validar(esquema, { nombre: ' Ana ', edad: '15', correo: 'A@B.PE' }), { nombre: 'Ana', edad: 15, correo: 'a@b.pe' });
  });

  test('reúne todos los errores a la vez', () => {
    const { errores } = revisar(esquema, { nombre: 'Demasiado largo', edad: 3.5, correo: 'malo' });
    assert.equal(errores.length, 3);
  });

  test('lanza error 400 con detalles', () => {
    assert.throws(() => validar(esquema, {}), (e) => e.status === 400 && e.detalles.length === 1);
  });

  test('valida identificadores', () => {
    assert.equal(idValido('7'), 7);
    assert.throws(() => idValido('-1'));
    assert.throws(() => idValido('abc'));
  });
});

describe('reglas de rendimiento', () => {
  test('clasifica niveles', () => {
    assert.equal(rendimiento.nivelDe(75), 'Alto');
    assert.equal(rendimiento.nivelDe(50), 'Medio');
    assert.equal(rendimiento.nivelDe(49.9), 'Bajo');
    assert.equal(rendimiento.nivelDe(null), null);
  });

  test('calcula la puntuación con las capacidades registradas', () => {
    assert.equal(rendimiento.calcularPuntuacion(evaluacion([70, 40, 60.5, 80, 75, 50, 90, 95])), 70.1);
    assert.equal(rendimiento.calcularPuntuacion(evaluacion([60, 80])), 70);
    assert.equal(rendimiento.calcularPuntuacion(evaluacion([])), null);
  });

  test('compara periodos del historial', () => {
    const r = rendimiento.comparacionPeriodos([80, 80, 60, 60], 4);
    assert.equal(r.diferencia, -20);
    assert.equal(rendimiento.comparacionPeriodos([80], 2), null);
  });
});

describe('alertas', () => {
  const deportista = (historial, ultima) => rendimiento.resumirDeportista({
    id: 1, nombre: 'Ana', codigo: 'A1',
    evaluaciones: historial.map((p, i) => ({ ...evaluacion(ultima), puntuacion_general: p, fecha: `2026-0${i + 1}-01` })),
  });

  test('detecta rendimiento bajo, caída y debilidad crítica', () => {
    const tipos = alertasDe(deportista([80, 78, 60, 45], [40, 60, 60, 60, 60, 60, 60, 60])).map((a) => a.tipo);
    assert.ok(tipos.includes('bajo'));
    assert.ok(tipos.includes('caida'));
    assert.ok(tipos.includes('debilidad'));
  });

  test('sin evaluaciones no hay alertas', () => assert.deepEqual(alertasDe(deportista([], [])), []));
});

describe('Random Forest', () => {
  const aleatorio = bosque.crearAleatorio(7);
  const X = [];
  const y = [];
  for (let i = 0; i < 150; i += 1) {
    const base = 20 + aleatorio() * 75;
    const fila = Array.from({ length: 8 }, () => Math.min(100, Math.max(0, base + (aleatorio() - 0.5) * 20)));
    X.push(fila);
    y.push(rendimiento.nivelDe(fila.reduce((a, b) => a + b) / 8));
  }

  test('aprende a clasificar con buena exactitud', () => {
    const { entrenamiento, prueba } = bosque.dividirEstratificado(y, 0.25, 1);
    const modelo = bosque.entrenar(entrenamiento.map((i) => X[i]), entrenamiento.map((i) => y[i]), { arboles: 50 });
    const { exactitud } = bosque.evaluar(prueba.map((i) => y[i]), prueba.map((i) => bosque.predecir(modelo, X[i]).clase), modelo.clases);
    assert.ok(exactitud > 0.8, `exactitud ${exactitud}`);
  });

  test('es reproducible y serializable a JSON', () => {
    const a = bosque.entrenar(X, y, { arboles: 10, semilla: 3 });
    const b = JSON.parse(JSON.stringify(bosque.entrenar(X, y, { arboles: 10, semilla: 3 })));
    assert.deepEqual(bosque.predecir(a, X[0]), bosque.predecir(b, X[0]));
    const suma = a.importancias.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(suma - 1) < 1e-9);
  });

  test('predice extremos con sentido', () => {
    const modelo = bosque.entrenar(X, y, { arboles: 30 });
    assert.equal(bosque.predecir(modelo, Array(8).fill(95)).clase, 'Alto');
    assert.equal(bosque.predecir(modelo, Array(8).fill(25)).clase, 'Bajo');
  });
});

describe('rutinas', () => {
  const dep = (disciplina, valores = []) => rendimiento.resumirDeportista({
    id: 1, nombre: 'Ana', codigo: 'A1', disciplina,
    evaluaciones: valores.length ? [{ ...evaluacion(valores), puntuacion_general: 45 }] : [],
  });

  test('usa la plantilla del deporte, de su familia o la general', () => {
    assert.equal(generarRutina(dep('Fútbol')).origen, 'deporte');
    assert.equal(generarRutina(dep('Karate Do')).origen, 'categoria');
    assert.equal(generarRutina(dep('Ajedrez')).origen, 'generica');
    assert.equal(generarRutina(dep(null)).nivel, 'Sin evaluar');
  });

  test('agrega refuerzos para las capacidades débiles', () => {
    const rutina = generarRutina(dep('Vóley', [30, 40, 80, 80, 80, 80, 80, 80]));
    assert.equal(rutina.nivel, 'Bajo');
    assert.deepEqual(rutina.refuerzos.map((r) => r.capacidad), ['Velocidad', 'Resistencia']);
  });
});

describe('asistente IA (reglas)', () => {
  test('recomienda priorizar las capacidades débiles', () => {
    const texto = reglas.generarRecomendacion({ velocidad: 30, fuerza: 90 });
    assert.match(texto, /priorizar el desarrollo de: velocidad/);
    assert.match(texto, /Fortalezas/);
  });

  test('resume una academia vacía sin fallar', () => {
    assert.match(reglas.resumirAcademia([]), /Aún no hay datos/);
  });
});

describe('lector de Excel', () => {
  test('reconoce encabezados con tildes y alias, e ignora filas vacías', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Datos');
    hoja.addRow(['Código', 'Nombres', 'Fecha de Evaluación', 'Deporte', 'Asistencia %', 'Otra cosa']);
    hoja.addRow(['A1', 'Ana', new Date(Date.UTC(2026, 2, 5)), 'Fútbol', 90, 'x']);
    hoja.addRow([]);
    hoja.addRow(['A2', { richText: [{ text: 'Be' }, { text: 'to' }] }, '12/04/2026', 'Vóley', { formula: '40+40', result: 80 }, 'y']);
    const { campos, extras, filas } = await leerExcel(Buffer.from(await libro.xlsx.writeBuffer()));
    assert.deepEqual(campos, ['codigo', 'nombre', 'fecha', 'disciplina', 'asistencia']);
    assert.deepEqual(extras, ['Otra cosa']);
    assert.equal(filas.length, 2);
    assert.equal(filas[1].datos.nombre, 'Beto');
    assert.equal(filas[1].datos.asistencia, 80);
    assert.equal(filas[1].numero, 4);
  });

  test('un archivo que no es Excel produce un error controlado', async () => {
    await assert.rejects(leerExcel(Buffer.from('esto no es un excel')));
  });
});

describe('manejo de errores', () => {
  function responder(error) {
    const res = {
      codigo: 0,
      cuerpo: null,
      status(c) { this.codigo = c; return this; },
      json(c) { this.cuerpo = c; return this; },
    };
    const original = console.error;
    console.error = () => {};
    manejadorErrores(error, { id: 'abc', method: 'GET', originalUrl: '/x' }, res, () => {});
    console.error = original;
    return res;
  }

  test('traduce errores de la base de datos a mensajes claros', () => {
    assert.equal(responder(Object.assign(new Error('dup'), { code: '23505' })).codigo, 409);
    assert.match(responder(Object.assign(new Error('x'), { code: '42P01' })).cuerpo.error, /schema\.sql/);
    assert.equal(responder(Object.assign(new Error('x'), { code: '53300' })).codigo, 503);
  });

  test('los errores inesperados no revelan detalles internos', () => {
    const res = responder(new Error('secreto interno'));
    assert.equal(res.codigo, 500);
    assert.doesNotMatch(res.cuerpo.error, /secreto/);
    assert.equal(res.cuerpo.referencia, 'abc');
  });

  test('respeta los errores HTTP de la aplicación', () => {
    assert.equal(responder(new HttpError(404, 'No existe')).codigo, 404);
  });
});

describe('permisos, módulos y auditoría (FASE 1)', () => {
  const permisos = require('../src/core/permisos');
  const modulos = require('../src/core/modulos');
  const { describirRuta } = require('../src/core/auditoria');

  test('el administrador tiene todos los permisos', () => {
    assert.equal(permisos.efectivos('admin').length, permisos.PERMISOS.filter((p) => !p.sinAdmin).length);
    assert.ok(!permisos.efectivos('admin').includes('portal.ver'));
  });

  test('valores por defecto y excepciones por academia', () => {
    assert.ok(permisos.efectivos('coach').includes('evaluaciones.gestionar'));
    assert.ok(!permisos.efectivos('coach').includes('usuarios.gestionar'));
    assert.ok(!permisos.efectivos('coach', { 'evaluaciones.gestionar': false }).includes('evaluaciones.gestionar'));
    assert.deepEqual(permisos.efectivos('deportista').sort(),
      ['comunicados.ver', 'portal.asistencia', 'portal.nutricion', 'portal.recuperacion', 'portal.ver', 'portal.videos']);
    // Ningún permiso del deportista ni del padre modifica resultados oficiales
    for (const rol of ['deportista', 'padre']) {
      assert.ok(permisos.efectivos(rol).every((p) => p.startsWith('portal.') || p === 'comunicados.ver'));
    }
    assert.deepEqual(permisos.efectivos('desconocido'), []);
  });

  test('nunca se conceden permisos de solo administrador ni de escritura al deportista', () => {
    assert.ok(!permisos.configurable('usuarios.gestionar', 'coach'));
    assert.ok(!permisos.configurable('evaluaciones.gestionar', 'deportista'));
    assert.ok(!permisos.efectivos('coach', { 'usuarios.gestionar': true }).includes('usuarios.gestionar'));
    assert.ok(!permisos.efectivos('padre', { 'evaluaciones.gestionar': true }).includes('evaluaciones.gestionar'));
  });

  test('los módulos no disponibles siempre están apagados', () => {
    const estado = modulos.efectivos({ nutricion: false, video: true });
    assert.equal(estado.nutricion, false);
    assert.equal(estado.video, false);
    assert.equal(estado.ml, true);
  });

  test('describe la ruta auditada', () => {
    assert.deepEqual(describirRuta('/deportistas/12'), { entidad: 'deportistas', entidadId: '12', subruta: null });
    assert.deepEqual(describirRuta('/admin/usuarios/5/password'), { entidad: 'usuarios', entidadId: '5', subruta: 'password' });
    assert.deepEqual(describirRuta('/ml/entrenar'), { entidad: 'ml', entidadId: null, subruta: 'entrenar' });
  });
});
