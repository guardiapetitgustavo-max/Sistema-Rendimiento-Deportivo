/**
 * Permisos por rol (administrador): qué puede hacer cada coach, deportista y padre en la academia.
 * El administrador siempre tiene todos. Los permisos de solo administrador no se pueden conceder.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, conCarga,
} from '../ui.js';
import { recargarVista } from '../navegacion.js';

export async function render(vista) {
  const datos = await api.get('/academia/permisos');
  const grupos = [...new Set(datos.permisos.map((p) => p.grupo))];
  const cambios = new Map(); // "rol|permiso" → permitido

  const celda = (p, rol) => {
    const v = p.valores[rol];
    if (!v.configurable) return html`<td class="text-center text-muted" title="No aplica a este rol">—</td>`;
    return html`<td class="text-center">
      <div class="form-check form-switch d-inline-block m-0">
        <input class="form-check-input" type="checkbox" role="switch" data-rol="${rol}" data-permiso="${p.clave}" ${v.permitido ? 'checked' : ''}
          aria-label="${p.etiqueta} · ${rol}">
      </div>
      ${v.permitido !== v.por_defecto ? html`<div class="insignia-personalizado">personalizado</div>` : ''}
    </td>`;
  };

  montar(vista, html`
    ${encabezado('shield-check', 'Permisos por rol', 'Decide exactamente qué puede hacer cada rol en tu academia', html`
      <button class="btn btn-primary" data-guardar disabled><i class="bi bi-check2 me-1"></i>Guardar cambios</button>`)}
    <div class="alert alert-info small"><i class="bi bi-info-circle me-1"></i>
      El <b>administrador</b> siempre tiene todos los permisos. Deportistas y padres <b>nunca</b> pueden modificar resultados oficiales:
      solo consultan su propio progreso. Los cambios se aplican al instante, sin que nadie tenga que volver a entrar.</div>
    <div class="card"><div class="table-responsive"><table class="table align-middle mb-0 tabla-permisos">
      <thead class="table-light"><tr><th>Permiso</th>${datos.roles.map((r) => html`<th class="text-center" style="width:140px">${r.nombre}</th>`)}</tr></thead>
      <tbody>${grupos.map((g) => html`
        <tr class="fila-grupo"><td colspan="${datos.roles.length + 1}">${g}</td></tr>
        ${datos.permisos.filter((p) => p.grupo === g).map((p) => html`<tr>
          <td><div class="fw-semibold small">${p.etiqueta}</div>
            <div class="text-muted" style="font-size:.72rem"><code>${p.clave}</code>${p.modulo ? html` · requiere el módulo <b>${p.modulo}</b>` : ''}
              ${p.solo_admin ? html` · <span class="text-warning">solo administrador</span>` : ''}</div></td>
          ${datos.roles.map((r) => (p.solo_admin ? html`<td class="text-center text-muted"><i class="bi bi-lock" title="Solo administrador"></i></td>` : celda(p, r.clave)))}
        </tr>`)}`)}
      </tbody>
    </table></div></div>`);

  const botonGuardar = vista.querySelector('[data-guardar]');
  vista.addEventListener('change', (e) => {
    const interruptor = e.target.closest('[data-permiso]');
    if (!interruptor) return;
    const clave = `${interruptor.dataset.rol}|${interruptor.dataset.permiso}`;
    const original = datos.permisos.find((p) => p.clave === interruptor.dataset.permiso).valores[interruptor.dataset.rol].permitido;
    if (interruptor.checked === original) cambios.delete(clave);
    else cambios.set(clave, interruptor.checked);
    botonGuardar.disabled = !cambios.size;
    botonGuardar.innerHTML = cambios.size
      ? `<i class="bi bi-check2 me-1"></i>Guardar ${cambios.size} cambio(s)`
      : '<i class="bi bi-check2 me-1"></i>Guardar cambios';
  });

  botonGuardar.addEventListener('click', async () => {
    const lista = [...cambios].map(([clave, permitido]) => {
      const [rol, permiso] = clave.split('|');
      return { rol, permiso, permitido };
    });
    try {
      await conCarga(botonGuardar, () => api.put('/academia/permisos', { cambios: lista }));
      avisar('Permisos actualizados.');
      recargarVista();
    } catch (error) {
      mostrarError(error);
    }
  });
}
