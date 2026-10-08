/**
 * Punto de entrada del frontend: sesión, estructura de la página, enrutador por hash (#/ruta),
 * menús por rol/permisos/módulos, marca de la academia, tema claro/oscuro y protecciones
 * ante errores y cortes de conexión.
 */
import { api } from './api.js';
import {
  html, montar, avisar, cargando, errorVista, iniciales, activarInclinacion, animarNumeros, mostrarError,
} from './ui.js';
import { destruirGraficos } from './graficos.js';
import { ir } from './navegacion.js';
import { alternarTema, temaActual } from './tema.js';
import { activarBuscador } from './buscador.js';
import {
  fijarUsuario, esAdmin, esSuperAdmin, puede, moduloActivo, rutaInicio, academiaActual, NOMBRE_ROL,
  coachElegido, elegirCoach, fijarCoaches, listaCoaches,
} from './sesion.js';
import * as portada from './views/portada.js';
import * as acceso from './views/acceso.js';
import * as dashboard from './views/dashboard.js';
import * as deportistas from './views/deportistas.js';
import * as perfil from './views/perfil.js';
import * as rutina from './views/rutina.js';
import * as evaluaciones from './views/evaluaciones.js';
import * as alimentacion from './views/alimentacion.js';
import * as importar from './views/importar.js';
import * as ml from './views/ml.js';
import * as ia from './views/ia.js';
import * as reportes from './views/reportes.js';
import * as cuenta from './views/cuenta.js';
import * as admin from './views/admin.js';
import * as academia from './views/academia.js';
import * as permisos from './views/permisos.js';
import * as auditoria from './views/auditoria.js';
import * as plataforma from './views/plataforma.js';
import * as portal from './views/portal.js';
import * as estructura from './views/estructura.js';
import * as metodologia from './views/metodologia.js';
import * as medicion from './views/medicion.js';
import * as rendimiento from './views/rendimiento.js';
import * as entrenamiento from './views/entrenamiento.js';
import * as inteligencia from './views/inteligencia.js';
import * as videos from './views/videos.js';
import * as nutricion from './views/nutricion.js';
import * as comercial from './views/comercial.js';
import * as integraciones from './views/integraciones.js';
import * as indicadores from './views/indicadores.js';

/**
 * Cada opción declara qué necesita para verse: un permiso, un módulo activo o ser super admin.
 * Los títulos de sección solo aparecen si alguna de sus opciones es visible.
 */
const MENU = [
  { titulo: 'Operación' },
  { ruta: '/dashboard', icono: 'grid-1x2', texto: 'Dashboard', permiso: 'dashboard.ver' },
  { ruta: '/deportistas', icono: 'people', texto: 'Deportistas', permiso: 'deportistas.ver' },
  { ruta: '/medicion', icono: 'stopwatch', texto: 'Modo Medición', permiso: 'resultados.ver' },
  { ruta: '/entrenamientos', icono: 'calendar-week', texto: 'Entrenamientos', permiso: 'entrenamientos.ver' },
  { ruta: '/asistencia', icono: 'person-check', texto: 'Asistencia', permiso: 'asistencia.ver' },
  { ruta: '/recuperacion', icono: 'heart-pulse', texto: 'Recuperación', permiso: 'recuperacion.ver' },
  { ruta: '/objetivos', icono: 'bullseye', texto: 'Objetivos', permiso: 'objetivos.ver' },
  { ruta: '/lesiones', icono: 'bandaid', texto: 'Lesiones', permiso: 'lesiones.ver' },
  { ruta: '/evaluaciones', icono: 'clipboard2-pulse', texto: 'Evaluación por observación', permiso: 'evaluaciones.ver' },
  { ruta: '/importar', icono: 'cloud-arrow-up', texto: 'Importar Excel', permiso: 'importacion.usar' },
  { titulo: 'Mi progreso' },
  { ruta: '/portal', icono: 'graph-up-arrow', texto: 'Mi progreso', permiso: 'portal.ver' },
  { titulo: 'Rendimiento e inteligencia' },
  { ruta: '/rendimiento', icono: 'graph-up-arrow', texto: 'Rendimiento', permiso: 'rendimiento.ver' },
  { ruta: '/indicadores', icono: 'clipboard-data', texto: 'Indicadores', permiso: 'indicadores.ver' },
  { ruta: '/alertas', icono: 'bell', texto: 'Alertas', permiso: 'alertas.ver' },
  { ruta: '/analisis', icono: 'stars', texto: 'Análisis IA', permiso: 'ia.analizar', modulo: 'ia_analisis' },
  { ruta: '/videos', icono: 'camera-video', texto: 'Videos', permiso: 'videos.ver', modulo: 'video' },
  { ruta: '/ia', icono: 'chat-dots', texto: 'Asistente IA', permiso: 'ia.usar', modulo: 'ia' },
  { ruta: '/ml', icono: 'cpu', texto: 'Machine Learning', permiso: 'ml.usar', modulo: 'ml' },
  { titulo: 'Seguimiento' },
  { ruta: '/nutricion', icono: 'egg-fried', texto: 'Nutrición', permiso: 'alimentacion.ver', modulo: 'nutricion' },
  { ruta: '/alimentacion', icono: 'cup-hot', texto: 'Alimentación diaria', permiso: 'alimentacion.ver', modulo: 'nutricion' },
  { ruta: '/comercial', icono: 'cash-stack', texto: 'Matrículas y pagos', permiso: 'comercial.ver', modulo: 'comercial' },
  { ruta: '/comunicados', icono: 'megaphone', texto: 'Comunicados', permiso: 'comunicados.ver' },
  { ruta: '/reportes', icono: 'bar-chart-line', texto: 'Reportes', permiso: 'reportes.ver' },
  { titulo: 'Mi academia' },
  { ruta: '/estructura', icono: 'diagram-3', texto: 'Estructura deportiva', permiso: 'estructura.ver' },
  { ruta: '/metodologia', icono: 'sliders', texto: 'Metodología', permiso: 'metodologia.ver' },
  { ruta: '/admin', icono: 'person-badge', texto: 'Usuarios', permiso: 'usuarios.gestionar' },
  { ruta: '/academia', icono: 'building-gear', texto: 'Configuración', permiso: 'academia.configurar' },
  { ruta: '/permisos', icono: 'shield-check', texto: 'Permisos', permiso: 'permisos.configurar' },
  { ruta: '/integraciones', icono: 'plug', texto: 'Integraciones', permiso: 'integraciones.gestionar', modulo: 'integraciones' },
  { ruta: '/auditoria', icono: 'journal-text', texto: 'Auditoría', permiso: 'auditoria.ver' },
  { titulo: 'Plataforma' },
  { ruta: '/plataforma', icono: 'buildings', texto: 'Academias', superAdmin: true },
  { titulo: 'Cuenta' },
  { ruta: '/encuestas', icono: 'ui-checks', texto: 'Evalúa la plataforma', academia: true },
  { ruta: '/cuenta', icono: 'person-gear', texto: 'Mi cuenta' },
];

const RUTAS = [
  { patron: /^\/$/, vista: portada.render, publica: true },
  { patron: /^\/login$/, vista: acceso.login, publica: true },
  { patron: /^\/dashboard$/, vista: dashboard.render, permiso: 'dashboard.ver' },
  { patron: /^\/deportistas$/, vista: deportistas.render, permiso: 'deportistas.ver' },
  { patron: /^\/deportistas\/(\d+)$/, vista: perfil.render, permiso: 'deportistas.ver' },
  { patron: /^\/deportistas\/(\d+)\/rutina$/, vista: rutina.render, permiso: 'deportistas.ver' },
  { patron: /^\/evaluaciones$/, vista: evaluaciones.render, permiso: 'evaluaciones.ver' },
  { patron: /^\/evaluaciones\/nueva$/, vista: evaluaciones.formulario, permiso: 'evaluaciones.gestionar' },
  { patron: /^\/evaluaciones\/(\d+)\/editar$/, vista: evaluaciones.formulario, permiso: 'evaluaciones.gestionar' },
  { patron: /^\/alimentacion$/, vista: alimentacion.render, permiso: 'alimentacion.ver', modulo: 'nutricion' },
  { patron: /^\/importar$/, vista: importar.render, permiso: 'importacion.usar' },
  { patron: /^\/ml$/, vista: ml.render, permiso: 'ml.usar', modulo: 'ml' },
  { patron: /^\/ia$/, vista: ia.render, permiso: 'ia.usar', modulo: 'ia' },
  { patron: /^\/reportes$/, vista: reportes.render, permiso: 'reportes.ver' },
  { patron: /^\/portal$/, vista: portal.render, permiso: 'portal.ver' },
  { patron: /^\/portal\/(\d+)$/, vista: portal.detalle, permiso: 'portal.ver' },
  { patron: /^\/admin$/, vista: admin.render, permiso: 'usuarios.gestionar' },
  { patron: /^\/academia$/, vista: academia.render, permiso: 'academia.configurar' },
  { patron: /^\/permisos$/, vista: permisos.render, permiso: 'permisos.configurar' },
  { patron: /^\/auditoria$/, vista: auditoria.render, permiso: 'auditoria.ver' },
  { patron: /^\/plataforma$/, vista: plataforma.render, superAdmin: true },
  { patron: /^\/cuenta$/, vista: cuenta.render },
  { patron: /^\/estructura$/, vista: estructura.render, permiso: 'estructura.ver' },
  { patron: /^\/metodologia$/, vista: metodologia.render, permiso: 'metodologia.ver' },
  { patron: /^\/medicion$/, vista: medicion.render, permiso: 'resultados.ver' },
  { patron: /^\/medicion\/cronometro$/, vista: medicion.cronometro, permiso: 'medicion.usar' },
  { patron: /^\/medicion\/(\d+)$/, vista: medicion.sesion, permiso: 'resultados.ver' },
  { patron: /^\/rendimiento$/, vista: rendimiento.render, permiso: 'rendimiento.ver' },
  { patron: /^\/entrenamientos$/, vista: entrenamiento.render, permiso: 'entrenamientos.ver' },
  { patron: /^\/entrenamientos\/(\d+)$/, vista: entrenamiento.detalle, permiso: 'entrenamientos.ver' },
  { patron: /^\/asistencia$/, vista: entrenamiento.asistenciaVista, permiso: 'asistencia.ver' },
  { patron: /^\/recuperacion$/, vista: entrenamiento.recuperacionVista, permiso: 'recuperacion.ver' },
  { patron: /^\/objetivos$/, vista: entrenamiento.objetivosVista, permiso: 'objetivos.ver' },
  { patron: /^\/alertas$/, vista: inteligencia.alertas, permiso: 'alertas.ver' },
  { patron: /^\/analisis$/, vista: inteligencia.analisis, permiso: 'ia.analizar', modulo: 'ia_analisis' },
  { patron: /^\/videos$/, vista: videos.render, permiso: 'videos.ver', modulo: 'video' },
  { patron: /^\/videos\/comparar$/, vista: videos.comparar, permiso: 'videos.ver', modulo: 'video' },
  { patron: /^\/nutricion$/, vista: nutricion.render, permiso: 'alimentacion.ver', modulo: 'nutricion' },
  { patron: /^\/comercial$/, vista: comercial.render, permiso: 'comercial.ver', modulo: 'comercial' },
  { patron: /^\/comunicados$/, vista: comercial.comunicados, permiso: 'comunicados.ver' },
  { patron: /^\/integraciones$/, vista: integraciones.render, permiso: 'integraciones.gestionar', modulo: 'integraciones' },
  { patron: /^\/indicadores$/, vista: indicadores.render, permiso: 'indicadores.ver' },
  { patron: /^\/lesiones$/, vista: indicadores.lesionesVista, permiso: 'lesiones.ver' },
  { patron: /^\/encuestas$/, vista: indicadores.encuestasVista, academia: true },
];

// Las capturas guardadas sin conexión en el Modo Medición se envían al abrir la app
window.addEventListener('load', () => { if (navigator.onLine) medicion.sincronizar({ silencioso: true }).catch(() => {}); });

const permitido = (item) => (!item.permiso || puede(item.permiso))
  && (!item.modulo || moduloActivo(item.modulo))
  && (!item.superAdmin || esSuperAdmin())
  && (!item.academia || Boolean(academiaActual()));

const app = document.getElementById('app');
let usuario = null;
let limpiezaPublica = null;

// ---------------------------------------------------------------------------
// Marca de la academia (nombre, logo y color)
// ---------------------------------------------------------------------------
const VARIABLES_MARCA = ['--primario', '--bs-primary', '--bs-primary-rgb', '--bs-link-color', '--bs-link-color-rgb'];

function aplicarMarca() {
  const raiz = document.documentElement.style;
  const color = academiaActual()?.config?.color_primario;
  VARIABLES_MARCA.forEach((v) => raiz.removeProperty(v));
  if (!color || !/^#[0-9a-f]{6}$/i.test(color) || color.toLowerCase() === '#3f6bff') return;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).join(', ');
  raiz.setProperty('--primario', color);
  raiz.setProperty('--bs-primary', color);
  raiz.setProperty('--bs-primary-rgb', rgb);
  raiz.setProperty('--bs-link-color', color);
  raiz.setProperty('--bs-link-color-rgb', rgb);
}

const logoAcademia = () => (academiaActual()?.config?.tiene_logo
  ? html`<img class="logo-academia" src="/api/academia/logo?v=${encodeURIComponent(academiaActual().config.color_primario || '')}${academiaActual().id}" alt="">`
  : html`<span class="logo-marca"><i class="bi bi-lightning-charge-fill"></i></span>`);

// ---------------------------------------------------------------------------
// Estructura de la aplicación (menú lateral + barra superior)
// ---------------------------------------------------------------------------
const iconoTema = () => (temaActual() === 'dark' ? 'sun' : 'moon-stars');

function menuVisible() {
  const visibles = [];
  MENU.forEach((item, i) => {
    if (item.titulo) {
      const siguientes = [];
      for (let j = i + 1; j < MENU.length && !MENU[j].titulo; j += 1) siguientes.push(MENU[j]);
      if (siguientes.some(permitido)) visibles.push(item);
    } else if (permitido(item)) visibles.push(item);
  });
  return visibles;
}

function montarEstructura() {
  const aca = academiaActual();
  const otras = (usuario.academias || []).filter((a) => a.id !== aca?.id && a.estado === 'activa');
  const nombreMarca = aca ? (aca.config?.nombre_comercial || aca.nombre) : 'SportEval AI';
  aplicarMarca();

  montar(app, html`
    <div class="layout">
      <aside class="menu-lateral" id="menu-lateral" aria-label="Menú principal">
        <a class="marca text-white" href="#${rutaInicio()}">
          ${logoAcademia()}
          <span>${nombreMarca}<small>${aca ? 'con SportEval AI' : 'Plataforma'}</small></span>
        </a>
        <nav class="menu-enlaces">
          ${menuVisible().map((m) => (m.titulo ? html`<div class="menu-titulo">${m.titulo}</div>` : html`
            <a href="#${m.ruta}" data-ruta="${m.ruta}"><i class="bi bi-${m.icono}"></i><span>${m.texto}</span>
              ${m.ruta === '/dashboard' ? html`<span class="badge text-bg-danger ms-auto d-none" id="insignia-alertas"></span>` : ''}
            </a>`))}
        </nav>
        <div class="menu-pie">${esAdmin()
    ? html`<i class="bi bi-shield-lock me-1 text-warning"></i>Administrador: ves y gestionas toda la academia.`
    : html`<i class="bi bi-shield-check me-1 text-success"></i>Tus datos están aislados en tu academia y protegidos.`}</div>
      </aside>
      <div class="contenido">
        <header class="barra-superior">
          <button class="boton-icono boton-menu" id="boton-menu" aria-label="Abrir menú"><i class="bi bi-list"></i></button>
          ${puede('deportistas.ver') ? html`<div class="buscador" id="buscador">
            <i class="bi bi-search"></i>
            <input class="form-control" type="search" placeholder="Buscar deportista por nombre o código…" autocomplete="off" aria-label="Buscar deportista">
          </div>` : html`<div class="flex-grow-1 fw-semibold text-truncate d-none d-sm-block">${nombreMarca}</div>`}
          <div class="ms-auto d-flex align-items-center gap-2">
            ${esAdmin() ? html`<label class="selector-coach" title="Coach cuyos datos estás viendo">
              <i class="bi bi-person-badge"></i>
              <select class="form-select form-select-sm" id="selector-coach" aria-label="Coach cuyos datos estás viendo">
                <option value="">Toda la academia</option>
              </select></label>` : ''}
            ${aca ? html`<div class="dropdown">
              <button class="boton-icono position-relative" id="boton-notificaciones" data-bs-toggle="dropdown" data-bs-auto-close="outside" title="Notificaciones" aria-label="Notificaciones">
                <i class="bi bi-bell"></i><span class="badge rounded-pill text-bg-danger position-absolute top-0 start-100 translate-middle d-none" id="insignia-notificaciones"></span></button>
              <div class="dropdown-menu dropdown-menu-end p-0 panel-notificaciones" id="panel-notificaciones"><div class="p-3 small text-muted">Cargando…</div></div>
            </div>` : ''}
            <button class="boton-icono" id="boton-tema" title="Cambiar tema" aria-label="Cambiar tema"><i class="bi bi-${iconoTema()}"></i></button>
            <div class="dropdown">
              <button class="btn d-flex align-items-center gap-2 px-1" data-bs-toggle="dropdown" aria-label="Menú de usuario">
                <span class="avatar">${iniciales(usuario.nombre)}</span>
                <span class="d-none d-md-block text-start lh-sm"><span class="d-block small fw-semibold" id="nombre-usuario">${usuario.nombre}</span>
                  <span class="d-block text-muted" style="font-size:.72rem">${aca ? aca.nombre : 'Plataforma'}
                    <span class="badge ${esAdmin() ? 'text-bg-warning' : 'text-bg-primary'} ms-1">${usuario.rol ? NOMBRE_ROL[usuario.rol] : 'Super admin'}</span></span></span>
                <i class="bi bi-chevron-down small text-muted"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#/cuenta"><i class="bi bi-person-gear me-2"></i>Mi cuenta</a></li>
                ${esSuperAdmin() ? html`<li><a class="dropdown-item" href="#/plataforma"><i class="bi bi-buildings me-2"></i>Plataforma</a></li>` : ''}
                ${otras.length ? html`<li><hr class="dropdown-divider"></li><li><h6 class="dropdown-header">Cambiar de academia</h6></li>
                  ${otras.map((a) => html`<li><button class="dropdown-item" data-academia="${a.id}"><i class="bi bi-building me-2"></i>${a.nombre}
                    <span class="text-muted small">· ${NOMBRE_ROL[a.rol]}</span></button></li>`)}` : ''}
                <li><hr class="dropdown-divider"></li>
                <li><button class="dropdown-item text-danger" id="boton-salir"><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li>
              </ul>
            </div>
          </div>
        </header>
        <main class="container-fluid p-3 p-md-4" id="vista" tabindex="-1"></main>
      </div>
    </div>`);

  const menu = document.getElementById('menu-lateral');
  document.getElementById('boton-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('abierto');
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) menu.classList.remove('abierto');
  });
  document.getElementById('boton-tema').addEventListener('click', cambiarTema);
  document.getElementById('boton-salir').addEventListener('click', async () => {
    await api.post('/auth/logout').catch(() => {});
    cambiarUsuario(null);
    ir('/login');
  });
  app.querySelectorAll('[data-academia]').forEach((b) => b.addEventListener('click', () => cambiarAcademia(Number(b.dataset.academia))));
  const buscador = document.getElementById('buscador');
  if (buscador) activarBuscador(buscador);
  if (esAdmin()) activarSelectorCoach();
  if (aca) activarNotificaciones();
}

// ---------------------------------------------------------------------------
// Notificaciones (alertas que le llegan a este usuario)
// ---------------------------------------------------------------------------
let temporizadorNotificaciones = null;
async function cargarNotificaciones() {
  const insignia = document.getElementById('insignia-notificaciones');
  const panel = document.getElementById('panel-notificaciones');
  if (!insignia || !panel) return;
  const n = await api.get('/notificaciones');
  insignia.textContent = n.sin_leer > 99 ? '99+' : n.sin_leer;
  insignia.classList.toggle('d-none', !n.sin_leer);
  montar(panel, html`<div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
      <span class="fw-semibold small">Notificaciones</span>${n.sin_leer ? html`<button class="btn btn-link btn-sm p-0" data-leer-todas>Marcar como leídas</button>` : ''}</div>
    <div style="max-height:60vh;overflow:auto">${n.lista.length ? n.lista.map((x) => html`<a class="dropdown-item small py-2 ${x.leida ? 'text-muted' : 'fw-semibold'}" style="white-space:normal" href="${x.enlace || '#/alertas'}">
      ${x.titulo}<div class="fw-normal text-muted">${x.cuerpo || ''}</div></a>`) : html`<div class="p-3 small text-muted">Sin notificaciones.</div>`}</div>`);
  panel.querySelector('[data-leer-todas]')?.addEventListener('click', async () => {
    await api.post('/notificaciones/leidas', {}).catch(() => {});
    cargarNotificaciones().catch(() => {});
  });
}
function activarNotificaciones() {
  cargarNotificaciones().catch(() => {});
  clearInterval(temporizadorNotificaciones);
  temporizadorNotificaciones = setInterval(() => {
    if (document.visibilityState === 'visible' && document.getElementById('insignia-notificaciones')) cargarNotificaciones().catch(() => {});
  }, 60000);
}

function cambiarUsuario(nuevo) {
  usuario = nuevo;
  fijarUsuario(nuevo);
}

/** Cuando cambia la cuenta, la academia o su configuración se vuelve a dibujar todo. */
function desmontarEstructura() {
  if (document.getElementById('vista')) app.replaceChildren();
}

async function refrescarSesion() {
  const nueva = await api.get('/auth/sesion');
  cambiarUsuario(nueva);
  desmontarEstructura();
  if (!nueva) return ir('/login');
  return navegar();
}

async function cambiarAcademia(id) {
  try {
    const nueva = await api.post('/auth/academia', { academia_id: id });
    cambiarUsuario(nueva);
    desmontarEstructura();
    avisar(`Ahora trabajas en ${nueva.academia.nombre}.`, 'info');
    ir(rutaInicio());
    navegar();
  } catch (error) {
    mostrarError(error);
  }
}

// ---------------------------------------------------------------------------
// Selector de coach (solo administrador)
// ---------------------------------------------------------------------------
async function cargarCoaches() {
  fijarCoaches(await api.get('/admin/usuarios'));
  const selector = document.getElementById('selector-coach');
  if (!selector) return;
  montar(selector, html`<option value="">Toda la academia</option>
    ${listaCoaches().map((c) => html`<option value="${c.id}" ${c.id === coachElegido() ? 'selected' : ''}>${c.nombre}${c.rol === 'admin' ? ' (admin)' : ''}</option>`)}`);
  selector.closest('.selector-coach').classList.toggle('filtrando', Boolean(coachElegido()));
}

function activarSelectorCoach() {
  const selector = document.getElementById('selector-coach');
  selector.addEventListener('change', () => {
    elegirCoach(selector.value);
    selector.closest('.selector-coach').classList.toggle('filtrando', Boolean(coachElegido()));
    avisar(coachElegido() ? `Viendo los datos de ${selector.selectedOptions[0].textContent}.` : 'Viendo los datos de toda la academia.', 'info');
    navegar();
  });
  cargarCoaches().catch(() => avisar('No se pudo cargar la lista de coaches.', 'warning'));
}

function cambiarTema() {
  alternarTema();
  const boton = document.querySelector('#boton-tema i');
  if (boton) boton.className = `bi bi-${iconoTema()}`;
  navegar(); // vuelve a dibujar la vista para que los gráficos tomen los nuevos colores
}

// ---------------------------------------------------------------------------
// Enrutador
// ---------------------------------------------------------------------------
function leerHash() {
  const [ruta, query = ''] = (window.location.hash.slice(1) || '/').split('?');
  return { ruta: ruta || '/', query: new URLSearchParams(query) };
}

let turnoNavegacion = 0;

async function navegar() {
  const turno = ++turnoNavegacion;
  const { ruta, query } = leerHash();
  const destino = RUTAS.find((r) => r.patron.test(ruta));
  if (!destino) return mostrarNoEncontrado();
  if (!destino.publica && !usuario) return ir('/login');
  if (destino.publica && usuario && ruta !== '/') return ir(rutaInicio());
  // Pantalla no permitida para este rol, permiso o módulo: se lleva a su inicio
  if (!destino.publica && !permitido(destino)) return ir(rutaInicio() === ruta ? '/cuenta' : rutaInicio());
  // Cuenta creada o restablecida por el administrador: primero debe poner su propia contraseña
  if (usuario?.debe_cambiar_clave && !destino.publica && ruta !== '/cuenta') return ir('/cuenta');

  destruirGraficos();
  limpiezaPublica?.();
  limpiezaPublica = null;
  document.querySelectorAll('.modal.show').forEach((m) => window.bootstrap?.Modal.getInstance(m)?.hide());
  const params = ruta.match(destino.patron).slice(1).map(Number);

  if (destino.publica) {
    VARIABLES_MARCA.forEach((v) => document.documentElement.style.removeProperty(v));
    document.title = 'SportEval AI · Evaluación del rendimiento deportivo';
    limpiezaPublica = await destino.vista(app, {
      usuario,
      inicio: rutaInicio,
      alEntrar: (u) => { cambiarUsuario(u); desmontarEstructura(); ir(u.debe_cambiar_clave ? '/cuenta' : rutaInicio()); },
    }) || null;
    return undefined;
  }

  if (!document.getElementById('vista')) montarEstructura();
  const seccion = `/${ruta.split('/')[1]}`;
  document.querySelectorAll('.menu-enlaces a').forEach((a) => {
    const activo = a.dataset.ruta === seccion;
    a.classList.toggle('activo', activo);
    if (activo) document.title = `${a.textContent.trim()} · ${academiaActual()?.nombre || 'SportEval AI'}`;
  });

  // Cada visita dibuja en un contenedor nuevo: si el usuario cambia de pantalla antes de que
  // termine de cargar, la respuesta antigua se descarta y no pisa a la nueva.
  const principal = document.getElementById('vista');
  const vista = document.createElement('div');
  vista.className = 'entrada';
  principal.replaceChildren(vista);
  montar(vista, cargando());
  window.scrollTo({ top: 0 });

  try {
    await destino.vista(vista, { params, query, usuario });
    if (turno !== turnoNavegacion) return undefined;
    activarInclinacion(vista);
    animarNumeros(vista);
  } catch (error) {
    if (error.status === 401 || turno !== turnoNavegacion) return undefined;
    // Permisos o módulos cambiados por el administrador mientras se usaba la app: se actualiza la sesión
    if (error.status === 403) refrescarSesionSilenciosa();
    montar(vista, errorVista(error));
    vista.querySelector('[data-reintentar]')?.addEventListener('click', navegar);
  }
  return undefined;
}

let refrescando = false;
async function refrescarSesionSilenciosa() {
  if (refrescando) return;
  refrescando = true;
  try {
    const nueva = await api.get('/auth/sesion');
    if (JSON.stringify(nueva?.permisos) !== JSON.stringify(usuario?.permisos)
      || JSON.stringify(nueva?.academia) !== JSON.stringify(usuario?.academia)) {
      cambiarUsuario(nueva);
      desmontarEstructura();
      navegar();
    }
  } catch {
    // sin conexión: se mantiene la sesión actual
  } finally {
    refrescando = false;
  }
}

function mostrarNoEncontrado() {
  if (!usuario) return ir('/');
  if (!document.getElementById('vista')) montarEstructura();
  const vista = document.getElementById('vista');
  montar(vista, errorVista({ status: 404, message: 'La página que buscas no existe o fue movida' }));
  vista.querySelector('[data-reintentar]')?.addEventListener('click', () => ir(rutaInicio()));
  return undefined;
}

// ---------------------------------------------------------------------------
// Protecciones globales
// ---------------------------------------------------------------------------
window.addEventListener('sesion-expirada', () => {
  if (!usuario) return;
  cambiarUsuario(null);
  avisar('Tu sesión expiró. Vuelve a iniciar sesión para continuar.', 'warning');
  ir('/login');
});

window.addEventListener('usuario-actualizado', (e) => {
  cambiarUsuario({ ...usuario, ...e.detail });
  const nombre = document.getElementById('nombre-usuario');
  if (nombre) nombre.textContent = usuario.nombre;
  const avatar = document.querySelector('.barra-superior .avatar');
  if (avatar) avatar.textContent = iniciales(usuario.nombre);
});

// La configuración de la academia (marca, módulos, permisos) cambió: se relee la sesión y se redibuja
window.addEventListener('sesion-cambiada', () => { refrescarSesion().catch(mostrarError); });

// Cualquier error inesperado del navegador se informa sin romper la aplicación
let ultimoAvisoError = 0;
function errorInesperado(detalle) {
  console.error(detalle);
  if (Date.now() - ultimoAvisoError < 5000) return;
  ultimoAvisoError = Date.now();
  avisar('Algo no salió como esperábamos. Si el problema continúa, recarga la página.', 'warning');
}
window.addEventListener('error', (e) => {
  if (/ResizeObserver loop/.test(e.message || '')) return;
  errorInesperado(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => errorInesperado(e.reason));

// Aviso de conexión perdida / recuperada
const avisoConexion = document.getElementById('aviso-conexion');
window.addEventListener('offline', () => avisoConexion?.classList.add('visible'));
window.addEventListener('online', () => {
  avisoConexion?.classList.remove('visible');
  avisar('Conexión recuperada.', 'success');
});
if (navigator.onLine === false) avisoConexion?.classList.add('visible');

window.addEventListener('hashchange', navegar);
window.addEventListener('recargar-vista', navegar);
// El panel de usuarios avisa cuando crea, edita o elimina cuentas
window.addEventListener('coaches-cambiaron', () => { if (esAdmin()) cargarCoaches().catch(() => {}); });
document.addEventListener('click', (e) => {
  const menu = document.getElementById('menu-lateral');
  if (menu && !menu.contains(e.target) && !e.target.closest('#boton-menu')) menu.classList.remove('abierto');
  // Filas de tabla navegables: <tr data-ir="/ruta"> (salvo clics en botones o enlaces)
  const fila = e.target.closest('[data-ir]');
  if (fila && !e.target.closest('a, button, input, select, label')) ir(fila.dataset.ir);
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cambiar-tema]')) cambiarTema();
});

(async function iniciar() {
  if (!window.bootstrap) {
    montar(app, html`<div class="pantalla-carga text-center p-4"><div><h1 class="h4">No se pudieron cargar los archivos de la aplicación</h1>
      <p class="text-muted">Revisa tu conexión y recarga la página.</p><a class="btn btn-primary" href="/">Recargar</a></div></div>`);
    return;
  }
  cambiarUsuario(await api.get('/auth/sesion').catch(() => null));
  navegar();
}());
