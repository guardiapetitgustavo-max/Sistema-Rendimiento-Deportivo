/** Dashboard: bienvenida, indicadores, alertas, gráficos y listas destacadas. */
import { api } from '../api.js';
import { html, montar, fecha, insigniaPuntaje, vacio } from '../ui.js';
import { lineas, barras, dona } from '../graficos.js';
import { COLOR_POR_NIVEL, PALETA_CAPACIDADES } from '../constantes.js';
import { actualizarAlertas } from '../navegacion.js';
import {
  esAdmin, coachElegido, nombreCoach, puede, moduloActivo,
} from '../sesion.js';

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

const COLOR_PRIORIDAD = { alta: 'danger', media: 'warning', baja: 'info' };

/** Panel con los datos REALES de medición, asistencia, recuperación y alertas (fases 3-6). */
function panelRendimiento(p) {
  const t = p.totales;
  return html`
    <div class="row g-3 mb-4">
      ${tarjetaDato('stopwatch', 'azul', t.resultados_30d, 'Resultados (30 días)')}
      ${tarjetaDato('person-check', 'verde', t.asistencia_30d, 'Asistencia % (30 días)')}
      ${tarjetaDato('calendar-week', 'cian', t.entrenamientos_7d, 'Entrenamientos (7 días)')}
      ${tarjetaDato('heart-pulse', 'ambar', t.fatiga_media_7d, 'Fatiga media (7 días)')}
    </div>
    <div class="row g-3 mb-4">
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header d-flex justify-content-between"><span><i class="bi bi-bell me-2"></i>Alertas abiertas</span><a class="small" href="#/alertas">Ver todas</a></div>
        <div class="list-group list-group-flush">${p.alertas.length ? p.alertas.slice(0, 6).map((a) => html`
          <a href="#/alertas" class="list-group-item list-group-item-action small d-flex gap-2"><span class="badge text-bg-${COLOR_PRIORIDAD[a.prioridad]} align-self-start">${a.prioridad}</span>
            <span><b>${a.deportista || 'Grupo'}</b> · ${a.titulo}<div class="text-muted">${a.motivo}</div></span></a>`)
    : html`<div class="list-group-item small text-muted">Sin alertas abiertas.</div>`}</div></div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-lightning me-2"></i>Últimos resultados y récords</div>
        <div class="list-group list-group-flush">${p.records_recientes.slice(0, 3).map((r) => html`<a class="list-group-item list-group-item-action small text-success" href="#/rendimiento?t=evolucion&deportista=${r.deportista_id}">
            <i class="bi bi-trophy-fill me-1 text-warning"></i>${r.titulo} · ${fecha(r.fecha)}</a>`)}
          ${p.ultimos_resultados.slice(0, 5).map((r) => html`<a class="list-group-item list-group-item-action small d-flex justify-content-between" href="#/rendimiento?t=evolucion&deportista=${r.deportista_id}">
            <span>${r.deportista} · ${r.prueba}</span><span class="fw-semibold">${r.texto}</span></a>`)}
          ${!p.ultimos_resultados.length ? html`<div class="list-group-item small text-muted">Aún no hay resultados. Usa el <a href="#/medicion">Modo Medición</a>.</div>` : ''}</div></div></div>
    </div>`;
}

export async function render(vista, { usuario }) {
  const [datos, panel] = await Promise.all([api.get('/dashboard'), puede('rendimiento.ver') ? api.get('/rendimiento/panel').catch(() => null) : null]);
  const { totales, alertas, graficos } = datos;
  actualizarAlertas(panel ? panel.alertas.length : alertas.length);
  const nombreCorto = usuario.nombre.split(' ')[0];

  montar(vista, html`
    <div class="bienvenida mb-4">
      <div class="position-relative" style="z-index:1">
        <p class="mb-1 text-white-50 small fw-semibold text-uppercase" style="letter-spacing:.08em">${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 class="h3 fw-bold mb-2">${saludo()}, ${nombreCorto}</h2>
        ${esAdmin() ? html`<span class="badge text-bg-warning mb-2"><i class="bi bi-shield-lock me-1"></i>Administrador ·
          ${coachElegido() ? `viendo a ${nombreCoach(coachElegido()) || 'un coach'}` : 'viendo toda la academia'}</span>` : ''}
        <p class="mb-3 text-white-50">${panel?.alertas.length
    ? `Tienes ${panel.alertas.length} alerta(s) abiertas por revisar.`
    : alertas.length ? `Tienes ${alertas.length} alerta(s) de rendimiento por revisar.`
    : totales.deportistas ? 'Todo en orden: no hay alertas de rendimiento.' : 'Empieza cargando a tus deportistas.'}</p>
        <div class="d-flex flex-wrap gap-2">
          ${puede('medicion.usar') ? html`<a class="btn btn-light fw-semibold" href="#/medicion"><i class="bi bi-stopwatch me-1"></i>Modo Medición</a>` : ''}
          ${puede('evaluaciones.gestionar') ? html`<a class="btn btn-outline-light" href="#/evaluaciones/nueva"><i class="bi bi-clipboard-plus me-1"></i>Evaluación por observación</a>` : ''}
          ${puede('importacion.usar') ? html`<a class="btn btn-outline-light" href="#/importar"><i class="bi bi-cloud-arrow-up me-1"></i>Importar Excel</a>` : ''}
          ${puede('ia.usar') && moduloActivo('ia') ? html`<a class="btn btn-outline-light" href="#/ia"><i class="bi bi-stars me-1"></i>Asistente IA</a>` : ''}
          ${puede('usuarios.gestionar') ? html`<a class="btn btn-outline-light" href="#/admin"><i class="bi bi-person-badge me-1"></i>Usuarios</a>` : ''}
        </div>
      </div>
    </div>

    ${panel ? panelRendimiento(panel) : ''}
    ${panel ? html`<h3 class="h6 text-muted text-uppercase mb-3" style="letter-spacing:.06em">Evaluaciones por observación (escala 0-100)</h3>` : ''}
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
