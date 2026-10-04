/**
 * Usuarios de la academia (administrador). No hay registro público: aquí se crean las cuentas de
 * administradores, coaches, deportistas y padres; se vinculan deportistas y padres con sus fichas;
 * se activan o desactivan accesos, se restablecen contraseñas y se mueven deportistas entre coaches.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, mostrarInfo, tablaPaginada,
  iniciales, fecha, fechaHora, insigniaPuntaje, opciones,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import {
  elegirCoach, usuarioActual, esSuperAdmin, academiaActual, NOMBRE_ROL,
} from '../sesion.js';
import { tarjetaDato } from './dashboard.js';

const ROLES = ['coach', 'admin', 'profesional', 'deportista', 'padre'].map((valor) => ({ valor, texto: NOMBRE_ROL[valor] }));
const COLOR_ROL = { admin: 'text-bg-warning', coach: 'text-bg-primary', profesional: 'text-bg-success', deportista: 'text-bg-info', padre: 'text-bg-secondary' };
const operativo = (rol) => ['admin', 'coach'].includes(rol);
const avisarCambio = () => window.dispatchEvent(new CustomEvent('coaches-cambiaron'));

/** El administrador puede cambiar nombre, correo o clave solo si la cuenta no se usa en otra academia. */
const identidadEditable = (c) => esSuperAdmin() || (c.otras_academias === 0 && !c.es_super_admin);

/** Muestra una sola vez el correo y la contraseña que hay que entregar. */
function mostrarCredenciales(cuenta, clave, titulo) {
  const texto = `Academia: ${academiaActual()?.nombre}\nCorreo: ${cuenta.correo}\nContraseña temporal: ${clave}\nEntra en: ${window.location.origin}`;
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

/** Campo de vínculo con fichas: una para el deportista, varias para el padre. */
function campoVinculos(fichas, seleccion = []) {
  const elegidos = new Set(seleccion.map((v) => v.id));
  return html`<div class="col-12" data-vinculos>
    <label class="form-label small fw-semibold" data-etiqueta-vinculo>Ficha del deportista</label>
    <select class="form-select" name="deportistas" data-select-vinculo size="1">
      <option value="">Sin vincular</option>
      ${fichas.map((f) => html`<option value="${f.id}" ${elegidos.has(f.id) ? 'selected' : ''}>${f.nombre} (${f.codigo})${f.coach ? ` · ${f.coach}` : ''}</option>`)}
    </select>
    <div class="form-text" data-ayuda-vinculo>Podrá consultar solo esta ficha, sin modificar resultados.</div>
  </div>`;
}

/** Ajusta el formulario al rol elegido (vínculos, selección múltiple para padres). */
function adaptarAlRol(formulario) {
  const rol = formulario.querySelector('[name=rol]')?.value;
  const bloque = formulario.querySelector('[data-vinculos]');
  if (!bloque) return;
  const select = bloque.querySelector('select');
  const visible = ['deportista', 'padre'].includes(rol);
  bloque.classList.toggle('d-none', !visible);
  select.disabled = !visible;
  select.multiple = rol === 'padre';
  select.size = rol === 'padre' ? Math.min(6, select.options.length) : 1;
  select.options[0].hidden = rol === 'padre';
  bloque.querySelector('[data-etiqueta-vinculo]').textContent = rol === 'padre' ? 'Deportistas a su cargo (Ctrl/Cmd para elegir varios)' : 'Ficha del deportista';
  bloque.querySelector('[data-ayuda-vinculo]').textContent = rol === 'padre'
    ? 'Podrá consultar el progreso de estos deportistas, sin modificar resultados.'
    : 'Podrá consultar solo esta ficha, sin modificar resultados.';
}

function valoresVinculo(formulario) {
  const select = formulario.querySelector('[data-select-vinculo]');
  if (!select || select.disabled) return undefined;
  return [...select.selectedOptions].map((o) => Number(o.value)).filter(Boolean);
}

function formularioCuenta(cuenta, fichas) {
  const editando = Boolean(cuenta);
  const propia = cuenta?.id === usuarioActual()?.id;
  const identidad = !editando || identidadEditable(cuenta);
  const elemento = modalFormulario({
    titulo: editando ? `Editar a ${cuenta.nombre}` : 'Nuevo usuario',
    boton: editando ? 'Guardar cambios' : 'Crear usuario',
    cuerpo: html`
      ${editando && !identidad ? html`<div class="alert alert-info small py-2"><i class="bi bi-info-circle me-1"></i>Esta cuenta también se usa en otra
        academia: su nombre, correo y contraseña los gestiona la propia persona.</div>` : ''}
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label small fw-semibold">Nombre completo *</label>
          <input class="form-control" name="nombre" value="${cuenta?.nombre ?? ''}" maxlength="120" required ${identidad ? '' : 'readonly'}></div>
        <div class="col-md-6"><label class="form-label small fw-semibold">Correo *</label>
          <input class="form-control" name="correo" type="email" value="${cuenta?.correo ?? ''}" autocomplete="off" required ${identidad ? '' : 'readonly'}></div>
        <div class="col-md-6"><label class="form-label small fw-semibold">Rol en la academia</label>
          <select class="form-select" name="rol" ${propia ? 'disabled' : ''}>${opciones(ROLES, cuenta?.rol || 'coach')}</select>
          <div class="form-text">Los permisos de cada rol se ajustan en <a href="#/permisos">Permisos</a>.</div></div>
        ${editando ? html`<div class="col-md-6 d-flex align-items-center"><div class="form-check form-switch mt-3">
            <input class="form-check-input" type="checkbox" role="switch" name="activo" id="cuenta-activa" ${cuenta.activo ? 'checked' : ''} ${propia ? 'disabled' : ''}>
            <label class="form-check-label" for="cuenta-activa">Acceso activo a esta academia</label></div></div>`
    : html`<div class="col-md-6"><label class="form-label small fw-semibold">Contraseña temporal</label>
            <input class="form-control" name="password" type="text" minlength="6" autocomplete="off" placeholder="Vacía = se genera una segura">
            <div class="form-text">Deberá cambiarla al entrar. Si el correo ya tiene cuenta, se conserva su contraseña.</div></div>`}
        ${campoVinculos(fichas, cuenta?.vinculos || [])}
      </div>`,
    alGuardar: async (datos) => {
      const formulario = elemento.querySelector('form');
      const cuerpo = { ...datos, deportistas: valoresVinculo(formulario) };
      if (propia) {
        delete cuerpo.rol;
        delete cuerpo.activo;
      }
      if (editando && !identidad) {
        delete cuerpo.nombre;
        delete cuerpo.correo;
      }
      if (editando) {
        const guardada = await api.put(`/admin/usuarios/${cuenta.id}`, cuerpo);
        avisar(`Usuario ${guardada.nombre} actualizado.`);
        if (propia) window.dispatchEvent(new CustomEvent('usuario-actualizado', { detail: { nombre: guardada.nombre, correo: guardada.correo } }));
        avisarCambio();
        recargarVista();
        return undefined;
      }
      const creada = await api.post('/admin/usuarios', cuerpo);
      avisarCambio();
      recargarVista();
      // Se muestra cuando el formulario ya se cerró, para no superponer ventanas
      return () => (creada.cuenta_existente
        ? mostrarInfo({
          titulo: 'Acceso concedido',
          cuerpo: html`<p class="mb-0"><b>${creada.nombre}</b> ya tenía una cuenta en SportEval AI. Ahora también tiene acceso a esta academia
            como <b>${NOMBRE_ROL[creada.rol]}</b> y entra con su contraseña de siempre (podrá cambiar de academia desde su menú).</p>`,
        })
        : mostrarCredenciales(creada, creada.clave_temporal, 'Usuario creado'));
    },
  });
  const formulario = elemento.querySelector('form');
  formulario.querySelector('[name=rol]').addEventListener('change', () => adaptarAlRol(formulario));
  adaptarAlRol(formulario);
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
  const destinos = cuentas.filter((c) => c.id !== cuenta.id && c.activo && operativo(c.rol))
    .map((c) => ({ valor: c.id, texto: `${c.nombre}${c.rol === 'admin' ? ' (admin)' : ''}` }));
  if (!destinos.length) {
    avisar('No hay otro coach activo al que transferir los deportistas.', 'warning');
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
    html`<b>${cuenta.nombre}</b> perderá el acceso a esta academia al instante. Sus datos se conservan y puedes reactivarlo cuando quieras.`,
    { titulo: 'Desactivar acceso', boton: 'Desactivar', peligro: true },
  )) return;
  try {
    await api.put(`/admin/usuarios/${cuenta.id}`, { activo: activar });
    avisar(`Acceso de ${cuenta.nombre} ${activar ? 'activado' : 'desactivado'}.`, activar ? 'success' : 'info');
    avisarCambio();
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

async function eliminar(cuenta) {
  if (!await confirmar(
    html`¿Quitar a <b>${cuenta.nombre}</b> de la academia? ${cuenta.otras_academias
      ? 'Conservará su cuenta en las otras academias a las que pertenece.'
      : 'Su cuenta se eliminará definitivamente.'}`,
    { titulo: 'Quitar de la academia', boton: 'Quitar', peligro: true },
  )) return;
  try {
    await api.delete(`/admin/usuarios/${cuenta.id}`);
    avisar(`${cuenta.nombre} ya no pertenece a la academia.`, 'info');
    avisarCambio();
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

const estado = (c) => html`
  ${c.activo ? html`<span class="badge text-bg-success">Activo</span>` : html`<span class="badge text-bg-secondary">Desactivado</span>`}
  ${c.debe_cambiar_clave ? html`<span class="badge text-bg-warning ms-1" title="Aún usa la contraseña temporal">Clave temporal</span>` : ''}
  ${c.otras_academias ? html`<span class="badge text-bg-light border ms-1" title="También pertenece a otra academia">+${c.otras_academias} academia</span>` : ''}`;

function acciones(c, propia) {
  const opcion = (accion, icono, texto, extra = '') => html`<li><button class="dropdown-item ${extra}" data-accion="${accion}" data-id="${c.id}"><i class="bi bi-${icono} me-2"></i>${texto}</button></li>`;
  return html`
    <div class="dropdown">
      <button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Acciones de ${c.nombre}"><i class="bi bi-three-dots"></i></button>
      <ul class="dropdown-menu dropdown-menu-end">
        ${operativo(c.rol) ? opcion('ver', 'eye', 'Ver sus datos') : ''}
        ${opcion('editar', 'pencil', 'Editar')}
        ${!propia && identidadEditable(c) ? opcion('clave', 'key', 'Restablecer contraseña') : ''}
        ${propia ? '' : opcion('estado', c.activo ? 'pause-circle' : 'play-circle', c.activo ? 'Desactivar acceso' : 'Activar acceso')}
        ${operativo(c.rol) && c.deportistas ? opcion('transferir', 'arrow-left-right', 'Transferir deportistas') : ''}
        ${propia ? '' : html`<li><hr class="dropdown-divider"></li>${opcion('eliminar', 'person-x', 'Quitar de la academia', 'text-danger')}`}
      </ul>
    </div>`;
}

const vinculos = (c) => (c.vinculos?.length
  ? html`${c.vinculos.map((v) => html`<span class="badge text-bg-light border me-1">${v.nombre}</span>`)}`
  : html`<span class="text-muted small">${['deportista', 'padre'].includes(c.rol) ? 'Sin vincular' : '—'}</span>`);

export async function render(vista) {
  const [resumen, cuentas, { datos: fichas }] = await Promise.all([
    api.get('/admin/resumen'),
    api.get('/admin/usuarios'),
    api.get('/deportistas', { todaLaAcademia: true }),
  ]);
  const yo = usuarioActual()?.id;
  let filtro = '';
  let filtroRol = '';

  montar(vista, html`
    ${encabezado('person-badge', 'Usuarios', `Quién tiene acceso a ${academiaActual()?.nombre || 'la academia'} y con qué rol`, html`
      <button class="btn btn-primary" data-accion="nuevo"><i class="bi bi-person-plus me-1"></i>Nuevo usuario</button>`)}

    <div class="row g-3 mb-4">
      ${tarjetaDato('person-badge', 'azul', resumen.coaches_activos, `Coaches activos de ${resumen.coaches}`)}
      ${tarjetaDato('people', 'verde', resumen.deportistas, `Deportistas activos (${resumen.deportistas_inactivos} de baja)`)}
      ${tarjetaDato('clipboard2-pulse', 'violeta', resumen.evaluaciones_30_dias, `Evaluaciones en 30 días (${resumen.evaluaciones} en total)`)}
      ${tarjetaDato('person-heart', 'ambar', resumen.cuentas_deportista + resumen.cuentas_padre, 'Cuentas de deportistas y padres')}
    </div>

    <div class="card">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span><i class="bi bi-people me-2"></i>Usuarios <span class="text-muted fw-normal small">· ${cuentas.length} en total · ${resumen.activos_7_dias} entraron esta semana</span></span>
        <div class="d-flex gap-2 flex-wrap">
          <select class="form-select form-select-sm" style="max-width:170px" data-filtro-rol aria-label="Filtrar por rol">
            ${opciones(ROLES, '', { vacia: 'Todos los roles' })}
          </select>
          <input class="form-control form-control-sm" style="max-width:240px" type="search" placeholder="Buscar por nombre o correo" data-buscar aria-label="Buscar usuario">
        </div>
      </div>
      <div class="table-responsive"><table class="table table-hover align-middle mb-0" data-tabla>
        <thead class="table-light"><tr>
          <th>Usuario</th><th>Rol</th><th>Estado</th><th>Vinculado a</th><th class="text-center">Deportistas</th><th class="text-center">Evaluaciones</th>
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
    const visibles = cuentas
      .filter((c) => !filtroRol || c.rol === filtroRol)
      .filter((c) => !texto || c.nombre.toLowerCase().includes(texto) || c.correo.includes(texto));
    tablaPaginada(tbody, pie, visibles, (c) => html`
      <tr class="${c.activo ? '' : 'fila-inactiva'}">
        <td><div class="d-flex align-items-center gap-2"><span class="avatar" style="width:34px;height:34px;font-size:.75rem">${iniciales(c.nombre)}</span>
          <div><div class="fw-semibold">${c.nombre}${c.id === yo ? html` <span class="text-muted small">(tú)</span>` : ''}</div>
            <div class="small text-muted">${c.correo}</div></div></div></td>
        <td><span class="badge ${COLOR_ROL[c.rol]}">${NOMBRE_ROL[c.rol]}</span></td>
        <td class="text-nowrap">${estado(c)}</td>
        <td>${vinculos(c)}</td>
        <td class="text-center">${operativo(c.rol) ? c.deportistas : '—'}</td>
        <td class="text-center">${operativo(c.rol) ? c.evaluaciones : '—'}</td>
        <td class="text-center">${operativo(c.rol) ? insigniaPuntaje(c.promedio) : '—'}</td>
        <td class="text-nowrap">${c.ultima_evaluacion ? fecha(c.ultima_evaluacion) : '—'}</td>
        <td class="text-nowrap small">${c.ultimo_acceso ? fechaHora(c.ultimo_acceso) : html`<span class="text-muted">Nunca</span>`}</td>
        <td class="text-end">${acciones(c, c.id === yo)}</td>
      </tr>`, { columnas: 10, porPagina: 20, mensajeVacio: 'No hay usuarios que coincidan', icono: 'person-badge' });
  };
  pintar();

  let espera = null;
  vista.querySelector('[data-buscar]').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtro = e.target.value.trim(); pintar(); }, 200);
  });
  vista.querySelector('[data-filtro-rol]').addEventListener('change', (e) => { filtroRol = e.target.value; pintar(); });

  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton || boton.disabled) return;
    const cuenta = cuentas.find((c) => c.id === Number(boton.dataset.id));
    switch (boton.dataset.accion) {
      case 'nuevo': formularioCuenta(null, fichas); break;
      case 'editar': formularioCuenta(cuenta, fichas); break;
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
