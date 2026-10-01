/** Perfil individual del deportista: evolución, fortalezas, predicción, alertas y alimentación. */
import { api } from '../api.js';
import {
  html, montar, fecha, fechaHora, numero, insigniaNivel, insigniaPuntaje, vacio, mostrarError, colorNivel,
} from '../ui.js';
import { lineas, radar } from '../graficos.js';
import { CAPACIDADES } from '../constantes.js';
import { ir, recargarVista } from '../navegacion.js';
import { abrirFormularioDeportista, darDeBajaDeportista } from './deportistas.js';
import { puede, moduloActivo } from '../sesion.js';
import { darDeBajaEvaluacion } from './evaluaciones.js';
import { abrirFormularioAlimentacion } from './alimentacion.js';

const dato = (etiqueta, valor) => html`<div class="col-6 col-md-4"><div class="etiqueta-dato">${etiqueta}</div><div class="fw-semibold">${valor}</div></div>`;

const flecha = (diferencia) => {
  if (diferencia > 0) return html`<span class="text-success"><i class="bi bi-arrow-up-short"></i>+${diferencia}</span>`;
  if (diferencia < 0) return html`<span class="text-danger"><i class="bi bi-arrow-down-short"></i>${diferencia}</span>`;
  return html`<span class="text-muted">=</span>`;
};

const listaCapacidades = (items, color, mensajeVacio) => (items.length
  ? html`<ul class="list-group list-group-flush">${items.map((i) => html`
      <li class="list-group-item d-flex justify-content-between"><span>${i.capacidad}</span><span class="badge bg-${color}">${i.valor}</span></li>`)}</ul>`
  : vacio(mensajeVacio, 'dash-circle'));

export async function render(vista, { params: [id] }) {
  const perfil = await api.get(`/deportistas/${id}/perfil`);
  const {
    deportista: d, evaluaciones, prediccion, evolucion, alertas, alimentacion,
  } = perfil;
  const recargar = recargarVista;
  const ultima = d.ultima_evaluacion;
  const puedeEvaluar = puede('evaluaciones.gestionar');
  const nutricion = moduloActivo('nutricion') && puede('alimentacion.ver');

  montar(vista, html`
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
      <div>
        <a href="#/deportistas" class="small text-decoration-none"><i class="bi bi-arrow-left"></i> Deportistas</a>
        <h2 class="h4 fw-bold mb-0 mt-1">${d.nombre} <span class="text-muted fs-6">${d.codigo}</span></h2>
        <div class="mt-1">${insigniaNivel(d.nivel)} ${d.disciplina ? html`<span class="badge text-bg-light border">${d.disciplina}</span>` : ''}</div>
      </div>
      <div class="d-flex flex-wrap gap-2">
        ${puedeEvaluar ? html`<a class="btn btn-success" href="#/evaluaciones/nueva?deportista=${d.id}"><i class="bi bi-clipboard-plus me-1"></i>Registrar evaluación</a>` : ''}
        <a class="btn btn-outline-primary" href="#/deportistas/${d.id}/rutina"><i class="bi bi-calendar-week me-1"></i>Ver rutina</a>
        <div class="dropdown">
          <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Más</button>
          <ul class="dropdown-menu dropdown-menu-end">
            ${nutricion && puede('alimentacion.gestionar') ? html`<li><button class="dropdown-item" data-accion="alimentacion"><i class="bi bi-egg-fried me-2"></i>Registrar alimentación</button></li>` : ''}
            ${puede('reportes.ver') ? html`<li><button class="dropdown-item" data-accion="excel"><i class="bi bi-file-earmark-excel me-2"></i>Reporte en Excel</button></li>
            <li><button class="dropdown-item" data-accion="pdf"><i class="bi bi-file-earmark-pdf me-2"></i>Reporte en PDF</button></li>` : ''}
            ${puede('deportistas.gestionar') ? html`<li><button class="dropdown-item" data-accion="editar"><i class="bi bi-pencil me-2"></i>Editar datos</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger" data-accion="baja"><i class="bi bi-person-dash me-2"></i>Dar de baja</button></li>` : ''}
          </ul>
        </div>
      </div>
    </div>

    ${alertas.length ? html`<div class="alert alert-warning">
      ${alertas.map((a) => html`<div><i class="bi bi-exclamation-triangle-fill me-1 text-${a.severidad}"></i>${a.mensaje}</div>`)}
    </div>` : ''}

    <div class="row g-3 mb-3">
      <div class="col-lg-7"><div class="card h-100">
        <div class="card-header"><i class="bi bi-person-vcard me-2"></i>Datos deportivos</div>
        <div class="card-body"><div class="row g-3">
          ${dato('Edad', d.edad ? `${d.edad} años` : '—')}
          ${dato('Categoría', d.categoria || '—')}
          ${dato('Disciplina', d.disciplina || '—')}
          ${dato('Registrado', fecha(d.fecha_registro))}
          ${dato('Evaluaciones', d.total_evaluaciones)}
          ${dato('Promedio general', numero(d.promedio_general))}
          ${dato('Última evaluación', fecha(ultima?.fecha))}
          ${dato('Hidratación promedio', alimentacion.promedio_hidratacion !== null ? `${alimentacion.promedio_hidratacion} L` : '—')}
        </div></div>
      </div></div>
      <div class="col-lg-5"><div class="card h-100">
        <div class="card-header"><i class="bi bi-cpu me-2"></i>Predicción del modelo ML</div>
        <div class="card-body">${prediccion ? html`
          <div class="d-flex align-items-center gap-3 mb-2">
            <span class="badge fs-6 text-bg-${colorNivel(prediccion.nivel)}">${prediccion.nivel}</span>
            <span class="small text-muted">Confianza: <b>${prediccion.confianza}%</b> · ${fechaHora(prediccion.fecha)}</span>
          </div>
          ${prediccion.modelo_demo ? html`<div class="small text-warning mb-2"><i class="bi bi-info-circle"></i> Modelo entrenado con datos de demostración.</div>` : ''}
          <p class="small mb-0 text-muted">Estimación estadística de apoyo, no un diagnóstico.</p>`
    : html`${vacio('Aún no hay predicción para este deportista', 'cpu')}
          ${moduloActivo('ml') && puede('ml.usar') ? html`<div class="text-center"><a class="btn btn-sm btn-primary" href="#/ml">Ir a Machine Learning</a></div>` : ''}`}
        </div>
      </div></div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-8"><div class="card h-100">
        <div class="card-header"><i class="bi bi-graph-up me-2"></i>Evolución: alumno vs. ${evolucion.nombre_disciplina} vs. academia</div>
        <div class="card-body">${evolucion.fechas.length ? html`<div class="grafico"><canvas id="g-evolucion"></canvas></div>` : vacio('Sin evaluaciones todavía')}</div>
      </div></div>
      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><i class="bi bi-bullseye me-2"></i>Perfil de capacidades (última)</div>
        <div class="card-body">${ultima ? html`<div class="grafico"><canvas id="g-radar"></canvas></div>` : vacio('Sin evaluaciones todavía')}</div>
      </div></div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-6 col-xl-3"><div class="card h-100">
        <div class="card-header text-success"><i class="bi bi-star me-2"></i>Fortalezas</div>
        <div class="card-body p-0">${listaCapacidades(perfil.fortalezas, 'success', 'Sin fortalezas marcadas (≥75)')}</div>
      </div></div>
      <div class="col-md-6 col-xl-3"><div class="card h-100">
        <div class="card-header text-danger"><i class="bi bi-arrow-up-right-circle me-2"></i>Aspectos por mejorar</div>
        <div class="card-body p-0">${listaCapacidades(perfil.aspectos_mejorar, 'danger', 'Sin debilidades marcadas (<55)')}</div>
      </div></div>
      <div class="col-xl-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-lightbulb me-2"></i>Recomendaciones de entrenamiento</div>
        <div class="card-body">${perfil.recomendacion ? html`<p class="texto-ia">${perfil.recomendacion}</p>` : vacio('Registra una evaluación para obtener recomendaciones')}</div>
      </div></div>
    </div>

    ${perfil.evolucion_capacidades.length ? html`<div class="card mb-3">
      <div class="card-header"><i class="bi bi-arrow-left-right me-2"></i>Evolución por capacidad (primera vs. última evaluación)</div>
      <div class="card-body p-0"><div class="table-responsive"><table class="table table-sm mb-0 align-middle">
        <thead class="table-light"><tr><th>Capacidad</th><th class="text-center">Inicial</th><th class="text-center">Actual</th><th class="text-center">Cambio</th></tr></thead>
        <tbody>${perfil.evolucion_capacidades.map((c) => html`<tr><td>${c.capacidad}</td><td class="text-center">${c.inicial}</td>
          <td class="text-center">${c.final}</td><td class="text-center">${flecha(c.diferencia)}</td></tr>`)}</tbody>
      </table></div></div>
    </div>` : ''}

    <div class="card mb-3">
      <div class="card-header"><i class="bi bi-clipboard2-data me-2"></i>Historial de evaluaciones</div>
      <div class="card-body p-0"><div class="table-responsive"><table class="table table-hover table-sm mb-0 align-middle">
        <thead class="table-light"><tr><th>Fecha</th>${CAPACIDADES.map((c) => html`<th class="text-center" title="${c.nombre}">${c.corto}</th>`)}
          <th class="text-center">General</th><th>Observaciones</th><th></th></tr></thead>
        <tbody>${evaluaciones.length ? evaluaciones.map((e) => html`<tr>
          <td class="text-nowrap">${fecha(e.fecha)}</td>
          ${CAPACIDADES.map((c) => html`<td class="text-center">${numero(e[c.clave])}</td>`)}
          <td class="text-center">${insigniaPuntaje(e.puntuacion_general)}</td>
          <td class="small text-muted">${e.observaciones || ''}</td>
          <td class="text-end text-nowrap">${puedeEvaluar ? html`
            <a class="btn btn-sm btn-outline-primary" href="#/evaluaciones/${e.id}/editar" title="Editar"><i class="bi bi-pencil"></i></a>
            <button class="btn btn-sm btn-outline-danger" data-baja-evaluacion="${e.id}" title="Dar de baja"><i class="bi bi-trash"></i></button>` : ''}
          </td></tr>`) : html`<tr><td colspan="12">${vacio('Sin evaluaciones registradas')}</td></tr>`}</tbody>
      </table></div></div>
    </div>

    ${nutricion ? html`<div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="bi bi-egg-fried me-2"></i>Alimentación reciente</span>
        <a class="btn btn-sm btn-outline-primary" href="#/alimentacion?deportista_id=${d.id}">Ver todo</a>
      </div>
      <div class="card-body p-0"><div class="table-responsive"><table class="table table-sm mb-0">
        <thead class="table-light"><tr><th>Fecha</th><th>Desayuno</th><th>Almuerzo</th><th>Cena</th><th>Agua (L)</th><th>Sueño (h)</th></tr></thead>
        <tbody>${alimentacion.recientes.length ? alimentacion.recientes.map((a) => html`<tr>
          <td>${fecha(a.fecha)}</td><td>${a.desayuno || '—'}</td><td>${a.almuerzo || '—'}</td><td>${a.cena || '—'}</td>
          <td>${numero(a.hidratacion_litros)}</td><td>${numero(a.horas_sueno)}</td></tr>`)
    : html`<tr><td colspan="6">${vacio('Sin registros de alimentación')}</td></tr>`}</tbody>
      </table></div></div>
    </div>` : ''}`);

  if (evolucion.fechas.length) {
    lineas(vista.querySelector('#g-evolucion'), evolucion.fechas.map(fecha), [
      { nombre: d.nombre, valores: evolucion.alumno },
      { nombre: `Promedio ${evolucion.nombre_disciplina}`, valores: evolucion.disciplina },
      { nombre: 'Promedio academia', valores: evolucion.academia },
    ]);
  }
  if (ultima) radar(vista.querySelector('#g-radar'), CAPACIDADES.map((c) => c.nombre), CAPACIDADES.map((c) => ultima[c.clave]));

  const acciones = {
    alimentacion: () => abrirFormularioAlimentacion({ deportista_id: d.id }, [d], recargar),
    excel: () => api.descargar(`/reportes/individual/excel?deportista_id=${d.id}`).catch(mostrarError),
    pdf: () => api.descargar(`/reportes/individual/pdf?deportista_id=${d.id}`).catch(mostrarError),
    editar: () => abrirFormularioDeportista(d, recargar),
    baja: () => darDeBajaDeportista(d, () => ir('/deportistas')),
  };
  vista.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => acciones[b.dataset.accion]()));
  vista.querySelectorAll('[data-baja-evaluacion]').forEach((b) => b.addEventListener('click', () =>
    darDeBajaEvaluacion(Number(b.dataset.bajaEvaluacion), recargar)));
}
