/** Dashboard: bienvenida, indicadores, alertas, gráficos y listas destacadas. */
import { api } from '../api.js';
import { html, montar, fecha, insigniaPuntaje, vacio } from '../ui.js';
import { lineas, barras, dona } from '../graficos.js';
import { COLOR_POR_NIVEL, PALETA_CAPACIDADES } from '../constantes.js';
import { actualizarAlertas } from '../navegacion.js';

export const tarjetaDato = (icono, color, valor, etiqueta, clases = 'col-6 col-xl-3') => html`
  <div class="${clases}">
    <div class="card tarjeta-dato h-100"><div class="card-body d-flex align-items-center gap-3">
      <div class="icono-dato icono-${color}"><i class="bi bi-${icono}"></i></div>
      <div><div class="valor-dato" ${valor !== null && valor !== undefined ? html`data-contar="${valor}"` : ''}>${valor ?? '—'}</div>
        <div class="etiqueta-dato">${etiqueta}</div></div>
    </div></div>
  </div>`;

const tablaDeportistas = (lista, mensaje) => html`
  <div class="table-responsive"><table class="table table-hover align-middle">
    <thead class="table-light"><tr><th>Deportista</th><th>Categoría</th><th class="text-end">Promedio</th></tr></thead>
    <tbody>${lista.length ? lista.map((d) => html`
      <tr class="fila-enlace" data-ir="/deportistas/${d.id}"><td><span class="fw-semibold">${d.nombre}</span> <span class="text-muted small">${d.codigo}</span></td>
        <td>${d.categoria || '—'}</td><td class="text-end">${insigniaPuntaje(d.promedio_general)}</td></tr>`)
    : html`<tr><td colspan="3">${vacio(mensaje, 'people')}</td></tr>`}</tbody>
  </table></div>`;

function saludo() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  return hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export async function render(vista, { usuario }) {
  const datos = await api.get('/dashboard');
  const { totales, alertas, graficos } = datos;
  actualizarAlertas(alertas.length);
  const nombreCorto = usuario.nombre.split(' ')[0];

  montar(vista, html`
    <div class="bienvenida mb-4">
      <div class="position-relative" style="z-index:1">
        <p class="mb-1 text-white-50 small fw-semibold text-uppercase" style="letter-spacing:.08em">${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 class="h3 fw-bold mb-2">${saludo()}, ${nombreCorto}</h2>
        <p class="mb-3 text-white-50">${alertas.length
    ? `Tienes ${alertas.length} alerta(s) de rendimiento por revisar.`
    : totales.deportistas ? 'Todo en orden: no hay alertas de rendimiento.' : 'Empieza cargando a tus deportistas.'}</p>
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-light fw-semibold" href="#/evaluaciones/nueva"><i class="bi bi-clipboard-plus me-1"></i>Nueva evaluación</a>
          <a class="btn btn-outline-light" href="#/importar"><i class="bi bi-cloud-arrow-up me-1"></i>Importar Excel</a>
          <a class="btn btn-outline-light" href="#/ia"><i class="bi bi-stars me-1"></i>Asistente IA</a>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      ${tarjetaDato('people', 'azul', totales.deportistas, 'Deportistas activos')}
      ${tarjetaDato('clipboard2-pulse', 'cian', totales.evaluaciones, 'Evaluaciones')}
      ${tarjetaDato('graph-up-arrow', 'verde', totales.promedio_general, 'Promedio general')}
      ${tarjetaDato('trophy', 'ambar', totales.rendimiento_alto, 'Rendimiento alto')}
    </div>

    ${alertas.length ? html`
      <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span><i class="bi bi-bell me-2"></i>Alertas automáticas de rendimiento</span>
          <span class="badge text-bg-danger">${alertas.length}</span>
        </div>
        <div class="list-group list-group-flush">
          ${alertas.slice(0, 6).map((a) => html`
            <a href="#/deportistas/${a.deportista_id}" class="list-group-item list-group-item-action d-flex align-items-start gap-2 small">
              <i class="bi bi-exclamation-triangle-fill text-${a.severidad} mt-1"></i><span><b>${a.deportista}:</b> ${a.mensaje}</span>
            </a>`)}
        </div>
        ${alertas.length > 6 ? html`<div class="card-footer small text-muted">y ${alertas.length - 6} alerta(s) más en los perfiles de los deportistas.</div>` : ''}
      </div>` : ''}

    ${totales.evaluaciones ? html`
    <div class="row g-3 mb-4">
      <div class="col-lg-8"><div class="card h-100">
        <div class="card-header"><i class="bi bi-activity me-2"></i>Evolución del rendimiento por fecha</div>
        <div class="card-body"><div class="grafico"><canvas id="g-evolucion"></canvas></div></div>
      </div></div>
      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><i class="bi bi-pie-chart me-2"></i>Distribución de niveles</div>
        <div class="card-body"><div class="grafico"><canvas id="g-niveles"></canvas></div></div>
      </div></div>
      <div class="col-lg-7"><div class="card h-100">
        <div class="card-header"><i class="bi bi-bar-chart me-2"></i>Comparación de habilidades (promedio)</div>
        <div class="card-body"><div class="grafico"><canvas id="g-habilidades"></canvas></div></div>
      </div></div>
      <div class="col-lg-5"><div class="card h-100">
        <div class="card-header"><i class="bi bi-diagram-3 me-2"></i>Rendimiento promedio por categoría</div>
        <div class="card-body"><div class="grafico"><canvas id="g-categorias"></canvas></div></div>
      </div></div>
    </div>` : html`
    <div class="card mb-4"><div class="card-body">${vacio(html`Aún no hay evaluaciones. <a href="#/importar">Importa un Excel</a> o
      <a href="#/deportistas">registra a tus deportistas</a> para ver los gráficos.`, 'bar-chart-line')}</div></div>`}

    <div class="row g-3">
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-trophy me-2"></i>Rendimiento alto</div>
        ${tablaDeportistas(datos.destacados, 'Todavía nadie supera 75 puntos de promedio')}
      </div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-life-preserver me-2"></i>Requieren atención</div>
        ${tablaDeportistas(datos.atencion, 'Nadie está por debajo de 50 puntos')}
      </div></div>
      <div class="col-12"><div class="card">
        <div class="card-header"><i class="bi bi-clock-history me-2"></i>Últimas evaluaciones</div>
        <div class="table-responsive"><table class="table table-hover align-middle">
          <thead class="table-light"><tr><th>Fecha</th><th>Deportista</th><th class="text-end">Puntuación</th></tr></thead>
          <tbody>${datos.ultimas_evaluaciones.length ? datos.ultimas_evaluaciones.map((e) => html`
            <tr class="fila-enlace" data-ir="/deportistas/${e.deportista_id}"><td>${fecha(e.fecha)}</td><td>${e.nombre} <span class="text-muted small">${e.codigo}</span></td>
              <td class="text-end">${insigniaPuntaje(e.puntuacion_general)}</td></tr>`)
    : html`<tr><td colspan="3">${vacio('Aún no hay evaluaciones')}</td></tr>`}</tbody>
        </table></div>
      </div></div>
    </div>`);

  if (!totales.evaluaciones) return;
  lineas(vista.querySelector('#g-evolucion'), graficos.evolucion.fechas.map(fecha), [
    { nombre: 'Promedio de puntuación general', valores: graficos.evolucion.valores },
  ]);
  const niveles = Object.keys(graficos.niveles);
  dona(vista.querySelector('#g-niveles'), niveles, Object.values(graficos.niveles), niveles.map((n) => COLOR_POR_NIVEL[n]));
  barras(vista.querySelector('#g-habilidades'), graficos.habilidades.etiquetas, graficos.habilidades.valores, { colores: PALETA_CAPACIDADES });
  barras(vista.querySelector('#g-categorias'), Object.keys(graficos.categorias), Object.values(graficos.categorias), { horizontal: true });
}
