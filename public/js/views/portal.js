/**
 * Portal del deportista y del padre/madre: consulta de SU progreso (o el de sus hijos).
 * Solo lectura: no pueden modificar resultados oficiales.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, fecha, numero, insigniaNivel, insigniaPuntaje, vacio, modalFormulario, avisar, mostrarError,
} from '../ui.js';
import { campos, limpiar } from '../formularios.js';
import { CAMPOS_RECUPERACION } from './entrenamiento.js';
import { lineas, radar } from '../graficos.js';
import { CAPACIDADES } from '../constantes.js';
import { ir } from '../navegacion.js';
import { rolActual, academiaActual, puede, moduloActivo } from '../sesion.js';
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
    <div data-seguimiento class="mb-4"></div>

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
  await seguimiento(vista.querySelector('[data-seguimiento]'), id);
}

// ---------------------------------------------------------------------------
// Seguimiento (fases 4-9): marcas reales, asistencia, objetivos, recomendaciones aprobadas,
// recuperación propia, videos autorizados, pagos y comunicados
// ---------------------------------------------------------------------------
const COLOR_OBJ = { activo: 'primary', alcanzado: 'success', vencido: 'danger' };

async function seguimiento(caja, id) {
  let s;
  try {
    s = await api.get(`/portal/deportistas/${id}/seguimiento`);
  } catch (error) {
    montar(caja, html`<div class="alert alert-light border small">No se pudo cargar el seguimiento: ${error.message}</div>`);
    return;
  }
  const esDeportista = rolActual() === 'deportista';
  const [videos, pagos, comunicados] = await Promise.all([
    puede('portal.videos') && moduloActivo('video') ? api.get('/portal/videos').catch(() => []) : [],
    puede('portal.pagos') && moduloActivo('comercial') ? api.get('/portal/pagos').catch(() => []) : [],
    api.get('/portal/comunicados').catch(() => []),
  ]);
  const r7 = s.recuperacion.resumen;
  montar(caja, html`
    ${s.logros.length ? html`<div class="alert alert-success d-flex gap-2 align-items-start"><i class="bi bi-trophy-fill fs-4"></i><div>
      ${s.logros.slice(0, 3).map((l) => html`<div><strong>${l.titulo}</strong> · <span class="small">${l.motivo}</span></div>`)}</div></div>` : ''}
    <div class="row g-3 mb-3">
      <div class="col-lg-8"><div class="card h-100"><div class="card-header"><i class="bi bi-stopwatch me-2"></i>Mis marcas (resultados oficiales)</div>
        ${s.evolucion.length ? html`<div class="table-responsive"><table class="table table-sm mb-0 align-middle">
          <thead class="table-light"><tr><th>Prueba</th><th>Actual</th><th>Mejor marca</th><th>Tendencia</th></tr></thead>
          <tbody>${s.evolucion.map((e) => html`<tr><td>${e.prueba}${e.contexto ? html` <span class="badge text-bg-light">${e.contexto}</span>` : ''}</td>
            <td>${e.textos.actual} <span class="small text-muted">${fecha(e.actual.fecha)}</span></td>
            <td class="text-success fw-semibold">${e.textos.mejor_marca || '—'}${e.record_personal ? html` <i class="bi bi-trophy-fill text-warning"></i>` : ''}</td>
            <td>${{ mejora: html`<span class="text-success">Mejorando</span>`, empeora: html`<span class="text-danger">Bajando</span>`, estable: 'Estable' }[e.tendencia.clasificacion] || html`<span class="small text-muted">Pocos datos</span>`}</td></tr>`)}</tbody></table></div>`
    : html`<div class="card-body">${vacio('Aún no hay marcas registradas.', 'stopwatch')}</div>`}</div></div>
      <div class="col-lg-4"><div class="card h-100"><div class="card-body">
        <div class="etiqueta-dato">Asistencia</div><div class="display-6 fw-bold">${s.asistencia.porcentaje ?? '—'}${s.asistencia.porcentaje !== null ? '%' : ''}</div>
        <div class="small text-muted mb-3">${s.asistencia.registros.length} registros recientes</div>
        <div class="etiqueta-dato">Recuperación (7 días)</div>
        <div class="small">Sueño ${r7.sueno_medio_h ?? '—'} h · Fatiga ${r7.fatiga_media ?? '—'}/10${r7.dias_con_dolor ? ` · ${r7.dias_con_dolor} día(s) con dolor` : ''}</div>
        ${esDeportista && puede('portal.recuperacion') ? html`<button class="btn btn-primary btn-sm mt-3 w-100" data-mi-recuperacion><i class="bi bi-heart-pulse me-1"></i>Registrar cómo estoy hoy</button>` : ''}
        ${esDeportista && puede('portal.nutricion') && moduloActivo('nutricion') ? html`<button class="btn btn-light btn-sm mt-2 w-100" data-mi-comida><i class="bi bi-cup-hot me-1"></i>Registrar mis comidas</button>` : ''}
      </div></div></div>
    </div>
    <div class="row g-3">
      <div class="col-md-6"><div class="card h-100"><div class="card-header"><i class="bi bi-bullseye me-2"></i>Mis objetivos</div>
        <ul class="list-group list-group-flush">${s.objetivos.length ? s.objetivos.map((o) => html`<li class="list-group-item d-flex justify-content-between gap-2">
          <span>${o.descripcion}${o.fecha_limite ? html` <span class="small text-muted">· hasta ${fecha(o.fecha_limite)}</span>` : ''}</span>
          <span class="badge text-bg-${COLOR_OBJ[o.estado] || 'secondary'}">${o.estado}</span></li>`) : html`<li class="list-group-item small text-muted">Sin objetivos todavía.</li>`}</ul></div></div>
      <div class="col-md-6"><div class="card h-100"><div class="card-header"><i class="bi bi-lightbulb me-2"></i>Recomendaciones de tu coach</div>
        <ul class="list-group list-group-flush">${s.recomendaciones.length ? s.recomendaciones.map((r) => html`<li class="list-group-item small">${r.texto}</li>`)
    : html`<li class="list-group-item small text-muted">Aún no hay recomendaciones aprobadas.</li>`}</ul></div></div>
      ${videos.length ? html`<div class="col-12"><div class="card"><div class="card-header"><i class="bi bi-camera-video me-2"></i>Mis videos</div><div class="card-body row g-2">
        ${videos.map((v) => html`<div class="col-md-4"><div class="border rounded p-2"><div class="small fw-semibold">${v.titulo}</div><div class="small text-muted">${fecha(v.fecha)}</div>
          <div class="ratio ratio-16x9 mt-1 bg-dark rounded" data-reproductor="${v.id}"><button class="btn btn-sm btn-light m-auto" style="width:auto;height:auto" data-ver-video="${v.id}"><i class="bi bi-play-fill"></i></button></div>
          ${(v.observaciones || []).map((o) => html`<div class="small mt-1 border-start ps-2">${o.observaciones}</div>`)}</div></div>`)}</div></div></div>` : ''}
      ${pagos.length ? html`<div class="col-md-6"><div class="card h-100"><div class="card-header"><i class="bi bi-cash-coin me-2"></i>Pagos</div>
        <ul class="list-group list-group-flush">${pagos.slice(0, 8).map((p) => html`<li class="list-group-item d-flex justify-content-between small">
          <span>${p.concepto} <span class="text-muted">· vence ${fecha(p.fecha_vencimiento)}</span></span>
          <span>${p.moneda} ${Number(p.monto).toFixed(2)} <span class="badge text-bg-${{ pagado: 'success', pendiente: 'warning', vencido: 'danger' }[p.estado] || 'secondary'}">${p.estado}</span></span></li>`)}</ul></div></div>` : ''}
      ${comunicados.length ? html`<div class="col-md-6"><div class="card h-100"><div class="card-header"><i class="bi bi-megaphone me-2"></i>Comunicados</div>
        <ul class="list-group list-group-flush">${comunicados.slice(0, 5).map((c) => html`<li class="list-group-item"><div class="fw-semibold small">${c.titulo}</div><div class="small text-muted">${c.cuerpo}</div></li>`)}</ul></div></div>` : ''}
    </div>`);

  caja.querySelector('[data-mi-recuperacion]')?.addEventListener('click', () => modalFormulario({
    titulo: '¿Cómo estás hoy?', tamano: 'modal-lg', cuerpo: campos(CAMPOS_RECUPERACION),
    alGuardar: async (datos) => {
      await api.post('/portal/recuperacion', limpiar(CAMPOS_RECUPERACION, datos));
      avisar('¡Gracias! Tu coach podrá verlo.');
      seguimiento(caja, id);
    },
  }));
  caja.querySelector('[data-mi-comida]')?.addEventListener('click', () => {
    const defs = [
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', defecto: new Date().toLocaleDateString('en-CA') },
      { nombre: 'hidratacion_litros', etiqueta: 'Agua (litros)', tipo: 'numero', min: 0, max: 24 },
      { nombre: 'desayuno', etiqueta: 'Desayuno' }, { nombre: 'hora_desayuno', etiqueta: 'Hora', tipo: 'hora' },
      { nombre: 'almuerzo', etiqueta: 'Almuerzo' }, { nombre: 'hora_almuerzo', etiqueta: 'Hora', tipo: 'hora' },
      { nombre: 'cena', etiqueta: 'Cena' }, { nombre: 'hora_cena', etiqueta: 'Hora', tipo: 'hora' },
      { nombre: 'colaciones', etiqueta: 'Snacks', col: 'col-12' },
    ];
    modalFormulario({
      titulo: 'Mis comidas', tamano: 'modal-lg', cuerpo: campos(defs),
      alGuardar: async (datos) => { await api.post('/portal/alimentacion', limpiar(defs, datos)); avisar('Comidas registradas.'); },
    });
  });
  caja.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ver-video]');
    if (!b) return;
    try {
      const { url } = await api.get(`/portal/videos/${b.dataset.verVideo}/url`);
      if (url) montar(caja.querySelector(`[data-reproductor="${b.dataset.verVideo}"]`), html`<video src="${url}" controls playsinline class="rounded"></video>`);
    } catch (error) { mostrarError(error); }
  });
}
