/**
 * Punto de entrada del frontend: sesión, estructura de la página, enrutador por hash (#/ruta),
 * tema claro/oscuro, buscador global y protecciones ante errores y cortes de conexión.
 */
import { api, consulta } from './api.js';
import {
  html, montar, avisar, cargando, errorVista, iniciales, activarInclinacion, animarNumeros,
} from './ui.js';
import { destruirGraficos } from './graficos.js';
import { ir } from './navegacion.js';
import { alternarTema, temaActual } from './tema.js';
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

const MENU = [
  { titulo: 'General' },
  { ruta: '/dashboard', icono: 'grid-1x2', texto: 'Dashboard' },
  { ruta: '/deportistas', icono: 'people', texto: 'Deportistas' },
  { ruta: '/evaluaciones', icono: 'clipboard2-pulse', texto: 'Evaluaciones' },
  { ruta: '/importar', icono: 'cloud-arrow-up', texto: 'Importar Excel' },
  { titulo: 'Inteligencia' },
  { ruta: '/ml', icono: 'cpu', texto: 'Machine Learning' },
  { ruta: '/ia', icono: 'stars', texto: 'Asistente IA' },
  { titulo: 'Seguimiento' },
  { ruta: '/alimentacion', icono: 'cup-hot', texto: 'Alimentación' },
  { ruta: '/reportes', icono: 'bar-chart-line', texto: 'Reportes' },
  { ruta: '/cuenta', icono: 'person-gear', texto: 'Mi cuenta' },
];

const RUTAS = [
  { patron: /^\/$/, vista: portada.render, publica: true },
  { patron: /^\/login$/, vista: acceso.login, publica: true },
  { patron: /^\/registro$/, vista: acceso.registro, publica: true },
  { patron: /^\/dashboard$/, vista: dashboard.render },
  { patron: /^\/deportistas$/, vista: deportistas.render },
  { patron: /^\/deportistas\/(\d+)$/, vista: perfil.render },
  { patron: /^\/deportistas\/(\d+)\/rutina$/, vista: rutina.render },
  { patron: /^\/evaluaciones$/, vista: evaluaciones.render },
  { patron: /^\/evaluaciones\/nueva$/, vista: evaluaciones.formulario },
  { patron: /^\/evaluaciones\/(\d+)\/editar$/, vista: evaluaciones.formulario },
  { patron: /^\/alimentacion$/, vista: alimentacion.render },
  { patron: /^\/importar$/, vista: importar.render },
  { patron: /^\/ml$/, vista: ml.render },
  { patron: /^\/ia$/, vista: ia.render },
  { patron: /^\/reportes$/, vista: reportes.render },
  { patron: /^\/cuenta$/, vista: cuenta.render },
];

const app = document.getElementById('app');
let usuario = null;
let limpiezaPublica = null;

// ---------------------------------------------------------------------------
// Estructura de la aplicación (menú lateral + barra superior)
// ---------------------------------------------------------------------------
const iconoTema = () => (temaActual() === 'dark' ? 'sun' : 'moon-stars');

function montarEstructura() {
  montar(app, html`
    <div class="layout">
      <aside class="menu-lateral" id="menu-lateral" aria-label="Menú principal">
        <a class="marca text-white" href="#/dashboard">
          <span class="logo-marca"><i class="bi bi-lightning-charge-fill"></i></span>
          <span>SportEval AI<small>Rendimiento deportivo</small></span>
        </a>
        <nav class="menu-enlaces">
          ${MENU.map((m) => (m.titulo ? html`<div class="menu-titulo">${m.titulo}</div>` : html`
            <a href="#${m.ruta}" data-ruta="${m.ruta}"><i class="bi bi-${m.icono}"></i><span>${m.texto}</span>
              ${m.ruta === '/dashboard' ? html`<span class="badge text-bg-danger ms-auto d-none" id="insignia-alertas"></span>` : ''}
            </a>`))}
        </nav>
        <div class="menu-pie"><i class="bi bi-shield-check me-1 text-success"></i>Tus datos están protegidos y solo tú los ves.</div>
      </aside>
      <div class="contenido">
        <header class="barra-superior">
          <button class="boton-icono boton-menu" id="boton-menu" aria-label="Abrir menú"><i class="bi bi-list"></i></button>
          <div class="buscador" id="buscador">
            <i class="bi bi-search"></i>
            <input class="form-control" type="search" placeholder="Buscar deportista por nombre o código…" autocomplete="off" aria-label="Buscar deportista">
          </div>
          <div class="ms-auto d-flex align-items-center gap-2">
            <button class="boton-icono" id="boton-tema" title="Cambiar tema" aria-label="Cambiar tema"><i class="bi bi-${iconoTema()}"></i></button>
            <div class="dropdown">
              <button class="btn d-flex align-items-center gap-2 px-1" data-bs-toggle="dropdown" aria-label="Menú de usuario">
                <span class="avatar">${iniciales(usuario.nombre)}</span>
                <span class="d-none d-md-block text-start lh-sm"><span class="d-block small fw-semibold" id="nombre-usuario">${usuario.nombre}</span>
                  <span class="d-block text-muted" style="font-size:.72rem">${usuario.correo}</span></span>
                <i class="bi bi-chevron-down small text-muted"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#/cuenta"><i class="bi bi-person-gear me-2"></i>Mi cuenta</a></li>
                <li><a class="dropdown-item" href="#/reportes"><i class="bi bi-download me-2"></i>Reportes</a></li>
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
    usuario = null;
    ir('/login');
  });
  activarBuscador(document.getElementById('buscador'));
}

function cambiarTema() {
  alternarTema();
  const boton = document.querySelector('#boton-tema i');
  if (boton) boton.className = `bi bi-${iconoTema()}`;
  navegar(); // vuelve a dibujar la vista para que los gráficos tomen los nuevos colores
}

// ---------------------------------------------------------------------------
// Buscador global de deportistas
// ---------------------------------------------------------------------------
function activarBuscador(contenedor) {
  const entrada = contenedor.querySelector('input');
  let resultados = null;
  let temporizador = null;
  let ultimaBusqueda = 0;
  let seleccion = -1;

  const cerrar = () => {
    resultados?.remove();
    resultados = null;
    seleccion = -1;
  };

  async function buscar(texto) {
    const turno = ++ultimaBusqueda;
    try {
      const { datos } = await api.get(`/deportistas${consulta({ q: texto })}`);
      if (turno !== ultimaBusqueda || document.activeElement !== entrada) return;
      cerrar();
      resultados = document.createElement('div');
      resultados.className = 'buscador-resultados';
      resultados.setAttribute('role', 'listbox');
      montar(resultados, datos.length ? html`${datos.slice(0, 8).map((d) => html`
        <a href="#/deportistas/${d.id}" role="option"><span><b>${d.nombre}</b> <span class="text-muted small">${d.codigo}</span></span>
          <span class="small text-muted">${d.disciplina || ''}</span></a>`)}`
        : html`<div class="p-3 small text-muted">Sin resultados para “${texto}”.</div>`);
      contenedor.append(resultados);
    } catch {
      cerrar();
    }
  }

  entrada.addEventListener('input', () => {
    clearTimeout(temporizador);
    const texto = entrada.value.trim();
    if (texto.length < 2) return cerrar();
    temporizador = setTimeout(() => buscar(texto), 250);
    return undefined;
  });
  entrada.addEventListener('keydown', (e) => {
    const enlaces = resultados ? [...resultados.querySelectorAll('a')] : [];
    if (e.key === 'Escape') { cerrar(); entrada.blur(); }
    if (!enlaces.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      seleccion = (seleccion + (e.key === 'ArrowDown' ? 1 : -1) + enlaces.length) % enlaces.length;
      enlaces.forEach((a, i) => a.classList.toggle('activo', i === seleccion));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      enlaces[Math.max(0, seleccion)].click();
    }
  });
  contenedor.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      entrada.value = '';
      cerrar();
    }
  });
  entrada.addEventListener('blur', () => setTimeout(cerrar, 180));
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
  if (destino.publica && usuario && ruta !== '/') return ir('/dashboard');

  destruirGraficos();
  limpiezaPublica?.();
  limpiezaPublica = null;
  document.querySelectorAll('.modal.show').forEach((m) => window.bootstrap?.Modal.getInstance(m)?.hide());
  const params = ruta.match(destino.patron).slice(1).map(Number);

  if (destino.publica) {
    document.title = 'SportEval AI · Evaluación del rendimiento deportivo';
    limpiezaPublica = await destino.vista(app, {
      usuario,
      alEntrar: (u) => { usuario = u; ir('/dashboard'); },
    }) || null;
    return undefined;
  }

  if (!document.getElementById('vista')) montarEstructura();
  const seccion = `/${ruta.split('/')[1]}`;
  document.querySelectorAll('.menu-enlaces a').forEach((a) => {
    const activo = a.dataset.ruta === seccion;
    a.classList.toggle('activo', activo);
    if (activo) document.title = `${a.textContent.trim()} · SportEval AI`;
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
    montar(vista, errorVista(error));
    vista.querySelector('[data-reintentar]')?.addEventListener('click', navegar);
  }
  return undefined;
}

function mostrarNoEncontrado() {
  if (!usuario) return ir('/');
  if (!document.getElementById('vista')) montarEstructura();
  const vista = document.getElementById('vista');
  montar(vista, errorVista({ status: 404, message: 'La página que buscas no existe o fue movida' }));
  vista.querySelector('[data-reintentar]')?.addEventListener('click', () => ir('/dashboard'));
  return undefined;
}

// ---------------------------------------------------------------------------
// Protecciones globales
// ---------------------------------------------------------------------------
window.addEventListener('sesion-expirada', () => {
  if (!usuario) return;
  usuario = null;
  avisar('Tu sesión expiró. Vuelve a iniciar sesión para continuar.', 'warning');
  ir('/login');
});

window.addEventListener('usuario-actualizado', (e) => {
  usuario = { ...usuario, ...e.detail };
  const nombre = document.getElementById('nombre-usuario');
  if (nombre) nombre.textContent = usuario.nombre;
  const avatar = document.querySelector('.barra-superior .avatar');
  if (avatar) avatar.textContent = iniciales(usuario.nombre);
});

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
  usuario = await api.get('/auth/sesion').catch(() => null);
  navegar();
}());
