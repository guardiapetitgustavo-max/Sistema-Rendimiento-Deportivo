/**
 * Asistente IA del Coach.
 * - Modo local (por defecto): motor de reglas con los datos reales (ver reglas.js).
 * - Modo OpenAI (opcional): IA_PROVIDER=openai y OPENAI_API_KEY en las variables de
 *   entorno. Si la API falla, se usa automáticamente el motor local.
 */
const env = require('../../config/env');
const { transaccion } = require('../../db/pool');
const { CAPACIDADES, NOMBRE_CAPACIDAD, promedio, calcularPuntuacion } = require('../../domain/rendimiento');
const { formatearFecha, redondear } = require('../../utils/valores');
const deportistas = require('../deportistas/deportistas.service');
const ml = require('../ml/ml.service');
const { alertasAcademia } = require('../alertas/alertas.service');
const reglas = require('./reglas');

const PROMPT_SISTEMA = 'Eres un asistente experto en ciencias del deporte que ayuda a un entrenador '
  + 'de una academia deportiva en Lima, Perú. Respondes en español, de forma práctica y basada en los '
  + 'datos entregados. Tus respuestas son apoyo al entrenamiento, nunca diagnósticos médicos.';

async function consultarOpenAI(prompt) {
  const { proveedor, openaiKey, openaiModelo } = env.ia;
  if (proveedor !== 'openai' || !openaiKey) return null;
  try {
    const respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: openaiModelo,
        temperature: 0.4,
        messages: [{ role: 'system', content: PROMPT_SISTEMA }, { role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    return datos.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

async function analizarDeportista(usuarioId, deportistaId) {
  const dep = await deportistas.cargarDeportista(usuarioId, deportistaId);
  const analisisLocal = reglas.analizarDeportista(dep);
  const analisisApi = await consultarOpenAI(
    `Analiza el rendimiento de este deportista y genera recomendaciones de entrenamiento personalizadas:\n\n${analisisLocal}`,
  );
  return { deportista: { id: dep.id, nombre: dep.nombre, codigo: dep.codigo }, texto: analisisApi || analisisLocal, modo: analisisApi ? 'api' : 'local' };
}

async function resumenAcademia(usuarioId) {
  return { texto: reglas.resumirAcademia(await deportistas.cargarAcademia(usuarioId)), modo: 'local' };
}

/**
 * Rellena SOLO las capacidades vacías con el promedio real del propio deportista,
 * de su disciplina o de la academia (en ese orden). Nunca sobrescribe datos registrados.
 */
async function autocompletar(usuarioId) {
  const academia = await deportistas.cargarAcademia(usuarioId);
  const promediosDe = (evaluaciones) => Object.fromEntries(
    CAPACIDADES.map((c) => [c, promedio(evaluaciones.map((e) => e[c]))]).filter(([, v]) => v !== null),
  );
  const claveDisciplina = (d) => (d.disciplina || '').trim().toLowerCase();

  const general = promediosDe(academia.flatMap((d) => d.evaluaciones));
  const porDisciplina = {};
  for (const d of academia) (porDisciplina[claveDisciplina(d)] ||= []).push(...d.evaluaciones);
  Object.keys(porDisciplina).forEach((k) => { porDisciplina[k] = promediosDe(porDisciplina[k]); });

  const cambios = [];
  for (const dep of academia) {
    const propio = promediosDe(dep.evaluaciones);
    const disciplina = porDisciplina[claveDisciplina(dep)];
    for (const ev of dep.evaluaciones) {
      const rellenos = {};
      for (const c of CAPACIDADES) {
        const referencia = propio[c] ?? disciplina[c] ?? general[c];
        if (ev[c] === null && referencia !== undefined) rellenos[c] = redondear(referencia);
      }
      if (Object.keys(rellenos).length) {
        const completa = { ...ev, ...rellenos };
        cambios.push({
          id: ev.id,
          rellenos,
          puntuacion: ev.puntuacion_general ?? calcularPuntuacion(completa),
          detalle: `${dep.nombre} (${dep.codigo}) ${formatearFecha(ev.fecha)}: ${Object.keys(rellenos).map((c) => NOMBRE_CAPACIDAD[c]).join(', ')}`,
        });
      }
    }
  }

  await transaccion(async (cliente) => {
    for (const cambio of cambios) {
      const columnas = Object.keys(cambio.rellenos);
      await cliente.query(
        `UPDATE evaluaciones SET ${columnas.map((c, i) => `${c} = $${i + 2}`).join(', ')},
                puntuacion_general = $${columnas.length + 2}
         WHERE id = $1`,
        [cambio.id, ...Object.values(cambio.rellenos), cambio.puntuacion],
      );
    }
  });

  return {
    celdas: cambios.reduce((s, c) => s + Object.keys(c.rellenos).length, 0),
    evaluaciones: cambios.length,
    detalle: cambios.slice(0, 15).map((c) => c.detalle),
  };
}

const paso = (nombre, ok, detalle, tipo = ok ? 'success' : 'danger') => ({ nombre, ok, detalle, tipo });

/** Modo Automático: completar datos → entrenar → predecir → resumir, con reporte paso a paso. */
async function modoAutomatico(usuarioId, { usarDemo = false, clave = usuarioId } = {}) {
  const pasos = [];

  try {
    const r = await autocompletar(usuarioId);
    pasos.push(r.celdas
      ? paso('Auto-completar datos faltantes', true, `Se completaron ${r.celdas} valores vacíos en ${r.evaluaciones} evaluaciones con promedios reales (del deportista, su disciplina o la academia). No se sobrescribió ningún dato registrado.`)
      : paso('Auto-completar datos faltantes', true, 'No había valores vacíos: las evaluaciones ya estaban completas.', 'info'));
  } catch (error) {
    pasos.push(paso('Auto-completar datos faltantes', false, error.message));
  }

  try {
    const info = await ml.entrenar(usuarioId, { usarDemo, clave });
    pasos.push(paso(
      'Entrenar modelo de Machine Learning',
      true,
      `Modelo entrenado con ${info.total_registros} registros, exactitud ${info.exactitud_pct}%.`
        + (info.es_demo ? ' ATENCIÓN: se apoyó en datos ficticios de demostración.' : ''),
      info.es_demo ? 'warning' : 'success',
    ));
  } catch (error) {
    pasos.push(paso('Entrenar modelo de Machine Learning', false, error.message));
  }

  try {
    const r = await ml.predecirTodos(usuarioId, { clave });
    pasos.push(paso('Generar predicciones', true, r.mensaje));
  } catch (error) {
    pasos.push(paso('Generar predicciones', false, error.message, 'warning'));
  }

  const academia = await deportistas.cargarAcademia(usuarioId);
  const totalAlertas = alertasAcademia(academia).length;
  pasos.push(paso('Resumen ejecutivo de la academia', true, `Resumen generado. Alertas automáticas activas: ${totalAlertas}.`, 'info'));

  return {
    ok: pasos.every((p) => p.ok),
    ejecutado_en: new Date().toISOString(),
    pasos,
    resumen: reglas.resumirAcademia(academia),
    alertas: totalAlertas,
  };
}

module.exports = { analizarDeportista, resumenAcademia, modoAutomatico };
