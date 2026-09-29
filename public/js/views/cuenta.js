/** Mi cuenta: datos del coach, contraseña, respaldo y reinicio de datos. */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, conCarga, confirmar, datosFormulario, pintarErrorFormulario, iniciales,
} from '../ui.js';
import { ir } from '../navegacion.js';
import { temaActual } from '../tema.js';

/** Envía un formulario con manejo de errores dentro del propio formulario. */
function alEnviar(formulario, accion) {
  const caja = formulario.querySelector('[data-error]');
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    caja.classList.add('d-none');
    try {
      await conCarga(formulario.querySelector('[type="submit"]'), () => accion(datosFormulario(formulario)));
    } catch (error) {
      pintarErrorFormulario(caja, error);
    }
  });
}

export function render(vista, { usuario }) {
  montar(vista, html`
    ${encabezado('person-gear', 'Mi cuenta', 'Tus datos de acceso, preferencias y copia de seguridad')}
    <div class="row g-3">
      <div class="col-lg-4"><div class="card h-100"><div class="card-body text-center py-4">
        <span class="avatar mx-auto mb-3" style="width:84px;height:84px;font-size:1.6rem" data-avatar>${iniciales(usuario.nombre)}</span>
        <h3 class="h5 fw-bold mb-0" data-nombre>${usuario.nombre}</h3>
        <p class="text-muted small mb-3">${usuario.correo}</p>
        <span class="badge text-bg-primary text-capitalize">${usuario.rol}</span>
        <hr>
        <div class="d-flex justify-content-between align-items-center">
          <span class="small">Tema de la interfaz</span>
          <button class="btn btn-sm btn-light" data-cambiar-tema><i class="bi bi-circle-half me-1"></i><span data-tema>${temaActual() === 'dark' ? 'Oscuro' : 'Claro'}</span></button>
        </div>
      </div></div></div>

      <div class="col-lg-8 d-flex flex-column gap-3">
        <form class="card" data-perfil novalidate>
          <div class="card-header"><i class="bi bi-person me-2"></i>Datos personales</div>
          <div class="card-body">
            <div class="alert alert-danger d-none" data-error role="alert"></div>
            <div class="row g-3">
              <div class="col-md-6"><label class="form-label small fw-semibold">Nombre completo</label>
                <input class="form-control" name="nombre" value="${usuario.nombre}" maxlength="120" required></div>
              <div class="col-md-6"><label class="form-label small fw-semibold">Correo</label>
                <input class="form-control" value="${usuario.correo}" disabled></div>
            </div>
          </div>
          <div class="card-footer text-end"><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
        </form>

        <form class="card" data-clave novalidate>
          <div class="card-header"><i class="bi bi-key me-2"></i>Cambiar contraseña</div>
          <div class="card-body">
            <div class="alert alert-danger d-none" data-error role="alert"></div>
            <div class="row g-3">
              <div class="col-md-4"><label class="form-label small fw-semibold">Contraseña actual</label>
                <input class="form-control" type="password" name="actual" autocomplete="current-password" required></div>
              <div class="col-md-4"><label class="form-label small fw-semibold">Nueva (mín. 6)</label>
                <input class="form-control" type="password" name="nueva" autocomplete="new-password" minlength="6" required></div>
              <div class="col-md-4"><label class="form-label small fw-semibold">Confirmar nueva</label>
                <input class="form-control" type="password" name="confirmar" autocomplete="new-password" required></div>
            </div>
          </div>
          <div class="card-footer text-end"><button class="btn btn-primary" type="submit">Actualizar contraseña</button></div>
        </form>

        <div class="card"><div class="card-header"><i class="bi bi-cloud-download me-2"></i>Copia de seguridad</div>
          <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
            <p class="small text-muted mb-0" style="max-width:520px">Descarga una copia completa (JSON) de tus deportistas, evaluaciones,
              alimentación y predicciones, incluidos los registros dados de baja.</p>
            <button class="btn btn-light" data-respaldo><i class="bi bi-download me-1"></i>Descargar respaldo</button>
          </div></div>

        <div class="card border border-danger-subtle"><div class="card-header text-danger"><i class="bi bi-exclamation-octagon me-2 text-danger"></i>Reiniciar datos</div>
          <div class="card-body">
            <p class="small">Borra <b>definitivamente</b> todos tus deportistas, evaluaciones, alimentación, predicciones y tu modelo de ML para
              empezar de cero. Tu cuenta se conserva. Descarga un respaldo antes.</p>
            <label class="form-label small" for="confirmacion">Escribe <b>REINICIAR</b> para confirmar</label>
            <div class="input-group" style="max-width:420px"><input class="form-control" id="confirmacion" data-confirmacion autocomplete="off">
              <button class="btn btn-danger" data-reiniciar><i class="bi bi-trash3 me-1"></i>Reiniciar</button></div>
          </div></div>
      </div>
    </div>`);

  alEnviar(vista.querySelector('[data-perfil]'), async (datos) => {
    const actualizado = await api.put('/cuenta/perfil', datos);
    window.dispatchEvent(new CustomEvent('usuario-actualizado', { detail: actualizado }));
    vista.querySelector('[data-nombre]').textContent = actualizado.nombre;
    vista.querySelector('[data-avatar]').textContent = iniciales(actualizado.nombre);
    avisar('Datos actualizados.');
  });

  const formClave = vista.querySelector('[data-clave]');
  alEnviar(formClave, async (datos) => {
    await api.put('/cuenta/password', datos);
    formClave.reset();
    avisar('Contraseña actualizada.');
  });

  vista.querySelector('[data-respaldo]').addEventListener('click', (e) =>
    conCarga(e.currentTarget, () => api.descargar('/cuenta/respaldo')).catch(mostrarError));

  vista.querySelector('[data-reiniciar]').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    const confirmacion = vista.querySelector('[data-confirmacion]').value.trim();
    if (confirmacion !== 'REINICIAR') return avisar('Escribe REINICIAR para confirmar', 'warning');
    const aceptado = await confirmar('Esta acción no se puede deshacer. ¿Borrar todos tus datos deportivos?', {
      titulo: 'Reiniciar datos', boton: 'Sí, borrar todo', peligro: true,
    });
    if (!aceptado) return undefined;
    try {
      const r = await conCarga(boton, () => api.post('/cuenta/reiniciar', { confirmacion }));
      avisar(`Datos reiniciados: se borraron ${r.deportistas_borrados} deportista(s).`);
      ir('/dashboard');
    } catch (error) {
      mostrarError(error);
    }
    return undefined;
  });
}
