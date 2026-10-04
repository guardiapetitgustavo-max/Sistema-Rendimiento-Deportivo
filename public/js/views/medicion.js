/**
 * Modo Medición (pensado para el teléfono en la cancha, la pista o la piscina):
 * - sesiones de evaluación y registro rápido por intento (tiempos como 4.82, 1:04.32…),
 * - cronómetro en pantalla con parciales,
 * - Modo Piscina: varios carriles con una salida común y llegada por carril,
 * - cola SIN CONEXIÓN: lo que no se pudo enviar se guarda en el teléfono y se sincroniza sin duplicar,
 * - cronómetro con dos dispositivos (salida en uno, llegada en otro) sincronizados con el reloj del servidor.
 */
import { api, ErrorApi } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, fecha, conCarga, vacio,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { campos, limpiar, tabla, insignia } from '../formularios.js';
import {
  parsearTiempo, formatearValor, formatearTiempo, claveUnica, textoVariacion, TEXTO_FUENTE,
} from '../medidas.js';

// ---------------------------------------------------------------------------
// Cola sin conexión (localStorage) — cada resultado lleva su clave de idempotencia
// ---------------------------------------------------------------------------
const CLAVE_COLA = 'sporteval-cola-medicion';
const leerCola = () => {
  try { return JSON.parse(window.localStorage.getItem(CLAVE_COLA) || '[]'); } catch { return []; }
};
const guardarCola = (cola) => {
  try { window.localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch { /* sin almacenamiento */ }
};

export const pendientes = () => leerCola().length;

/** Envía un resultado; si no hay conexión lo deja en la cola del teléfono. */
async function enviarResultado(item) {
  const datos = { ...item, clave_idempotencia: item.clave_idempotencia || claveUnica() };
  try {
    return { guardado: await api.post('/medicion/resultados', datos) };
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 0) {
      guardarCola([...leerCola(), datos]);
      return { enCola: true };
    }
    throw error;
  }
}

export async function sincronizar({ silencioso = false } = {}) {
  const cola = leerCola();
  if (!cola.length) return null;
  const r = await api.post('/medicion/resultados/lote', { resultados: cola });
  // Se quitan de la cola los guardados y los duplicados; los errores de validación se conservan para revisarlos
  const conError = new Set(r.detalle.filter((d) => d.estado === 'error').map((d) => d.clave_idempotencia));
  guardarCola(cola.filter((c) => conError.has(c.clave_idempotencia)));
  if (!silencioso || r.guardados) avisar(`Sincronizado: ${r.guardados} guardados, ${r.duplicados} ya estaban${r.errores ? `, ${r.errores} con errores` : ''}.`, r.errores ? 'warning' : 'success');
  return r;
}
window.addEventListener('online', () => { sincronizar({ silencioso: true }).catch(() => {}); });

// ---------------------------------------------------------------------------
// Lista de sesiones
// ---------------------------------------------------------------------------
export async function render(vista) {
  const [sesiones, resumen] = await Promise.all([api.get('/medicion/sesiones'), api.get('/estructura/resumen')]);
  const enCola = pendientes();
  const medir = puede('medicion.usar');
  montar(vista, html`
    ${encabezado('stopwatch', 'Modo Medición', 'Registra pruebas en vivo, incluso sin conexión', html`
      ${medir ? html`<a class="btn btn-light" href="#/medicion/cronometro"><i class="bi bi-phone me-1"></i>Cronómetro 2 dispositivos</a>
      <button class="btn btn-primary" data-nueva><i class="bi bi-plus-lg me-1"></i>Nueva sesión</button>` : ''}`)}
    ${enCola ? html`<div class="alert alert-warning d-flex align-items-center gap-2"><i class="bi bi-cloud-arrow-up"></i>
      <span>${enCola} resultado(s) guardados en este teléfono esperando conexión.</span><button class="btn btn-sm btn-warning ms-auto" data-sincronizar>Sincronizar ahora</button></div>` : ''}
    <div class="row g-3">${sesiones.length ? sesiones.map((s) => html`<div class="col-md-6 col-xl-4"><a class="card h-100 text-reset text-decoration-none tarjeta-sesion" href="#/medicion/${s.id}">
      <div class="card-body"><div class="d-flex justify-content-between align-items-start">
        <div><div class="fw-bold">${s.nombre}</div><div class="small text-muted">${fecha(s.fecha)} · ${s.deporte || 'Varios'}${s.equipo ? ` · ${s.equipo}` : ''}</div></div>
        ${insignia(s.estado, s.estado === 'abierta' ? 'success' : 'secondary')}</div>
      <div class="mt-2 small"><i class="bi bi-${s.modo === 'piscina' ? 'water' : 'geo'} me-1"></i>${s.modo}${s.condiciones?.largo_piscina ? ` ${s.condiciones.largo_piscina} m` : ''}
        · <strong>${s.resultados}</strong> resultados${s.coach ? ` · ${s.coach}` : ''}</div></div></a></div>`)
    : html`<div class="col-12">${vacio('Aún no hay sesiones de evaluación. Crea una para empezar a medir.', 'stopwatch')}</div>`}</div>`);

  vista.querySelector('[data-sincronizar]')?.addEventListener('click', async (e) => {
    try { await conCarga(e.currentTarget, () => sincronizar()); recargarVista(); } catch (error) { mostrarError(error); }
  });
  vista.querySelector('[data-nueva]')?.addEventListener('click', async () => {
    const plantillas = await api.get('/metodologia/plantillas');
    const ops = (l) => l.map((x) => ({ valor: x.id, texto: x.nombre }));
    const equipos = resumen.mis_equipos ? resumen.equipos.filter((e) => resumen.mis_equipos.includes(e.id)) : resumen.equipos;
    const defs = [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, col: 'col-12', defecto: `Evaluación ${new Date().toLocaleDateString('es-PE')}` },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', defecto: new Date().toLocaleDateString('en-CA') },
      { nombre: 'modo', etiqueta: 'Modo', tipo: 'select', vacia: false, opciones: ['campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado'].map((m) => ({ valor: m, texto: m })) },
      { nombre: 'deporte_id', etiqueta: 'Deporte', tipo: 'select', opciones: ops(resumen.deportes) },
      { nombre: 'equipo_id', etiqueta: 'Equipo', tipo: 'select', opciones: ops(equipos) },
      { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: ops(resumen.categorias) },
      { nombre: 'instalacion_id', etiqueta: 'Instalación', tipo: 'select', opciones: resumen.instalaciones.map((i) => ({ valor: i.id, texto: `${i.nombre}${i.largo_m ? ` (${i.largo_m} m)` : ''}` })) },
      { nombre: 'plantilla_id', etiqueta: 'Plantilla de pruebas', tipo: 'select', opciones: ops(plantillas) },
      { nombre: 'largo_piscina', etiqueta: 'Largo de piscina (Modo Piscina)', tipo: 'select', opciones: [{ valor: 25, texto: '25 m' }, { valor: 50, texto: '50 m' }] },
      { nombre: 'clima', etiqueta: 'Clima / condiciones' },
      { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', col: 'col-12' },
    ];
    modalFormulario({
      titulo: 'Nueva sesión de evaluación',
      tamano: 'modal-lg',
      cuerpo: campos(defs),
      alGuardar: async (datos) => {
        const d = limpiar(defs, datos);
        const condiciones = {};
        if (d.largo_piscina) condiciones.largo_piscina = Number(d.largo_piscina);
        if (d.clima) condiciones.clima = d.clima;
        const s = await api.post('/medicion/sesiones', { ...d, condiciones });
        return () => ir(`/medicion/${s.id}`);
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Captura de una sesión
// ---------------------------------------------------------------------------
export async function sesion(vista, { params: [id], query }) {
  const s = await api.get(`/medicion/sesiones/${id}`);
  let pruebas = s.pruebas;
  if (!pruebas.length) pruebas = await api.get(`/metodologia/pruebas${s.deporte_id ? `?deporte_id=${s.deporte_id}` : ''}`);
  const { datos: todos } = await api.get('/deportistas');
  let deportistas = todos;
  if (s.equipo_id) {
    const miembros = await api.get(`/estructura/equipos/${s.equipo_id}/miembros`).catch(() => []);
    if (miembros.length) deportistas = todos.filter((d) => miembros.some((m) => m.id === d.id));
  } else if (s.deporte_id) deportistas = todos.filter((d) => !d.deporte_id || d.deporte_id === s.deporte_id);
  const pruebaId = Number(query.get('prueba')) || pruebas[0]?.id;
  const prueba = pruebas.find((p) => p.id === pruebaId);
  const abierta = s.estado === 'abierta';
  const medir = puede('medicion.usar') && abierta;
  const gestionar = puede('resultados.gestionar');
  const piscina = s.modo === 'piscina' && prueba?.tipo_resultado === 'TIME';
  const resultadosPrueba = (dep) => s.resultados.filter((r) => r.deportista_id === dep && r.prueba_id === pruebaId).sort((a, b) => a.intento - b.intento);
  const fmt = (v) => formatearValor(v, prueba || {});

  montar(vista, html`
    ${encabezado(piscina ? 'water' : 'stopwatch', s.nombre, `${fecha(s.fecha)} · ${s.modo}${s.condiciones?.largo_piscina ? ` ${s.condiciones.largo_piscina} m` : ''}${s.condiciones?.clima ? ` · ${s.condiciones.clima}` : ''}`, html`
      <a class="btn btn-light" href="#/medicion"><i class="bi bi-arrow-left me-1"></i>Sesiones</a>
      ${abierta && puede('medicion.usar') ? html`<button class="btn btn-outline-secondary" data-cerrar><i class="bi bi-lock me-1"></i>Cerrar sesión</button>` : ''}
      ${!abierta && gestionar ? html`<button class="btn btn-outline-secondary" data-reabrir><i class="bi bi-unlock me-1"></i>Reabrir</button>` : ''}`)}
    ${pendientes() ? html`<div class="alert alert-warning py-2 d-flex align-items-center"><i class="bi bi-cloud-arrow-up me-2"></i>${pendientes()} resultado(s) sin sincronizar
      <button class="btn btn-sm btn-warning ms-auto" data-sincronizar>Sincronizar</button></div>` : ''}
    ${!pruebas.length ? vacio('No hay pruebas configuradas para este deporte. Actívalo desde una plantilla en Estructura.', 'clipboard-x') : html`
    <div class="d-flex flex-nowrap overflow-auto gap-2 mb-3 pb-1">${pruebas.map((p) => html`<a class="btn btn-sm text-nowrap ${p.id === pruebaId ? 'btn-primary' : 'btn-light'}" href="#/medicion/${id}?prueba=${p.id}">${p.nombre}</a>`)}</div>
    ${prueba ? html`<div class="card mb-3"><div class="card-body py-2 small d-flex flex-wrap gap-3">
      <span><i class="bi bi-rulers me-1"></i>${prueba.unidad}${prueba.tipo_resultado === 'TIME' ? ' (escribe 4.82 o 1:04.32)' : ''}</span>
      <span><i class="bi bi-arrow-repeat me-1"></i>${prueba.intentos} intento(s) · cuenta ${prueba.criterio}</span>
      <span><i class="bi bi-arrow-${prueba.direccion_mejora === 'LOWER_IS_BETTER' ? 'down' : 'up'} me-1"></i>${prueba.direccion_mejora === 'LOWER_IS_BETTER' ? 'Menos es mejor' : 'Más es mejor'}</span>
      ${prueba.instrucciones ? html`<span class="text-muted">${prueba.instrucciones}</span>` : ''}</div></div>` : ''}

    ${medir && prueba?.tipo_resultado === 'TIME' && !piscina ? html`<div class="card mb-3 cronometro" data-crono>
      <div class="card-body d-flex flex-wrap align-items-center gap-3">
        <div class="display-5 fw-bold font-monospace" data-pantalla>0.00</div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-success btn-lg" data-iniciar><i class="bi bi-play-fill"></i> Salida</button>
          <button class="btn btn-warning btn-lg" data-parcial disabled><i class="bi bi-flag"></i> Parcial</button>
          <button class="btn btn-danger btn-lg" data-parar disabled><i class="bi bi-stop-fill"></i> Llegada</button>
          <button class="btn btn-light btn-lg" data-reiniciar><i class="bi bi-arrow-counterclockwise"></i></button>
        </div>
        <div class="small text-muted w-100" data-parciales></div>
        <div class="small text-muted w-100">Al parar, toca <i class="bi bi-box-arrow-in-down"></i> en la fila del deportista para usar el tiempo (y los parciales).</div>
      </div></div>` : ''}

    ${piscina && medir ? html`<div class="card mb-3" data-piscina><div class="card-header d-flex flex-wrap align-items-center gap-2">
      <span class="fw-semibold"><i class="bi bi-water me-1"></i>Modo Piscina · ${prueba.nombre}</span>
      <span class="display-6 font-monospace ms-auto" data-reloj-piscina>0.00</span>
      <button class="btn btn-success" data-salida-piscina><i class="bi bi-play-fill"></i> Salida</button>
      <button class="btn btn-light" data-reiniciar-piscina><i class="bi bi-arrow-counterclockwise"></i></button></div>
      <div class="card-body"><div class="row g-2">${Array.from({ length: Math.min(8, s.carriles || 6) }, (_, i) => html`<div class="col-sm-6 col-lg-4"><div class="border rounded p-2 carril" data-carril="${i + 1}">
        <div class="d-flex align-items-center gap-2 mb-2"><span class="badge text-bg-primary">C${i + 1}</span>
          <select class="form-select form-select-sm" data-dep-carril><option value="">— deportista —</option>${deportistas.map((d) => html`<option value="${d.id}">${d.nombre}</option>`)}</select></div>
        <div class="d-flex align-items-center gap-2"><span class="font-monospace fs-5 flex-grow-1" data-tiempo-carril>—</span>
          <button class="btn btn-sm btn-warning" data-parcial-carril disabled title="Parcial"><i class="bi bi-flag"></i></button>
          <button class="btn btn-sm btn-danger" data-llegada-carril disabled>Llegada</button></div>
        <div class="small text-muted" data-parciales-carril></div></div></div>`)}</div>
        <button class="btn btn-primary mt-3" data-guardar-carriles><i class="bi bi-save me-1"></i>Guardar tiempos de los carriles</button></div></div>` : ''}

    <div class="card mb-3"><div class="card-header fw-semibold">${prueba?.nombre || ''} · ${deportistas.length} deportistas</div>
      <div class="list-group list-group-flush">${deportistas.map((d) => {
    const previos = resultadosPrueba(d.id);
    return html`<div class="list-group-item" data-fila="${d.id}">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <div class="flex-grow-1"><div class="fw-semibold">${d.nombre}</div><div class="small text-muted">${d.codigo}${d.categoria ? ` · ${d.categoria}` : ''}</div>
              <div class="d-flex flex-wrap gap-1 mt-1" data-intentos>${previos.map((r) => html`<span class="badge ${r.oficial ? 'text-bg-light' : 'text-bg-secondary'}" title="${TEXTO_FUENTE[r.fuente_medicion]}">#${r.intento}: ${fmt(r.valor)}</span>`)}</div></div>
            ${medir && prueba ? html`<form class="d-flex gap-1 align-items-center" data-registrar="${d.id}" novalidate>
              ${prueba.tipo_resultado === 'TIME' && !piscina ? html`<button type="button" class="btn btn-outline-secondary" data-usar-crono title="Usar tiempo del cronómetro"><i class="bi bi-box-arrow-in-down"></i></button>` : ''}
              <input class="form-control" style="width:7.5rem" name="valor" inputmode="decimal" placeholder="${prueba.tipo_resultado === 'TIME' ? '0:00.00' : prueba.unidad}" autocomplete="off" required>
              ${(prueba.campos || []).map((c) => html`<input class="form-control form-control-sm" style="width:6rem" name="extra_${c.clave}" placeholder="${c.etiqueta}" inputmode="decimal">`)}
              <button class="btn btn-primary"><i class="bi bi-check-lg"></i></button></form>` : ''}
          </div><div class="small mt-1" data-lectura></div></div>`;
  })}</div></div>`}

    <div class="card"><div class="card-header fw-semibold">Resultados de la sesión (${s.resultados.length})</div>
      ${tabla(s.resultados, [
    { titulo: 'Deportista', valor: (r) => r.deportista },
    { titulo: 'Prueba', valor: (r) => r.prueba },
    { titulo: 'Intento', valor: (r) => r.intento },
    { titulo: 'Valor', valor: (r) => html`<span class="fw-semibold">${r.valor_texto}</span>${r.carril ? html` <span class="small text-muted">C${r.carril}</span>` : ''}${r.datos?.correcciones?.length ? html` <i class="bi bi-pencil-square text-warning" title="Corregido"></i>` : ''}` },
    { titulo: 'Fuente', valor: (r) => html`${TEXTO_FUENTE[r.fuente_medicion] || r.fuente_medicion}${r.oficial ? '' : html` ${insignia('no oficial', 'secondary')}`}` },
  ], {
    acciones: (r) => (gestionar ? html`<button class="btn btn-sm btn-light" data-corregir="${r.id}" title="Corregir"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-light text-danger" data-anular="${r.id}" title="Anular"><i class="bi bi-x-circle"></i></button>` : ''),
    vacio: 'Aún no hay resultados.',
  })}</div>`);

  // --- cronómetro en pantalla
  const crono = { inicio: null, fin: null, parciales: [], timer: null };
  const pantalla = vista.querySelector('[data-pantalla]');
  const pintarCrono = () => {
    if (!pantalla) return;
    const t = ((crono.fin ?? performance.now()) - crono.inicio) / 1000;
    pantalla.textContent = crono.inicio ? formatearTiempo(t).replace(' s', '') : '0.00';
  };
  vista.querySelector('[data-iniciar]')?.addEventListener('click', (e) => {
    crono.inicio = performance.now(); crono.fin = null; crono.parciales = [];
    crono.timer = setInterval(pintarCrono, 31);
    e.currentTarget.disabled = true;
    vista.querySelector('[data-parar]').disabled = false;
    vista.querySelector('[data-parcial]').disabled = false;
    vista.querySelector('[data-parciales]').textContent = '';
  });
  vista.querySelector('[data-parcial]')?.addEventListener('click', () => {
    const t = (performance.now() - crono.inicio) / 1000;
    crono.parciales.push(Math.round(t * 100) / 100);
    vista.querySelector('[data-parciales]').textContent = `Parciales: ${crono.parciales.map((x) => formatearTiempo(x)).join(' · ')}`;
  });
  vista.querySelector('[data-parar]')?.addEventListener('click', (e) => {
    crono.fin = performance.now(); clearInterval(crono.timer); pintarCrono();
    e.currentTarget.disabled = true;
    vista.querySelector('[data-parcial]').disabled = true;
    vista.querySelector('[data-iniciar]').disabled = false;
  });
  vista.querySelector('[data-reiniciar]')?.addEventListener('click', () => {
    clearInterval(crono.timer); Object.assign(crono, { inicio: null, fin: null, parciales: [] }); pintarCrono();
    vista.querySelector('[data-iniciar]').disabled = false;
    vista.querySelector('[data-parar]').disabled = true;
    vista.querySelector('[data-parciales]').textContent = '';
  });
  const tiempoCrono = () => (crono.inicio && crono.fin ? Math.round(((crono.fin - crono.inicio) / 1000) * 100) / 100 : null);
  const parcialesDe = (lista, final) => {
    if (!prueba?.parcial_cada_m || !lista.length) return undefined;
    return [...lista.map((t, i) => ({ m: prueba.parcial_cada_m * (i + 1), t })).filter((p) => p.m < prueba.distancia_m), { m: prueba.distancia_m, t: final }];
  };

  // --- registrar un intento
  const largo = s.condiciones?.largo_piscina;
  async function registrar(depId, valorTexto, extra = {}) {
    const valor = prueba.tipo_resultado === 'TIME' ? parsearTiempo(valorTexto) : valorTexto;
    const cuerpo = {
      deportista_id: depId, prueba_id: prueba.id, sesion_id: s.id, valor, fecha: s.fecha, clave_idempotencia: claveUnica(),
      datos: { ...(extra.datos || {}), ...(largo ? { largo_piscina: largo } : {}) }, parciales: extra.parciales, carril: extra.carril,
    };
    const r = await enviarResultado(cuerpo);
    const fila = vista.querySelector(`[data-fila="${depId}"]`);
    if (r.enCola) {
      fila?.querySelector('[data-intentos]')?.insertAdjacentHTML('beforeend', String(html`<span class="badge text-bg-warning" title="Pendiente de sincronizar">${fmt(Number(valor))} ⏳</span>`));
      avisar('Sin conexión: guardado en el teléfono. Se enviará al volver la conexión.', 'warning');
      return;
    }
    const g = r.guardado;
    fila?.querySelector('[data-intentos]')?.insertAdjacentHTML('beforeend', String(html`<span class="badge ${g.lectura.record_personal ? 'text-bg-success' : 'text-bg-light'}">#${g.intento}: ${g.valor_texto}</span>`));
    const lectura = fila?.querySelector('[data-lectura]');
    if (lectura) {
      montar(lectura, g.lectura.atipico ? html`<span class="text-danger fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i>Valor atípico: difiere más de un 25 % de su mejor marca (${fmt(g.lectura.mejor_previo)}). Revísalo y corrígelo si fue un error.</span>`
        : g.lectura.record_personal ? html`<span class="text-success fw-semibold"><i class="bi bi-trophy-fill me-1"></i>¡Récord personal! (antes ${fmt(g.lectura.mejor_previo)})</span>`
        : g.lectura.primera_marca ? html`<span class="text-primary">Primera marca registrada en esta prueba.</span>`
          : html`<span class="text-muted">Mejor marca: ${fmt(g.lectura.mejor_previo)}${g.lectura.desde_anterior ? ` · vs. anterior: ${textoVariacion(g.lectura.desde_anterior)}` : ''}</span>`);
    }
  }

  vista.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-registrar]');
    if (!form) return;
    e.preventDefault();
    const entrada = form.querySelector('[name="valor"]');
    if (!entrada.value.trim()) { entrada.focus(); return; }
    const datosExtra = {};
    form.querySelectorAll('[name^="extra_"]').forEach((i) => { if (i.value !== '') datosExtra[i.name.slice(6)] = Number(i.value.replace(',', '.')); });
    try {
      await conCarga(form.querySelector('button:not([type="button"])'), () => registrar(Number(form.dataset.registrar), entrada.value, { datos: datosExtra, parciales: form.dataset.parciales ? JSON.parse(form.dataset.parciales) : undefined }));
      entrada.value = '';
      delete form.dataset.parciales;
      form.querySelectorAll('[name^="extra_"]').forEach((i) => { i.value = ''; });
      // Pasa al siguiente deportista para agilizar la captura
      const siguiente = form.closest('[data-fila]')?.nextElementSibling?.querySelector('[name="valor"]');
      siguiente?.focus();
    } catch (error) {
      mostrarError(error);
    }
  });

  vista.addEventListener('click', async (e) => {
    const usar = e.target.closest('[data-usar-crono]');
    if (usar) {
      const t = tiempoCrono();
      if (t === null) { avisar('Primero toma un tiempo con el cronómetro.', 'info'); return; }
      const form = usar.closest('form');
      form.querySelector('[name="valor"]').value = t.toFixed(2);
      const par = parcialesDe(crono.parciales, t);
      if (par) form.dataset.parciales = JSON.stringify(par);
      return;
    }
    const corregir = e.target.closest('[data-corregir]');
    const anular = e.target.closest('[data-anular]');
    try {
      if (corregir) {
        const r = s.resultados.find((x) => String(x.id) === corregir.dataset.corregir);
        modalFormulario({
          titulo: `Corregir resultado de ${r.deportista}`,
          cuerpo: html`<p class="small text-muted">El valor anterior (${r.valor_texto}) queda registrado junto con el motivo.</p>${campos([
            { nombre: 'valor', etiqueta: 'Valor correcto', requerido: true }, { nombre: 'motivo', etiqueta: 'Motivo', requerido: true },
          ])}`,
          alGuardar: async (d) => {
            await api.put(`/medicion/resultados/${r.id}`, { valor: r.tipo_resultado === 'TIME' ? parsearTiempo(d.valor) : d.valor, motivo: d.motivo });
            avisar('Resultado corregido.');
            recargarVista();
          },
        });
      } else if (anular) {
        modalFormulario({
          titulo: 'Anular resultado',
          boton: 'Anular',
          cuerpo: html`<p class="small text-muted">El resultado deja de contar, pero queda en el registro con el motivo.</p>${campos([{ nombre: 'motivo', etiqueta: 'Motivo', requerido: true, col: 'col-12' }])}`,
          alGuardar: async (d) => {
            await api.delete(`/medicion/resultados/${anular.dataset.anular}?motivo=${encodeURIComponent(d.motivo || '')}`);
            avisar('Resultado anulado.');
            recargarVista();
          },
        });
      } else if (e.target.closest('[data-cerrar]') && await confirmar('Al cerrar la sesión ya no se podrán añadir resultados (un responsable puede reabrirla).')) {
        await api.post(`/medicion/sesiones/${id}/cerrar`); recargarVista();
      } else if (e.target.closest('[data-reabrir]')) {
        await api.post(`/medicion/sesiones/${id}/reabrir`); recargarVista();
      } else if (e.target.closest('[data-sincronizar]')) {
        await sincronizar(); recargarVista();
      }
    } catch (error) {
      mostrarError(error);
    }
  });

  if (piscina && medir) activarPiscina(vista, { registrar, prueba, fmt });
}

/** Modo Piscina: salida común y llegada (y parciales) por carril. */
function activarPiscina(vista, { registrar, prueba }) {
  let inicio = null;
  let timer = null;
  const reloj = vista.querySelector('[data-reloj-piscina]');
  const carriles = [...vista.querySelectorAll('[data-carril]')].map((el) => ({ el, tiempo: null, parciales: [] }));
  const ahora = () => Math.round(((performance.now() - inicio) / 1000) * 100) / 100;
  vista.querySelector('[data-salida-piscina]').addEventListener('click', (e) => {
    inicio = performance.now();
    e.currentTarget.disabled = true;
    timer = setInterval(() => { reloj.textContent = formatearTiempo(ahora()).replace(' s', ''); }, 47);
    carriles.forEach((c) => {
      c.tiempo = null; c.parciales = [];
      c.el.querySelector('[data-tiempo-carril]').textContent = '…';
      c.el.querySelector('[data-parciales-carril]').textContent = '';
      const activo = Boolean(c.el.querySelector('[data-dep-carril]').value);
      c.el.querySelector('[data-llegada-carril]').disabled = !activo;
      c.el.querySelector('[data-parcial-carril]').disabled = !activo || !prueba.parcial_cada_m;
    });
  });
  vista.querySelector('[data-reiniciar-piscina]').addEventListener('click', () => {
    clearInterval(timer); inicio = null; reloj.textContent = '0.00';
    vista.querySelector('[data-salida-piscina]').disabled = false;
    carriles.forEach((c) => { c.tiempo = null; c.parciales = []; c.el.querySelector('[data-tiempo-carril]').textContent = '—'; c.el.querySelector('[data-parciales-carril]').textContent = ''; });
  });
  carriles.forEach((c) => {
    c.el.querySelector('[data-llegada-carril]').addEventListener('click', (e) => {
      if (!inicio) return;
      c.tiempo = ahora();
      e.currentTarget.disabled = true;
      c.el.querySelector('[data-parcial-carril]').disabled = true;
      c.el.querySelector('[data-tiempo-carril]').textContent = formatearTiempo(c.tiempo);
      if (carriles.every((x) => x.tiempo !== null || !x.el.querySelector('[data-dep-carril]').value)) clearInterval(timer);
    });
    c.el.querySelector('[data-parcial-carril]').addEventListener('click', () => {
      if (!inicio) return;
      c.parciales.push(ahora());
      c.el.querySelector('[data-parciales-carril]').textContent = c.parciales.map((t, i) => `${prueba.parcial_cada_m * (i + 1)} m: ${formatearTiempo(t)}`).join(' · ');
    });
  });
  vista.querySelector('[data-guardar-carriles]').addEventListener('click', async (e) => {
    const listos = carriles.filter((c) => c.tiempo !== null && c.el.querySelector('[data-dep-carril]').value);
    if (!listos.length) { avisar('No hay tiempos de llegada para guardar.', 'info'); return; }
    try {
      await conCarga(e.currentTarget, async () => {
        for (const c of listos) {
          const parciales = prueba.parcial_cada_m && c.parciales.length
            ? [...c.parciales.map((t, i) => ({ m: prueba.parcial_cada_m * (i + 1), t })).filter((p) => p.m < prueba.distancia_m), { m: prueba.distancia_m, t: c.tiempo }] : undefined;
          await registrar(Number(c.el.querySelector('[data-dep-carril]').value), c.tiempo, { carril: Number(c.el.dataset.carril), parciales });
        }
      });
      avisar(`${listos.length} tiempo(s) guardados.`);
      setTimeout(recargarVista, 600);
    } catch (error) {
      mostrarError(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Cronómetro con dos dispositivos
// ---------------------------------------------------------------------------
/** Mide el desfase entre el reloj del teléfono y el del servidor (mejor de 5 muestras). */
async function sincronizarReloj() {
  const muestras = [];
  for (let i = 0; i < 5; i += 1) {
    const envio = Date.now();
    const { servidor } = await api.get('/medicion/hora');
    muestras.push({ envio, servidor, recepcion: Date.now() });
  }
  const mejor = muestras.reduce((a, b) => ((b.recepcion - b.envio) < (a.recepcion - a.envio) ? b : a));
  const idaVuelta = mejor.recepcion - mejor.envio;
  return { desfase_ms: Math.round(mejor.servidor - (mejor.envio + idaVuelta / 2)), incertidumbre_ms: Math.ceil(idaVuelta / 2) };
}

export async function cronometro(vista) {
  const { datos: deportistas } = await api.get('/deportistas');
  const pruebas = (await api.get('/metodologia/pruebas')).filter((p) => p.tipo_resultado === 'TIME');
  montar(vista, html`
    ${encabezado('phone', 'Cronómetro con dos dispositivos', 'Un teléfono marca la salida y otro la llegada. Ambos se sincronizan con el reloj del servidor.', html`<a class="btn btn-light" href="#/medicion"><i class="bi bi-arrow-left me-1"></i>Volver</a>`)}
    <div class="row g-3">
      <div class="col-lg-5"><div class="card h-100"><div class="card-body">
        <h3 class="h6 fw-bold">1. Crear un cronómetro</h3>
        <form data-crear class="row g-2">
          <div class="col-12"><select class="form-select" name="deportista_id" required><option value="">Deportista…</option>${deportistas.map((d) => html`<option value="${d.id}">${d.nombre}</option>`)}</select></div>
          <div class="col-12"><select class="form-select" name="prueba_id" required><option value="">Prueba de tiempo…</option>${pruebas.map((p) => html`<option value="${p.id}">${p.nombre}</option>`)}</select></div>
          <div class="col-12"><button class="btn btn-primary w-100">Crear y obtener código</button></div>
        </form>
        <div class="text-center mt-3 d-none" data-codigo-creado><div class="small text-muted">Código para los dos teléfonos</div><div class="display-4 fw-bold font-monospace" data-codigo></div></div>
      </div></div></div>
      <div class="col-lg-7"><div class="card h-100"><div class="card-body">
        <h3 class="h6 fw-bold">2. Unirse con el código</h3>
        <div class="row g-2 align-items-end">
          <div class="col-6"><input class="form-control form-control-lg font-monospace" data-entrada-codigo inputmode="numeric" maxlength="6" placeholder="000000"></div>
          <div class="col-6"><div class="btn-group w-100"><button class="btn btn-outline-success" data-rol="salida">Soy SALIDA</button><button class="btn btn-outline-danger" data-rol="llegada">Soy LLEGADA</button></div></div>
        </div>
        <div class="mt-3 d-none" data-panel-marca>
          <div class="small text-muted mb-2" data-estado-reloj>Sincronizando reloj…</div>
          <div class="small mb-2" data-estado-crono></div>
          <button class="btn btn-lg w-100 py-4 fs-3" data-marcar disabled></button>
          <div class="mt-3 fs-4 fw-bold text-center" data-resultado-crono></div>
        </div>
      </div></div></div>
    </div>`);

  vista.querySelector('[data-crear]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const datos = Object.fromEntries(new FormData(e.target));
      const c = await api.post('/medicion/cronometros', { deportista_id: Number(datos.deportista_id), prueba_id: Number(datos.prueba_id) });
      vista.querySelector('[data-codigo-creado]').classList.remove('d-none');
      vista.querySelector('[data-codigo]').textContent = c.codigo;
      vista.querySelector('[data-entrada-codigo]').value = c.codigo;
    } catch (error) {
      mostrarError(error);
    }
  });

  let reloj = null;
  let sondeo = null;
  vista.querySelectorAll('[data-rol]').forEach((b) => b.addEventListener('click', async () => {
    const codigo = vista.querySelector('[data-entrada-codigo]').value.trim();
    if (!/^\d{6}$/.test(codigo)) { avisar('Escribe el código de 6 dígitos.', 'info'); return; }
    const rol = b.dataset.rol;
    const panel = vista.querySelector('[data-panel-marca]');
    panel.classList.remove('d-none');
    const boton = vista.querySelector('[data-marcar]');
    boton.className = `btn btn-lg w-100 py-4 fs-3 btn-${rol === 'salida' ? 'success' : 'danger'}`;
    boton.textContent = rol === 'salida' ? '¡SALIDA!' : '¡LLEGADA!';
    try {
      reloj = await sincronizarReloj();
      vista.querySelector('[data-estado-reloj]').textContent = `Reloj sincronizado (desfase ${reloj.desfase_ms} ms, precisión ±${reloj.incertidumbre_ms} ms).`;
      boton.disabled = false;
    } catch (error) {
      mostrarError(error);
    }
    clearInterval(sondeo);
    const estado = vista.querySelector('[data-estado-crono]');
    sondeo = setInterval(async () => {
      if (!vista.isConnected) { clearInterval(sondeo); return; }
      try {
        const c = await api.get(`/medicion/cronometros/${codigo}`);
        estado.textContent = `${c.deportista} · ${c.prueba} · estado: ${c.estado.replace('_', ' ')}`;
        if (c.estado === 'terminado' && c.inicio_ms && c.fin_ms) {
          vista.querySelector('[data-resultado-crono]').textContent = `Tiempo: ${formatearTiempo((c.fin_ms - c.inicio_ms) / 1000)} (±${c.incertidumbre_ms} ms)`;
          clearInterval(sondeo);
        }
      } catch { /* reintenta en el siguiente ciclo */ }
    }, 1500);
    boton.onclick = async () => {
      const marca = Date.now(); // se toma ANTES de cualquier espera de red
      boton.disabled = true;
      try {
        const r = await api.post(`/medicion/cronometros/${codigo}/marca`, { tipo: rol, marca_ms: marca, ...reloj });
        if (r.resultado) vista.querySelector('[data-resultado-crono]').textContent = `Tiempo: ${r.resultado.valor_texto} (±${r.incertidumbre_ms} ms) · guardado`;
        else avisar(rol === 'salida' ? 'Salida marcada.' : 'Llegada marcada.');
      } catch (error) {
        boton.disabled = false;
        mostrarError(error);
      }
    };
  }));
}
