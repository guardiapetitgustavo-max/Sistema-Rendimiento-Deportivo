/**
 * Portal del deportista y del padre/madre: consulta de SU progreso (o el de sus hijos).
 * Solo lectura: no pueden modificar resultados oficiales.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, fecha, numero, insigniaNivel, insigniaPuntaje, vacio,
} from '../ui.js';
import { lineas, radar } from '../graficos.js';
import { CAPACIDADES } from '../constantes.js';
import { ir } from '../navegacion.js';
import { rolActual, academiaActual } from '../sesion.js';
import { tarjetaDato } from './dashboard.js';

export async function render(vista) {
  const fichas = await api.get('/portal/deportistas');
  // El deportista con una sola ficha va directo a su progreso
  if (fichas.length === 1) {
    await detalle(vista, { params: [fichas[0].id], unico: true });
    return;
  }
  montar(vista, html`
    ${encabezado('graph-up-arrow', rolActual() === 'padre' ? 'Progreso de tus deportistas' : 'Mi progreso',
    `Información compartida por ${academiaActual()?.nombre || 'tu academia'}`)}
    ${fichas.length ? html`<div class="row g-3">${fichas.map((f) => html`
      <div class="col-md-6 col-xl-4"><a class="card tarjeta-funcion h-100 text-decoration-none" href="#/portal/${f.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div><div class="fw-bold fs-5">${f.nombre}</div><div class="small text-muted">${f.codigo} · ${f.disciplina || 'Sin disciplina'} · ${f.categoria || 'Sin categoría'}</div></div>
            ${insigniaNivel(f.nivel)}
          </div>
          <div class="d-flex gap-4 small">
            <div><div class="etiqueta-dato">Promedio</div>${insigniaPuntaje(f.promedio_general)}</div>
            <div><div class="etiqueta-dato">Evaluaciones</div><b>${f.total_evaluaciones}</b></div>
            <div><div class="etiqueta-dato">Última</div><b>${f.ultima_fecha ? fecha(f.ultima_fecha) : '—'}</b></div>
          </div>
        </div></a></div>`)}</div>`
    : html`<div class="card"><div class="card-body">${vacio('Todavía no hay ninguna ficha de deportista vinculada a tu cuenta. Pídeselo a tu academia.', 'person-lines-fill')}</div></div>`}`);
}

export async function detalle(vista, { params: [id], unico = false }) {
  const perfil = await api.get(`/portal/deportistas/${id}`);
  const {
    deportista: d, evaluaciones, fortalezas, aspectos_mejorar: aspectos, evolucion, evolucion_capacidades: capacidades,
  } = perfil;
  const ultima = d.ultima_evaluacion;

  montar(vista, html`
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
      <div>
        ${unico ? '' : html`<a href="#/portal" class="small text-decoration-none"><i class="bi bi-arrow-left"></i> Volver</a>`}
        <h2 class="h4 fw-bold mb-0 mt-1">${unico && rolActual() === 'deportista' ? 'Mi progreso' : d.nombre} <span class="text-muted fs-6">${d.codigo}</span></h2>
        <div class="mt-1">${insigniaNivel(d.nivel)} ${d.disciplina ? html`<span class="badge text-bg-light border">${d.disciplina}</span>` : ''}
          ${d.categoria ? html`<span class="badge text-bg-light border">${d.categoria}</span>` : ''}
          ${d.coach ? html`<span class="small text-muted ms-1"><i class="bi bi-person-badge me-1"></i>Coach: ${d.coach}</span>` : ''}</div>
      </div>
      <span class="badge text-bg-light border align-self-center"><i class="bi bi-eye me-1"></i>Solo consulta</span>
    </div>

    <div class="row g-3 mb-4">
      ${tarjetaDato('graph-up-arrow', 'azul', d.promedio_general, 'Promedio general')}
      ${tarjetaDato('clipboard2-pulse', 'cian', d.total_evaluaciones, 'Evaluaciones')}
      ${tarjetaDato('trophy', 'verde', fortalezas.length, 'Fortalezas actuales')}
      ${tarjetaDato('bullseye', 'ambar', aspectos.length, 'Aspectos por mejorar')}
    </div>

    <div class="row g-3 mb-4">
      <div class="col-lg-8"><div class="card h-100"><div class="card-header"><i class="bi bi-activity me-2"></i>Evolución</div>
        <div class="card-body">${evolucion.fechas.length > 1 ? html`<div style="height:280px"><canvas id="g-evolucion"></canvas></div>`
    : vacio('Se necesitan al menos 2 evaluaciones para ver la evolución', 'activity')}</div></div></div>
      <div class="col-lg-4"><div class="card h-100"><div class="card-header"><i class="bi bi-bullseye me-2"></i>Última evaluación</div>
        <div class="card-body">${ultima ? html`<div style="height:280px"><canvas id="g-radar"></canvas></div>` : vacio('Aún sin evaluaciones', 'bullseye')}</div></div></div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-6"><div class="card h-100"><div class="card-header text-success"><i class="bi bi-hand-thumbs-up me-2"></i>Fortalezas</div>
        <ul class="list-group list-group-flush">${fortalezas.length ? fortalezas.map((f) => html`<li class="list-group-item d-flex justify-content-between"><span>${f.capacidad}</span><span class="badge bg-success">${f.valor}</span></li>`)
    : html`<li class="list-group-item text-muted small">Sin fortalezas destacadas todavía.</li>`}</ul></div></div>
      <div class="col-md-6"><div class="card h-100"><div class="card-header text-warning"><i class="bi bi-arrow-up-right-circle me-2"></i>Por mejorar</div>
        <ul class="list-group list-group-flush">${aspectos.length ? aspectos.map((f) => html`<li class="list-group-item d-flex justify-content-between"><span>${f.capacidad}</span><span class="badge bg-warning text-dark">${f.valor}</span></li>`)
    : html`<li class="list-group-item text-muted small">Nada por debajo del umbral. ¡Buen trabajo!</li>`}</ul></div></div>
    </div>

    ${capacidades.length ? html`<div class="card mb-4"><div class="card-header"><i class="bi bi-arrow-left-right me-2"></i>Primera vs. última evaluación</div>
      <div class="table-responsive"><table class="table table-sm mb-0 align-middle">
        <thead class="table-light"><tr><th>Capacidad</th><th class="text-center">Inicial</th><th class="text-center">Actual</th><th class="text-center">Cambio</th></tr></thead>
        <tbody>${capacidades.map((c) => html`<tr><td>${c.capacidad}</td><td class="text-center">${c.inicial}</td><td class="text-center">${c.final}</td>
          <td class="text-center ${c.diferencia > 0 ? 'text-success' : c.diferencia < 0 ? 'text-danger' : 'text-muted'}">${c.diferencia > 0 ? '+' : ''}${c.diferencia}</td></tr>`)}</tbody>
      </table></div></div>` : ''}

    <div class="card"><div class="card-header"><i class="bi bi-list-check me-2"></i>Historial de evaluaciones</div>
      <div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">
        <thead class="table-light"><tr><th>Fecha</th>${CAPACIDADES.map((c) => html`<th class="text-center" title="${c.nombre}">${c.corto}</th>`)}<th class="text-center">General</th><th>Observaciones</th></tr></thead>
        <tbody>${evaluaciones.length ? evaluaciones.map((e) => html`<tr><td class="text-nowrap">${fecha(e.fecha)}</td>
          ${CAPACIDADES.map((c) => html`<td class="text-center">${numero(e[c.clave])}</td>`)}
          <td class="text-center">${insigniaPuntaje(e.puntuacion_general)}</td><td class="small text-muted">${e.observaciones || ''}</td></tr>`)
    : html`<tr><td colspan="${CAPACIDADES.length + 3}">${vacio('Sin evaluaciones registradas')}</td></tr>`}</tbody>
      </table></div></div>
    <p class="small text-muted mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>Los resultados los registra tu coach. Si ves algún error, coméntaselo.</p>`);

  if (evolucion.fechas.length > 1) {
    lineas(vista.querySelector('#g-evolucion'), evolucion.fechas.map(fecha), [
      { nombre: d.nombre, valores: evolucion.alumno },
      { nombre: `Promedio ${evolucion.nombre_disciplina}`, valores: evolucion.disciplina },
    ]);
  }
  if (ultima) radar(vista.querySelector('#g-radar'), CAPACIDADES.map((c) => c.nombre), CAPACIDADES.map((c) => ultima[c.clave]));
  if (!unico) vista.querySelector('a[href="#/portal"]')?.addEventListener('click', (e) => { e.preventDefault(); ir('/portal'); });
}
