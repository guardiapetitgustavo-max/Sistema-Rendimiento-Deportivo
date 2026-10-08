/**
 * Motor de alertas (FASE 6). Reglas deterministas y configurables por academia (tabla reglas_alerta sobre el
 * catálogo de domain/reglas-alerta.js). Cada alerta guarda los DATOS que la generaron y una clave única, así
 * volver a evaluar no la duplica. Las alertas nuevas notifican al coach responsable y a los administradores.
 */
const { query } = require('../../db/pool');
const { REGLAS } = require('../../domain/reglas-alerta');
const M = require('../../domain/medicion');
const I = require('../../domain/indicadores');
const { hoyISO } = require('../../utils/valores');

/** Reglas efectivas de una academia: catálogo + parámetros guardados. */
async function reglasDe(academia) {
  const { rows } = await query('SELECT * FROM reglas_alerta WHERE academia_id = $1', [academia]);
  const guardadas = new Map(rows.map((r) => [r.tipo, r]));
  return Object.fromEntries(Object.entries(REGLAS).map(([tipo, base]) => {
    const g = guardadas.get(tipo);
    return [tipo, {
      tipo, nombre: base.nombre, activa: g ? g.activa : true, prioridad: g?.prioridad || base.prioridad,
      parametros: { ...base.parametros, ...(g?.parametros || {}) }, version: g?.version || 0,
    }];
  }));
}

const dias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const fmt = (r, v) => M.formatearValor(v, { tipo: r.tipo_resultado, unidad: r.unidad, decimales: r.decimales });

/**
 * Evalúa las reglas para un conjunto de deportistas (todos los de la academia, o uno).
 * Devuelve las alertas candidatas (sin guardar) para poder probarlas.
 */
async function candidatas(academia, reglas, deportistaId = null) {
  const filtroDep = deportistaId ? 'AND d.id = $2' : '';
  const params = deportistaId ? [academia, deportistaId] : [academia];
  const [deps, res, asis, recu, objs, cargas, primeras] = await Promise.all([
    query(`SELECT d.id, d.nombre, d.usuario_id FROM deportistas d WHERE d.academia_id = $1 AND d.activo ${filtroDep}`, params),
    query(`SELECT r.id, r.deportista_id, r.prueba_id, r.valor, r.unidad, r.datos, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, p.nombre AS prueba, p.criterio,
             m.direccion_mejora, m.tipo_resultado, m.decimales, m.rango_min, m.rango_max
           FROM resultados r JOIN deportistas d ON d.id = r.deportista_id JOIN pruebas p ON p.id = r.prueba_id JOIN metricas m ON m.id = r.metrica_id
           WHERE r.academia_id = $1 AND r.activo AND r.oficial AND d.activo ${filtroDep} ORDER BY r.fecha, r.id`, params),
    query(`SELECT a.deportista_id, a.estado, to_char(a.fecha, 'YYYY-MM-DD') AS fecha FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
           WHERE a.academia_id = $1 AND d.activo AND a.fecha >= CURRENT_DATE - ${Math.max(1, Number(reglas.baja_asistencia.parametros.dias) || 30)} ${filtroDep}`, params),
    query(`SELECT r.id, r.deportista_id, r.fatiga, r.horas_sueno, r.dolor, r.dolor_zona, r.dolor_intensidad, to_char(r.fecha, 'YYYY-MM-DD') AS fecha
           FROM recuperacion r JOIN deportistas d ON d.id = r.deportista_id
           WHERE r.academia_id = $1 AND d.activo AND r.fecha >= CURRENT_DATE - 30 ${filtroDep} ORDER BY r.fecha`, params),
    query(`SELECT o.id, o.deportista_id, o.descripcion, to_char(o.fecha_limite, 'YYYY-MM-DD') AS fecha_limite FROM objetivos o
           LEFT JOIN deportistas d ON d.id = o.deportista_id
           WHERE o.academia_id = $1 AND o.estado IN ('activo', 'vencido') AND o.fecha_limite < CURRENT_DATE ${deportistaId ? 'AND o.deportista_id = $2' : ''}`, params),
    // Carga sRPE de los últimos 28 días y fecha de la primera carga (para el ACWR)
    query(`SELECT a.deportista_id, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.rpe_sesion * coalesce(a.minutos, s.duracion_min) AS carga
           FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id LEFT JOIN sesiones_entrenamiento s ON s.id = a.sesion_id
           WHERE a.academia_id = $1 AND d.activo AND a.estado IN ('presente', 'tardanza') AND a.rpe_sesion IS NOT NULL
             AND coalesce(a.minutos, s.duracion_min) > 0 AND a.fecha >= CURRENT_DATE - 30 ${filtroDep}`, params),
    query(`SELECT a.deportista_id, to_char(min(a.fecha), 'YYYY-MM-DD') AS primera FROM asistencia a JOIN deportistas d ON d.id = a.deportista_id
           WHERE a.academia_id = $1 AND a.rpe_sesion IS NOT NULL AND a.estado IN ('presente', 'tardanza') ${filtroDep} GROUP BY a.deportista_id`, params),
  ]);
  const hoy = hoyISO();
  const alertas = [];
  const agregar = (tipo, dep, titulo, motivo, datos, clave) => {
    const regla = reglas[tipo];
    if (!regla?.activa) return;
    alertas.push({
      tipo, deportista_id: dep?.id ?? null, responsable_id: dep?.usuario_id ?? null, titulo, motivo, datos,
      prioridad: regla.prioridad, clave_unica: clave, visible_deportista: tipo === 'record_personal',
    });
  };

  for (const dep of deps.rows) {
    // --- Rendimiento: por prueba y contexto compatible, con los intentos de un día consolidados
    const propios = res.rows.filter((r) => r.deportista_id === dep.id);
    const grupos = new Map();
    for (const r of propios) {
      const k = M.claveComparacion(r);
      if (!grupos.has(k)) grupos.set(k, new Map());
      const g = grupos.get(k);
      g.set(r.fecha, [...(g.get(r.fecha) || []), r]);
    }
    for (const [clave, porDia] of grupos) {
      const ejemplo = [...porDia.values()][0][0];
      const rango = { min: ejemplo.rango_min, max: ejemplo.rango_max };
      const dir = ejemplo.direccion_mejora;
      if (dir === 'CUSTOM') continue;
      const serie = [...porDia.entries()].map(([fecha, l]) => ({
        fecha, valor: M.consolidarIntentos(l.map((x) => x.valor), ejemplo.criterio, dir, rango), resultado_id: l.at(-1).id,
      }));
      if (serie.length < 2) continue;
      const ultimo = serie.at(-1);
      const anterior = serie.at(-2);
      const previos = serie.slice(0, -1).map((s) => s.valor);
      const mejorPrevio = M.mejorValor(previos, dir, rango);
      const vsMejor = M.variacion(mejorPrevio, ultimo.valor, dir, rango);
      const umbralAtipico = Number(reglas.valor_atipico.parametros.porcentaje) || 25;
      if (vsMejor && Math.abs(vsMejor.porcentaje ?? 0) > umbralAtipico) {
        // Control de calidad: no se interpreta (ni récord ni caída) hasta que una persona lo revise
        agregar('valor_atipico', dep, `Valor atípico en ${ejemplo.prueba}`,
          `${fmt(ejemplo, ultimo.valor)} el ${ultimo.fecha} difiere un ${Math.abs(vsMejor.porcentaje)}% de su mejor marca (${fmt(ejemplo, mejorPrevio)}). Revisa si es un error de registro.`,
          { prueba_id: ejemplo.prueba_id, valor: ultimo.valor, mejor_marca: mejorPrevio, porcentaje: vsMejor.porcentaje, resultado_id: ultimo.resultado_id, umbral: umbralAtipico },
          `atipico:${dep.id}:${clave}:${ultimo.fecha}`);
        continue;
      }
      if (M.esMejor(ultimo.valor, mejorPrevio, dir, rango) === true) {
        agregar('record_personal', dep, `Récord personal en ${ejemplo.prueba}`,
          `${dep.nombre} marcó ${fmt(ejemplo, ultimo.valor)} el ${ultimo.fecha}; su mejor marca anterior era ${fmt(ejemplo, mejorPrevio)}.`,
          { prueba_id: ejemplo.prueba_id, prueba: ejemplo.prueba, valor: ultimo.valor, mejor_anterior: mejorPrevio, fecha: ultimo.fecha, resultado_id: ultimo.resultado_id },
          `record:${dep.id}:${clave}:${ultimo.fecha}`);
      }
      const umbralCaida = Number(reglas.caida_rendimiento.parametros.porcentaje) || 5;
      // Una diferencia de una sola unidad de resolución (p. ej. 1 acierto de 10) no se considera un cambio real
      const resolucion = 10 ** -(Number.isInteger(ejemplo.decimales) ? ejemplo.decimales : 2);
      const supera = (a, b) => Math.abs(a - b) > resolucion + 1e-9;
      if (vsMejor && vsMejor.porcentaje !== null && vsMejor.porcentaje <= -umbralCaida && supera(ultimo.valor, mejorPrevio)) {
        agregar('caida_rendimiento', dep, `Caída en ${ejemplo.prueba}`,
          `La última marca (${fmt(ejemplo, ultimo.valor)}, ${ultimo.fecha}) es ${Math.abs(vsMejor.porcentaje)}% peor que su mejor marca (${fmt(ejemplo, mejorPrevio)}). Umbral: ${umbralCaida}%.`,
          { prueba_id: ejemplo.prueba_id, valor: ultimo.valor, mejor_marca: mejorPrevio, porcentaje: vsMejor.porcentaje, fecha: ultimo.fecha, umbral: umbralCaida },
          `caida:${dep.id}:${clave}:${ultimo.fecha}`);
      }
      const vsAnterior = M.variacion(anterior.valor, ultimo.valor, dir, rango);
      const umbralMejora = Number(reglas.mejora_importante.parametros.porcentaje) || 5;
      if (vsAnterior && vsAnterior.porcentaje !== null && vsAnterior.porcentaje >= umbralMejora && supera(ultimo.valor, anterior.valor)) {
        agregar('mejora_importante', dep, `Mejora importante en ${ejemplo.prueba}`,
          `Pasó de ${fmt(ejemplo, anterior.valor)} (${anterior.fecha}) a ${fmt(ejemplo, ultimo.valor)} (${ultimo.fecha}): mejora del ${vsAnterior.porcentaje}%.`,
          { prueba_id: ejemplo.prueba_id, anterior: anterior.valor, actual: ultimo.valor, porcentaje: vsAnterior.porcentaje, fecha: ultimo.fecha },
          `mejora:${dep.id}:${clave}:${ultimo.fecha}`);
      }
    }

    // --- Evaluación pendiente
    const diasPend = Number(reglas.evaluacion_pendiente.parametros.dias) || 60;
    const ultimaMedicion = propios.at(-1)?.fecha || null;
    if (ultimaMedicion && ultimaMedicion < dias(diasPend)) {
      agregar('evaluacion_pendiente', dep, 'Evaluación pendiente',
        `${dep.nombre} no tiene mediciones oficiales desde el ${ultimaMedicion} (más de ${diasPend} días).`,
        { ultima_medicion: ultimaMedicion, dias: diasPend }, `pendiente:${dep.id}:${new Date().toISOString().slice(0, 7)}`);
    }

    // --- Asistencia
    const pa = reglas.baja_asistencia.parametros;
    const filas = asis.rows.filter((a) => a.deportista_id === dep.id && a.estado !== 'justificado');
    if (filas.length >= (Number(pa.minimo_registros) || 4)) {
      const pct = M.redondear((filas.filter((a) => a.estado !== 'ausente').length / filas.length) * 100, 1);
      if (pct < Number(pa.porcentaje)) {
        const semana = `${new Date().getUTCFullYear()}-${Math.ceil((((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7)}`;
        agregar('baja_asistencia', dep, 'Baja asistencia',
          `Asistencia del ${pct}% en los últimos ${pa.dias} días (${filas.length} registros); el mínimo es ${pa.porcentaje}%.`,
          { porcentaje: pct, registros: filas.length, dias: pa.dias, minimo: pa.porcentaje }, `asistencia:${dep.id}:${semana}`);
      }
    }

    // --- Recuperación (seguimiento, no diagnóstico)
    const rec = recu.rows.filter((r) => r.deportista_id === dep.id);
    const pf = reglas.fatiga_repetida.parametros;
    const consecutivos = Number(pf.dias_consecutivos) || 3;
    const conFatiga = rec.filter((r) => r.fatiga !== null);
    const ultimosF = conFatiga.slice(-consecutivos);
    if (ultimosF.length === consecutivos && ultimosF.every((r) => r.fatiga >= Number(pf.umbral))) {
      const seguidos = ultimosF.every((r, i) => i === 0 || (new Date(r.fecha) - new Date(ultimosF[i - 1].fecha)) / 86400000 === 1);
      if (seguidos) {
        agregar('fatiga_repetida', dep, 'Fatiga alta repetida',
          `Fatiga ${ultimosF.map((r) => r.fatiga).join(', ')}/10 los días ${ultimosF.map((r) => r.fecha).join(', ')} (umbral ${pf.umbral}). Revisar la carga.`,
          { valores: ultimosF.map((r) => ({ fecha: r.fecha, fatiga: r.fatiga })), umbral: pf.umbral }, `fatiga:${dep.id}:${ultimosF.at(-1).fecha}`);
      }
    }
    const ps = reglas.sueno_insuficiente.parametros;
    const conSueno = rec.filter((r) => r.horas_sueno !== null).slice(-(Number(ps.dias) || 5));
    if (conSueno.length >= (Number(ps.dias) || 5)) {
      const mediaS = M.redondear(conSueno.reduce((s, r) => s + r.horas_sueno, 0) / conSueno.length, 1);
      if (mediaS < Number(ps.horas)) {
        agregar('sueno_insuficiente', dep, 'Sueño insuficiente',
          `Promedio de ${mediaS} h de sueño en los últimos ${conSueno.length} registros (mínimo ${ps.horas} h).`,
          { media_horas: mediaS, registros: conSueno.length, minimo: ps.horas }, `sueno:${dep.id}:${conSueno.at(-1).fecha}`);
      }
    }
    // --- Carga: pico agudo respecto a la carga crónica (ACWR)
    const umbralAcwr = Number(reglas.carga_acwr.parametros.umbral) || 1.5;
    const propiasCargas = cargas.rows.filter((c) => c.deportista_id === dep.id).map((c) => ({ fecha: c.fecha, carga: Number(c.carga) }));
    if (propiasCargas.length) {
      const primera = primeras.rows.find((x) => x.deportista_id === dep.id)?.primera || null;
      const a = I.acwr(propiasCargas, hoy, { primera });
      if (a.acwr !== null && a.acwr > umbralAcwr) {
        const semana = I.sumarDias(hoy, -((new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7));
        agregar('carga_acwr', dep, 'Pico de carga de entrenamiento',
          `ACWR de ${a.acwr} (carga de 7 días ${a.aguda} UA frente a una media semanal de ${a.cronica} UA en 4 semanas; umbral ${umbralAcwr}). Valorar reducir la carga: los picos se asocian a más riesgo de lesión.`,
          { acwr: a.acwr, aguda: a.aguda, cronica: a.cronica, umbral: umbralAcwr, fecha: hoy }, `acwr:${dep.id}:${semana}`);
      }
    }

    const umbralDolor = Number(reglas.dolor_reportado.parametros.intensidad) || 6;
    for (const r of rec.filter((x) => x.dolor && (x.dolor_intensidad ?? 0) >= umbralDolor && x.fecha >= dias(7))) {
      agregar('dolor_reportado', dep, 'Dolor reportado',
        `${dep.nombre} reportó dolor${r.dolor_zona ? ` en ${r.dolor_zona}` : ''} de intensidad ${r.dolor_intensidad}/10 el ${r.fecha}. No es un diagnóstico: derivar a un profesional si persiste.`,
        { recuperacion_id: r.id, zona: r.dolor_zona, intensidad: r.dolor_intensidad, fecha: r.fecha }, `dolor:${r.id}`);
    }
  }

  for (const o of objs.rows) {
    const dep = deps.rows.find((d) => d.id === o.deportista_id) || null;
    if (o.deportista_id && !dep) continue;
    agregar('objetivo_vencido', dep, 'Objetivo vencido', `"${o.descripcion}" venció el ${o.fecha_limite} sin alcanzarse.`,
      { objetivo_id: o.id, fecha_limite: o.fecha_limite }, `objetivo:${o.id}`);
  }
  return alertas;
}

/** Guarda las alertas nuevas (sin duplicar) y notifica. Devuelve cuántas se crearon. */
async function evaluar(academia, deportistaId = null) {
  const reglas = await reglasDe(academia);
  const lista = await candidatas(academia, reglas, deportistaId);
  let creadas = 0;
  const { rows: admins } = await query("SELECT usuario_id FROM membresias WHERE academia_id = $1 AND rol = 'admin' AND activo", [academia]);
  for (const a of lista) {
    const { rows } = await query(
      `INSERT INTO alertas (academia_id, deportista_id, tipo, titulo, motivo, datos, prioridad, responsable_id, visible_deportista, clave_unica)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (academia_id, clave_unica) DO NOTHING RETURNING id`,
      [academia, a.deportista_id, a.tipo, a.titulo, a.motivo, JSON.stringify(a.datos), a.prioridad, a.responsable_id, a.visible_deportista, a.clave_unica],
    );
    if (!rows.length) continue;
    creadas += 1;
    if (a.prioridad === 'baja') continue;
    const destinatarios = new Set([a.responsable_id, ...admins.map((x) => x.usuario_id)].filter(Boolean));
    for (const usuario of destinatarios) {
      await query('INSERT INTO notificaciones (academia_id, usuario_id, titulo, cuerpo, enlace) VALUES ($1, $2, $3, $4, $5)',
        [academia, usuario, a.titulo, a.motivo.slice(0, 400), a.deportista_id ? `#/deportistas/${a.deportista_id}` : '#/alertas']);
    }
  }
  return { evaluadas: lista.length, creadas };
}

/**
 * Evalúa las reglas de UN deportista tras registrar un dato (resultado, recuperación…) si el módulo de
 * alertas está activo. Nunca hace fallar la operación principal.
 */
async function trasRegistrar(usuario, deportistaIds) {
  if (!usuario?.academia?.modulos?.ia_alertas) return;
  for (const id of [...new Set(deportistaIds)].filter(Boolean)) {
    try {
      await evaluar(usuario.academia.id, id);
    } catch (error) {
      console.error(JSON.stringify({ nivel: 'error', origen: 'motor-alertas', mensaje: error.message }));
    }
  }
}

module.exports = { reglasDe, candidatas, evaluar, trasRegistrar };
