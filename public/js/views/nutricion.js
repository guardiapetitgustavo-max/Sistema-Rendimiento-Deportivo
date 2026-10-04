/**
 * Nutrición: perfil declarado (preferencias, restricciones, alergias), notas del profesional y orientación
 * GENERAL (hidratación y horarios) calculada con los registros reales. No es un plan clínico.
 */
import { api } from '../api.js';
import { html, montar, encabezado, avisar, opcionesDeportistas, vacio } from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { campos } from '../formularios.js';

export async function render(vista, { query }) {
  const { datos: deportistas } = await api.get('/deportistas');
  const id = Number(query.get('deportista')) || deportistas[0]?.id;
  if (!id) { montar(vista, vacio('No hay deportistas.')); return; }
  const r = await api.get(`/nutricion/deportistas/${id}`);
  const edita = puede('alimentacion.gestionar');
  const profesional = puede('nutricion.orientar');
  const p = r.perfil || {};
  montar(vista, html`
    ${encabezado('egg-fried', 'Nutrición', 'Perfil, horarios y orientación general (no clínica)', html`<a class="btn btn-light" href="#/alimentacion?deportista_id=${id}"><i class="bi bi-cup-hot me-1"></i>Registros diarios</a>`)}
    <div class="card mb-3"><div class="card-body py-2"><select class="form-select w-auto" data-dep>${opcionesDeportistas(deportistas, id, null)}</select></div></div>
    <div class="row g-3">
      <div class="col-lg-6"><div class="card h-100"><div class="card-body">
        <h3 class="h6 fw-bold">Orientación general</h3>
        <ul class="small">${r.orientacion.puntos.map((x) => html`<li>${x}</li>`)}</ul>
        <div class="small text-muted"><i class="bi bi-info-circle me-1"></i>${r.orientacion.aviso}</div>
        ${p.notas_profesional ? html`<div class="border-start border-3 border-success ps-2 mt-3"><div class="small fw-semibold">Notas de ${p.profesional || 'el profesional'}</div>
          <div class="small" style="white-space:pre-line">${p.notas_profesional}</div></div>` : ''}
      </div></div></div>
      <div class="col-lg-6"><div class="card h-100"><div class="card-body">
        <h3 class="h6 fw-bold">Perfil declarado</h3>
        <form data-perfil>${campos([
    { nombre: 'preferencias', etiqueta: 'Preferencias', tipo: 'textarea', col: 'col-12', deshabilitado: !edita },
    { nombre: 'restricciones', etiqueta: 'Restricciones', tipo: 'textarea', col: 'col-12', deshabilitado: !edita },
    { nombre: 'alergias_declaradas', etiqueta: 'Alergias declaradas', tipo: 'textarea', col: 'col-12', deshabilitado: !edita },
    { nombre: 'objetivo', etiqueta: 'Objetivo', col: 'col-12', deshabilitado: !edita },
    ...(profesional ? [{ nombre: 'notas_profesional', etiqueta: 'Notas profesionales (las ve el staff)', tipo: 'textarea', filas: 4, col: 'col-12' }] : []),
  ], p)}${edita ? html`<button class="btn btn-primary mt-3">Guardar perfil</button>` : ''}</form>
      </div></div></div>
    </div>`);
  vista.querySelector('[data-dep]').addEventListener('change', (e) => ir(`/nutricion?deportista=${e.target.value}`));
  vista.querySelector('[data-perfil]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    await api.put(`/nutricion/deportistas/${id}`, datos);
    avisar('Perfil guardado.');
    recargarVista();
  });
}
