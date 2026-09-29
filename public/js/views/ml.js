/** Machine Learning: entrenar el Random Forest, ver su desempeño y generar predicciones. */
import { api } from '../api.js';
import {
  html, montar, encabezado, fechaHora, vacio, avisar, mostrarError, conCarga, colorNivel,
} from '../ui.js';
import { barras } from '../graficos.js';
import { CAPACIDADES, COLORES } from '../constantes.js';
import { recargarVista } from '../navegacion.js';

const porcentaje = (v) => `${(v * 100).toFixed(1)}%`;

export async function render(vista) {
  const estado = await api.get('/ml');
  const { info } = estado;
  const faltan = Math.max(0, estado.minimo_requerido - estado.evaluaciones_completas);

  montar(vista, html`
    ${encabezado('cpu', 'Machine Learning', 'Random Forest que clasifica el nivel de rendimiento (Bajo / Medio / Alto) según las 8 capacidades')}
    <div class="row g-3 mb-3">
      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><i class="bi bi-gear me-2"></i>Entrenar y predecir</div>
        <div class="card-body">
          <p class="small mb-2">Evaluaciones completas disponibles: <b>${estado.evaluaciones_completas}</b> de ${estado.total_evaluaciones}
            (mínimo ${estado.minimo_requerido}).</p>
          ${faltan ? html`<div class="alert alert-warning small py-2">Faltan ${faltan} evaluaciones completas. Puedes apoyarte en datos de
            demostración (ficticios) para probar el sistema.</div>` : ''}
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="usar-demo" ${faltan ? 'checked' : ''}>
            <label class="form-check-label small" for="usar-demo">Usar datos de demostración si faltan datos reales</label>
          </div>
          <button class="btn btn-primary w-100 mb-2" data-entrenar><i class="bi bi-lightning me-1"></i>Entrenar modelo</button>
          <button class="btn btn-success w-100" data-predecir ${info ? '' : 'disabled'}><i class="bi bi-magic me-1"></i>Generar predicciones</button>
          <p class="small text-muted mt-3 mb-0">Las predicciones son estimaciones estadísticas de apoyo al entrenador, no diagnósticos.</p>
        </div>
      </div></div>

      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><i class="bi bi-clipboard-check me-2"></i>Estado del modelo</div>
        <div class="card-body">${info ? html`
          ${info.es_demo ? html`<div class="alert alert-warning small py-2"><i class="bi bi-exclamation-triangle me-1"></i>
            Entrenado con datos ficticios de demostración. Importa evaluaciones reales y vuelve a entrenar.</div>` : ''}
          <div class="row text-center g-2 mb-3">
            <div class="col-6"><div class="valor-dato">${info.exactitud_pct}%</div><div class="etiqueta-dato">Exactitud en prueba</div></div>
            <div class="col-6"><div class="valor-dato">${info.total_registros}</div><div class="etiqueta-dato">Registros (${info.registros_reales} reales)</div></div>
          </div>
          <table class="table table-sm small mb-2">
            <thead><tr><th>Nivel</th><th>Precisión</th><th>Sensibilidad</th><th>F1</th></tr></thead>
            <tbody>${Object.entries(info.metricas_por_clase).map(([nivel, m]) => html`<tr>
              <td><span class="badge text-bg-${colorNivel(nivel)}">${nivel}</span></td>
              <td>${porcentaje(m.precision)}</td><td>${porcentaje(m.sensibilidad)}</td><td>${porcentaje(m.f1)}</td></tr>`)}</tbody>
          </table>
          <p class="small text-muted mb-0">Entrenado: ${fechaHora(info.entrenado_en)} · ${info.registros_prueba} registros de prueba.</p>`
    : vacio('El modelo aún no ha sido entrenado', 'cpu')}
        </div>
      </div></div>

      <div class="col-lg-4"><div class="card h-100">
        <div class="card-header"><i class="bi bi-bar-chart-steps me-2"></i>Importancia de variables</div>
        <div class="card-body">${info ? html`<div class="grafico"><canvas id="g-importancia"></canvas></div>` : vacio('Disponible tras entrenar')}</div>
      </div></div>
    </div>

    <div class="card"><div class="card-header"><i class="bi bi-list-stars me-2"></i>Últimas predicciones por deportista</div>
      <div class="card-body p-0"><div class="table-responsive"><table class="table table-hover table-sm align-middle mb-0">
        <thead class="table-light"><tr><th>Deportista</th><th>Categoría</th><th>Nivel</th><th>Confianza</th><th>Puntuación</th><th>Fecha</th><th>Recomendación</th></tr></thead>
        <tbody>${estado.predicciones.length ? estado.predicciones.map((p) => html`
          <tr class="fila-enlace" data-ir="/deportistas/${p.deportista_id}">
            <td>${p.nombre} <span class="text-muted small">(${p.codigo})</span></td><td>${p.categoria || '—'}</td>
            <td><span class="badge text-bg-${colorNivel(p.nivel)}">${p.nivel}</span>${p.modelo_demo ? html` <span class="badge text-bg-light border">demo</span>` : ''}</td>
            <td>${p.confianza}%</td><td>${p.rendimiento_predicho ?? '—'}</td><td class="text-nowrap small">${fechaHora(p.fecha)}</td>
            <td class="small text-muted" style="max-width:420px">${(p.recomendacion || '').split('\n')[0]}</td>
          </tr>`) : html`<tr><td colspan="7">${vacio('Sin predicciones todavía')}</td></tr>`}</tbody>
      </table></div></div>
    </div>`);

  if (info) {
    const importancia = CAPACIDADES.map((c) => ({ nombre: c.nombre, valor: (info.importancia_variables[c.clave] || 0) * 100 }))
      .sort((a, b) => b.valor - a.valor);
    barras(vista.querySelector('#g-importancia'), importancia.map((i) => i.nombre), importancia.map((i) => Number(i.valor.toFixed(1))), {
      horizontal: true, colores: COLORES.acento, maximo: undefined,
    });
  }

  const ejecutar = (boton, accion, mensaje) => boton.addEventListener('click', async () => {
    try {
      const resultado = await conCarga(boton, accion);
      avisar(mensaje(resultado), resultado.es_demo ? 'warning' : 'success');
      recargarVista();
    } catch (error) {
      mostrarError(error);
    }
  });
  ejecutar(vista.querySelector('[data-entrenar]'), () => api.post('/ml/entrenar', { usar_demo: vista.querySelector('#usar-demo').checked }),
    (r) => `Modelo entrenado con ${r.total_registros} registros. Exactitud: ${r.exactitud_pct}%.${r.es_demo ? ' Se usaron datos de demostración.' : ''}`);
  ejecutar(vista.querySelector('[data-predecir]'), () => api.post('/ml/predecir'), (r) => r.mensaje);
}
