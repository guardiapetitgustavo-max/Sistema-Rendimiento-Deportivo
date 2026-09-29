/** Evaluaciones: listado con filtros, registro manual, edición y baja lógica. */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, opciones, opcionesDeportistas, fecha, numero, insigniaPuntaje, avisar,
  mostrarError, confirmar, datosFormulario, conCarga, tablaPaginada, pintarErrorFormulario,
} from '../ui.js';
import { CAPACIDADES } from '../constantes.js';
import { ir, recargarVista } from '../navegacion.js';
import { esAdmin, coachElegido } from '../sesion.js';

const ORDENES = [
  { valor: 'fecha_desc', texto: 'Más recientes' },
  { valor: 'fecha_asc', texto: 'Más antiguas' },
  { valor: 'puntuacion_desc', texto: 'Mayor puntuación' },
  { valor: 'puntuacion_asc', texto: 'Menor puntuación' },
];

const hoy = () => new Date().toLocaleDateString('en-CA');

export async function darDeBajaEvaluacion(id, alTerminar) {
  const aceptado = await confirmar(
    'La evaluación dejará de mostrarse, pero se conserva en el historial del deportista.',
    { titulo: 'Dar de baja la evaluación', boton: 'Dar de baja', peligro: true },
  );
  if (!aceptado) return;
  try {
    await api.delete(`/evaluaciones/${id}`);
    avisar('Evaluación dada de baja.', 'info');
    await alTerminar();
  } catch (error) {
    mostrarError(error);
  }
}

export async function render(vista, { query }) {
  const filtros = Object.fromEntries(query);
  const verCoach = esAdmin() && !coachElegido();
  const [evaluaciones, { datos: deportistas, categorias }] = await Promise.all([
    api.get(`/evaluaciones${consulta(filtros)}`),
    api.get('/deportistas'),
  ]);

  montar(vista, html`
    ${encabezado('clipboard2-pulse', 'Evaluaciones', 'Historial de evaluaciones por observación directa (escala 0-100)', html`
      <a class="btn btn-primary" href="#/evaluaciones/nueva"><i class="bi bi-clipboard-plus me-1"></i>Registrar evaluación</a>`)}

    <div class="card mb-3"><div class="card-body">
      <form class="row g-2 align-items-end" data-filtros>
        <div class="col-md-3"><label class="form-label small">Buscar</label>
          <input class="form-control" name="q" value="${filtros.q || ''}" placeholder="Nombre o código"></div>
        <div class="col-md-3"><label class="form-label small">Deportista</label>
          <select class="form-select" name="deportista_id">${opcionesDeportistas(deportistas, filtros.deportista_id, 'Todos')}</select></div>
        <div class="col-md-2"><label class="form-label small">Categoría</label>
          <select class="form-select" name="categoria">${opciones(categorias.map((c) => ({ valor: c, texto: c })), filtros.categoria, { vacia: 'Todas' })}</select></div>
        <div class="col-6 col-md-2"><label class="form-label small">Desde</label>
          <input class="form-control" type="date" name="desde" value="${filtros.desde || ''}"></div>
        <div class="col-6 col-md-2"><label class="form-label small">Hasta</label>
          <input class="form-control" type="date" name="hasta" value="${filtros.hasta || ''}"></div>
        <div class="col-md-3"><label class="form-label small">Ordenar por</label>
          <select class="form-select" name="orden">${opciones(ORDENES, filtros.orden || 'fecha_desc')}</select></div>
        <div class="col-md-3 d-flex gap-2">
          <button class="btn btn-primary flex-grow-1"><i class="bi bi-funnel"></i> Filtrar</button>
          <a class="btn btn-light" href="#/evaluaciones" title="Limpiar filtros"><i class="bi bi-x-lg"></i></a>
        </div>
      </form>
    </div></div>

    <div class="card"><div class="card-header small text-muted fw-normal">${evaluaciones.length} evaluación(es)${evaluaciones.length >= 1000 ? ' · se muestran las 1000 más relevantes, usa los filtros para acotar' : ''}</div>
      <div class="table-responsive"><table class="table table-hover table-sm align-middle" data-tabla>
        <thead class="table-light"><tr><th>Fecha</th><th>Deportista</th><th>Categoría</th>
          ${CAPACIDADES.map((c) => html`<th class="text-center" title="${c.nombre}">${c.corto}</th>`)}
          <th class="text-center">General</th><th>Origen</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="paginacion"></div>
    </div>`);

  vista.querySelector('[data-filtros]').addEventListener('submit', (e) => {
    e.preventDefault();
    ir(`/evaluaciones${consulta(datosFormulario(e.target))}`);
  });
  tablaPaginada(vista.querySelector('[data-tabla] tbody'), vista.querySelector('.paginacion'), evaluaciones, (e) => html`
    <tr class="fila-enlace" data-ir="/deportistas/${e.deportista_id}">
      <td class="text-nowrap">${fecha(e.fecha)}</td>
      <td><span class="fw-semibold">${e.nombre}</span> <span class="text-muted small">${e.codigo}</span>
        ${verCoach ? html`<div class="insignia-coach"><i class="bi bi-person-badge"></i>${e.coach}</div>` : ''}</td>
      <td>${e.categoria || '—'}</td>
      ${CAPACIDADES.map((c) => html`<td class="text-center">${numero(e[c.clave])}</td>`)}
      <td class="text-center">${insigniaPuntaje(e.puntuacion_general)}</td>
      <td><span class="badge text-bg-light border">${e.origen}</span></td>
      <td class="text-end text-nowrap">
        <a class="btn btn-sm btn-light" href="#/evaluaciones/${e.id}/editar" title="Editar" aria-label="Editar"><i class="bi bi-pencil"></i></a>
        <button class="btn btn-sm btn-light text-danger" data-baja="${e.id}" title="Dar de baja" aria-label="Dar de baja"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`, { columnas: CAPACIDADES.length + 6, mensajeVacio: 'No hay evaluaciones que coincidan', icono: 'clipboard2-pulse' });

  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-baja]');
    if (boton) darDeBajaEvaluacion(Number(boton.dataset.baja), recargarVista);
  });
}

/** Página de registro (nueva) o edición de una evaluación. */
export async function formulario(vista, { params: [id], query }) {
  const editando = Boolean(id);
  const [evaluacion, { datos: deportistas }] = await Promise.all([
    editando ? api.get(`/evaluaciones/${id}`) : Promise.resolve({ fecha: hoy() }),
    api.get('/deportistas'),
  ]);
  const deportistaId = evaluacion.deportista_id || query.get('deportista');
  const valor = (campo) => evaluacion[campo] ?? '';

  montar(vista, html`
    ${encabezado('clipboard-plus', editando ? 'Editar evaluación' : 'Registrar evaluación',
    'Cada evaluación se suma al historial del deportista. La puntuación general se calcula sola si la dejas vacía.')}
    <form class="card" novalidate><div class="card-body">
      <div class="alert alert-danger d-none" data-error role="alert"></div>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label small fw-semibold">Deportista *</label>
          ${editando
    ? html`<input class="form-control" value="${evaluacion.nombre} (${evaluacion.codigo})" disabled>`
    : html`<select class="form-select" name="deportista_id" required>${opcionesDeportistas(deportistas, deportistaId)}</select>
              ${deportistas.length ? '' : html`<div class="form-text">Primero <a href="#/deportistas">registra un deportista</a>.</div>`}`}
        </div>
        <div class="col-md-3"><label class="form-label small fw-semibold">Fecha</label>
          <input class="form-control" type="date" name="fecha" value="${valor('fecha')}" max="${hoy()}"></div>
        <div class="col-md-3"><label class="form-label small fw-semibold">Puntuación general</label>
          <input class="form-control" type="number" step="0.1" min="0" max="100" name="puntuacion_general" value="${valor('puntuacion_general')}" placeholder="Automática"></div>
        ${CAPACIDADES.map((c) => html`
          <div class="col-6 col-md-3"><label class="form-label small fw-semibold">${c.nombre}</label>
            <input class="form-control" type="number" step="0.1" min="0" max="100" name="${c.clave}" value="${valor(c.clave)}" placeholder="0-100"></div>`)}
        <div class="col-12"><label class="form-label small fw-semibold">Observaciones</label>
          <textarea class="form-control" name="observaciones" rows="3">${valor('observaciones')}</textarea></div>
      </div>
    </div>
    <div class="card-footer d-flex justify-content-end gap-2">
      <button type="button" class="btn btn-light" data-volver>Cancelar</button>
      <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Guardar evaluación</button>
    </div></form>`);

  const form = vista.querySelector('form');
  const destino = () => `/deportistas/${form.deportista_id?.value || evaluacion.deportista_id}`;
  vista.querySelector('[data-volver]').addEventListener('click', () => (window.history.length > 1 ? window.history.back() : ir('/evaluaciones')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cajaError = form.querySelector('[data-error]');
    cajaError.classList.add('d-none');
    try {
      await conCarga(form.querySelector('[type="submit"]'), () => (editando
        ? api.put(`/evaluaciones/${id}`, datosFormulario(form))
        : api.post('/evaluaciones', datosFormulario(form))));
      avisar(editando ? 'Evaluación actualizada.' : 'Evaluación registrada. El historial ya está actualizado.');
      ir(destino());
    } catch (error) {
      pintarErrorFormulario(cajaError, error);
      cajaError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
