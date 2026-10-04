/**
 * Inteligencia: alertas con su motivo y los datos que las generaron, análisis trazables (deportista,
 * 360°, equipo), recomendaciones que revisa una persona y asistente que responde con los datos reales.
 * Si no hay datos suficientes se muestra "DATOS INSUFICIENTES": nunca se inventan resultados.
 */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, fecha, fechaHora, vacio, conCarga, opcionesDeportistas,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede, moduloActivo } from '../sesion.js';
import { tabla, pestanas, insignia, COLOR_PRIORIDAD } from '../formularios.js';

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
const TEXTO_ESTADO = { nueva: 'Nueva', vista: 'Vista', resuelta: 'Resuelta', descartada: 'Descartada' };

export async function alertas(vista, { query }) {
  const estado = query.get('estado') || 'nueva,vista';
  const tipo = query.get('tipo') || '';
  const lista = await api.get(`/inteligencia/alertas${consulta({ estado, tipo })}`);
  const gestiona = puede('alertas.gestionar');
  const tipos = [...new Set(lista.map((a) => a.tipo))];
  montar(vista, html`
    ${encabezado('bell', 'Alertas', 'Generadas por reglas configurables con los datos reales; cada una explica su motivo', html`
      ${gestiona && moduloActivo('ia_alertas') ? html`<button class="btn btn-primary" data-evaluar><i class="bi bi-arrow-repeat me-1"></i>Evaluar ahora</button>` : ''}
      ${puede('metodologia.ver') ? html`<a class="btn btn-light" href="#/metodologia?t=reglas"><i class="bi bi-sliders me-1"></i>Reglas</a>` : ''}`)}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-2">
      ${[['nueva,vista', 'Abiertas'], ['resuelta', 'Resueltas'], ['descartada', 'Descartadas']].map(([v, t]) => html`<a class="btn btn-sm ${estado === v ? 'btn-primary' : 'btn-light'}" href="#/alertas?estado=${v}">${t}</a>`)}
      <select class="form-select form-select-sm w-auto ms-auto" data-tipo><option value="">Todos los tipos</option>${tipos.map((t) => html`<option ${t === tipo ? 'selected' : ''}>${t}</option>`)}</select>
    </div></div>
    ${lista.length ? html`<div class="row g-3">${lista.map((a) => html`<div class="col-lg-6"><div class="card h-100 borde-${COLOR_PRIORIDAD[a.prioridad]}"><div class="card-body">
      <div class="d-flex justify-content-between gap-2"><div class="fw-bold">${a.titulo}</div>
        <div class="text-nowrap">${insignia(a.prioridad, COLOR_PRIORIDAD[a.prioridad])} ${insignia(TEXTO_ESTADO[a.estado], 'light')}</div></div>
      <div class="small text-muted mb-1">${a.deportista ? html`<a href="#/deportistas/${a.deportista_id}">${a.deportista}</a> · ` : ''}${fechaHora(a.creado_en)}</div>
      <p class="mb-2">${a.motivo}</p>
      <details class="small"><summary class="text-muted">Datos que la generaron</summary><pre class="small bg-body-tertiary p-2 rounded mb-0">${JSON.stringify(a.datos, null, 2)}</pre></details>
      ${gestiona && ['nueva', 'vista'].includes(a.estado) ? html`<div class="d-flex gap-2 mt-2">
        <button class="btn btn-sm btn-success" data-estado="${a.id}:resuelta"><i class="bi bi-check2 me-1"></i>Resuelta</button>
        <button class="btn btn-sm btn-light" data-estado="${a.id}:descartada">Descartar</button>
        ${a.estado === 'nueva' ? html`<button class="btn btn-sm btn-light" data-estado="${a.id}:vista">Marcar vista</button>` : ''}</div>` : ''}
    </div></div></div>`)}</div>` : vacio('No hay alertas en esta vista.', 'bell-slash')}`);

  vista.querySelector('[data-tipo]').addEventListener('change', (e) => ir(`/alertas?${new URLSearchParams({ estado, ...(e.target.value ? { tipo: e.target.value } : {}) })}`));
  vista.querySelector('[data-evaluar]')?.addEventListener('click', async (e) => {
    try {
      const r = await conCarga(e.currentTarget, () => api.post('/inteligencia/alertas/evaluar'));
      avisar(`Evaluación completa: ${r.creadas} alerta(s) nueva(s).`);
      recargarVista();
    } catch (error) { mostrarError(error); }
  });
  vista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-estado]');
    if (!b) return;
    const [id, nuevo] = b.dataset.estado.split(':');
    try { await api.put(`/inteligencia/alertas/${id}`, { estado: nuevo }); recargarVista(); } catch (error) { mostrarError(error); }
  });
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------
const PESTANAS = [
  { clave: 'deportista', texto: 'Deportista / 360°', icono: 'person-bounding-box' },
  { clave: 'equipo', texto: 'Equipo', icono: 'people' },
  { clave: 'recomendaciones', texto: 'Recomendaciones', icono: 'check2-square' },
  { clave: 'asistente', texto: 'Preguntar a los datos', icono: 'chat-dots' },
  { clave: 'historial', texto: 'Historial', icono: 'clock-history' },
];

const lista = (titulo, items, icono, color) => (items?.length ? html`<div class="mb-3"><div class="fw-semibold small text-${color} mb-1"><i class="bi bi-${icono} me-1"></i>${titulo}</div>
  <ul class="small mb-0 ps-3">${items.map((i) => html`<li>${i.texto || i}</li>`)}</ul></div>` : '');

export function pintarAnalisis(r) {
  const insuf = !r.suficiente;
  return html`<div class="card"><div class="card-body">
    <div class="d-flex flex-wrap justify-content-between gap-2 mb-2"><div class="small text-muted">${r.tipo === '360' ? 'Análisis 360°' : 'Análisis'} · ${r.modelo} v${r.version} · ${fechaHora(r.creado_en)}</div>
      ${insignia(insuf ? 'DATOS INSUFICIENTES' : `Confianza ${r.confianza}`, insuf ? 'secondary' : { alta: 'success', media: 'warning', baja: 'danger' }[r.confianza] || 'info')}</div>
    <p class="fw-semibold">${r.resumen}</p>
    <div class="row"><div class="col-md-6">${lista('Fortalezas', r.fortalezas, 'hand-thumbs-up', 'success')}${lista('Tendencias', r.tendencias, 'graph-up', 'primary')}</div>
      <div class="col-md-6">${lista('Aspectos a mejorar', r.debilidades, 'arrow-up-circle', 'warning')}${lista('Riesgos', r.riesgos, 'exclamation-triangle', 'danger')}</div></div>
    ${lista('Recomendaciones (pendientes de aprobación del coach)', r.recomendaciones, 'lightbulb', 'info')}
    ${lista('Datos faltantes', r.datos_faltantes, 'question-circle', 'secondary')}
    <details class="small"><summary class="text-muted">Datos y configuración usados</summary><pre class="small bg-body-tertiary p-2 rounded">${JSON.stringify({ datos_usados: r.datos_usados, configuracion: r.configuracion }, null, 2)}</pre></details>
    <div class="small text-muted mt-2"><i class="bi bi-info-circle me-1"></i>${r.aviso}</div>
  </div></div>`;
}

export async function analisis(vista, { query }) {
  const activa = query.get('t') || 'deportista';
  let cuerpo = '';
  let despues = () => {};
  if (activa === 'deportista') {
    const { datos: deportistas } = await api.get('/deportistas');
    const id = query.get('deportista') || '';
    cuerpo = html`<div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2 align-items-center">
      <select class="form-select w-auto" data-dep>${opcionesDeportistas(deportistas, id)}</select>
      ${moduloActivo('ia_analisis') && puede('ia.analizar') ? html`<button class="btn btn-primary" data-analizar="deportista"><i class="bi bi-stars me-1"></i>Analizar rendimiento</button>` : ''}
      ${moduloActivo('ia_360') && puede('ia.360') ? html`<button class="btn btn-outline-primary" data-analizar="360"><i class="bi bi-bullseye me-1"></i>Análisis 360°</button>` : ''}
    </div></div><div data-resultado></div>`;
    despues = () => vista.querySelectorAll('[data-analizar]').forEach((b) => b.addEventListener('click', async () => {
      const dep = vista.querySelector('[data-dep]').value;
      if (!dep) { avisar('Elige un deportista.', 'info'); return; }
      try {
        const r = await conCarga(b, () => api.post(`/inteligencia/analisis/deportistas/${dep}${b.dataset.analizar === '360' ? '/360' : ''}`));
        montar(vista.querySelector('[data-resultado]'), pintarAnalisis(r));
      } catch (error) { mostrarError(error); }
    }));
  } else if (activa === 'equipo') {
    const equipos = await api.get('/estructura/equipos');
    cuerpo = html`<div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2">
      <select class="form-select w-auto" data-equipo><option value="">Equipo…</option>${equipos.map((e) => html`<option value="${e.id}">${e.nombre}</option>`)}</select>
      <button class="btn btn-primary" data-analizar-equipo><i class="bi bi-stars me-1"></i>Analizar equipo</button></div></div><div data-resultado></div>`;
    despues = () => vista.querySelector('[data-analizar-equipo]').addEventListener('click', async (e) => {
      const eq = vista.querySelector('[data-equipo]').value;
      if (!eq) return;
      try {
        const r = await conCarga(e.currentTarget, () => api.post(`/inteligencia/analisis/equipos/${eq}`));
        montar(vista.querySelector('[data-resultado]'), html`<div class="card"><div class="card-body"><p class="fw-semibold">${r.resumen}</p>
          ${r.suficiente ? html`${tabla(r.pruebas, [{ titulo: 'Prueba', valor: (p) => html`${p.prueba}${p.contexto ? ` (${p.contexto})` : ''}` },
    { titulo: 'Medidos', valor: (p) => p.deportistas_medidos }, { titulo: 'Media', valor: (p) => `${p.media} ${p.unidad}` }, { titulo: 'Mejor', valor: (p) => `${p.mejor} ${p.unidad}` }])}
          <div class="row mt-3"><div class="col-md-6">${lista('Con tendencia de mejora', r.destacados.map((d) => `${d.nombre} (${d.pruebas_mejoran} prueba/s)`), 'graph-up-arrow', 'success')}</div>
          <div class="col-md-6">${lista('Requieren atención', r.atencion.map((d) => `${d.nombre} (${d.pruebas_empeoran} prueba/s empeoran)`), 'exclamation-triangle', 'danger')}</div></div>` : ''}
          <div class="small text-muted">${r.aviso}</div></div></div>`);
      } catch (error) { mostrarError(error); }
    });
  } else if (activa === 'recomendaciones') {
    const recs = await api.get(`/inteligencia/recomendaciones${consulta({ estado: query.get('estado') || 'pendiente' })}`);
    const aprueba = puede('recomendaciones.aprobar');
    cuerpo = html`<div class="d-flex gap-2 mb-3">${['pendiente', 'aprobada', 'rechazada'].map((e) => html`<a class="btn btn-sm ${(query.get('estado') || 'pendiente') === e ? 'btn-primary' : 'btn-light'}" href="#/analisis?t=recomendaciones&estado=${e}">${e}</a>`)}</div>
      <div class="alert alert-info small">Las recomendaciones automáticas solo las ve el deportista cuando un coach o profesional las aprueba (puede editarlas antes).</div>
      ${recs.length ? html`<div class="list-group">${recs.map((r) => html`<div class="list-group-item"><div class="d-flex flex-wrap gap-2 align-items-start">
        <div class="flex-grow-1"><div class="small text-muted">${r.deportista} · ${r.categoria} · ${fecha(r.creado_en)}${r.revisor ? ` · revisó ${r.revisor}` : ''}</div>
          <textarea class="form-control form-control-sm mt-1" rows="2" data-texto="${r.id}" ${aprueba && r.estado === 'pendiente' ? '' : 'disabled'}>${r.texto}</textarea></div>
        ${aprueba && r.estado === 'pendiente' ? html`<div class="d-flex flex-column gap-1"><button class="btn btn-sm btn-success" data-revisar="${r.id}:aprobada">Aprobar</button>
          <button class="btn btn-sm btn-light" data-revisar="${r.id}:rechazada">Rechazar</button></div>` : insignia(r.estado, r.estado === 'aprobada' ? 'success' : 'secondary')}
      </div></div>`)}</div>` : vacio('No hay recomendaciones en este estado.')}`;
    despues = () => vista.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-revisar]');
      if (!b) return;
      const [id, estado] = b.dataset.revisar.split(':');
      try {
        await api.put(`/inteligencia/recomendaciones/${id}`, { estado, texto: vista.querySelector(`[data-texto="${id}"]`).value });
        avisar(estado === 'aprobada' ? 'Aprobada: ya la ve el deportista.' : 'Rechazada.');
        recargarVista();
      } catch (error) { mostrarError(error); }
    });
  } else if (activa === 'asistente') {
    cuerpo = html`<div class="card"><div class="card-body">
      <div class="small text-muted mb-2">Ejemplos: "mejores marcas en velocidad 30 m", "¿quién mejoró este mes?", "asistencia baja", "¿quiénes tienen más fatiga?", "alertas", "objetivos".</div>
      <form class="d-flex gap-2" data-preguntar><input class="form-control" name="pregunta" placeholder="Pregunta sobre los datos de tu academia…" required>
        <button class="btn btn-primary"><i class="bi bi-send"></i></button></form>
      <div class="mt-3" data-respuestas></div></div></div>`;
    despues = () => vista.querySelector('[data-preguntar]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pregunta = e.target.pregunta.value;
      try {
        const r = await conCarga(e.submitter, () => api.post('/inteligencia/preguntar', { pregunta }));
        vista.querySelector('[data-respuestas]').insertAdjacentHTML('afterbegin', String(html`<div class="border rounded p-3 mb-2"><div class="small text-muted mb-1"><i class="bi bi-person me-1"></i>${pregunta}</div>
          <div style="white-space:pre-line">${r.respuesta}</div></div>`));
        e.target.reset();
      } catch (error) { mostrarError(error); }
    });
  } else {
    const h = await api.get('/inteligencia/analisis');
    cuerpo = html`<div class="card">${tabla(h, [
      { titulo: 'Fecha', valor: (a) => fechaHora(a.creado_en) },
      { titulo: 'Tipo', valor: (a) => a.tipo },
      { titulo: 'Deportista', valor: (a) => a.deportista || '—' },
      { titulo: 'Resumen', valor: (a) => html`<span class="small">${a.resumen || ''}</span>` },
      { titulo: 'Datos', valor: (a) => insignia(a.suficiente ? 'suficientes' : 'insuficientes', a.suficiente ? 'success' : 'secondary') },
      { titulo: 'Por', valor: (a) => a.usuario || '—' },
    ], { vacio: 'Aún no hay análisis.' })}</div>`;
  }

  montar(vista, html`${encabezado('stars', 'Análisis inteligente', 'Motor de reglas trazable: cada conclusión indica los datos en que se basa')}
    ${pestanas('analisis', PESTANAS, activa)}${cuerpo}`);
  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/analisis?t=${b.dataset.pestana}`)));
  despues();
}
