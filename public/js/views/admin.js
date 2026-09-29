/**
 * Administración: el administrador crea las cuentas de los coaches (no hay registro público),
 * las edita, desactiva, restablece contraseñas, mueve deportistas entre coaches y ve la
 * actividad de toda la academia.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, mostrarInfo, tablaPaginada,
  iniciales, fecha, fechaHora, insigniaPuntaje, opciones,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { elegirCoach, usuarioActual } from '../sesion.js';
import { tarjetaDato } from './dashboard.js';

const ROLES = [{ valor: 'coach', texto: 'Coach' }, { valor: 'admin', texto: 'Administrador' }];

const avisarCambio = () => window.dispatchEvent(new CustomEvent('coaches-cambiaron'));

/** Muestra una sola vez el correo y la contraseña que hay que entregar al coach. */
function mostrarCredenciales(cuenta, clave, titulo) {
  const texto = `Correo: ${cuenta.correo}\nContraseña temporal: ${clave}\nEntra en: ${window.location.origin}`;
  const ventana = mostrarInfo({
    titulo,
    cuerpo: html`
      <p class="small text-muted">Entrega estos datos a <b>${cuenta.nombre}</b>. Por seguridad, la contraseña
        <b>no se vuelve a mostrar</b> y el sistema le pedirá cambiarla la primera vez que entre.</p>
      <div class="d-grid gap-2 mb-3">
        <div class="credencial"><span><span class="text-muted small d-block">Correo</span>${cuenta.correo}</span></div>
        <div class="credencial"><span><span class="text-muted small d-block">Contraseña temporal</span>${clave}</span></div>
      </div>
      <button class="btn btn-light w-100" data-copiar><i class="bi bi-clipboard me-1"></i>Copiar datos de acceso</button>`,
  });
  const botonCopiar = ventana.querySelector('[data-copiar]');
  botonCopiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texto);
      botonCopiar.innerHTML = '<i class="bi bi-clipboard-check me-1"></i>Copiado';
    } catch {
      avisar('No se pudo copiar automáticamente. Selecciona y copia los datos a mano.', 'warning');
    }
  });
}

function formularioCuenta(cuenta = null) {
  const editando = Boolean(cuenta);
  const propia = cuenta?.id === usuarioActual()?.id;
  modalFormulario({
    titulo: editando ? `Editar a ${cuenta.nombre}` : 'Nueva cuenta de coach',
    boton: editando ? 'Guardar cambios' : 'Crear cuenta',
    cuerpo: html`
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label small fw-semibold">Nombre completo *</label>
          <input class="form-control" name="nombre" value="${cuenta?.nombre ?? ''}" maxlength="120" required></div>
        <div class="col-md-6"><label class="form-label small fw-semibold">Correo *</label>
          <input class="form-control" name="correo" type="email" value="${cuenta?.correo ?? ''}" autocomplete="off" required></div>
        <div class="col-md-6"><label class="form-label small fw-semibold">Rol</label>
          <select class="form-select" name="rol" ${propia ? 'disabled' : ''}>${opciones(ROLES, cuenta?.rol || 'coach')}</select>
          <div class="form-text">El administrador ve y edita los datos de todos los coaches.</div></div>
        ${editando ? html`<div class="col-md-6 d-flex align-items-center"><div class="form-check form-switch mt-3">
            <input class="form-check-input" type="checkbox" role="switch" name="activo" id="cuenta-activa" ${cuenta.activo ? 'checked' : ''} ${propia ? 'disabled' : ''}>
            <label class="form-check-label" for="cuenta-activa">Cuenta activa (puede iniciar sesión)</label></div></div>`
    : html`<div class="col-md-6"><label class="form-label small fw-semibold">Contraseña temporal</label>
            <input class="form-control" name="password" type="text" minlength="6" autocomplete="off" placeholder="Vacía = se genera una segura">
            <div class="form-text">El coach deberá cambiarla al entrar.</div></div>`}
      </div>`,
    alGuardar: async (datos) => {
      if (propia) {
        delete datos.rol;
        delete datos.activo;
      }
      if (editando) {
        const guardada = await api.put(`/admin/usuarios/${cuenta.id}`, datos);
        avisar(`Cuenta de ${guardada.nombre} actualizada.`);
        if (propia) window.dispatchEvent(new CustomEvent('usuario-actualizado', { detail: { nombre: guardada.nombre, correo: guardada.correo } }));
      } else {
        const creada = await api.post('/admin/usuarios', datos);
        mostrarCredenciales(creada, creada.clave_temporal, 'Cuenta creada');
      }
      avisarCambio();
      recargarVista();
    },
  });
}

async function restablecerClave(cuenta) {
  const aceptado = await confirmar(
    html`Se generará una contraseña temporal nueva para <b>${cuenta.nombre}</b> y su contraseña actual dejará de funcionar.`,
    { titulo: 'Restablecer contraseña', boton: 'Generar contraseña' },
  );
  if (!aceptado) return;
  try {
    const { clave_temporal: clave } = await api.post(`/admin/usuarios/${cuenta.id}/password`, {});
    mostrarCredenciales(cuenta, clave, 'Contraseña restablecida');
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

function transferir(cuenta, cuentas) {
  const destinos = cuentas.filter((c) => c.id !== cuenta.id && c.activo)
    .map((c) => ({ valor: c.id, texto: `${c.nombre}${c.rol === 'admin' ? ' (admin)' : ''}` }));
  if (!destinos.length) {
    avisar('No hay otra cuenta activa a la que transferir los deportistas.', 'warning');
    return;
  }
  modalFormulario({
    titulo: `Transferir deportistas de ${cuenta.nombre}`,
    boton: 'Transferir',
    cuerpo: html`<p class="small text-muted">Los <b>${cuenta.deportistas}</b> deportista(s) activos (y los dados de baja) pasarán con todo su
        historial de evaluaciones, alimentación y predicciones al coach que elijas.</p>
      <label class="form-label small fw-semibold">Coach de destino</label>
      <select class="form-select" name="destino_id" required>${opciones(destinos, '', { vacia: 'Selecciona un coach' })}</select>`,
    alGuardar: async (datos) => {
      const r = await api.post(`/admin/usuarios/${cuenta.id}/transferir`, datos);
      avisar(`${r.deportistas_transferidos} deportista(s) transferidos a ${r.destino}.`);
      avisarCambio();
      recargarVista();
    },
  });
}

async function cambiarEstado(cuenta) {
  const activar = !cuenta.activo;
  if (!activar && !await confirmar(
    html`<b>${cuenta.nombre}</b> no podrá iniciar sesión y su sesión abierta se cerrará al instante. Sus datos se conservan.`,
    { titulo: 'Desactivar cuenta', boton: 'Desactivar', peligro: true },
  )) return;
  try {
    await api.put(`/admin/usuarios/${cuenta.id}`, { activo: activar });
    avisar(`Cuenta de ${cuenta.nombre} ${activar ? 'activada' : 'desactivada'}.`, activar ? 'success' : 'info');
    avisarCambio();
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

async function eliminar(cuenta) {
  if (!await confirmar(
    html`¿Eliminar definitivamente la cuenta de <b>${cuenta.nombre}</b>? Esta acción no se puede deshacer.`,
    { titulo: 'Eliminar cuenta', boton: 'Eliminar', peligro: true },
  )) return;
  try {
    await api.delete(`/admin/usuarios/${cuenta.id}`);
    avisar(`Cuenta de ${cuenta.nombre} eliminada.`, 'info');
    avisarCambio();
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

const estado = (c) => html`
  ${c.activo ? html`<span class="badge text-bg-success">Activa</span>` : html`<span class="badge text-bg-secondary">Desactivada</span>`}
  ${c.debe_cambiar_clave ? html`<span class="badge text-bg-warning ms-1" title="Aún usa la contraseña temporal">Clave temporal</span>` : ''}`;

function acciones(c, propia) {
  return html`
    <div class="dropdown">
      <button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Acciones de ${c.nombre}"><i class="bi bi-three-dots"></i></button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><button class="dropdown-item" data-accion="ver" data-id="${c.id}"><i class="bi bi-eye me-2"></i>Ver sus datos</button></li>
        <li><button class="dropdown-item" data-accion="editar" data-id="${c.id}"><i class="bi bi-pencil me-2"></i>Editar cuenta</button></li>
        ${propia ? '' : html`
          <li><button class="dropdown-item" data-accion="clave" data-id="${c.id}"><i class="bi bi-key me-2"></i>Restablecer contraseña</button></li>
          <li><button class="dropdown-item" data-accion="estado" data-id="${c.id}"><i class="bi bi-${c.activo ? 'pause-circle' : 'play-circle'} me-2"></i>${c.activo ? 'Desactivar' : 'Activar'}</button></li>`}
        <li><button class="dropdown-item" data-accion="transferir" data-id="${c.id}" ${c.deportistas ? '' : 'disabled'}><i class="bi bi-arrow-left-right me-2"></i>Transferir deportistas</button></li>
        ${propia ? '' : html`<li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" data-accion="eliminar" data-id="${c.id}"><i class="bi bi-trash3 me-2"></i>Eliminar cuenta</button></li>`}
      </ul>
    </div>`;
}

export async function render(vista) {
  const [resumen, cuentas] = await Promise.all([api.get('/admin/resumen'), api.get('/admin/usuarios')]);
  const yo = usuarioActual()?.id;
  let filtro = '';

  montar(vista, html`
    ${encabezado('shield-lock', 'Coaches y accesos', 'Crea las cuentas de los coaches, controla su acceso y revisa la actividad de toda la academia', html`
      <button class="btn btn-primary" data-accion="nuevo"><i class="bi bi-person-plus me-1"></i>Nueva cuenta</button>`)}

    <div class="row g-3 mb-4">
      ${tarjetaDato('person-badge', 'azul', resumen.coaches_activos, `Coaches activos de ${resumen.coaches}`)}
      ${tarjetaDato('people', 'verde', resumen.deportistas, 'Deportistas en la academia')}
      ${tarjetaDato('clipboard2-pulse', 'violeta', resumen.evaluaciones_30_dias, `Evaluaciones en 30 días (${resumen.evaluaciones} en total)`)}
      ${tarjetaDato('graph-up-arrow', 'ambar', resumen.promedio_general, 'Promedio general de la academia')}
    </div>

    <div class="card">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span><i class="bi bi-people me-2"></i>Cuentas <span class="text-muted fw-normal small">· ${cuentas.length} en total · ${resumen.activos_7_dias} entraron esta semana</span></span>
        <input class="form-control form-control-sm" style="max-width:260px" type="search" placeholder="Buscar por nombre o correo" data-buscar aria-label="Buscar cuenta">
      </div>
      <div class="table-responsive"><table class="table table-hover align-middle mb-0" data-tabla>
        <thead class="table-light"><tr>
          <th>Cuenta</th><th>Rol</th><th>Estado</th><th class="text-center">Deportistas</th><th class="text-center">Evaluaciones</th>
          <th class="text-center">Promedio</th><th>Última evaluación</th><th>Último acceso</th><th class="text-end"></th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="paginacion"></div>
    </div>
    <p class="small text-muted mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>Para trabajar con los datos de un coach
      (deportistas, evaluaciones, Excel, ML, reportes) elígelo en el selector de la barra superior o usa <b>Ver sus datos</b>.</p>`);

  const tbody = vista.querySelector('[data-tabla] tbody');
  const pie = vista.querySelector('.paginacion');
  const pintar = () => {
    const texto = filtro.toLowerCase();
    const visibles = cuentas.filter((c) => !texto || c.nombre.toLowerCase().includes(texto) || c.correo.includes(texto));
    tablaPaginada(tbody, pie, visibles, (c) => html`
      <tr class="${c.activo ? '' : 'fila-inactiva'}">
        <td><div class="d-flex align-items-center gap-2"><span class="avatar" style="width:34px;height:34px;font-size:.75rem">${iniciales(c.nombre)}</span>
          <div><div class="fw-semibold">${c.nombre}${c.id === yo ? html` <span class="text-muted small">(tú)</span>` : ''}</div>
            <div class="small text-muted">${c.correo}</div></div></div></td>
        <td><span class="badge ${c.rol === 'admin' ? 'text-bg-warning' : 'text-bg-primary'}">${c.rol === 'admin' ? 'Admin' : 'Coach'}</span></td>
        <td class="text-nowrap">${estado(c)}</td>
        <td class="text-center">${c.deportistas}</td>
        <td class="text-center">${c.evaluaciones}</td>
        <td class="text-center">${insigniaPuntaje(c.promedio)}</td>
        <td class="text-nowrap">${c.ultima_evaluacion ? fecha(c.ultima_evaluacion) : '—'}</td>
        <td class="text-nowrap small">${c.ultimo_acceso ? fechaHora(c.ultimo_acceso) : html`<span class="text-muted">Nunca</span>`}</td>
        <td class="text-end">${acciones(c, c.id === yo)}</td>
      </tr>`, { columnas: 9, porPagina: 20, mensajeVacio: 'No hay cuentas que coincidan', icono: 'person-badge' });
  };
  pintar();

  let espera = null;
  vista.querySelector('[data-buscar]').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtro = e.target.value.trim(); pintar(); }, 200);
  });

  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton || boton.disabled) return;
    const cuenta = cuentas.find((c) => c.id === Number(boton.dataset.id));
    switch (boton.dataset.accion) {
      case 'nuevo': formularioCuenta(); break;
      case 'editar': formularioCuenta(cuenta); break;
      case 'clave': restablecerClave(cuenta); break;
      case 'estado': cambiarEstado(cuenta); break;
      case 'transferir': transferir(cuenta, cuentas); break;
      case 'eliminar': eliminar(cuenta); break;
      case 'ver':
        elegirCoach(cuenta.id);
        avisarCambio();
        avisar(`Viendo los datos de ${cuenta.nombre}.`, 'info');
        ir('/dashboard');
        break;
      default:
    }
  });
}
