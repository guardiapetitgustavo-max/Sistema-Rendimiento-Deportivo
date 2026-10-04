/**
 * Plataforma (super administrador): crea academias con su administrador, las suspende o reactiva y
 * ve su uso. No muestra datos deportivos privados: para operar dentro de una academia hace falta
 * un acceso explícito, que queda registrado en la auditoría de esa academia.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, mostrarInfo, fecha, fechaHora,
} from '../ui.js';
import { recargarVista } from '../navegacion.js';
import { tarjetaDato } from './dashboard.js';
import { campos, tabla, insignia } from '../formularios.js';

let PLANES = [];
let CATALOGO = { recursos: {}, modulos: [] };

/** Plan y suscripción de una academia, con su uso frente a los límites del plan. */
async function suscripcion(a) {
  const r = await api.get(`/plataforma/academias/${a.id}/suscripcion`);
  const actual = r.historial.find((h) => h.actual);
  modalFormulario({
    titulo: `Plan de ${a.nombre}`,
    tamano: 'modal-lg',
    boton: 'Cambiar plan',
    cuerpo: html`<div class="mb-3">${tabla(Object.entries(r.uso), [
      { titulo: 'Recurso', valor: ([k]) => CATALOGO.recursos[k] || k },
      { titulo: 'Uso', valor: ([, u]) => u.uso },
      { titulo: 'Límite', valor: ([, u]) => (u.limite === null ? 'Sin límite' : u.limite) },
    ])}</div>
      ${campos([
    { nombre: 'plan', etiqueta: 'Plan', tipo: 'select', vacia: false, opciones: PLANES.map((p) => ({ valor: p.clave, texto: `${p.nombre} (${p.moneda} ${p.precio_mensual}/mes)` })) },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacia: false, opciones: ['activa', 'prueba', 'vencida', 'suspendida', 'cancelada'].map((e) => ({ valor: e, texto: e })) },
    { nombre: 'fin', etiqueta: 'Vence el', tipo: 'fecha' },
    { nombre: 'notas', etiqueta: 'Notas' },
  ], { plan: actual?.plan, estado: actual?.estado, fin: actual?.fin })}
      <div class="small text-muted mt-3">Historial: ${r.historial.map((h) => `${h.plan_nombre} (${h.estado}, desde ${fecha(h.inicio)})`).join(' → ')}</div>`,
    alGuardar: async (datos) => {
      await api.post(`/plataforma/academias/${a.id}/suscripcion`, datos);
      avisar('Suscripción actualizada.');
      recargarVista();
    },
  });
}

function cobro(a) {
  modalFormulario({
    titulo: `Registrar cobro a ${a.nombre}`,
    cuerpo: campos([{ nombre: 'monto', etiqueta: 'Monto', tipo: 'numero', requerido: true, min: 0 }, { nombre: 'moneda', etiqueta: 'Moneda', defecto: 'USD' },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' }, { nombre: 'metodo', etiqueta: 'Método' }, { nombre: 'referencia', etiqueta: 'Referencia', col: 'col-12' }]),
    alGuardar: async (datos) => { await api.post(`/plataforma/academias/${a.id}/pagos`, datos); avisar('Cobro registrado.'); },
  });
}

function editarPlanes() {
  const plan = (p) => html`<div class="border rounded p-3 mb-3" data-plan="${p.clave}">
    <div class="row g-2">${campos([
    { nombre: `${p.clave}__nombre`, etiqueta: 'Nombre', col: 'col-md-4' },
    { nombre: `${p.clave}__precio_mensual`, etiqueta: 'Precio mensual', tipo: 'numero', col: 'col-md-4' },
    { nombre: `${p.clave}__moneda`, etiqueta: 'Moneda', col: 'col-md-4' },
  ], { [`${p.clave}__nombre`]: p.nombre, [`${p.clave}__precio_mensual`]: p.precio_mensual, [`${p.clave}__moneda`]: p.moneda })}</div>
    <div class="small fw-semibold mt-2">Límites (vacío = sin límite)</div>
    <div class="row g-2">${Object.entries(CATALOGO.recursos).map(([k, t]) => html`<div class="col-6 col-md-3"><label class="form-label small mb-0">${t}</label>
      <input class="form-control form-control-sm" type="number" min="0" name="${p.clave}__lim__${k}" value="${p.limites?.[k] ?? ''}"></div>`)}</div>
    <div class="small fw-semibold mt-2">Módulos incluidos</div>
    <div class="d-flex flex-wrap gap-3">${CATALOGO.modulos.map((m) => html`<label class="form-check small"><input class="form-check-input" type="checkbox" name="${p.clave}__mod__${m.clave}" ${p.modulos.includes(m.clave) ? 'checked' : ''}> ${m.etiqueta}</label>`)}</div>
  </div>`;
  modalFormulario({
    titulo: 'Planes de la plataforma',
    tamano: 'modal-xl',
    cuerpo: html`${PLANES.map((p) => html`<h3 class="h6 fw-bold">${p.clave} ${insignia(`${p.academias} academias`, 'light')}</h3>${plan(p)}`)}`,
    alGuardar: async (datos) => {
      for (const p of PLANES) {
        await api.post('/plataforma/planes', {
          clave: p.clave, nombre: datos[`${p.clave}__nombre`], precio_mensual: datos[`${p.clave}__precio_mensual`], moneda: datos[`${p.clave}__moneda`], orden: p.orden,
          limites: Object.fromEntries(Object.keys(CATALOGO.recursos).map((k) => [k, datos[`${p.clave}__lim__${k}`] === '' ? null : Number(datos[`${p.clave}__lim__${k}`])])),
          modulos: CATALOGO.modulos.map((m) => m.clave).filter((m) => datos[`${p.clave}__mod__${m}`] === true),
        });
      }
      avisar('Planes actualizados: los límites y módulos se aplican al instante.');
      recargarVista();
    },
  });
}

async function crearDemo(boton) {
  if (!await confirmar(html`Se creará (o se volverá a crear) <b>Sport Academy Demo</b> con 36 deportistas de Fútbol, Natación y Atletismo, 3 coaches,
    evaluaciones de 4 meses, entrenamientos, asistencia, recuperación, objetivos, pagos y alertas. <b>Los datos son sintéticos.</b>`, { titulo: 'Academia demo', boton: 'Crear demo' })) return;
  boton.disabled = true;
  try {
    const r = await api.post('/plataforma/demo');
    mostrarInfo({
      titulo: 'Academia demo lista',
      cuerpo: html`<p>${r.deportistas} deportistas, ${r.resultados} resultados, ${r.entrenamientos} entrenamientos y ${r.alertas} alertas en ${(r.duracion_ms / 1000).toFixed(1)} s.</p>
        <p class="small mb-1">Cuentas (contraseña <code>${r.clave}</code>):</p><ul class="small">${r.cuentas.map((c) => html`<li><code>${c}</code></li>`)}</ul>
        <p class="small text-muted mb-0">Tú ya eres administrador de la demo: cámbiala desde tu menú de usuario.</p>`,
    }).addEventListener('hidden.bs.modal', () => window.dispatchEvent(new CustomEvent('sesion-cambiada')));
  } catch (error) {
    mostrarError(error);
  } finally {
    boton.disabled = false;
  }
}

function mostrarCreada(creada) {
  const ventana = mostrarInfo({
    titulo: 'Academia creada',
    cuerpo: creada.cuenta_existente
      ? html`<p class="mb-0"><b>${creada.nombre}</b> está lista. <b>${creada.admin.correo}</b> ya tenía cuenta: entra con su contraseña de
          siempre y verá la nueva academia en su menú.</p>`
      : html`<p class="small text-muted">Entrega estos datos al administrador de <b>${creada.nombre}</b>. La contraseña no se vuelve a mostrar
          y deberá cambiarla al entrar.</p>
        <div class="d-grid gap-2 mb-3">
          <div class="credencial"><span><span class="text-muted small d-block">Correo</span>${creada.admin.correo}</span></div>
          <div class="credencial"><span><span class="text-muted small d-block">Contraseña temporal</span>${creada.clave_temporal}</span></div>
        </div>
        <button class="btn btn-light w-100" data-copiar><i class="bi bi-clipboard me-1"></i>Copiar datos de acceso</button>`,
  });
  const copiar = ventana.querySelector('[data-copiar]');
  copiar?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`Academia: ${creada.nombre}\nCorreo: ${creada.admin.correo}\nContraseña temporal: ${creada.clave_temporal}\nEntra en: ${window.location.origin}`);
      copiar.innerHTML = '<i class="bi bi-clipboard-check me-1"></i>Copiado';
    } catch {
      avisar('No se pudo copiar automáticamente.', 'warning');
    }
  });
}

function nuevaAcademia() {
  modalFormulario({
    titulo: 'Nueva academia',
    boton: 'Crear academia',
    cuerpo: html`<div class="row g-3">
      <div class="col-12"><label class="form-label small fw-semibold">Nombre de la academia *</label>
        <input class="form-control" name="nombre" maxlength="120" required placeholder="Academia Deportiva Los Andes"></div>
      <div class="col-12"><hr class="my-1"><div class="small fw-semibold text-muted">Su primer administrador</div></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Nombre *</label>
        <input class="form-control" name="admin_nombre" maxlength="120" required></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Correo *</label>
        <input class="form-control" name="admin_correo" type="email" required autocomplete="off"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Contraseña temporal</label>
        <input class="form-control" name="admin_password" type="text" minlength="6" autocomplete="off" placeholder="Vacía = se genera una segura">
        <div class="form-text">Si el correo ya tiene cuenta, se conserva su contraseña.</div></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Plan</label>
        <select class="form-select" name="plan">${PLANES.map((p) => html`<option value="${p.clave}" ${p.clave === 'PRO' ? 'selected' : ''}>${p.nombre}</option>`)}</select></div>
      <div class="col-md-6"><label class="form-label small fw-semibold">Suscripción</label>
        <select class="form-select" name="estado_suscripcion"><option value="activa">Activa</option><option value="prueba">Prueba</option></select></div>
    </div>`,
    alGuardar: async (datos) => {
      const creada = await api.post('/plataforma/academias', datos);
      recargarVista();
      return () => mostrarCreada(creada);
    },
  });
}

function editarAcademia(a) {
  modalFormulario({
    titulo: `Editar ${a.nombre}`,
    cuerpo: html`<label class="form-label small fw-semibold">Nombre *</label>
      <input class="form-control" name="nombre" value="${a.nombre}" maxlength="120" required>`,
    alGuardar: async (datos) => {
      await api.put(`/plataforma/academias/${a.id}`, datos);
      avisar('Academia actualizada.');
      recargarVista();
    },
  });
}

async function cambiarEstado(a) {
  const suspender = a.estado === 'activa';
  if (!await confirmar(suspender
    ? html`Todos los usuarios de <b>${a.nombre}</b> perderán el acceso al instante. Sus datos se conservan intactos y podrás reactivarla.`
    : html`¿Reactivar <b>${a.nombre}</b>? Sus usuarios podrán volver a entrar.`, {
    titulo: suspender ? 'Suspender academia' : 'Reactivar academia', boton: suspender ? 'Suspender' : 'Reactivar', peligro: suspender,
  })) return;
  try {
    await api.put(`/plataforma/academias/${a.id}`, { estado: suspender ? 'suspendida' : 'activa' });
    avisar(`${a.nombre} ${suspender ? 'suspendida' : 'reactivada'}.`, suspender ? 'warning' : 'success');
    recargarVista();
  } catch (error) {
    mostrarError(error);
  }
}

async function pedirAcceso(a) {
  if (!a.soy_miembro && !await confirmar(
    html`Entrarás a <b>${a.nombre}</b> como administrador y podrás ver sus datos. <b>Quedará registrado en su auditoría</b>
      y su equipo podrá verlo. Úsalo solo con autorización de la academia.`,
    { titulo: 'Acceso a los datos de la academia', boton: 'Entrar con registro' },
  )) return;
  try {
    if (!a.soy_miembro) await api.post(`/plataforma/academias/${a.id}/acceso`);
    await api.post('/auth/academia', { academia_id: a.id });
    window.dispatchEvent(new CustomEvent('sesion-cambiada'));
    window.location.hash = '#/dashboard';
  } catch (error) {
    mostrarError(error);
  }
}

export async function render(vista) {
  const [resumen, academias, planes] = await Promise.all([api.get('/plataforma/resumen'), api.get('/plataforma/academias'), api.get('/plataforma/planes')]);
  PLANES = planes.planes;
  CATALOGO = planes;

  montar(vista, html`
    ${encabezado('buildings', 'Plataforma', 'Academias que usan SportEval AI', html`
      <button class="btn btn-light" data-accion="demo"><i class="bi bi-magic me-1"></i>Academia demo</button>
      <button class="btn btn-light" data-accion="planes"><i class="bi bi-boxes me-1"></i>Planes</button>
      <button class="btn btn-primary" data-accion="nueva"><i class="bi bi-plus-lg me-1"></i>Nueva academia</button>`)}
    <div class="row g-3 mb-4">
      ${tarjetaDato('buildings', 'azul', resumen.academias_activas, `Academias activas de ${resumen.academias}`)}
      ${tarjetaDato('person-badge', 'violeta', resumen.usuarios, 'Usuarios en la plataforma')}
      ${tarjetaDato('people', 'verde', resumen.deportistas, 'Deportistas activos')}
      ${tarjetaDato('activity', 'ambar', resumen.activos_7_dias, 'Usuarios activos esta semana')}
    </div>
    <div class="alert alert-light border small"><i class="bi bi-shield-lock me-1"></i>Como super administrador ves el <b>uso</b> de cada academia,
      no sus datos deportivos. Para entrar a una academia usa <b>Acceder a los datos</b>: queda registrado en su auditoría.</div>
    <div class="card"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr><th>Academia</th><th>Estado</th><th class="text-center">Admins</th><th class="text-center">Coaches</th>
        <th class="text-center">Deportistas</th><th class="text-center">Evaluaciones</th><th class="text-center">Cuentas dep./padres</th><th>Última actividad</th><th></th></tr></thead>
      <tbody>${academias.length ? academias.map((a) => html`<tr class="${a.estado === 'activa' ? '' : 'fila-inactiva'}">
        <td><div class="fw-semibold">${a.nombre}</div><div class="small text-muted">${a.correos_admin || 'Sin administrador'} · desde ${fecha(a.creado_en.slice(0, 10))}</div></td>
        <td>${a.estado === 'activa' ? html`<span class="badge text-bg-success">Activa</span>` : html`<span class="badge text-bg-danger">Suspendida</span>`}
          ${a.suscripcion ? html`<div class="small text-muted">${a.suscripcion.nombre} · ${a.suscripcion.estado}</div>` : ''}
          ${a.soy_miembro ? html`<span class="badge text-bg-light border ms-1">Eres miembro</span>` : ''}</td>
        <td class="text-center">${a.administradores}</td><td class="text-center">${a.coaches}</td>
        <td class="text-center">${a.deportistas}</td><td class="text-center">${a.evaluaciones}</td>
        <td class="text-center">${a.cuentas_deportista + a.cuentas_padre}</td>
        <td class="small text-nowrap">${a.ultima_actividad ? fechaHora(a.ultima_actividad) : html`<span class="text-muted">Nunca</span>`}</td>
        <td class="text-end"><div class="dropdown">
          <button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Acciones de ${a.nombre}"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item" data-accion="editar" data-id="${a.id}"><i class="bi bi-pencil me-2"></i>Cambiar nombre</button></li>
            <li><button class="dropdown-item" data-accion="acceso" data-id="${a.id}" ${a.estado === 'activa' ? '' : 'disabled'}><i class="bi bi-box-arrow-in-right me-2"></i>${a.soy_miembro ? 'Entrar a la academia' : 'Acceder a los datos'}</button></li>
            <li><button class="dropdown-item" data-accion="plan" data-id="${a.id}"><i class="bi bi-boxes me-2"></i>Plan y uso</button></li>
            <li><button class="dropdown-item" data-accion="cobro" data-id="${a.id}"><i class="bi bi-cash me-2"></i>Registrar cobro</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item ${a.estado === 'activa' ? 'text-danger' : 'text-success'}" data-accion="estado" data-id="${a.id}">
              <i class="bi bi-${a.estado === 'activa' ? 'pause-circle' : 'play-circle'} me-2"></i>${a.estado === 'activa' ? 'Suspender' : 'Reactivar'}</button></li>
          </ul></div></td>
      </tr>`) : html`<tr><td colspan="9" class="text-center text-muted py-4">Aún no hay academias.</td></tr>`}</tbody>
    </table></div></div>`);

  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton || boton.disabled) return;
    const a = academias.find((x) => x.id === Number(boton.dataset.id));
    if (boton.dataset.accion === 'nueva') nuevaAcademia();
    if (boton.dataset.accion === 'editar') editarAcademia(a);
    if (boton.dataset.accion === 'estado') cambiarEstado(a);
    if (boton.dataset.accion === 'acceso') pedirAcceso(a);
    if (boton.dataset.accion === 'plan') suscripcion(a).catch(mostrarError);
    if (boton.dataset.accion === 'cobro') cobro(a);
    if (boton.dataset.accion === 'planes') editarPlanes();
    if (boton.dataset.accion === 'demo') crearDemo(boton);
  });
}
