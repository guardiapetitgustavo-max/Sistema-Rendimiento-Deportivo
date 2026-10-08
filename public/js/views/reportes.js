/** Reportes descargables en Excel y PDF. */
import { api } from '../api.js';
import {
  html, montar, encabezado, opcionesDeportistas, vacio, avisar, mostrarError, conCarga,
} from '../ui.js';
import { lineas } from '../graficos.js';
import { pedirValoracion } from './indicadores.js';

const PESTANAS = [
  { tipo: 'general', texto: 'General', icono: 'table' },
  { tipo: 'ranking', texto: 'Ranking', icono: 'trophy' },
  { tipo: 'evolucion', texto: 'Evolución', icono: 'graph-up' },
  { tipo: 'seguimiento', texto: 'Seguimiento', icono: 'exclamation-diamond' },
  { tipo: 'estadisticas', texto: 'Estadísticas', icono: 'calculator' },
  { tipo: 'marcas', texto: 'Mejores marcas', icono: 'stopwatch' },
  { tipo: 'asistencia', texto: 'Asistencia', icono: 'person-check' },
  { tipo: 'alertas', texto: 'Alertas', icono: 'bell' },
];

const botonesDescarga = (tipo) => html`
  <div class="btn-group btn-group-sm">
    <button class="btn btn-outline-success" data-descargar="/reportes/${tipo}/excel"><i class="bi bi-file-earmark-excel me-1"></i>Excel</button>
    <button class="btn btn-outline-danger" data-descargar="/reportes/${tipo}/pdf"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
  </div>`;

const tabla = ({ titulo, columnas, filas }, tipo) => html`
  <div class="card"><div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
    <span>${titulo}</span>${botonesDescarga(tipo)}
  </div>
  ${tipo === 'evolucion' && filas.length ? html`<div class="card-body border-bottom"><div class="grafico"><canvas id="g-evolucion"></canvas></div></div>` : ''}
  <div class="card-body p-0"><div class="table-responsive" style="max-height:520px"><table class="table table-hover table-sm mb-0 align-middle">
    <thead class="table-light"><tr>${columnas.map((c) => html`<th>${c}</th>`)}</tr></thead>
    <tbody>${filas.length ? filas.map((f) => html`<tr>${f.map((v) => html`<td>${v === '' ? '—' : v}</td>`)}</tr>`)
    : html`<tr><td colspan="${columnas.length}">${vacio('No hay datos para este reporte')}</td></tr>`}</tbody>
  </table></div></div></div>`;

export async function render(vista) {
  const [reportes, { datos: deportistas }] = await Promise.all([api.get('/reportes'), api.get('/deportistas')]);

  montar(vista, html`
    ${encabezado('bar-chart-line', 'Reportes', 'Consulta y descarga reportes con los datos reales de tu academia')}
    <ul class="nav nav-tabs mb-3 flex-nowrap overflow-auto" role="tablist">
      ${PESTANAS.map((p, i) => html`<li class="nav-item"><button class="nav-link text-nowrap ${i ? '' : 'active'}" data-bs-toggle="tab" data-bs-target="#tab-${p.tipo}" type="button">
        <i class="bi bi-${p.icono} me-1"></i>${p.texto}</button></li>`)}
      <li class="nav-item"><button class="nav-link text-nowrap" data-bs-toggle="tab" data-bs-target="#tab-individual" type="button"><i class="bi bi-person me-1"></i>Individual</button></li>
    </ul>
    <div class="tab-content">
      ${PESTANAS.map((p, i) => html`<div class="tab-pane fade ${i ? '' : 'show active'}" id="tab-${p.tipo}">${tabla(reportes[p.tipo], p.tipo)}</div>`)}

      <div class="tab-pane fade" id="tab-individual"><div class="card" style="max-width:560px"><div class="card-body">
        <p class="small text-muted">Historial completo de evaluaciones de un deportista.</p>
        <select class="form-select mb-3" data-individual>${opcionesDeportistas(deportistas, '')}</select>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-success flex-grow-1" data-individual-formato="excel"><i class="bi bi-file-earmark-excel me-1"></i>Descargar Excel</button>
          <button class="btn btn-outline-danger flex-grow-1" data-individual-formato="pdf"><i class="bi bi-file-earmark-pdf me-1"></i>Descargar PDF</button>
        </div>
      </div></div></div>

    </div>`);

  const evolucion = reportes.evolucion.filas;
  if (evolucion.length) {
    lineas(vista.querySelector('#g-evolucion'), evolucion.map((f) => f[0]), [{ nombre: 'Promedio de la academia', valores: evolucion.map((f) => f[1]) }]);
  }

  vista.querySelectorAll('[data-descargar]').forEach((b) => b.addEventListener('click', () =>
    conCarga(b, () => api.descargar(b.dataset.descargar)).then((r) => pedirValoracion(r?.reporteId)).catch(mostrarError)));

  vista.querySelectorAll('[data-individual-formato]').forEach((b) => b.addEventListener('click', () => {
    const id = vista.querySelector('[data-individual]').value;
    if (!id) return avisar('Selecciona un deportista', 'warning');
    return conCarga(b, () => api.descargar(`/reportes/individual/${b.dataset.individualFormato}?deportista_id=${id}`))
      .then((r) => pedirValoracion(r?.reporteId)).catch(mostrarError);
  }));
}
