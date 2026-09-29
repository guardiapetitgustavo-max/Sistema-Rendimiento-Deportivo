/** Asistente IA del Coach: análisis individual, resumen de la academia y Modo Automático. */
import { api } from '../api.js';
import {
  html, montar, encabezado, opcionesDeportistas, vacio, mostrarError, conCarga, fechaHora, avisar,
} from '../ui.js';

const ICONO_PASO = { success: 'check-circle-fill', info: 'info-circle-fill', warning: 'exclamation-triangle-fill', danger: 'x-circle-fill' };

const bloqueTexto = (titulo, texto, modo) => html`
  <div class="card"><div class="card-header d-flex justify-content-between align-items-center">
    <span><i class="bi bi-chat-square-text me-2"></i>${titulo}</span>
    <span class="badge ${modo === 'api' ? 'text-bg-primary' : 'text-bg-secondary'}">${modo === 'api' ? 'IA externa' : 'Motor de reglas local'}</span>
  </div><div class="card-body"><p class="texto-ia">${texto}</p></div></div>`;

const reporteAutomatico = (r) => html`
  <div class="card mb-3"><div class="card-header d-flex justify-content-between align-items-center">
    <span><i class="bi bi-robot me-2"></i>Modo Automático · ${fechaHora(r.ejecutado_en)}</span>
    <span class="badge ${r.ok ? 'text-bg-success' : 'text-bg-warning'}">${r.ok ? 'Completado' : 'Con advertencias'}</span>
  </div><ul class="list-group list-group-flush">
    ${r.pasos.map((p, i) => html`<li class="list-group-item d-flex gap-2">
      <i class="bi bi-${ICONO_PASO[p.tipo]} text-${p.tipo} mt-1"></i>
      <div><div class="fw-semibold small">${i + 1}. ${p.nombre}</div><div class="small text-muted">${p.detalle}</div></div></li>`)}
  </ul></div>
  ${bloqueTexto('Resumen ejecutivo', r.resumen, 'local')}`;

export async function render(vista) {
  const { datos: deportistas } = await api.get('/deportistas');

  montar(vista, html`
    ${encabezado('stars', 'Asistente IA del Coach', 'Recomendaciones basadas en los datos reales de tus deportistas')}
    <div class="row g-3">
      <div class="col-lg-4 d-flex flex-column gap-3">
        <div class="card"><div class="card-header"><i class="bi bi-magic me-2"></i>Modo Automático</div><div class="card-body">
          <p class="small text-muted">En un clic: completa valores vacíos con promedios reales (sin sobrescribir nada), entrena el modelo,
            genera predicciones y arma un resumen con las alertas.</p>
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="auto-demo">
            <label class="form-check-label small" for="auto-demo">Permitir datos de demostración si faltan datos reales</label>
          </div>
          <button class="btn btn-success w-100" data-automatico><i class="bi bi-play-circle me-1"></i>Ejecutar Modo Automático</button>
        </div></div>

        <div class="card"><div class="card-header"><i class="bi bi-person-lines-fill me-2"></i>Análisis por deportista</div><div class="card-body">
          <select class="form-select mb-3" data-deportista>${opcionesDeportistas(deportistas, '')}</select>
          <button class="btn btn-primary w-100" data-analizar ${deportistas.length ? '' : 'disabled'}><i class="bi bi-stars me-1"></i>Generar recomendación</button>
        </div></div>

        <div class="card"><div class="card-header"><i class="bi bi-building me-2"></i>Análisis de la academia</div><div class="card-body">
          <button class="btn btn-outline-primary w-100" data-resumen><i class="bi bi-clipboard-data me-1"></i>Generar resumen general</button>
        </div></div>
      </div>
      <div class="col-lg-8" data-salida>${vacio('Elige una opción de la izquierda para ver el análisis aquí', 'chat-square-dots')}</div>
    </div>`);

  const salida = vista.querySelector('[data-salida]');
  const accion = (selector, ejecutar) => vista.querySelector(selector).addEventListener('click', async (e) => {
    try {
      const contenido = await conCarga(e.currentTarget, ejecutar);
      if (contenido) {
        montar(salida, html`<div class="entrada">${contenido}</div>`);
        if (window.innerWidth < 992) salida.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error) {
      mostrarError(error);
    }
  });

  accion('[data-automatico]', async () => {
    const r = await api.post('/ia/automatico', { usar_demo: vista.querySelector('#auto-demo').checked });
    avisar(r.ok ? 'Modo Automático completado.' : 'Modo Automático terminó con advertencias.', r.ok ? 'success' : 'warning');
    return reporteAutomatico(r);
  });
  accion('[data-analizar]', async () => {
    const id = vista.querySelector('[data-deportista]').value;
    if (!id) {
      avisar('Selecciona un deportista', 'warning');
      return null;
    }
    const r = await api.post('/ia/analizar', { deportista_id: Number(id) });
    return bloqueTexto(`Análisis de ${r.deportista.nombre}`, r.texto, r.modo);
  });
  accion('[data-resumen]', async () => {
    const r = await api.post('/ia/resumen');
    return bloqueTexto('Resumen de la academia', r.texto, r.modo);
  });
}
