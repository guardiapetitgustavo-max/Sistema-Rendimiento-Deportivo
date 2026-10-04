/**
 * Videos: subida directa al almacenamiento privado (URL firmada), archivo por deportista/prueba,
 * reproducción con URL temporal, comparación A/B lado a lado y observaciones del coach.
 * El análisis automático solo aparece si existe un modelo real; si no: "ANÁLISIS NO DISPONIBLE".
 */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, fecha, vacio, opcionesDeportistas,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { insignia } from '../formularios.js';

const MIME_OK = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

/** Sube el archivo con progreso (XMLHttpRequest permite mostrar el porcentaje). */
function subirArchivo(subida, archivo, alProgreso) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', subida.url);
    xhr.setRequestHeader('Content-Type', archivo.type);
    if (subida.local) xhr.setRequestHeader('X-Requested-With', 'fetch');
    Object.entries(subida.cabeceras || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) alProgreso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La subida falló (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Se perdió la conexión durante la subida'));
    xhr.send(archivo);
  });
}

function bloqueAnalisis(v) {
  const a = v.analisis;
  const medido = a?.disponible && a.medidos && Object.keys(a.medidos).length;
  return html`
    ${v.estado === 'PENDING' || v.estado === 'PROCESSING' ? html`<div class="small text-info"><span class="spinner-border spinner-border-sm me-1"></span>Análisis en cola (${v.estado})…</div>` : ''}
    ${a && !a.disponible ? html`<div class="small text-muted"><i class="bi bi-slash-circle me-1"></i>${a.mensaje || 'ANÁLISIS NO DISPONIBLE'}</div>` : ''}
    ${medido ? html`<div class="small"><span class="fw-semibold">Medido:</span> ${Object.entries(a.medidos).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ')}</div>` : ''}
    ${a?.estimaciones && Object.keys(a.estimaciones).length ? html`<div class="small"><span class="fw-semibold">Estimado (no oficial):</span> ${Object.entries(a.estimaciones).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ')}</div>` : ''}
    ${(v.observaciones || []).map((o) => html`<div class="small border-start border-3 ps-2 mt-1"><span class="fw-semibold">Observación:</span> ${o.observaciones}</div>`)}`;
}

export async function render(vista, { query }) {
  const depId = query.get('deportista') || '';
  const [estado, videos, { datos: deportistas }] = await Promise.all([
    api.get('/videos/estado'), api.get(`/videos${consulta({ deportista_id: depId })}`), api.get('/deportistas'),
  ]);
  const sube = puede('videos.subir');
  montar(vista, html`
    ${encabezado('camera-video', 'Videos', 'Archivo privado por deportista y prueba, comparación A/B y observaciones', sube ? html`<button class="btn btn-primary" data-subir><i class="bi bi-upload me-1"></i>Subir video</button>` : '')}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-3 align-items-center small">
      <select class="form-select form-select-sm w-auto" data-filtro>${opcionesDeportistas(deportistas, depId, 'Todos los deportistas')}</select>
      <span>Almacenamiento: <strong>${estado.almacenamiento || 'no configurado'}</strong> · máx. ${estado.max_mb} MB</span>
      <span>Análisis automático: ${estado.analisis_automatico
    ? (estado.worker.activo ? insignia(`activo (${estado.worker.movimientos.join(', ') || 'metadatos'})`, 'success') : insignia('servicio de análisis inactivo', 'warning'))
    : insignia('ANÁLISIS NO DISPONIBLE', 'secondary')}</span>
      <button class="btn btn-sm btn-outline-primary ms-auto" data-comparar><i class="bi bi-layout-split me-1"></i>Comparar A/B</button>
    </div></div>
    ${videos.length ? html`<div class="row g-3">${videos.map((v) => html`<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body">
      <div class="d-flex gap-2 align-items-start"><input class="form-check-input mt-1" type="checkbox" value="${v.id}" data-sel title="Elegir para comparar">
        <div class="flex-grow-1"><div class="fw-semibold">${v.titulo}</div><div class="small text-muted">${v.deportista} · ${v.prueba || v.tipo_movimiento} · ${fecha(v.fecha)}</div></div>
        ${v.visible_deportista ? html`<i class="bi bi-eye text-success" title="Visible para el deportista"></i>` : html`<i class="bi bi-eye-slash text-muted" title="Solo staff"></i>`}</div>
      <div class="ratio ratio-16x9 my-2 bg-dark rounded d-flex align-items-center justify-content-center" data-reproductor="${v.id}">
        <button class="btn btn-light btn-sm position-absolute top-50 start-50 translate-middle" style="width:auto;height:auto" data-ver="${v.id}"><i class="bi bi-play-fill"></i> Ver</button></div>
      ${bloqueAnalisis(v)}
      ${sube ? html`<div class="d-flex gap-1 mt-2"><button class="btn btn-sm btn-light" data-observar="${v.id}"><i class="bi bi-chat-left-text"></i> Observación</button>
        <button class="btn btn-sm btn-light" data-visible="${v.id}">${v.visible_deportista ? 'Ocultar al deportista' : 'Mostrar al deportista'}</button>
        <button class="btn btn-sm btn-light text-danger ms-auto" data-borrar="${v.id}"><i class="bi bi-trash"></i></button></div>` : ''}
    </div></div></div>`)}</div>` : vacio('Aún no hay videos.', 'camera-video')}`);

  vista.querySelector('[data-filtro]').addEventListener('change', (e) => ir(`/videos${e.target.value ? `?deportista=${e.target.value}` : ''}`));
  vista.querySelector('[data-comparar]').addEventListener('click', () => {
    const sel = [...vista.querySelectorAll('[data-sel]:checked')].map((c) => c.value);
    if (sel.length !== 2) { avisar('Marca exactamente 2 videos para compararlos.', 'info'); return; }
    ir(`/videos/comparar?a=${sel[0]}&b=${sel[1]}`);
  });
  vista.querySelector('[data-subir]')?.addEventListener('click', async () => {
    const pruebas = await api.get('/metodologia/pruebas');
    const modal = modalFormulario({
      titulo: 'Subir video',
      boton: 'Subir',
      cuerpo: html`<div class="row g-3">
        <div class="col-md-6"><label class="form-label small fw-semibold">Deportista *</label><select class="form-select" name="deportista_id" required>${opcionesDeportistas(deportistas, depId)}</select></div>
        <div class="col-md-6"><label class="form-label small fw-semibold">Prueba</label><select class="form-select" name="prueba_id"><option value="">—</option>${pruebas.map((p) => html`<option value="${p.id}">${p.nombre}</option>`)}</select></div>
        <div class="col-md-8"><label class="form-label small fw-semibold">Título *</label><input class="form-control" name="titulo" required maxlength="120"></div>
        <div class="col-md-4"><label class="form-label small fw-semibold">Movimiento</label><input class="form-control" name="tipo_movimiento" placeholder="salida, viraje, sprint…"></div>
        <div class="col-12"><label class="form-label small fw-semibold">Archivo (MP4, MOV, WEBM · máx. ${estado.max_mb} MB) *</label>
          <input class="form-control" type="file" name="archivo" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" capture="environment" required></div>
        <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="visible_deportista" id="vis"><label class="form-check-label" for="vis">Visible para el deportista</label></div></div>
        <div class="col-12"><div class="progress d-none" data-progreso><div class="progress-bar" style="width:0%"></div></div></div></div>`,
      alGuardar: async (datos) => {
        const archivo = modal.querySelector('[name="archivo"]').files[0];
        if (!archivo) throw new Error('Elige un archivo de video');
        if (!MIME_OK.includes(archivo.type)) throw new Error('Formato no admitido (MP4, MOV, WEBM o M4V)');
        if (archivo.size > estado.max_mb * 1048576) throw new Error(`El archivo supera ${estado.max_mb} MB`);
        const { id, subida } = await api.post('/videos', {
          deportista_id: Number(datos.deportista_id), prueba_id: datos.prueba_id ? Number(datos.prueba_id) : null, titulo: datos.titulo,
          tipo_movimiento: datos.tipo_movimiento || null, mime: archivo.type, tamano_bytes: archivo.size, visible_deportista: datos.visible_deportista,
        });
        const barra = modal.querySelector('[data-progreso]');
        barra.classList.remove('d-none');
        await subirArchivo(subida, archivo, (p) => { barra.firstElementChild.style.width = `${p}%`; barra.firstElementChild.textContent = `${p}%`; });
        const v = await api.post(`/videos/${id}/confirmar`);
        avisar(v.estado === 'PENDING' ? 'Video subido. El análisis se procesará en segundo plano.' : 'Video subido.');
        recargarVista();
      },
    });
  });
  vista.addEventListener('click', async (e) => {
    const ver = e.target.closest('[data-ver]');
    const obs = e.target.closest('[data-observar]');
    const vis = e.target.closest('[data-visible]');
    const borrar = e.target.closest('[data-borrar]');
    try {
      if (ver) {
        const { url } = await api.get(`/videos/${ver.dataset.ver}/url`);
        montar(vista.querySelector(`[data-reproductor="${ver.dataset.ver}"]`), html`<video src="${url}" controls playsinline autoplay class="rounded"></video>`);
      } else if (obs) {
        modalFormulario({
          titulo: 'Observación del coach',
          cuerpo: html`<textarea class="form-control" name="observaciones" rows="4" required placeholder="Lo que observas en el video (técnica, posición…)"></textarea>`,
          alGuardar: async (d) => { await api.post(`/videos/${obs.dataset.observar}/observaciones`, d); recargarVista(); },
        });
      } else if (vis) {
        const v = videos.find((x) => String(x.id) === vis.dataset.visible);
        await api.put(`/videos/${v.id}`, { visible_deportista: !v.visible_deportista });
        recargarVista();
      } else if (borrar && await confirmar('¿Eliminar este video? Se borra el archivo.', { peligro: true, boton: 'Eliminar' })) {
        await api.delete(`/videos/${borrar.dataset.borrar}`);
        recargarVista();
      }
    } catch (error) { mostrarError(error); }
  });
}

export async function comparar(vista, { query }) {
  const r = await api.get(`/videos/comparar?a=${query.get('a')}&b=${query.get('b')}`);
  const lado = (v) => html`<div class="col-md-6"><div class="card h-100"><div class="card-body">
    <div class="fw-semibold">${v.titulo}</div><div class="small text-muted mb-2">${v.deportista} · ${v.prueba || v.tipo_movimiento} · ${fecha(v.fecha)}</div>
    <video src="${v.url}" controls playsinline class="w-100 rounded bg-dark" data-video></video>${bloqueAnalisis(v)}</div></div></div>`;
  montar(vista, html`${encabezado('layout-split', 'Comparación A/B', 'Reproduce ambos a la vez o cuadro a cuadro', html`<a class="btn btn-light" href="#/videos"><i class="bi bi-arrow-left me-1"></i>Videos</a>`)}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-2">
      <button class="btn btn-sm btn-primary" data-ambos="play"><i class="bi bi-play-fill"></i> Ambos</button>
      <button class="btn btn-sm btn-light" data-ambos="pause"><i class="bi bi-pause-fill"></i></button>
      <button class="btn btn-sm btn-light" data-paso="-0.04">−1 cuadro</button><button class="btn btn-sm btn-light" data-paso="0.04">+1 cuadro</button>
      <select class="form-select form-select-sm w-auto" data-velocidad>${[0.25, 0.5, 1].map((x) => html`<option value="${x}" ${x === 1 ? 'selected' : ''}>${x}×</option>`)}</select>
    </div></div>
    <div class="row g-3">${lado(r.a)}${lado(r.b)}</div>`);
  const videos = [...vista.querySelectorAll('[data-video]')];
  vista.querySelectorAll('[data-ambos]').forEach((b) => b.addEventListener('click', () => videos.forEach((v) => (b.dataset.ambos === 'play' ? v.play() : v.pause()))));
  vista.querySelectorAll('[data-paso]').forEach((b) => b.addEventListener('click', () => videos.forEach((v) => { v.pause(); v.currentTime = Math.max(0, v.currentTime + Number(b.dataset.paso)); })));
  vista.querySelector('[data-velocidad]').addEventListener('change', (e) => videos.forEach((v) => { v.playbackRate = Number(e.target.value); }));
}
