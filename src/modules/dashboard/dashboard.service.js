/**
 * Datos del dashboard: indicadores, alertas, listas destacadas y series para los gráficos.
 */
const { CAPACIDADES, NOMBRE_CAPACIDAD, NIVELES, UMBRAL, capitalizar, promedio } = require('../../domain/rendimiento');
const { redondear } = require('../../utils/valores');
const deportistas = require('../deportistas/deportistas.service');
const { alertasAcademia } = require('../alertas/alertas.service');

const resumenCorto = ({ id, codigo, nombre, categoria, promedio_general: promedioGeneral }) =>
  ({ id, codigo, nombre, categoria, promedio_general: promedioGeneral });

function evolucionPorFecha(evaluaciones) {
  const porFecha = new Map();
  for (const ev of evaluaciones) {
    if (ev.puntuacion_general !== null) porFecha.set(ev.fecha, [...(porFecha.get(ev.fecha) || []), ev.puntuacion_general]);
  }
  const fechas = [...porFecha.keys()].sort();
  return { fechas, valores: fechas.map((f) => redondear(promedio(porFecha.get(f)))) };
}

async function obtener(alcance) {
  const academia = await deportistas.cargarAcademia(alcance);
  const evaluaciones = academia.flatMap((d) => d.evaluaciones);
  const conPromedio = academia.filter((d) => d.promedio_general !== null);

  const porCategoria = {};
  for (const d of conPromedio) (porCategoria[d.categoria || 'Sin categoría'] ||= []).push(d.promedio_general);

  return {
    totales: {
      deportistas: academia.length,
      evaluaciones: evaluaciones.length,
      promedio_general: redondear(promedio(evaluaciones.map((e) => e.puntuacion_general))),
      rendimiento_alto: conPromedio.filter((d) => d.nivel === 'Alto').length,
    },
    alertas: alertasAcademia(academia),
    destacados: conPromedio.filter((d) => d.promedio_general >= UMBRAL.alto)
      .sort((a, b) => b.promedio_general - a.promedio_general).slice(0, 6).map(resumenCorto),
    atencion: conPromedio.filter((d) => d.promedio_general < UMBRAL.medio)
      .sort((a, b) => a.promedio_general - b.promedio_general).slice(0, 6).map(resumenCorto),
    ultimas_evaluaciones: [...evaluaciones]
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
      .slice(0, 8)
      .map((e) => {
        const d = academia.find((x) => x.id === e.deportista_id);
        return { id: e.id, fecha: e.fecha, puntuacion_general: e.puntuacion_general, deportista_id: d.id, nombre: d.nombre, codigo: d.codigo };
      }),
    graficos: {
      habilidades: {
        etiquetas: CAPACIDADES.map((c) => capitalizar(NOMBRE_CAPACIDAD[c])),
        valores: CAPACIDADES.map((c) => redondear(promedio(evaluaciones.map((e) => e[c]))) ?? 0),
      },
      evolucion: evolucionPorFecha(evaluaciones),
      niveles: Object.fromEntries(NIVELES.map((n) => [n, conPromedio.filter((d) => d.nivel === n).length])),
      categorias: Object.fromEntries(Object.entries(porCategoria).map(([k, v]) => [k, redondear(promedio(v))])),
    },
  };
}

module.exports = { obtener };
