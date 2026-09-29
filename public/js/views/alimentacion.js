/** Registro de alimentación, hidratación y descanso de los deportistas. */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, opcionesDeportistas, fecha, numero, avisar, mostrarError, confirmar, modalFormulario, tablaPaginada,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';

const CAMPOS_TEXTO = [
  { clave: 'desayuno', nombre: 'Desayuno' },
  { clave: 'almuerzo', nombre: 'Almuerzo' },
  { clave: 'cena', nombre: 'Cena' },
  { clave: 'colaciones', nombre: 'Colaciones / snacks' },
  { clave: 'suplementos', nombre: 'Suplementos' },
];

/** Modal de alta o edición (se reutiliza desde el perfil del deportista). */
export function abrirFormularioAlimentacion(registro, deportistas, alGuardar) {
  const editando = Boolean(registro?.id);
  const valor = (campo) => registro?.[campo] ?? '';
  modalFormulario({
    titulo: editando ? `Editar registro de ${registro.nombre}` : 'Nuevo registro de alimentación',
    tamano: 'modal-lg',
    cuerpo: html`<div class="row g-3">
      <div class="col-md-8"><label class="form-label small fw-semibold">Deportista *</label>
        ${editando ? html`<input class="form-control" value="${registro.nombre} (${registro.codigo})" disabled>`
    : html`<select class="form-select" name="deportista_id" required>${opcionesDeportistas(deportistas, registro?.deportista_id)}</select>`}
      </div>
      <div class="col-md-4"><label class="form-label small fw-semibold">Fecha</label>
        <input class="form-control" type="date" name="fecha" value="${valor('fecha') || new Date().toLocaleDateString('en-CA')}"></div>
      ${CAMPOS_TEXTO.map((c) => html`<div class="col-md-6"><label class="form-label small fw-semibold">${c.nombre}</label>
        <input class="form-control" name="${c.clave}" value="${valor(c.clave)}" maxlength="255"></div>`)}
      <div class="col-6 col-md-3"><label class="form-label small fw-semibold">Agua (litros)</label>
        <input class="form-control" type="number" step="0.1" min="0" max="24" name="hidratacion_litros" value="${valor('hidratacion_litros')}"></div>
      <div class="col-6 col-md-3"><label class="form-label small fw-semibold">Horas de sueño</label>
        <input class="form-control" type="number" step="0.5" min="0" max="24" name="horas_sueno" value="${valor('horas_sueno')}"></div>
      <div class="col-12"><label class="form-label small fw-semibold">Notas</label>
        <textarea class="form-control" name="notas" rows="2">${valor('notas')}</textarea></div>
    </div>`,
    alGuardar: async (datos) => {
      if (editando) await api.put(`/alimentacion/${registro.id}`, datos);
      else await api.post('/alimentacion', datos);
      avisar(editando ? 'Registro actualizado.' : 'Registro de alimentación guardado.');
      await alGuardar();
    },
  });
}

export async function render(vista, { query }) {
  const deportistaId = query.get('deportista_id') || '';
  const [registros, { datos: deportistas }] = await Promise.all([
    api.get(`/alimentacion${consulta({ deportista_id: deportistaId })}`),
    api.get('/deportistas'),
  ]);
  const recargar = recargarVista;
  const promedio = (campo) => {
    const valores = registros.map((r) => r[campo]).filter((v) => v !== null);
    return valores.length ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1) : '—';
  };

  montar(vista, html`
    ${encabezado('cup-hot', 'Alimentación', 'Comidas, hidratación y descanso para relacionarlos con el rendimiento', html`
      <button class="btn btn-primary" data-nuevo ${deportistas.length ? '' : 'disabled'}><i class="bi bi-plus-lg me-1"></i>Nuevo registro</button>`)}

    <div class="card mb-3"><div class="card-body row g-3 align-items-end">
      <div class="col-md-5"><label class="form-label small">Deportista</label>
        <select class="form-select" data-filtro>${opcionesDeportistas(deportistas, deportistaId, 'Todos los deportistas')}</select></div>
      <div class="col-6 col-md-3"><div class="etiqueta-dato">Hidratación promedio</div><div class="valor-dato">${promedio('hidratacion_litros')} L</div></div>
      <div class="col-6 col-md-3"><div class="etiqueta-dato">Sueño promedio</div><div class="valor-dato">${promedio('horas_sueno')} h</div></div>
    </div></div>

    <div class="card">
      <div class="table-responsive"><table class="table table-hover table-sm align-middle" data-tabla>
        <thead class="table-light"><tr><th>Fecha</th><th>Deportista</th><th>Desayuno</th><th>Almuerzo</th><th>Cena</th>
          <th>Colaciones</th><th>Agua (L)</th><th>Sueño (h)</th><th>Suplementos</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="paginacion"></div>
    </div>`);

  tablaPaginada(vista.querySelector('[data-tabla] tbody'), vista.querySelector('.paginacion'), registros, (r) => html`<tr>
    <td class="text-nowrap">${fecha(r.fecha)}</td>
    <td><a href="#/deportistas/${r.deportista_id}" class="fw-semibold">${r.nombre}</a></td>
    <td>${r.desayuno || '—'}</td><td>${r.almuerzo || '—'}</td><td>${r.cena || '—'}</td><td>${r.colaciones || '—'}</td>
    <td>${numero(r.hidratacion_litros)}</td><td>${numero(r.horas_sueno)}</td><td>${r.suplementos || '—'}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-light" data-editar="${r.id}" title="Editar" aria-label="Editar"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-light text-danger" data-baja="${r.id}" title="Dar de baja" aria-label="Dar de baja"><i class="bi bi-trash"></i></button>
    </td></tr>`, { columnas: 10, mensajeVacio: 'Sin registros de alimentación', icono: 'cup-hot' });

  vista.querySelector('[data-filtro]').addEventListener('change', (e) => ir(`/alimentacion${consulta({ deportista_id: e.target.value })}`));
  vista.querySelector('[data-nuevo]').addEventListener('click', () =>
    abrirFormularioAlimentacion({ deportista_id: deportistaId }, deportistas, recargar));

  vista.addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar]');
    if (editar) abrirFormularioAlimentacion(registros.find((r) => r.id === Number(editar.dataset.editar)), deportistas, recargar);
    const baja = e.target.closest('[data-baja]');
    if (!baja) return;
    if (!await confirmar('El registro dejará de mostrarse, pero se conserva en el historial.', { titulo: 'Dar de baja', boton: 'Dar de baja', peligro: true })) return;
    try {
      await api.delete(`/alimentacion/${baja.dataset.baja}`);
      avisar('Registro dado de baja.', 'info');
      recargar();
    } catch (error) {
      mostrarError(error);
    }
  });
}
