/**
 * Utilidades de interfaz: plantillas HTML seguras, formatos, avisos, modales,
 * estados de carga, paginación y efectos 3D.
 */

// ---------------------------------------------------------------------------
// Plantillas: html`...` escapa todo valor interpolado (protección contra XSS)
// ---------------------------------------------------------------------------
class Html {
  constructor(texto) {
    this.texto = texto;
  }

  toString() {
    return this.texto;
  }
}

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) => ENTIDADES[c]);

function convertir(valor) {
  if (valor === null || valor === undefined || valor === false) return '';
  if (valor instanceof Html) return valor.texto;
  if (Array.isArray(valor)) return valor.map(convertir).join('');
  return escapar(valor);
}

export function html(partes, ...valores) {
  return new Html(partes.reduce((acc, parte, i) => acc + parte + (i < valores.length ? convertir(valores[i]) : ''), ''));
}

export function montar(elemento, contenido) {
  elemento.innerHTML = String(contenido);
}

export const prefiereMenosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------
export function fecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const numero = (valor) => (valor === null || valor === undefined || valor === '' ? '—' : valor);

const COLOR_NIVEL = { Alto: 'success', Medio: 'warning', Bajo: 'danger' };
export const colorNivel = (nivel) => COLOR_NIVEL[nivel] || 'secondary';

export function nivelDe(puntuacion) {
  if (puntuacion === null || puntuacion === undefined) return null;
  if (puntuacion >= 75) return 'Alto';
  return puntuacion >= 50 ? 'Medio' : 'Bajo';
}

export const insigniaNivel = (nivel) =>
  html`<span class="badge text-bg-${colorNivel(nivel)}">${nivel || 'Sin dato'}</span>`;

export const insigniaPuntaje = (valor) =>
  (valor === null || valor === undefined
    ? html`<span class="text-muted">—</span>`
    : html`<span class="badge text-bg-${colorNivel(nivelDe(valor))}">${valor}</span>`);

export const iniciales = (nombre = '') =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// ---------------------------------------------------------------------------
// Bloques reutilizables
// ---------------------------------------------------------------------------
/** Pantalla de carga con la forma aproximada del contenido (evita saltos visuales). */
export const cargando = () => html`
  <div aria-busy="true" aria-label="Cargando">
    <div class="esqueleto mb-4" style="height:44px;width:280px"></div>
    <div class="row g-3 mb-4">${[1, 2, 3, 4].map(() => html`<div class="col-6 col-xl-3"><div class="esqueleto" style="height:104px"></div></div>`)}</div>
    <div class="esqueleto mb-3" style="height:280px"></div>
    <div class="esqueleto" style="height:180px"></div>
  </div>`;

export const vacio = (mensaje, icono = 'inbox') =>
  html`<div class="estado-vacio"><div class="icono"><i class="bi bi-${icono}"></i></div>${mensaje}</div>`;

export const encabezado = (icono, titulo, subtitulo = '', acciones = '') => html`
  <div class="encabezado d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
    <div class="d-flex align-items-center">
      <span class="icono-titulo"><i class="bi bi-${icono}"></i></span>
      <div>
        <h2 class="h4 mb-0">${titulo}</h2>
        ${subtitulo ? html`<p class="text-muted mb-0 small">${subtitulo}</p>` : ''}
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2">${acciones}</div>
  </div>`;

/** Mensaje de error de una pantalla con botón para volver a intentar. */
export const errorVista = (error) => html`
  <div class="card"><div class="card-body text-center py-5">
    <div class="estado-vacio pb-2"><div class="icono text-danger"><i class="bi bi-exclamation-octagon"></i></div></div>
    <h3 class="h5 fw-bold">${error.status === 404 ? 'No encontramos lo que buscas' : 'No se pudo cargar esta sección'}</h3>
    <p class="text-muted mb-3">${error.message}.</p>
    ${error.referencia ? html`<p class="small text-muted">Código de referencia: <code>${error.referencia}</code></p>` : ''}
    <div class="d-flex justify-content-center gap-2">
      <a class="btn btn-light" href="#/dashboard"><i class="bi bi-house me-1"></i>Ir al inicio</a>
      <button class="btn btn-primary" data-reintentar><i class="bi bi-arrow-clockwise me-1"></i>Reintentar</button>
    </div>
  </div></div>`;

export const opciones = (lista, seleccionado, { vacia } = {}) => html`
  ${vacia ? html`<option value="">${vacia}</option>` : ''}
  ${lista.map(({ valor, texto }) => html`<option value="${valor}" ${String(valor) === String(seleccionado ?? '') ? 'selected' : ''}>${texto}</option>`)}`;

export const opcionesDeportistas = (deportistas, seleccionado, vacia = 'Selecciona un deportista') =>
  opciones(deportistas.map((d) => ({ valor: d.id, texto: `${d.nombre} (${d.codigo})` })), seleccionado, { vacia });

// ---------------------------------------------------------------------------
// Tablas con paginación
// ---------------------------------------------------------------------------
/**
 * Dibuja `items` en el <tbody> con paginación. Los botones de las filas deben
 * manejarse con delegación de eventos (un solo listener en la tabla).
 */
export function tablaPaginada(tbody, pie, items, dibujarFila, { porPagina = 25, columnas = 1, mensajeVacio = 'Sin datos', icono = 'inbox' } = {}) {
  let pagina = 1;
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));

  function pintar() {
    const inicio = (pagina - 1) * porPagina;
    const visibles = items.slice(inicio, inicio + porPagina);
    montar(tbody, visibles.length
      ? html`${visibles.map(dibujarFila)}`
      : html`<tr><td colspan="${columnas}">${vacio(mensajeVacio, icono)}</td></tr>`);
    if (!pie) return;
    pie.classList.toggle('d-none', items.length <= porPagina);
    montar(pie, html`
      <span>Mostrando ${inicio + 1}–${inicio + visibles.length} de ${items.length}</span>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-light" data-pagina="anterior" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior"><i class="bi bi-chevron-left"></i></button>
        <button class="btn btn-light" disabled>${pagina} / ${paginas}</button>
        <button class="btn btn-light" data-pagina="siguiente" ${pagina === paginas ? 'disabled' : ''} aria-label="Página siguiente"><i class="bi bi-chevron-right"></i></button>
      </div>`);
  }

  pie?.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-pagina]');
    if (!boton) return;
    pagina = Math.min(paginas, Math.max(1, pagina + (boton.dataset.pagina === 'siguiente' ? 1 : -1)));
    pintar();
    tbody.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  pintar();
}

// ---------------------------------------------------------------------------
// Efectos
// ---------------------------------------------------------------------------
/** Anima los números de los elementos [data-contar] desde 0 hasta su valor. */
export function animarNumeros(raiz) {
  raiz.querySelectorAll('[data-contar]').forEach((el) => {
    const destino = Number(el.dataset.contar);
    if (!Number.isFinite(destino) || prefiereMenosMovimiento()) return;
    const decimales = (el.dataset.contar.split('.')[1] || '').length;
    const inicio = performance.now();
    const duracion = 900;
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suave = 1 - (1 - t) ** 3;
      el.textContent = (destino * suave).toFixed(decimales);
      if (t < 1 && el.isConnected) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

/** Inclinación 3D que sigue al puntero (solo con mouse y si se permiten animaciones). */
export function activarInclinacion(raiz, selector = '.tarjeta-dato, .tarjeta-funcion', intensidad = 8) {
  if (prefiereMenosMovimiento() || !window.matchMedia('(hover: hover)').matches) return;
  raiz.querySelectorAll(selector).forEach((tarjeta) => {
    tarjeta.addEventListener('pointermove', (e) => {
      const caja = tarjeta.getBoundingClientRect();
      const x = (e.clientX - caja.left) / caja.width;
      const y = (e.clientY - caja.top) / caja.height;
      tarjeta.style.setProperty('--ry', `${(x - 0.5) * intensidad}deg`);
      tarjeta.style.setProperty('--rx', `${(0.5 - y) * intensidad}deg`);
      tarjeta.style.setProperty('--mx', `${x * 100}%`);
      tarjeta.style.setProperty('--my', `${y * 100}%`);
    });
    tarjeta.addEventListener('pointerleave', () => {
      tarjeta.style.setProperty('--rx', '0deg');
      tarjeta.style.setProperty('--ry', '0deg');
    });
  });
}

// ---------------------------------------------------------------------------
// Avisos y diálogos
// ---------------------------------------------------------------------------
const ICONO_AVISO = { success: 'check-circle-fill', danger: 'x-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };

export function avisar(mensaje, tipo = 'success') {
  const contenedor = document.getElementById('avisos');
  if (!contenedor || !window.bootstrap) {
    console.warn(mensaje);
    return;
  }
  const aviso = document.createElement('div');
  aviso.className = `toast align-items-center text-bg-${tipo} border-0`;
  aviso.setAttribute('role', tipo === 'danger' ? 'alert' : 'status');
  montar(aviso, html`<div class="d-flex"><div class="toast-body"><i class="bi bi-${ICONO_AVISO[tipo] || 'info-circle-fill'} me-2"></i>${mensaje}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`);
  contenedor.append(aviso);
  while (contenedor.children.length > 4) contenedor.firstElementChild.remove();
  aviso.addEventListener('hidden.bs.toast', () => aviso.remove());
  new bootstrap.Toast(aviso, { delay: tipo === 'danger' ? 8000 : 4500 }).show();
}

export function mostrarError(error) {
  const detalles = error.detalles?.length ? ` ${error.detalles.join(' ')}` : '';
  const referencia = error.referencia ? ` (ref. ${error.referencia})` : '';
  avisar(`${error.message}.${detalles}${referencia}`.replace('..', '.'), 'danger');
}

/** Valores de un formulario como objeto (los checkbox se convierten en booleanos). */
export function datosFormulario(formulario) {
  const datos = Object.fromEntries(new FormData(formulario));
  formulario.querySelectorAll('input[type="checkbox"][name]').forEach((c) => { datos[c.name] = c.checked; });
  return datos;
}

/** Deshabilita un botón mientras se ejecuta una acción (evita envíos dobles). */
export async function conCarga(boton, accion) {
  if (boton.dataset.ocupado) return undefined;
  const original = boton.innerHTML;
  boton.dataset.ocupado = '1';
  boton.disabled = true;
  boton.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Procesando…';
  try {
    return await accion();
  } finally {
    delete boton.dataset.ocupado;
    if (boton.isConnected) {
      boton.disabled = false;
      boton.innerHTML = original;
    }
  }
}

function crearModal(contenido, tamano = '') {
  const elemento = document.createElement('div');
  elemento.className = 'modal fade';
  elemento.tabIndex = -1;
  montar(elemento, html`<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${tamano}"><div class="modal-content">${contenido}</div></div>`);
  document.body.append(elemento);
  const modal = new bootstrap.Modal(elemento);
  elemento.addEventListener('hidden.bs.modal', () => {
    modal.dispose();
    elemento.remove();
  });
  modal.show();
  return { elemento, modal };
}

/** Diálogo de confirmación. Resuelve true si el usuario acepta. */
export function confirmar(mensaje, { titulo = 'Confirmar', boton = 'Aceptar', peligro = false } = {}) {
  return new Promise((resolve) => {
    let aceptado = false;
    const { elemento, modal } = crearModal(html`
      <div class="modal-header"><h5 class="modal-title fw-bold">${titulo}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${mensaje}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-${peligro ? 'danger' : 'primary'}" data-aceptar>${boton}</button>
      </div>`);
    elemento.querySelector('[data-aceptar]').addEventListener('click', () => {
      aceptado = true;
      modal.hide();
    });
    elemento.addEventListener('hidden.bs.modal', () => resolve(aceptado));
  });
}

/** Ventana informativa con un solo botón (devuelve el elemento para enlazar eventos). */
export function mostrarInfo({ titulo, cuerpo, boton = 'Entendido' }) {
  const { elemento } = crearModal(html`
    <div class="modal-header"><h5 class="modal-title fw-bold">${titulo}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
    <div class="modal-body">${cuerpo}</div>
    <div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">${boton}</button></div>`);
  return elemento;
}

/** Lista de errores dentro de un formulario. */
export function pintarErrorFormulario(caja, error) {
  montar(caja, html`<i class="bi bi-exclamation-triangle-fill me-1"></i>${error.message}
    ${error.detalles?.length ? html`<ul class="mb-0 mt-1">${error.detalles.map((d) => html`<li>${d}</li>`)}</ul>` : ''}`);
  caja.classList.remove('d-none');
}

/**
 * Modal con formulario. `alGuardar(datos)` puede lanzar un error de la API:
 * se muestra dentro del modal y el formulario queda abierto para corregir.
 */
export function modalFormulario({ titulo, cuerpo, boton = 'Guardar', tamano = '', alGuardar }) {
  const { elemento, modal } = crearModal(html`
    <form novalidate>
      <div class="modal-header"><h5 class="modal-title fw-bold">${titulo}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="alert alert-danger d-none" data-error role="alert"></div>${cuerpo}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">${boton}</button>
      </div>
    </form>`, tamano);

  const formulario = elemento.querySelector('form');
  const cajaError = elemento.querySelector('[data-error]');
  elemento.addEventListener('shown.bs.modal', () => formulario.querySelector('input:not([disabled]), select, textarea')?.focus());
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    cajaError.classList.add('d-none');
    try {
      await conCarga(formulario.querySelector('[type="submit"]'), () => alGuardar(datosFormulario(formulario)));
      modal.hide();
    } catch (error) {
      pintarErrorFormulario(cajaError, error);
    }
  });
  return elemento;
}
