/**
 * Integraciones: dispositivos (fotocélulas, GPS, wearables, cronometraje) con su clave de API.
 * La clave se muestra UNA sola vez al crearla.
 */
import { api } from '../api.js';
import { html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, fechaHora, mostrarInfo } from '../ui.js';
import { recargarVista } from '../navegacion.js';
import { campos, tabla, insignia } from '../formularios.js';

export async function render(vista) {
  const dispositivos = await api.get('/integraciones/dispositivos');
  const base = `${window.location.origin}/api/integraciones/api/mediciones`;
  montar(vista, html`
    ${encabezado('plug', 'Integraciones', 'Dispositivos que envían mediciones automáticamente', html`<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Dispositivo</button>`)}
    <div class="card mb-3">${tabla(dispositivos, [
    { titulo: 'Dispositivo', valor: (d) => html`<span class="fw-semibold">${d.nombre}</span><div class="small text-muted">${d.tipo} · clave ${d.prefijo}…</div>` },
    { titulo: 'Mediciones', valor: (d) => d.mediciones },
    { titulo: 'Último uso', valor: (d) => fechaHora(d.ultimo_uso) },
    { titulo: 'Estado', valor: (d) => insignia(d.activo ? 'activo' : 'desactivado', d.activo ? 'success' : 'secondary') },
  ], { acciones: (d) => (d.activo ? html`<button class="btn btn-sm btn-light text-danger" data-desactivar="${d.id}">Desactivar</button>` : ''), vacio: 'Sin dispositivos.' })}</div>
    <div class="card"><div class="card-body small">
      <h3 class="h6 fw-bold">Cómo enviar mediciones</h3>
      <p>POST <code>${base}</code> con la cabecera <code>Authorization: Bearer &lt;clave&gt;</code> y un JSON:</p>
      <pre class="bg-body-tertiary p-2 rounded">{ "deportista_codigo": "SAD-001", "prueba_clave": "sprint_30m", "valor": 4.61,
  "fecha": "2026-10-03", "clave_idempotencia": "foto-0001" }</pre>
      <p>Para GPS envía la trayectoria y el sistema calcula distancia, ritmo, velocidad y FC media (marcados como derivados):</p>
      <pre class="bg-body-tertiary p-2 rounded">{ "deportista_codigo": "SAD-001", "prueba_clave": "cooper",
  "gps": [{ "lat": -12.1, "lon": -77.03, "t": 1700000000000, "fc": 150 }, …] }</pre>
      <p class="mb-0">Varias a la vez: <code>{ "mediciones": [ … ] }</code> (máx. 500). La clave de idempotencia evita duplicados si el dispositivo reintenta.
      Los resultados quedan con fuente <strong>SENSOR</strong> o <strong>EXTERNAL_SYSTEM</strong>.</p>
    </div></div>`);
  vista.querySelector('[data-nuevo]').addEventListener('click', () => modalFormulario({
    titulo: 'Nuevo dispositivo',
    cuerpo: campos([{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', vacia: false, opciones: ['fotocelula', 'gps', 'wearable', 'cronometraje', 'pulsometro', 'otro'].map((t) => ({ valor: t, texto: t })) }]),
    alGuardar: async (d) => {
      const r = await api.post('/integraciones/dispositivos', d);
      return () => {
        mostrarInfo({ titulo: 'Clave del dispositivo', cuerpo: html`<p>${r.aviso}</p><input class="form-control font-monospace" readonly value="${r.clave}">` })
          .addEventListener('hidden.bs.modal', recargarVista);
      };
    },
  }));
  vista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-desactivar]');
    if (b && await confirmar('El dispositivo dejará de poder enviar mediciones.', { peligro: true, boton: 'Desactivar' })) {
      try { await api.delete(`/integraciones/dispositivos/${b.dataset.desactivar}`); avisar('Desactivado.'); recargarVista(); } catch (error) { mostrarError(error); }
    }
  });
}
