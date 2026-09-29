/** Rutina semanal del deportista según su disciplina y sus debilidades. */
import { api } from '../api.js';
import { html, montar, mostrarError, conCarga } from '../ui.js';

const ORIGEN = {
  deporte: 'plantilla específica de su deporte',
  categoria: 'plantilla de su familia de deportes',
  generica: 'plantilla de entrenamiento general',
};

export async function render(vista, { params: [id] }) {
  const r = await api.get(`/deportistas/${id}/rutina`);

  montar(vista, html`
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
      <div>
        <a href="#/deportistas/${id}" class="small text-decoration-none"><i class="bi bi-arrow-left"></i> Perfil de ${r.deportista.nombre}</a>
        <h2 class="h4 fw-bold mb-1 mt-1"><i class="bi bi-calendar-week me-2"></i>Rutina de entrenamiento</h2>
        <p class="text-muted small mb-0">${r.disciplina} · Enfoque: <b>${r.enfoque}</b> (${ORIGEN[r.origen]}) · Nivel actual: <b>${r.nivel}</b></p>
      </div>
      <button class="btn btn-outline-danger no-imprimir" data-pdf><i class="bi bi-file-earmark-pdf me-1"></i>Descargar PDF</button>
    </div>

    <div class="row g-3 mb-3">
      ${r.bloques.map((b) => html`<div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><span class="badge text-bg-primary me-2">${b.dia}</span>${b.enfoque}</div>
        <ul class="list-group list-group-flush">${b.ejercicios.map(([nombre, dosis, descanso, objetivo]) => html`
          <li class="list-group-item"><div class="fw-semibold small">${nombre}</div>
            <div class="small text-muted"><i class="bi bi-repeat"></i> ${dosis} · <i class="bi bi-pause-circle"></i> ${descanso} · ${objetivo}</div></li>`)}
        </ul>
      </div></div>`)}
    </div>

    <div class="row g-3">
      ${r.refuerzos.length ? html`<div class="col-lg-6"><div class="card h-100">
        <div class="card-header text-danger"><i class="bi bi-bandaid me-2"></i>Refuerzo de aspectos por mejorar</div>
        <ul class="list-group list-group-flush">${r.refuerzos.map((x) => html`
          <li class="list-group-item small"><b>${x.capacidad}:</b> ${x.ejercicio} (${x.dosis}) · ${x.nota}</li>`)}</ul>
      </div></div>` : ''}
      <div class="${r.refuerzos.length ? 'col-lg-6' : 'col-12'}"><div class="card h-100">
        <div class="card-header"><i class="bi bi-lightbulb me-2"></i>Recomendaciones</div>
        <ul class="list-group list-group-flush">${r.recomendaciones.map((x) => html`<li class="list-group-item small">${x}</li>`)}</ul>
      </div></div>
    </div>`);

  vista.querySelector('[data-pdf]').addEventListener('click', (e) =>
    conCarga(e.currentTarget, () => api.descargar(`/deportistas/${id}/rutina/pdf`)).catch(mostrarError));
}
