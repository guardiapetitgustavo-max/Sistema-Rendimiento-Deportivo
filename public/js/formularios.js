/**
 * Formularios y tablas declarativas para las pantallas de catálogos (estructura, metodología, comercial…).
 */
import { html } from './ui.js';

/**
 * Campo de formulario. def: { nombre, etiqueta, tipo, opciones, requerido, col, paso, min, max, ayuda, deshabilitado }
 * tipos: texto | numero | entero | fecha | hora | select | textarea | check | color | correo
 */
export function campo(def, valor) {
  const v = valor ?? def.defecto ?? '';
  const req = def.requerido ? 'required' : '';
  const dis = def.deshabilitado ? 'disabled' : '';
  const etiqueta = html`<label class="form-label small fw-semibold">${def.etiqueta}${def.requerido ? ' *' : ''}</label>`;
  let control;
  switch (def.tipo) {
    case 'select':
      control = html`<select class="form-select" name="${def.nombre}" ${req} ${dis}>
        ${def.vacia !== false ? html`<option value="">${def.vacia || '—'}</option>` : ''}
        ${(def.opciones || []).map((o) => html`<option value="${o.valor}" ${String(o.valor) === String(v) ? 'selected' : ''}>${o.texto}</option>`)}</select>`;
      break;
    case 'textarea':
      control = html`<textarea class="form-control" name="${def.nombre}" rows="${def.filas || 2}" ${req} ${dis}>${v}</textarea>`;
      break;
    case 'check':
      return html`<div class="${def.col || 'col-12'}"><div class="form-check form-switch mt-2">
        <input class="form-check-input" type="checkbox" name="${def.nombre}" id="c-${def.nombre}" ${v === true || v === 'true' ? 'checked' : ''} ${dis}>
        <label class="form-check-label" for="c-${def.nombre}">${def.etiqueta}</label></div>${def.ayuda ? html`<div class="form-text">${def.ayuda}</div>` : ''}</div>`;
    default: {
      const tipo = { numero: 'number', entero: 'number', fecha: 'date', hora: 'time', color: 'color', correo: 'email' }[def.tipo] || 'text';
      const paso = def.tipo === 'entero' ? '1' : (def.paso || 'any');
      const valorFinal = def.tipo === 'fecha' && v ? String(v).slice(0, 10) : (def.tipo === 'hora' && v ? String(v).slice(0, 5) : v);
      control = html`<input class="form-control${def.tipo === 'color' ? ' form-control-color w-100' : ''}" type="${tipo}" name="${def.nombre}" value="${valorFinal}"
        ${tipo === 'number' ? html`step="${paso}"` : ''} ${def.min !== undefined ? html`min="${def.min}"` : ''} ${def.max !== undefined ? html`max="${def.max}"` : ''}
        ${def.placeholder ? html`placeholder="${def.placeholder}"` : ''} ${def.maxLargo ? html`maxlength="${def.maxLargo}"` : ''} ${req} ${dis}>`;
    }
  }
  return html`<div class="${def.col || 'col-md-6'}">${etiqueta}${control}${def.ayuda ? html`<div class="form-text">${def.ayuda}</div>` : ''}</div>`;
}

export const campos = (defs, registro = {}) => html`<div class="row g-3">${defs.map((d) => campo(d, registro?.[d.nombre]))}</div>`;

/** Convierte "" en null y los números de texto en números (según los tipos declarados). */
export function limpiar(defs, datos) {
  const salida = { ...datos };
  for (const d of defs) {
    if (!(d.nombre in salida)) continue;
    if (salida[d.nombre] === '') salida[d.nombre] = null;
    else if ((d.tipo === 'numero' || d.tipo === 'entero') && salida[d.nombre] !== null) salida[d.nombre] = Number(salida[d.nombre]);
  }
  return salida;
}

/** Tabla simple. columnas: [{ titulo, valor: (fila) => html|texto, clase }] */
export const tabla = (filas, columnas, { acciones, vacio = 'Sin registros', atributos } = {}) => html`
  <div class="table-responsive"><table class="table table-hover table-sm align-middle mb-0">
    <thead class="table-light"><tr>${columnas.map((c) => html`<th class="${c.clase || ''}">${c.titulo}</th>`)}${acciones ? html`<th></th>` : ''}</tr></thead>
    <tbody>${filas.length ? filas.map((f) => html`<tr ${atributos ? atributos(f) : ''}>${columnas.map((c) => html`<td class="${c.clase || ''}">${c.valor(f)}</td>`)}
      ${acciones ? html`<td class="text-end text-nowrap">${acciones(f)}</td>` : ''}</tr>`)
    : html`<tr><td colspan="${columnas.length + (acciones ? 1 : 0)}" class="text-center text-muted py-4">${vacio}</td></tr>`}</tbody>
  </table></div>`;

/** Pestañas simples: devuelve el html y un activador. */
export function pestanas(id, lista, activa) {
  return html`<ul class="nav nav-pills flex-nowrap overflow-auto mb-3 gap-1" role="tablist" data-pestanas="${id}">
    ${lista.map((p) => html`<li class="nav-item"><button class="nav-link text-nowrap ${p.clave === activa ? 'active' : ''}" type="button" data-pestana="${p.clave}">
      ${p.icono ? html`<i class="bi bi-${p.icono} me-1"></i>` : ''}${p.texto}</button></li>`)}</ul>`;
}

/** Barra de progreso 0-100. */
export const progreso = (valor, color = 'primary') => (valor === null || valor === undefined
  ? html`<span class="text-muted small">Sin datos</span>`
  : html`<div class="d-flex align-items-center gap-2"><div class="progress flex-grow-1" style="height:8px"><div class="progress-bar bg-${color}" style="width:${Math.max(0, Math.min(100, valor))}%"></div></div><span class="small fw-semibold">${valor}%</span></div>`);

export const insignia = (texto, color = 'secondary') => html`<span class="badge text-bg-${color}">${texto}</span>`;

export const COLOR_PRIORIDAD = { alta: 'danger', media: 'warning', baja: 'info' };
