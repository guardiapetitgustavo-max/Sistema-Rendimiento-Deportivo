/**
 * Metodología configurable de la academia: métricas, pruebas (con baremos), plantillas de evaluación
 * versionadas, configuraciones de scoring versionadas y reglas de alerta.
 * Cambiar el scoring o una plantilla crea una VERSIÓN nueva: lo calculado antes no se modifica.
 */
import { api } from '../api.js';
import { html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, fechaHora } from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { campos, limpiar, tabla, pestanas, insignia } from '../formularios.js';
import { TEXTO_DIRECCION, CAPACIDADES } from '../medidas.js';

const PESTANAS = [
  { clave: 'pruebas', texto: 'Pruebas', icono: 'stopwatch' },
  { clave: 'metricas', texto: 'Métricas', icono: 'rulers' },
  { clave: 'plantillas', texto: 'Plantillas de evaluación', icono: 'card-checklist' },
  { clave: 'scoring', texto: 'Scoring', icono: 'calculator' },
  { clave: 'reglas', texto: 'Reglas de alerta', icono: 'bell' },
];
const op = (lista) => lista.map((x) => ({ valor: x, texto: x }));

export async function render(vista, { query }) {
  const activa = query.get('t') || 'pruebas';
  const configura = puede('metodologia.configurar');
  const [cat, resumen] = await Promise.all([api.get('/metodologia/catalogos'), api.get('/estructura/resumen')]);
  const deportes = resumen.deportes.map((d) => ({ valor: d.id, texto: d.nombre }));
  let cuerpo = '';
  let accion = '';
  const ctx = {};

  if (activa === 'pruebas') {
    const deporte = query.get('deporte_id') || '';
    const [pruebas, metricas] = await Promise.all([api.get(`/metodologia/pruebas${deporte ? `?deporte_id=${deporte}` : ''}`), api.get('/metodologia/metricas')]);
    Object.assign(ctx, { pruebas, metricas });
    ctx.defs = [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'metrica_id', etiqueta: 'Métrica', tipo: 'select', requerido: true, opciones: metricas.map((m) => ({ valor: m.id, texto: `${m.nombre} (${m.unidad})` })) },
      { nombre: 'deporte_id', etiqueta: 'Deporte (vacío = prueba general)', tipo: 'select', opciones: deportes },
      { nombre: 'capacidad', etiqueta: 'Capacidad', tipo: 'select', requerido: true, vacia: false, opciones: Object.entries(CAPACIDADES).map(([valor, texto]) => ({ valor, texto })) },
      { nombre: 'modo', etiqueta: 'Modo', tipo: 'select', vacia: false, opciones: op(cat.modos) },
      { nombre: 'distancia_m', etiqueta: 'Distancia (m)', tipo: 'numero', min: 0.1 },
      { nombre: 'estilo', etiqueta: 'Estilo (natación)' },
      { nombre: 'parcial_cada_m', etiqueta: 'Parcial cada (m)', tipo: 'numero', min: 1 },
      { nombre: 'intentos', etiqueta: 'Intentos', tipo: 'entero', min: 1, max: 10, defecto: 1 },
      { nombre: 'criterio', etiqueta: 'Valor oficial de los intentos', tipo: 'select', vacia: false, opciones: [{ valor: 'mejor', texto: 'El mejor' }, { valor: 'promedio', texto: 'Promedio' }, { valor: 'ultimo', texto: 'El último' }] },
      { nombre: 'baremo_base', etiqueta: 'Referencia de 0 puntos', tipo: 'numero', ayuda: 'Valor que vale 0 en el puntaje' },
      { nombre: 'baremo_excelente', etiqueta: 'Referencia de 100 puntos', tipo: 'numero', ayuda: 'Valor que vale 100 en el puntaje' },
      { nombre: 'instrucciones', etiqueta: 'Instrucciones / protocolo', tipo: 'textarea', col: 'col-12' },
    ];
    accion = configura ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva prueba</button>` : '';
    cuerpo = html`<div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
        <label class="small text-muted">Deporte</label>
        <select class="form-select form-select-sm w-auto" data-deporte><option value="">Todas</option>${deportes.map((d) => html`<option value="${d.valor}" ${String(d.valor) === deporte ? 'selected' : ''}>${d.texto}</option>`)}</select>
        <span class="small text-muted ms-auto">${pruebas.length} pruebas · una prueba con resultados no cambia su métrica, distancia, estilo ni modo</span></div></div>
      <div class="card">${tabla(pruebas, [
    { titulo: 'Prueba', valor: (p) => html`<span class="fw-semibold">${p.nombre}</span><div class="small text-muted">${p.deporte || 'General'} · ${CAPACIDADES[p.capacidad] || p.capacidad}</div>` },
    { titulo: 'Métrica', valor: (p) => html`${p.metrica} <span class="text-muted">(${p.unidad})</span><div class="small text-muted">${TEXTO_DIRECCION[p.direccion_mejora]}</div>` },
    { titulo: 'Modo', valor: (p) => html`${p.modo}${p.distancia_m ? html`<div class="small text-muted">${p.distancia_m} m ${p.estilo || ''}</div>` : ''}` },
    { titulo: 'Intentos', valor: (p) => `${p.intentos} (${p.criterio})` },
    { titulo: 'Baremo 0 → 100', valor: (p) => (p.baremo_base !== null ? `${p.baremo_base} → ${p.baremo_excelente}` : html`<span class="text-muted">—</span>`) },
    { titulo: 'Resultados', valor: (p) => p.resultados },
  ], { acciones: (p) => (configura ? html`<button class="btn btn-sm btn-light" data-editar="${p.id}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-light text-danger" data-baja="pruebas:${p.id}"><i class="bi bi-archive"></i></button>` : '') })}</div>`;
  } else if (activa === 'metricas') {
    ctx.metricas = await api.get('/metodologia/metricas');
    ctx.defs = [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'unidad', etiqueta: 'Unidad (s, m, cm, rep…)', requerido: true },
      { nombre: 'tipo_resultado', etiqueta: 'Tipo de resultado', tipo: 'select', requerido: true, opciones: op(cat.tipos_resultado) },
      { nombre: 'direccion_mejora', etiqueta: 'Dirección de mejora', tipo: 'select', requerido: true, opciones: cat.direcciones.map((d) => ({ valor: d, texto: TEXTO_DIRECCION[d] })) },
      { nombre: 'rango_min', etiqueta: 'Rango objetivo mín. (TARGET_RANGE)', tipo: 'numero' },
      { nombre: 'rango_max', etiqueta: 'Rango objetivo máx. (TARGET_RANGE)', tipo: 'numero' },
      { nombre: 'decimales', etiqueta: 'Decimales', tipo: 'entero', min: 0, max: 4, defecto: 2 },
    ];
    accion = configura ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva métrica</button>` : '';
    cuerpo = html`<div class="card">${tabla(ctx.metricas, [
      { titulo: 'Métrica', valor: (m) => html`<span class="fw-semibold">${m.nombre}</span>` },
      { titulo: 'Tipo', valor: (m) => m.tipo_resultado }, { titulo: 'Unidad', valor: (m) => m.unidad },
      { titulo: 'Dirección', valor: (m) => html`${TEXTO_DIRECCION[m.direccion_mejora]}${m.direccion_mejora === 'TARGET_RANGE' ? html`<div class="small text-muted">${m.rango_min ?? '…'} – ${m.rango_max ?? '…'}</div>` : ''}` },
      { titulo: 'Resultados', valor: (m) => m.resultados },
    ], { acciones: (m) => (configura ? html`<button class="btn btn-sm btn-light" data-editar="${m.id}"><i class="bi bi-pencil"></i></button>` : '') })}</div>`;
  } else if (activa === 'plantillas') {
    const [plantillas, pruebas] = await Promise.all([api.get(`/metodologia/plantillas${query.get('historial') ? '?historial=true' : ''}`), api.get('/metodologia/pruebas')]);
    Object.assign(ctx, { plantillas, pruebas });
    accion = configura ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva plantilla</button>` : '';
    const nombre = (id) => pruebas.find((p) => p.id === id)?.nombre || `#${id}`;
    cuerpo = html`<div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="hist" data-historial ${query.get('historial') ? 'checked' : ''}>
        <label class="form-check-label small" for="hist">Ver versiones anteriores</label></div>
      <div class="card">${tabla(plantillas, [
    { titulo: 'Plantilla', valor: (p) => html`<span class="fw-semibold">${p.nombre}</span> ${insignia(`v${p.version}`, p.vigente ? 'primary' : 'secondary')}<div class="small text-muted">${p.deporte || 'Todas'}${p.frecuencia_dias ? ` · cada ${p.frecuencia_dias} días` : ''}</div>` },
    { titulo: 'Pruebas', valor: (p) => html`<span class="small">${p.pruebas.map(nombre).join(', ')}</span>` },
    { titulo: 'Sesiones', valor: (p) => p.sesiones },
  ], { acciones: (p) => (configura && p.vigente ? html`<button class="btn btn-sm btn-light" data-editar="${p.id}" title="Crear nueva versión"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-light text-danger" data-retirar="${p.id}"><i class="bi bi-archive"></i></button>` : '') })}</div>`;
  } else if (activa === 'scoring') {
    const [scoring, pruebas] = await Promise.all([api.get(`/metodologia/scoring${query.get('historial') ? '?historial=true' : ''}`), api.get('/metodologia/pruebas')]);
    Object.assign(ctx, { scoring, pruebas });
    accion = configura ? html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva configuración</button>` : '';
    cuerpo = html`<div class="alert alert-info small"><i class="bi bi-info-circle me-1"></i>Cada cambio crea una versión nueva. Los puntajes ya calculados guardan la versión con que se calcularon y no cambian.</div>
      <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="hist" data-historial ${query.get('historial') ? 'checked' : ''}>
        <label class="form-check-label small" for="hist">Ver versiones anteriores</label></div>
      <div class="card">${tabla(scoring, [
    { titulo: 'Configuración', valor: (s) => html`<span class="fw-semibold">${s.nombre}</span> ${insignia(`v${s.version}`, s.vigente ? 'primary' : 'secondary')}<div class="small text-muted">${s.deporte || 'Todos los deportes'} · ${s.categoria || 'todas las categorías'}</div>` },
    { titulo: 'Pesos', valor: (s) => html`<span class="small">${Object.entries(s.pesos).map(([c, p]) => `${CAPACIDADES[c] || c} ${p}`).join(' · ')}</span>` },
    { titulo: 'Baremos', valor: (s) => Object.keys(s.baremos || {}).length },
    { titulo: 'Desde', valor: (s) => fechaHora(s.activa_desde || s.creado_en) },
  ], { acciones: (s) => (configura && s.vigente ? html`<button class="btn btn-sm btn-light" data-editar="${s.id}" title="Nueva versión"><i class="bi bi-pencil"></i></button>` : '') })}</div>`;
  } else {
    ctx.reglas = await api.get('/metodologia/reglas');
    cuerpo = html`<div class="row g-3">${ctx.reglas.map((r) => html`<div class="col-lg-6"><div class="card h-100"><div class="card-body">
      <div class="d-flex justify-content-between align-items-start mb-1"><h3 class="h6 fw-bold mb-0">${r.nombre}</h3>
        ${insignia(r.activa ? 'Activa' : 'Inactiva', r.activa ? 'success' : 'secondary')}</div>
      <p class="small text-muted">${r.descripcion}</p>
      <div class="small">${Object.entries(r.parametros).map(([k, v]) => html`<span class="badge text-bg-light me-1">${k.replace(/_/g, ' ')}: ${v}</span>`)}
        <span class="badge text-bg-${{ alta: 'danger', media: 'warning', baja: 'info' }[r.prioridad]}">prioridad ${r.prioridad}</span></div>
      ${configura ? html`<button class="btn btn-sm btn-light mt-2" data-regla="${r.tipo}"><i class="bi bi-sliders me-1"></i>Ajustar</button>` : ''}
    </div></div></div>`)}</div>`;
  }

  montar(vista, html`${encabezado('sliders', 'Metodología', configura ? 'Configura cómo se mide y se puntúa en tu academia' : 'Cómo se mide y se puntúa en tu academia (solo lectura)', accion)}
    ${pestanas('metodologia', PESTANAS, activa)}${cuerpo}`);

  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/metodologia?t=${b.dataset.pestana}`)));
  vista.querySelector('[data-deporte]')?.addEventListener('change', (e) => ir(`/metodologia?t=pruebas${e.target.value ? `&deporte_id=${e.target.value}` : ''}`));
  vista.querySelector('[data-historial]')?.addEventListener('change', (e) => ir(`/metodologia?t=${activa}${e.target.checked ? '&historial=1' : ''}`));
  vista.querySelector('[data-nuevo]')?.addEventListener('click', () => abrirEditor(activa, ctx, null, deportes, resumen));
  vista.addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar]');
    const baja = e.target.closest('[data-baja]');
    const retirar = e.target.closest('[data-retirar]');
    const regla = e.target.closest('[data-regla]');
    try {
      if (editar) {
        const lista = ctx[activa];
        abrirEditor(activa, ctx, lista.find((x) => x.id === Number(editar.dataset.editar)), deportes, resumen);
      } else if (baja && await confirmar('¿Dar de baja esta prueba? Sus resultados se conservan.', { peligro: true })) {
        const [ruta, id] = baja.dataset.baja.split(':');
        await api.delete(`/metodologia/${ruta}/${id}`);
        recargarVista();
      } else if (retirar && await confirmar('¿Retirar esta plantilla? Las sesiones que la usaron la conservan.', { peligro: true })) {
        await api.delete(`/metodologia/plantillas/${retirar.dataset.retirar}`);
        recargarVista();
      } else if (regla) {
        editarRegla(ctx.reglas.find((r) => r.tipo === regla.dataset.regla));
      }
    } catch (error) {
      mostrarError(error);
    }
  });
}

function abrirEditor(activa, ctx, registro, deportes, resumen) {
  if (activa === 'pruebas' || activa === 'metricas') {
    modalFormulario({
      titulo: `${registro ? 'Editar' : 'Nueva'} ${activa === 'pruebas' ? 'prueba' : 'métrica'}`,
      tamano: 'modal-lg',
      cuerpo: campos(ctx.defs, registro || { criterio: 'mejor', modo: 'campo', intentos: 1, decimales: 2 }),
      alGuardar: async (datos) => {
        const limpio = limpiar(ctx.defs, datos);
        if (registro) await api.put(`/metodologia/${activa}/${registro.id}`, limpio);
        else await api.post(`/metodologia/${activa}`, limpio);
        avisar('Guardado.');
        recargarVista();
      },
    });
    return;
  }
  if (activa === 'plantillas') {
    const marcadas = new Set(registro?.pruebas || []);
    modalFormulario({
      titulo: registro ? `Nueva versión de "${registro.nombre}"` : 'Nueva plantilla de evaluación',
      tamano: 'modal-lg',
      cuerpo: html`${campos([
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
        { nombre: 'deporte_id', etiqueta: 'Deporte', tipo: 'select', opciones: deportes },
        { nombre: 'frecuencia_dias', etiqueta: 'Repetir cada (días)', tipo: 'entero', min: 1, max: 365 },
      ], registro || {})}
        <div class="fw-semibold small mt-3 mb-1">Pruebas incluidas</div>
        <div class="row g-1" style="max-height:40vh;overflow:auto">${ctx.pruebas.map((p) => html`<div class="col-md-6"><label class="form-check border rounded p-2 ps-5 w-100 small">
          <input class="form-check-input" type="checkbox" name="p_${p.id}" ${marcadas.has(p.id) ? 'checked' : ''}>${p.nombre} <span class="text-muted">(${p.deporte || 'general'})</span></label></div>`)}</div>`,
      alGuardar: async (datos) => {
        const pruebas = Object.entries(datos).filter(([k, v]) => k.startsWith('p_') && v === true).map(([k]) => Number(k.slice(2)));
        const cuerpo = { nombre: datos.nombre, deporte_id: datos.deporte_id || null, frecuencia_dias: datos.frecuencia_dias || null, pruebas };
        if (registro) await api.put(`/metodologia/plantillas/${registro.id}`, cuerpo);
        else await api.post('/metodologia/plantillas', cuerpo);
        avisar(registro ? 'Nueva versión creada (la anterior queda en el historial).' : 'Plantilla creada.');
        recargarVista();
      },
    });
    return;
  }
  if (activa === 'scoring') {
    const pesos = registro?.pesos || {};
    const baremos = registro?.baremos || {};
    const pruebas = ctx.pruebas.filter((p) => !registro?.deporte_id || p.deporte_id === registro.deporte_id || p.deporte_id === null);
    modalFormulario({
      titulo: registro ? `Nueva versión de "${registro.nombre}" (v${registro.version + 1})` : 'Nueva configuración de scoring',
      tamano: 'modal-xl',
      cuerpo: html`${campos([
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
        { nombre: 'deporte_id', etiqueta: 'Deporte', tipo: 'select', opciones: deportes, col: 'col-md-3' },
        { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: resumen.categorias.map((c) => ({ valor: c.id, texto: c.nombre })), col: 'col-md-3' },
      ], registro || {})}
        <div class="fw-semibold small mt-3 mb-1">Peso de cada capacidad (0-100)</div>
        <div class="row g-2">${Object.entries(CAPACIDADES).filter(([c]) => c !== 'otra').map(([c, t]) => html`<div class="col-6 col-md-3">
          <label class="form-label small mb-0">${t}</label><input class="form-control form-control-sm" type="number" min="0" max="100" name="peso_${c}" value="${pesos[c] ?? ''}"></div>`)}</div>
        <div class="fw-semibold small mt-3 mb-1">Baremos por prueba (vacío = usa el de la prueba)</div>
        <div style="max-height:35vh;overflow:auto">${tabla(pruebas, [
    { titulo: 'Prueba', valor: (p) => html`${p.nombre} <span class="text-muted small">(${p.unidad})</span>` },
    { titulo: '0 puntos', valor: (p) => html`<input class="form-control form-control-sm" type="number" step="any" name="b0_${p.id}" value="${baremos[p.id]?.base ?? ''}" placeholder="${p.baremo_base ?? ''}">` },
    { titulo: '100 puntos', valor: (p) => html`<input class="form-control form-control-sm" type="number" step="any" name="b1_${p.id}" value="${baremos[p.id]?.excelente ?? ''}" placeholder="${p.baremo_excelente ?? ''}">` },
  ])}</div>`,
      alGuardar: async (datos) => {
        const cuerpo = {
          nombre: datos.nombre, deporte_id: datos.deporte_id || null, categoria_id: datos.categoria_id || null, pesos: {}, baremos: {},
        };
        for (const [k, v] of Object.entries(datos)) {
          if (k.startsWith('peso_') && v !== '') cuerpo.pesos[k.slice(5)] = Number(v);
          if (k.startsWith('b0_') && v !== '' && datos[`b1_${k.slice(3)}`] !== '') cuerpo.baremos[k.slice(3)] = { base: Number(v), excelente: Number(datos[`b1_${k.slice(3)}`]) };
        }
        if (registro) await api.put(`/metodologia/scoring/${registro.id}`, cuerpo);
        else await api.post('/metodologia/scoring', cuerpo);
        avisar('Configuración guardada como versión nueva.');
        recargarVista();
      },
    });
  }
}

function editarRegla(regla) {
  modalFormulario({
    titulo: regla.nombre,
    cuerpo: html`<p class="small text-muted">${regla.descripcion}</p>${campos([
      { nombre: 'activa', etiqueta: 'Regla activa', tipo: 'check' },
      { nombre: 'prioridad', etiqueta: 'Prioridad', tipo: 'select', vacia: false, opciones: ['baja', 'media', 'alta'].map((p) => ({ valor: p, texto: p })) },
      ...Object.keys(regla.parametros).map((k) => ({ nombre: `par_${k}`, etiqueta: `${k.replace(/_/g, ' ')} (defecto ${regla.parametros_defecto[k]})`, tipo: 'numero', min: 0 })),
    ], { ...regla, ...Object.fromEntries(Object.entries(regla.parametros).map(([k, v]) => [`par_${k}`, v])) })}`,
    alGuardar: async (datos) => {
      const parametros = Object.fromEntries(Object.entries(datos).filter(([k]) => k.startsWith('par_')).map(([k, v]) => [k.slice(4), v]));
      await api.put(`/metodologia/reglas/${regla.tipo}`, { activa: datos.activa, prioridad: datos.prioridad, parametros });
      avisar('Regla actualizada.');
      recargarVista();
    },
  });
}
