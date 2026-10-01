/** Auditoría de la academia: quién hizo qué y cuándo (inicios de sesión, altas, cambios, bajas, configuración). */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, fechaHora, tablaPaginada, datosFormulario,
} from '../ui.js';
import { ir } from '../navegacion.js';

const ACCIONES = {
  login: ['Inicio de sesión', 'box-arrow-in-right', 'success'],
  logout: ['Cierre de sesión', 'box-arrow-right', 'secondary'],
  cambio_academia: ['Cambio de academia', 'arrow-left-right', 'info'],
  crear: ['Creación', 'plus-circle', 'primary'],
  modificar: ['Modificación', 'pencil', 'warning'],
  eliminar: ['Eliminación / baja', 'trash', 'danger'],
  configurar: ['Configuración de la academia', 'gear', 'warning'],
  configurar_permisos: ['Cambio de permisos', 'shield-check', 'warning'],
  password: ['Contraseña', 'key', 'warning'],
  transferir: ['Transferencia de deportistas', 'arrow-left-right', 'info'],
  entrenar: ['Entrenamiento de ML', 'cpu', 'info'],
  predecir: ['Predicciones de ML', 'cpu', 'info'],
  analizar: ['Análisis IA', 'stars', 'info'],
  automatico: ['Modo automático IA', 'stars', 'info'],
  confirmar: ['Importación de Excel', 'cloud-arrow-up', 'primary'],
  reiniciar: ['Reinicio de datos', 'exclamation-octagon', 'danger'],
};

function describir(accion) {
  if (accion.startsWith('plataforma:')) {
    const detalle = accion.split(':')[1];
    const textos = {
      crear: 'Academia creada', estado_suspendida: 'Academia suspendida', estado_activa: 'Academia reactivada',
      modificar: 'Datos de la academia (plataforma)', acceso_super_admin: 'Acceso del super administrador',
    };
    return [textos[detalle] || accion, 'buildings', detalle === 'estado_suspendida' ? 'danger' : 'dark'];
  }
  return ACCIONES[accion] || [accion, 'dot', 'secondary'];
}

export async function render(vista, { query }) {
  const filtros = Object.fromEntries(query);
  const eventos = await api.get(`/academia/auditoria${consulta({ ...filtros, limite: 500 })}`);
  const opcionesAccion = Object.entries(ACCIONES).map(([valor, [texto]]) => ({ valor, texto }));

  montar(vista, html`
    ${encabezado('journal-text', 'Auditoría', 'Registro de los eventos importantes de tu academia (últimos 500)')}
    <div class="card mb-3"><div class="card-body">
      <form class="row g-2 align-items-end" data-filtros>
        <div class="col-md-4"><label class="form-label small">Tipo de evento</label>
          <select class="form-select" name="accion"><option value="">Todos</option>
            ${opcionesAccion.map((o) => html`<option value="${o.valor}" ${filtros.accion === o.valor ? 'selected' : ''}>${o.texto}</option>`)}
            <option value="plataforma" ${filtros.accion === 'plataforma' ? 'selected' : ''}>Acciones de la plataforma</option>
          </select></div>
        <div class="col-md-3"><label class="form-label small">Desde</label>
          <input class="form-control" type="date" name="desde" value="${filtros.desde || ''}"></div>
        <div class="col-md-3 d-flex gap-2">
          <button class="btn btn-primary flex-grow-1"><i class="bi bi-funnel"></i> Filtrar</button>
          <a class="btn btn-light" href="#/auditoria" title="Limpiar filtros"><i class="bi bi-x-lg"></i></a>
        </div>
      </form>
    </div></div>
    <div class="card"><div class="card-header small text-muted fw-normal">${eventos.length} evento(s)</div>
      <div class="table-responsive"><table class="table table-sm align-middle mb-0" data-tabla>
        <thead class="table-light"><tr><th>Fecha</th><th>Evento</th><th>Usuario</th><th>Sobre</th><th>Detalle</th></tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="paginacion"></div>
    </div>`);

  vista.querySelector('[data-filtros]').addEventListener('submit', (e) => {
    e.preventDefault();
    ir(`/auditoria${consulta(datosFormulario(e.target))}`);
  });

  tablaPaginada(vista.querySelector('[data-tabla] tbody'), vista.querySelector('.paginacion'), eventos, (ev) => {
    const [texto, icono, color] = describir(ev.accion);
    const detalle = ev.detalle || {};
    const resumen = detalle.cambios ? `Campos: ${Array.isArray(detalle.cambios) ? detalle.cambios.map((c) => (typeof c === 'string' ? c : `${c.rol}:${c.permiso}=${c.permitido ? 'sí' : 'no'}`)).join(', ') : ''}`
      : detalle.correo ? `Correo: ${detalle.correo}`
        : detalle.ruta ? `${detalle.metodo} ${detalle.ruta}` : (detalle.motivo || detalle.nombre || '');
    return html`<tr>
      <td class="text-nowrap small">${fechaHora(ev.creado_en)}</td>
      <td class="text-nowrap"><span class="badge text-bg-${color}"><i class="bi bi-${icono} me-1"></i>${texto}</span></td>
      <td class="small">${ev.usuario ? html`<b>${ev.usuario}</b><div class="text-muted">${ev.correo}</div>` : html`<span class="text-muted">—</span>`}</td>
      <td class="small">${ev.entidad || '—'}${ev.entidad_id ? html` <span class="text-muted">#${ev.entidad_id}</span>` : ''}</td>
      <td class="small text-muted text-break">${resumen}${ev.ip ? html`<div style="font-size:.7rem">IP ${ev.ip}</div>` : ''}</td>
    </tr>`;
  }, { columnas: 5, porPagina: 30, mensajeVacio: 'No hay eventos con esos filtros', icono: 'journal-text' });
}
