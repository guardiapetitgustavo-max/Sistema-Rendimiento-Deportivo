/**
 * Rendimiento: evolución por prueba con récords y tendencia, puntaje compuesto (con su versión de scoring),
 * rankings por prueba y comparativas. Solo se comparan resultados compatibles (misma prueba y contexto).
 */
import { api } from '../api.js';
import { html, montar, encabezado, fecha, vacio, mostrarError, opcionesDeportistas } from '../ui.js';
import { ir } from '../navegacion.js';
import { puede } from '../sesion.js';
import { tabla, pestanas, insignia } from '../formularios.js';
import { serieMedicion, radar, lineas } from '../graficos.js';
import { textoVariacion, CAPACIDADES, TEXTO_DIRECCION } from '../medidas.js';

const PESTANAS = [
  { clave: 'evolucion', texto: 'Evolución', icono: 'graph-up' },
  { clave: 'ranking', texto: 'Ranking', icono: 'trophy' },
  { clave: 'comparar', texto: 'Comparar', icono: 'people' },
];
const COLOR_TENDENCIA = { mejora: 'success', empeora: 'danger', estable: 'secondary', insuficiente: 'light', sube: 'info', baja: 'info' };
const TEXTO_TENDENCIA = { mejora: 'Mejora', empeora: 'Empeora', estable: 'Estable', insuficiente: 'Datos insuficientes', sube: 'Sube', baja: 'Baja' };

export async function render(vista, { query }) {
  const activa = query.get('t') || 'evolucion';
  const { datos: deportistas } = await api.get('/deportistas');
  let cuerpo = '';
  let despues = () => {};

  if (activa === 'evolucion') {
    const id = Number(query.get('deportista')) || deportistas[0]?.id;
    if (!id) cuerpo = vacio('No hay deportistas.');
    else {
      const [evo, punt, historial] = await Promise.all([
        api.get(`/rendimiento/deportistas/${id}/evolucion`),
        api.get(`/rendimiento/deportistas/${id}/puntaje`),
        api.get(`/rendimiento/deportistas/${id}/puntajes`),
      ]);
      cuerpo = html`
        <div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2 align-items-center">
          <select class="form-select w-auto" data-deportista>${opcionesDeportistas(deportistas, id, null)}</select>
          <a class="btn btn-light btn-sm" href="#/deportistas/${id}"><i class="bi bi-person me-1"></i>Ficha</a>
          ${puede('ia.analizar') ? html`<a class="btn btn-light btn-sm" href="#/analisis?deportista=${id}"><i class="bi bi-stars me-1"></i>Analizar</a>` : ''}
        </div></div>
        <div class="row g-3 mb-3">
          <div class="col-lg-5"><div class="card h-100"><div class="card-body">
            <div class="etiqueta-dato">Puntaje compuesto</div>
            ${punt.disponible ? html`<div class="d-flex align-items-end gap-2"><div class="display-5 fw-bold">${punt.total}</div><div class="text-muted mb-2">/100</div></div>
              <div class="small text-muted mb-2">Scoring "${punt.scoring.nombre}" v${punt.scoring.version} · cobertura ${punt.cobertura}% del peso</div>
              <div style="height:230px"><canvas data-radar></canvas></div>
              ${punt.sin_baremo?.length ? html`<div class="small text-muted">Sin baremo (no puntúan): ${punt.sin_baremo.join(', ')}</div>` : ''}`
    : html`<div class="alert alert-secondary mt-2 mb-0">${punt.mensaje}</div>`}
          </div></div></div>
          <div class="col-lg-7"><div class="card h-100"><div class="card-body">
            <div class="etiqueta-dato">Historial del puntaje (cada punto guarda su versión de scoring)</div>
            ${historial.length > 1 ? html`<div style="height:260px"><canvas data-historial></canvas></div>`
    : html`<p class="text-muted small mt-2">${historial.length ? `Un cálculo guardado: ${historial[0].puntaje} (${fecha(historial[0].fecha)}, ${historial[0].scoring} v${historial[0].version}).` : 'Aún no hay puntajes guardados.'}</p>`}
          </div></div></div>
        </div>
        ${evo.length ? html`<div class="row g-3">${evo.map((e, i) => html`<div class="col-xl-6"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div><div class="fw-bold">${e.prueba}${e.contexto ? html` <span class="badge text-bg-light">${e.contexto}</span>` : ''}</div>
              <div class="small text-muted">${CAPACIDADES[e.capacidad] || e.capacidad} · ${TEXTO_DIRECCION[e.direccion_mejora]} · ${e.mediciones} mediciones</div></div>
            ${insignia(TEXTO_TENDENCIA[e.tendencia.clasificacion], COLOR_TENDENCIA[e.tendencia.clasificacion])}</div>
          <div class="row text-center g-2 my-2 small">
            <div class="col-4"><div class="text-muted">Actual</div><div class="fw-bold">${e.textos.actual}</div><div class="text-muted">${fecha(e.actual.fecha)}</div></div>
            <div class="col-4"><div class="text-muted">Mejor marca</div><div class="fw-bold text-success">${e.textos.mejor_marca || '—'}</div>${e.record_personal ? html`<div><i class="bi bi-trophy-fill text-warning"></i> récord reciente</div>` : ''}</div>
            <div class="col-4"><div class="text-muted">Desde el inicio</div><div class="fw-bold">${textoVariacion(e.desde_primera) || '—'}</div><div class="text-muted">vs. anterior: ${textoVariacion(e.desde_anterior) || '—'}</div></div>
          </div>
          <div style="height:180px"><canvas data-serie="${i}"></canvas></div>
          <div class="small text-muted mt-1">${e.tendencia.clasificacion === 'insuficiente' ? e.tendencia.motivo : `Tendencia ${e.tendencia.cambio_relativo_pct}% en ${e.tendencia.dias} días (R² ${e.tendencia.r2}, confianza ${e.tendencia.confianza}).`}</div>
        </div></div></div>`)}</div>` : vacio('Este deportista no tiene resultados oficiales. Regístralos en el Modo Medición.', 'stopwatch')}`;
      despues = () => {
        if (punt.disponible) {
          const caps = Object.keys(punt.scoring.pesos);
          radar(vista.querySelector('[data-radar]'), caps.map((c) => CAPACIDADES[c] || c), caps.map((c) => punt.capacidades[c] ?? null));
        }
        if (historial.length > 1) lineas(vista.querySelector('[data-historial]'), historial.map((h) => `${fecha(h.fecha)} v${h.version}`), [{ nombre: 'Puntaje', valores: historial.map((h) => h.puntaje) }]);
        evo.forEach((e, i) => serieMedicion(vista.querySelector(`[data-serie="${i}"]`), e.serie.map((p) => fecha(p.fecha)),
          [{ nombre: e.prueba, valores: e.serie.map((p) => p.valor) }], { invertir: e.direccion_mejora === 'LOWER_IS_BETTER', unidad: e.unidad }));
        vista.querySelector('[data-deportista]')?.addEventListener('change', (ev) => ir(`/rendimiento?t=evolucion&deportista=${ev.target.value}`));
      };
    }
  } else if (activa === 'ranking') {
    const [pruebas, resumen] = await Promise.all([api.get('/metodologia/pruebas'), api.get('/estructura/resumen')]);
    const pruebaId = Number(query.get('prueba')) || pruebas.find((p) => p.resultados > 0)?.id;
    const filtros = { categoria_id: query.get('categoria') || '', equipo_id: query.get('equipo') || '', sexo: query.get('sexo') || '', contexto: query.get('contexto') || '' };
    let r = null;
    if (pruebaId) {
      const q = new URLSearchParams({ prueba_id: pruebaId, ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) });
      r = await api.get(`/rendimiento/ranking?${q}`).catch((error) => { mostrarError(error); return null; });
    }
    const sel = (nombre, lista, valor, vaciaTexto) => html`<select class="form-select form-select-sm w-auto" data-filtro="${nombre}"><option value="">${vaciaTexto}</option>
      ${lista.map((x) => html`<option value="${x.valor}" ${String(x.valor) === String(valor) ? 'selected' : ''}>${x.texto}</option>`)}</select>`;
    cuerpo = html`<div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2 align-items-center">
        ${sel('prueba', pruebas.filter((p) => p.resultados > 0).map((p) => ({ valor: p.id, texto: p.nombre })), pruebaId, 'Prueba…')}
        ${sel('categoria', resumen.categorias.map((c) => ({ valor: c.id, texto: c.nombre })), filtros.categoria_id, 'Todas las categorías')}
        ${sel('equipo', resumen.equipos.map((c) => ({ valor: c.id, texto: c.nombre })), filtros.equipo_id, 'Todos los equipos')}
        ${sel('sexo', [{ valor: 'F', texto: 'Femenino' }, { valor: 'M', texto: 'Masculino' }], filtros.sexo, 'Ambos sexos')}
        ${r?.contextos?.length > 1 ? sel('contexto', r.contextos.map((c) => ({ valor: c.clave, texto: c.nombre })), r.contexto, 'Contexto') : ''}
      </div></div>
      ${r ? html`<div class="card"><div class="card-header small text-muted">${r.prueba} · ${TEXTO_DIRECCION[r.direccion_mejora]} · mejor marca oficial de cada deportista
        ${r.contextos?.length > 1 ? ' · solo resultados del mismo contexto' : ''}</div>${tabla(r.filas, [
    { titulo: '#', valor: (f) => (f.posicion <= 3 ? html`<i class="bi bi-trophy-fill text-${['warning', 'secondary', 'danger'][f.posicion - 1]}"></i> ${f.posicion}` : f.posicion) },
    { titulo: 'Deportista', valor: (f) => html`<a href="#/rendimiento?t=evolucion&deportista=${f.deportista_id}">${f.deportista}</a> <span class="small text-muted">${f.codigo}</span>` },
    { titulo: 'Marca', valor: (f) => html`<span class="fw-bold">${f.texto}</span>` },
    { titulo: 'Fecha', valor: (f) => fecha(f.fecha) },
  ], { vacio: 'Sin resultados con estos filtros.' })}</div>` : vacio('Elige una prueba con resultados.', 'trophy')}`;
    despues = () => vista.querySelectorAll('[data-filtro]').forEach((s) => s.addEventListener('change', () => {
      const q = new URLSearchParams({ t: 'ranking' });
      vista.querySelectorAll('[data-filtro]').forEach((x) => { if (x.value) q.set(x.dataset.filtro, x.value); });
      if (s.dataset.filtro === 'prueba') q.delete('contexto');
      ir(`/rendimiento?${q}`);
    }));
  } else {
    const ids = (query.get('ids') || '').split(',').map(Number).filter(Boolean);
    let r = null;
    if (ids.length >= 2) r = await api.get(`/rendimiento/comparar?ids=${ids.join(',')}`).catch((error) => { mostrarError(error); return null; });
    cuerpo = html`<div class="card mb-3"><div class="card-body">
        <div class="small text-muted mb-2">Elige de 2 a 6 deportistas. Solo se comparan las pruebas que tienen en común y en el mismo contexto.</div>
        <div class="row g-1" style="max-height:200px;overflow:auto">${deportistas.map((d) => html`<div class="col-6 col-md-4 col-xl-3"><label class="form-check small">
          <input class="form-check-input" type="checkbox" value="${d.id}" data-comparar ${ids.includes(d.id) ? 'checked' : ''}> ${d.nombre}</label></div>`)}</div>
        <button class="btn btn-primary btn-sm mt-2" data-ver-comparacion><i class="bi bi-people me-1"></i>Comparar</button></div></div>
      ${r ? (r.pruebas.length ? html`<div class="card">${tabla(r.pruebas, [
    { titulo: 'Prueba', valor: (p) => html`<span class="fw-semibold">${p.prueba}</span>${p.contexto ? html` <span class="badge text-bg-light">${p.contexto}</span>` : ''}<div class="small text-muted">${TEXTO_DIRECCION[p.direccion_mejora]}</div>` },
    ...r.deportistas.map((d) => ({
      titulo: d.nombre,
      valor: (p) => {
        const v = p.valores.find((x) => x.deportista_id === d.id);
        return v?.mejor === null || v?.mejor === undefined ? html`<span class="text-muted">—</span>`
          : html`<span class="${v.lider ? 'fw-bold text-success' : ''}">${v.lider ? html`<i class="bi bi-star-fill me-1"></i>` : ''}${v.texto}</span>`;
      },
    })),
  ])}</div>` : vacio('Estos deportistas no tienen pruebas en común con resultados compatibles.')) : ''}`;
    despues = () => vista.querySelector('[data-ver-comparacion]').addEventListener('click', () => {
      const elegidos = [...vista.querySelectorAll('[data-comparar]:checked')].map((c) => c.value);
      ir(`/rendimiento?t=comparar&ids=${elegidos.join(',')}`);
    });
  }

  montar(vista, html`${encabezado('graph-up-arrow', 'Rendimiento', 'Evolución real por prueba, récords, puntajes, rankings y comparativas')}
    ${pestanas('rendimiento', PESTANAS, activa)}${cuerpo}`);
  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/rendimiento?t=${b.dataset.pestana}`)));
  despues();
}
