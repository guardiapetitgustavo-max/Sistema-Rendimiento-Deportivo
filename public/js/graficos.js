/**
 * Gráficos con Chart.js, adaptados al tema claro/oscuro.
 * Si la librería no cargó, los gráficos se omiten sin romper la pantalla.
 */
import { COLORES } from './constantes.js';
import { prefiereMenosMovimiento } from './ui.js';

const activos = new Set();
const disponible = () => typeof window.Chart === 'function';

function paleta() {
  const estilos = getComputedStyle(document.documentElement);
  return {
    texto: estilos.getPropertyValue('--texto-suave').trim() || '#5b6478',
    rejilla: estilos.getPropertyValue('--borde').trim() || 'rgba(15,23,42,.08)',
    superficie: estilos.getPropertyValue('--superficie').trim() || '#fff',
  };
}

function configurarGlobal() {
  const { texto, rejilla } = paleta();
  Object.assign(Chart.defaults, { color: texto, borderColor: rejilla, maintainAspectRatio: false });
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.animation.duration = prefiereMenosMovimiento() ? 0 : 900;
  Chart.defaults.animation.easing = 'easeOutQuart';
}

export function destruirGraficos() {
  activos.forEach((grafico) => grafico.destroy());
  activos.clear();
}

function crear(lienzo, configuracion) {
  if (!lienzo || !disponible()) {
    if (lienzo) lienzo.replaceWith(Object.assign(document.createElement('p'), { className: 'text-muted small', textContent: 'Gráfico no disponible.' }));
    return null;
  }
  activos.forEach((grafico) => {
    if (!grafico.canvas?.isConnected) {
      grafico.destroy();
      activos.delete(grafico);
    }
  });
  configurarGlobal();
  try {
    const grafico = new Chart(lienzo, configuracion);
    activos.add(grafico);
    return grafico;
  } catch (error) {
    console.error('No se pudo dibujar el gráfico', error);
    return null;
  }
}

/** Relleno degradado vertical para las áreas bajo la línea. */
function degradado(color) {
  return ({ chart }) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'transparent';
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, `${color}55`);
    g.addColorStop(1, `${color}00`);
    return g;
  };
}

const escala100 = { min: 0, max: 100, grid: { drawTicks: false }, border: { display: false } };

export function lineas(lienzo, etiquetas, series, { mostrarLeyenda = series.length > 1 } = {}) {
  const colores = [COLORES.acento, COLORES.amarillo, COLORES.gris, COLORES.verde];
  return crear(lienzo, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: series.map((s, i) => ({
        label: s.nombre,
        data: s.valores,
        borderColor: colores[i % colores.length],
        backgroundColor: i === 0 ? degradado(colores[0]) : 'transparent',
        fill: i === 0,
        tension: 0.4,
        spanGaps: true,
        borderWidth: i === 0 ? 3 : 2,
        borderDash: i === 0 ? [] : [6, 4],
        pointRadius: i === 0 ? 4 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: paleta().superficie,
        pointBorderWidth: 2,
      })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { y: escala100, x: { grid: { display: false } } },
      plugins: { legend: { display: mostrarLeyenda, position: 'bottom' } },
    },
  });
}

export function barras(lienzo, etiquetas, valores, { horizontal = false, colores = COLORES.acento, maximo = 100 } = {}) {
  return crear(lienzo, {
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderRadius: 8, borderSkipped: false, maxBarThickness: 42 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      scales: {
        [horizontal ? 'x' : 'y']: { min: 0, max: maximo, border: { display: false } },
        [horizontal ? 'y' : 'x']: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

export function dona(lienzo, etiquetas, valores, colores) {
  return crear(lienzo, {
    type: 'doughnut',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderWidth: 0, hoverOffset: 10, spacing: 3, borderRadius: 6 }] },
    options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } },
  });
}

export function radar(lienzo, etiquetas, valores) {
  const { rejilla } = paleta();
  return crear(lienzo, {
    type: 'radar',
    data: {
      labels: etiquetas,
      datasets: [{
        data: valores,
        borderColor: COLORES.acento,
        backgroundColor: `${COLORES.acento}33`,
        pointBackgroundColor: COLORES.acento,
        borderWidth: 2,
      }],
    },
    options: {
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, display: false }, grid: { color: rejilla }, angleLines: { color: rejilla } } },
      plugins: { legend: { display: false } },
    },
  });
}

/**
 * Serie de mediciones reales (segundos, metros, cm…) con su propia escala.
 * Si menos es mejor (tiempos) el eje se invierte para que "subir" siempre signifique mejorar.
 */
export function serieMedicion(lienzo, etiquetas, series, { invertir = false, unidad = '' } = {}) {
  const colores = [COLORES.acento, COLORES.amarillo, COLORES.verde, COLORES.violeta, COLORES.rojo, COLORES.claro];
  return crear(lienzo, {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: series.map((s, i) => ({
        label: s.nombre,
        data: s.valores,
        borderColor: s.color || colores[i % colores.length],
        backgroundColor: 'transparent',
        tension: 0.25,
        spanGaps: true,
        borderWidth: s.punteada ? 1.5 : 2.5,
        borderDash: s.punteada ? [6, 4] : [],
        pointRadius: s.punteada ? 0 : 4,
        pointBackgroundColor: paleta().superficie,
        pointBorderWidth: 2,
      })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { reverse: invertir, border: { display: false }, title: { display: Boolean(unidad), text: unidad } },
        x: { grid: { display: false } },
      },
      plugins: { legend: { display: series.length > 1, position: 'bottom' } },
    },
  });
}

/** Barras con escala libre (cargas, conteos…). */
export function barrasLibres(lienzo, etiquetas, valores, { color = COLORES.acento, etiqueta = '' } = {}) {
  return crear(lienzo, {
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ label: etiqueta, data: valores, backgroundColor: color, borderRadius: 6, maxBarThickness: 36 }] },
    options: { scales: { y: { beginAtZero: true, border: { display: false } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } },
  });
}
