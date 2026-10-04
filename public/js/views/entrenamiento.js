/**
 * Entrenamientos (sesiones con ejercicios, cierre y carga sRPE), asistencia y recuperación.
 */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, fecha, vacio, conCarga, opcionesDeportistas,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { campos, limpiar, tabla, insignia, progreso } from '../formularios.js';
import { barrasLibres } from '../graficos.js';

const COLOR_ESTADO = { planificada: 'info', realizada: 'success', cancelada: 'secondary' };
const ESTADOS_ASIS = [
  { valor: 'presente', texto: 'Presente', color: 'success' }, { valor: 'tardanza', texto: 'Tarde', color: 'warning' },
  { valor: 'ausente', texto: 'Ausente', color: 'danger' }, { valor: 'justificado', texto: 'Justificado', color: 'secondary' },
];

// ---------------------------------------------------------------------------
// Sesiones de entrenamiento
// ---------------------------------------------------------------------------
export async function render(vista, { query }) {
  const desde = query.get('desde') || new Date(Date.now() - 21 * 86400000).toLocaleDateString('en-CA');
  const [sesiones, resumen, plantillas] = await Promise.all([
    api.get(`/entrenamientos/sesiones${consulta({ desde, equipo_id: query.get('equipo') })}`), api.get('/estructura/resumen'), api.get('/entrenamientos/plantillas'),
  ]);
  const gestiona = puede('entrenamientos.gestionar');
  montar(vista, html`
    ${encabezado('calendar-week', 'Entrenamientos', 'Planifica, registra asistencia y esfuerzo (sRPE) y cierra cada sesión', gestiona ? html`<button class="btn btn-primary" data-nueva><i class="bi bi-plus-lg me-1"></i>Nueva sesión</button>` : '')}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center small">
      <label>Desde</label><input type="date" class="form-control form-control-sm w-auto" value="${desde}" data-desde>
      <select class="form-select form-select-sm w-auto" data-equipo><option value="">Todos los equipos</option>
        ${resumen.equipos.map((e) => html`<option value="${e.id}" ${String(e.id) === query.get('equipo') ? 'selected' : ''}>${e.nombre}</option>`)}</select>
    </div></div>
    <div class="card">${tabla(sesiones, [
    { titulo: 'Fecha', valor: (s) => html`<span class="fw-semibold">${fecha(s.fecha)}</span> <span class="small text-muted">${s.hora ? String(s.hora).slice(0, 5) : ''}</span>` },
    { titulo: 'Equipo / tipo', valor: (s) => html`${s.equipo || 'Sin equipo'}<div class="small text-muted">${s.tipo || s.deporte || ''}</div>` },
    { titulo: 'Objetivo', valor: (s) => s.objetivo || '—' },
    { titulo: 'Duración', valor: (s) => (s.duracion_min ? `${s.duracion_min} min` : '—') },
    { titulo: 'Asistencia', valor: (s) => (s.registrados ? `${s.presentes}/${s.registrados}` : '—') },
    { titulo: 'Estado', valor: (s) => insignia(s.estado, COLOR_ESTADO[s.estado]) },
  ], { vacio: 'No hay sesiones en este periodo.', atributos: (s) => html`data-ir="/entrenamientos/${s.id}" role="button"` })}</div>`);

  const filtrar = () => ir(`/entrenamientos?${new URLSearchParams({ desde: vista.querySelector('[data-desde]').value, ...(vista.querySelector('[data-equipo]').value ? { equipo: vista.querySelector('[data-equipo]').value } : {}) })}`);
  vista.querySelector('[data-desde]').addEventListener('change', filtrar);
  vista.querySelector('[data-equipo]').addEventListener('change', filtrar);
  vista.querySelector('[data-nueva]')?.addEventListener('click', () => formularioSesion(null, resumen, plantillas));
}

function filaEjercicio(e = {}) {
  return html`<div class="row g-1 mb-1 align-items-center" data-ejercicio>
    <div class="col-12 col-md-4"><input class="form-control form-control-sm" data-c="nombre" placeholder="Ejercicio" value="${e.nombre || ''}"></div>
    <div class="col-3 col-md-1"><input class="form-control form-control-sm" data-c="series" type="number" min="1" placeholder="Series" value="${e.series ?? ''}"></div>
    <div class="col-3 col-md-1"><input class="form-control form-control-sm" data-c="repeticiones" type="number" min="1" placeholder="Reps" value="${e.repeticiones ?? ''}"></div>
    <div class="col-3 col-md-2"><input class="form-control form-control-sm" data-c="distancia_m" type="number" min="0" step="any" placeholder="Metros" value="${e.distancia_m ?? ''}"></div>
    <div class="col-3 col-md-1"><input class="form-control form-control-sm" data-c="duracion_min" type="number" min="0" step="any" placeholder="Min" value="${e.duracion_min ?? ''}"></div>
    <div class="col-4 col-md-1"><input class="form-control form-control-sm" data-c="intensidad" type="number" min="1" max="10" placeholder="Int." value="${e.intensidad ?? ''}"></div>
    <div class="col-6 col-md-1"><input class="form-control form-control-sm" data-c="descanso_s" type="number" min="0" placeholder="Desc. s" value="${e.descanso_s ?? ''}"></div>
    <div class="col-2 col-md-1 text-end"><button type="button" class="btn btn-sm btn-light text-danger" data-quitar><i class="bi bi-x"></i></button></div></div>`;
}

function formularioSesion(sesion, resumen, plantillas) {
  const defs = [
    { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, defecto: new Date().toLocaleDateString('en-CA'), col: 'col-md-3' },
    { nombre: 'hora', etiqueta: 'Hora', tipo: 'hora', col: 'col-md-3' },
    { nombre: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'entero', min: 1, max: 600, col: 'col-md-3' },
    { nombre: 'intensidad', etiqueta: 'Intensidad planificada (1-10)', tipo: 'entero', min: 1, max: 10, col: 'col-md-3' },
    { nombre: 'equipo_id', etiqueta: 'Equipo', tipo: 'select', opciones: (resumen.mis_equipos ? resumen.equipos.filter((e) => resumen.mis_equipos.includes(e.id)) : resumen.equipos).map((e) => ({ valor: e.id, texto: e.nombre })) },
    { nombre: 'plantilla_id', etiqueta: 'Tipo de sesión', tipo: 'select', opciones: plantillas.map((p) => ({ valor: p.id, texto: p.nombre })) },
    { nombre: 'deporte_id', etiqueta: 'Deporte', tipo: 'select', opciones: resumen.deportes.map((d) => ({ valor: d.id, texto: d.nombre })) },
    { nombre: 'instalacion_id', etiqueta: 'Instalación', tipo: 'select', opciones: resumen.instalaciones.map((i) => ({ valor: i.id, texto: i.nombre })) },
    { nombre: 'objetivo', etiqueta: 'Objetivo de la sesión', col: 'col-12' },
    { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', col: 'col-12' },
  ];
  const modal = modalFormulario({
    titulo: sesion ? 'Editar sesión' : 'Nueva sesión de entrenamiento',
    tamano: 'modal-xl',
    cuerpo: html`${campos(defs, sesion || {})}
      <div class="d-flex justify-content-between align-items-center mt-3 mb-1"><span class="fw-semibold small">Ejercicios</span>
        <button type="button" class="btn btn-sm btn-light" data-agregar><i class="bi bi-plus"></i> Añadir</button></div>
      <div data-ejercicios>${(sesion?.ejercicios?.length ? sesion.ejercicios : [{}]).map(filaEjercicio)}</div>`,
    alGuardar: async (datos) => {
      const ejercicios = [...modal.querySelectorAll('[data-ejercicio]')].map((f) => Object.fromEntries([...f.querySelectorAll('[data-c]')]
        .map((i) => [i.dataset.c, i.value === '' ? null : (i.dataset.c === 'nombre' ? i.value : Number(i.value))]))).filter((e) => e.nombre);
      const cuerpo = { ...limpiar(defs, datos), ejercicios };
      const r = sesion ? await api.put(`/entrenamientos/sesiones/${sesion.id}`, cuerpo) : await api.post('/entrenamientos/sesiones', cuerpo);
      avisar('Sesión guardada.');
      return () => (sesion ? recargarVista() : ir(`/entrenamientos/${r.id}`));
    },
  });
  modal.querySelector('[data-agregar]').addEventListener('click', () => modal.querySelector('[data-ejercicios]').insertAdjacentHTML('beforeend', String(filaEjercicio())));
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-quitar]')) e.target.closest('[data-ejercicio]').remove(); });
}

export async function detalle(vista, { params: [id] }) {
  const [s, resumen, plantillas] = await Promise.all([api.get(`/entrenamientos/sesiones/${id}`), api.get('/estructura/resumen'), api.get('/entrenamientos/plantillas')]);
  const gestiona = puede('entrenamientos.gestionar');
  const asistencia = puede('asistencia.gestionar');
  let participantes = s.participantes;
  if (!participantes.length) participantes = s.asistencia.map((a) => ({ id: a.deportista_id, nombre: a.deportista, codigo: a.codigo }));
  const registro = new Map(s.asistencia.map((a) => [a.deportista_id, a]));

  montar(vista, html`
    ${encabezado('calendar-check', `Sesión del ${fecha(s.fecha)}`, `${s.objetivo || 'Sin objetivo'}${s.duracion_min ? ` · ${s.duracion_min} min` : ''}`, html`
      <a class="btn btn-light" href="#/entrenamientos"><i class="bi bi-arrow-left me-1"></i>Volver</a>
      ${gestiona && s.estado !== 'realizada' ? html`<button class="btn btn-light" data-editar><i class="bi bi-pencil me-1"></i>Editar</button>` : ''}
      ${gestiona && s.estado === 'planificada' ? html`<button class="btn btn-success" data-cerrar><i class="bi bi-check2-circle me-1"></i>Marcar realizada</button>` : ''}`)}
    <div class="row g-3">
      <div class="col-lg-5"><div class="card h-100"><div class="card-body">
        <div class="d-flex justify-content-between"><span class="etiqueta-dato">Contenido</span>${insignia(s.estado, COLOR_ESTADO[s.estado])}</div>
        ${s.ejercicios.length ? html`<ol class="small ps-3 mt-2">${s.ejercicios.map((e) => html`<li><strong>${e.nombre}</strong>
          <span class="text-muted">${[e.series && `${e.series}×`, e.repeticiones && `${e.repeticiones} rep`, e.distancia_m && `${e.distancia_m} m`, e.duracion_min && `${e.duracion_min} min`, e.intensidad && `int. ${e.intensidad}`, e.descanso_s && `desc. ${e.descanso_s}s`].filter(Boolean).join(' · ')}</span></li>`)}</ol>`
    : html`<p class="text-muted small mt-2">Sin ejercicios registrados.</p>`}
        <div class="small text-muted">Totales: ${s.totales.metros ? `${s.totales.metros} m · ` : ''}${s.totales.minutos ? `${s.totales.minutos} min · ` : ''}${s.totales.series} series</div>
        ${s.carga_media_srpe ? html`<div class="mt-2"><span class="etiqueta-dato">Carga media (sRPE)</span> <strong>${s.carga_media_srpe}</strong> UA</div>` : ''}
        ${s.observaciones ? html`<p class="small mt-2 mb-0">${s.observaciones}</p>` : ''}
      </div></div></div>
      <div class="col-lg-7"><div class="card h-100"><div class="card-header fw-semibold">Asistencia y esfuerzo percibido (RPE 0-10)</div>
        ${participantes.length ? html`<form data-asistencia><div class="list-group list-group-flush">${participantes.map((p) => {
    const a = registro.get(p.id);
    return html`<div class="list-group-item d-flex flex-wrap gap-2 align-items-center" data-participante="${p.id}">
            <div class="flex-grow-1">${p.nombre} <span class="small text-muted">${p.codigo}</span></div>
            <div class="btn-group btn-group-sm" role="group">${ESTADOS_ASIS.map((e) => html`<input type="radio" class="btn-check" name="e_${p.id}" id="e_${p.id}_${e.valor}" value="${e.valor}" ${(a?.estado || '') === e.valor ? 'checked' : ''} ${asistencia ? '' : 'disabled'}>
              <label class="btn btn-outline-${e.color}" for="e_${p.id}_${e.valor}">${e.texto}</label>`)}</div>
            <input class="form-control form-control-sm" style="width:4.5rem" type="number" min="0" max="10" name="rpe_${p.id}" value="${a?.rpe_sesion ?? ''}" placeholder="RPE" ${asistencia ? '' : 'disabled'}>
          </div>`;
  })}</div>
          ${asistencia ? html`<div class="card-body d-flex gap-2"><button type="button" class="btn btn-light btn-sm" data-todos>Todos presentes</button>
            <button class="btn btn-primary btn-sm ms-auto"><i class="bi bi-save me-1"></i>Guardar asistencia</button></div>` : ''}</form>`
    : html`<div class="card-body">${vacio('La sesión no tiene equipo: asígnale uno para ver a los participantes.')}</div>`}
      </div></div>
    </div>`);

  vista.querySelector('[data-editar]')?.addEventListener('click', () => formularioSesion(s, resumen, plantillas));
  vista.querySelector('[data-cerrar]')?.addEventListener('click', async (e) => {
    if (!await confirmar('¿Marcar la sesión como realizada? Su contenido quedará fijo.')) return;
    try { await conCarga(e.currentTarget, () => api.post(`/entrenamientos/sesiones/${id}/cerrar`, {})); recargarVista(); } catch (error) { mostrarError(error); }
  });
  vista.querySelector('[data-todos]')?.addEventListener('click', () => vista.querySelectorAll('input[value="presente"]').forEach((r) => { r.checked = true; }));
  vista.querySelector('[data-asistencia]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = new FormData(e.target);
    const registros = participantes.filter((p) => datos.get(`e_${p.id}`)).map((p) => ({
      deportista_id: p.id, estado: datos.get(`e_${p.id}`), rpe_sesion: datos.get(`rpe_${p.id}`) === '' ? null : Number(datos.get(`rpe_${p.id}`)),
    }));
    if (!registros.length) { avisar('Marca el estado de al menos un deportista.', 'info'); return; }
    try {
      await conCarga(e.submitter, () => api.post('/asistencia', { sesion_id: Number(id), registros }));
      avisar(`Asistencia guardada (${registros.length}).`);
      recargarVista();
    } catch (error) {
      mostrarError(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Asistencia: estadísticas y carga semanal
// ---------------------------------------------------------------------------
export async function asistenciaVista(vista, { query }) {
  const desde = query.get('desde') || new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA');
  const r = await api.get(`/asistencia/estadisticas${consulta({ desde })}`);
  montar(vista, html`
    ${encabezado('person-check', 'Asistencia', '% de asistencia = (presentes + tardanzas) / registros sin contar los justificados', html`
      <input type="date" class="form-control w-auto" value="${desde}" data-desde>`)}
    <div class="row g-3 mb-3">
      <div class="col-md-4"><div class="card h-100"><div class="card-body"><div class="etiqueta-dato">Asistencia global</div>
        <div class="display-6 fw-bold">${r.porcentaje_global ?? '—'}${r.porcentaje_global !== null ? '%' : ''}</div><div class="small text-muted">${r.registros} registros</div></div></div></div>
      <div class="col-md-8"><div class="card h-100"><div class="card-body"><div class="etiqueta-dato">Carga semanal de entrenamiento (sRPE = RPE × minutos)</div>
        ${r.carga_semanal.length ? html`<div style="height:180px"><canvas data-carga></canvas></div>` : html`<p class="small text-muted">Sin RPE registrado.</p>`}</div></div></div>
    </div>
    <div class="card">${tabla(r.deportistas, [
    { titulo: 'Deportista', valor: (d) => html`<a href="#/deportistas/${d.deportista_id}">${d.deportista}</a> <span class="small text-muted">${d.codigo}</span>` },
    { titulo: 'Asistencia', valor: (d) => progreso(d.porcentaje, d.porcentaje >= 85 ? 'success' : d.porcentaje >= 75 ? 'warning' : 'danger'), clase: 'w-25' },
    { titulo: 'P / T / A / J', valor: (d) => `${d.presentes} / ${d.tardanzas} / ${d.ausencias} / ${d.justificadas}` },
    { titulo: 'Carga total (UA)', valor: (d) => d.carga_total_srpe ?? '—' },
  ], { vacio: 'Sin registros de asistencia en el periodo.' })}</div>`);
  if (r.carga_semanal.length) barrasLibres(vista.querySelector('[data-carga]'), r.carga_semanal.map((c) => fecha(c.semana)), r.carga_semanal.map((c) => c.carga), { etiqueta: 'sRPE' });
  vista.querySelector('[data-desde]').addEventListener('change', (e) => ir(`/asistencia?desde=${e.target.value}`));
}

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------
export const CAMPOS_RECUPERACION = [
  { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, defecto: new Date().toLocaleDateString('en-CA'), col: 'col-6 col-md-4' },
  { nombre: 'horas_sueno', etiqueta: 'Horas de sueño', tipo: 'numero', min: 0, max: 24, paso: '0.5', col: 'col-6 col-md-4' },
  { nombre: 'calidad_sueno', etiqueta: 'Calidad del sueño (1-5)', tipo: 'entero', min: 1, max: 5, col: 'col-6 col-md-4' },
  { nombre: 'fatiga', etiqueta: 'Fatiga (1-10)', tipo: 'entero', min: 1, max: 10, col: 'col-6 col-md-3' },
  { nombre: 'estres', etiqueta: 'Estrés (1-10)', tipo: 'entero', min: 1, max: 10, col: 'col-6 col-md-3' },
  { nombre: 'recuperacion', etiqueta: 'Recuperación (1-10)', tipo: 'entero', min: 1, max: 10, col: 'col-6 col-md-3' },
  { nombre: 'rpe', etiqueta: 'Esfuerzo de ayer (RPE 0-10)', tipo: 'entero', min: 0, max: 10, col: 'col-6 col-md-3' },
  { nombre: 'dolor', etiqueta: 'Tengo dolor o molestia', tipo: 'check', col: 'col-12' },
  { nombre: 'dolor_zona', etiqueta: 'Zona del dolor', col: 'col-md-8' },
  { nombre: 'dolor_intensidad', etiqueta: 'Intensidad (0-10)', tipo: 'entero', min: 0, max: 10, col: 'col-md-4' },
  { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', col: 'col-12' },
];

export async function recuperacionVista(vista, { query }) {
  const depId = query.get('deportista') || '';
  const [registros, { datos: deportistas }] = await Promise.all([api.get(`/recuperacion${consulta({ deportista_id: depId })}`), api.get('/deportistas')]);
  const registra = puede('recuperacion.registrar');
  montar(vista, html`
    ${encabezado('heart-pulse', 'Recuperación', 'Sueño, fatiga, estrés y dolor reportado. Seguimiento, no diagnóstico médico.', registra ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Registrar</button>` : '')}
    <div class="card mb-3"><div class="card-body py-2"><select class="form-select form-select-sm w-auto" data-filtro>${opcionesDeportistas(deportistas, depId, 'Todos los deportistas')}</select></div></div>
    <div class="card">${tabla(registros.slice(0, 300), [
    { titulo: 'Fecha', valor: (r) => fecha(r.fecha) },
    { titulo: 'Deportista', valor: (r) => r.deportista },
    { titulo: 'Sueño', valor: (r) => (r.horas_sueno !== null ? html`<span class="${r.horas_sueno < 7 ? 'text-danger fw-semibold' : ''}">${r.horas_sueno} h</span>` : '—') },
    { titulo: 'Fatiga', valor: (r) => (r.fatiga !== null ? html`<span class="${r.fatiga >= 8 ? 'text-danger fw-semibold' : ''}">${r.fatiga}</span>` : '—') },
    { titulo: 'Estrés', valor: (r) => r.estres ?? '—' },
    { titulo: 'Recuperación', valor: (r) => r.recuperacion ?? '—' },
    { titulo: 'Dolor', valor: (r) => (r.dolor ? html`<span class="text-danger"><i class="bi bi-bandaid me-1"></i>${r.dolor_zona || 'sí'} (${r.dolor_intensidad ?? '?'})</span>` : '—') },
    { titulo: 'Origen', valor: (r) => insignia(r.origen, 'light') },
  ], { vacio: 'Sin registros.' })}</div>`);
  vista.querySelector('[data-filtro]').addEventListener('change', (e) => ir(`/recuperacion${e.target.value ? `?deportista=${e.target.value}` : ''}`));
  vista.querySelector('[data-nuevo]')?.addEventListener('click', () => modalFormulario({
    titulo: 'Registrar recuperación',
    tamano: 'modal-lg',
    cuerpo: html`<div class="mb-3"><label class="form-label small fw-semibold">Deportista *</label><select class="form-select" name="deportista_id" required>${opcionesDeportistas(deportistas, depId)}</select></div>${campos(CAMPOS_RECUPERACION)}`,
    alGuardar: async (datos) => {
      await api.post('/recuperacion', { ...limpiar(CAMPOS_RECUPERACION, datos), deportista_id: Number(datos.deportista_id) });
      avisar('Recuperación registrada.');
      recargarVista();
    },
  }));
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------
const COLOR_OBJ = { activo: 'primary', alcanzado: 'success', vencido: 'danger', cancelado: 'secondary' };

export async function objetivosVista(vista) {
  const [objetivos, { datos: deportistas }, resumen, pruebas] = await Promise.all([
    api.get('/objetivos'), api.get('/deportistas'), api.get('/estructura/resumen'), api.get('/metodologia/pruebas'),
  ]);
  const gestiona = puede('objetivos.gestionar');
  montar(vista, html`
    ${encabezado('bullseye', 'Objetivos', 'El progreso se calcula con los resultados, la asistencia y los entrenamientos reales', gestiona ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo objetivo</button>` : '')}
    <div class="card">${tabla(objetivos, [
    { titulo: 'Objetivo', valor: (o) => html`<span class="fw-semibold">${o.descripcion}</span><div class="small text-muted">${o.deportista || o.equipo || o.categoria} · ${o.tipo}${o.prueba ? ` · ${o.prueba}` : ''}</div>` },
    { titulo: 'Meta', valor: (o) => html`${o.valor_objetivo}${o.tipo === 'asistencia' ? '%' : o.unidad ? ` ${o.unidad}` : ''}<div class="small text-muted">inicio ${o.valor_inicial ?? '—'} · actual ${o.valor_actual ?? '—'}</div>` },
    { titulo: 'Progreso', valor: (o) => progreso(o.progreso, o.estado === 'alcanzado' ? 'success' : 'primary'), clase: 'w-25' },
    { titulo: 'Límite', valor: (o) => (o.fecha_limite ? fecha(o.fecha_limite) : '—') },
    { titulo: 'Estado', valor: (o) => insignia(o.estado, COLOR_OBJ[o.estado]) },
  ], {
    acciones: (o) => (gestiona && o.estado !== 'alcanzado' ? html`<button class="btn btn-sm btn-light" data-cancelar="${o.id}" title="${o.estado === 'cancelado' ? 'Reactivar' : 'Cancelar'}">
      <i class="bi bi-${o.estado === 'cancelado' ? 'arrow-counterclockwise' : 'x-circle'}"></i></button>` : ''),
    vacio: 'Sin objetivos.',
  })}</div>`);

  vista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    const o = objetivos.find((x) => x.id === Number(b.dataset.cancelar));
    try { await api.put(`/objetivos/${o.id}`, { estado: o.estado === 'cancelado' ? 'activo' : 'cancelado' }); recargarVista(); } catch (error) { mostrarError(error); }
  });
  vista.querySelector('[data-nuevo]')?.addEventListener('click', () => {
    const defs = [
      { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', vacia: false, opciones: [{ valor: 'rendimiento', texto: 'Rendimiento (marca en una prueba)' }, { valor: 'asistencia', texto: 'Asistencia (%)' }, { valor: 'entrenamiento', texto: 'Entrenamientos asistidos (nº)' }] },
      { nombre: 'descripcion', etiqueta: 'Descripción', requerido: true },
      { nombre: 'deportista_id', etiqueta: 'Deportista', tipo: 'select', opciones: deportistas.map((d) => ({ valor: d.id, texto: d.nombre })) },
      { nombre: 'equipo_id', etiqueta: '… o equipo', tipo: 'select', opciones: resumen.equipos.map((x) => ({ valor: x.id, texto: x.nombre })) },
      { nombre: 'prueba_id', etiqueta: 'Prueba (rendimiento)', tipo: 'select', opciones: pruebas.map((p) => ({ valor: p.id, texto: `${p.nombre} (${p.unidad})` })) },
      { nombre: 'valor_objetivo', etiqueta: 'Valor objetivo', tipo: 'numero', requerido: true, ayuda: 'En tiempos usa segundos (1:04.32 = 64.32)' },
      { nombre: 'fecha_inicio', etiqueta: 'Inicio', tipo: 'fecha', defecto: new Date().toLocaleDateString('en-CA') },
      { nombre: 'fecha_limite', etiqueta: 'Fecha límite', tipo: 'fecha' },
    ];
    modalFormulario({
      titulo: 'Nuevo objetivo',
      tamano: 'modal-lg',
      cuerpo: campos(defs),
      alGuardar: async (datos) => {
        await api.post('/objetivos', limpiar(defs, datos));
        avisar('Objetivo creado.');
        recargarVista();
      },
    });
  });
}
