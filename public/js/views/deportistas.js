/** Lista de deportistas con filtros, alta, edición y baja lógica. */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, opciones, insigniaNivel, insigniaPuntaje, avisar, mostrarError, confirmar,
  modalFormulario, datosFormulario, tablaPaginada, iniciales,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { esAdmin, coachElegido, listaCoaches } from '../sesion.js';

const texto = (valor) => valor ?? '';

/** Administrador: elige (o cambia) el coach dueño del deportista. */
function campoCoach(deportista) {
  if (!esAdmin()) return '';
  const actual = deportista?.usuario_id ?? coachElegido() ?? '';
  const lista = listaCoaches().map((c) => ({ valor: c.id, texto: `${c.nombre}${c.rol === 'admin' ? ' (admin)' : ''}` }));
  return html`<div class="col-12">
    <label class="form-label small fw-semibold">Coach responsable *</label>
    <select class="form-select" name="coach_id" required>${opciones(lista, actual, { vacia: 'Selecciona un coach' })}</select>
    ${deportista ? html`<div class="form-text">Si eliges otro coach, el deportista pasa a él con todo su historial.</div>` : ''}
  </div>`;
}

/** Modal de alta/edición de deportista (se reutiliza desde el perfil). */
export function abrirFormularioDeportista(deportista = null, alGuardar) {
  const editando = Boolean(deportista);
  modalFormulario({
    titulo: editando ? `Editar a ${deportista.nombre}` : 'Nuevo deportista',
    cuerpo: html`
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Código *</label>
          <input class="form-control" name="codigo" value="${texto(deportista?.codigo)}" placeholder="DEP-001" ${editando ? 'disabled' : 'required'}>
        </div>
        <div class="col-md-8">
          <label class="form-label small fw-semibold">Nombre completo *</label>
          <input class="form-control" name="nombre" value="${texto(deportista?.nombre)}" required>
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-semibold">Edad</label>
          <input class="form-control" name="edad" type="number" min="4" max="100" value="${texto(deportista?.edad)}">
        </div>
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Categoría</label>
          <input class="form-control" name="categoria" value="${texto(deportista?.categoria)}" placeholder="Sub-16">
        </div>
        <div class="col-md-5">
          <label class="form-label small fw-semibold">Disciplina</label>
          <input class="form-control" name="disciplina" value="${texto(deportista?.disciplina)}" placeholder="Fútbol, Vóley, Karate…">
        </div>
        ${campoCoach(deportista)}
      </div>`,
    alGuardar: async (datos) => {
      const guardado = editando
        ? await api.put(`/deportistas/${deportista.id}`, datos)
        : await api.post('/deportistas', datos);
      avisar(guardado.reactivado
        ? `${guardado.nombre} fue reactivado con todo su historial.`
        : `Deportista ${guardado.nombre} ${editando ? 'actualizado' : 'registrado'}.`);
      await alGuardar(guardado);
    },
  });
}

/** Baja lógica con confirmación (se reutiliza desde el perfil). */
export async function darDeBajaDeportista(deportista, alTerminar) {
  const aceptado = await confirmar(
    html`¿Dar de baja a <b>${deportista.nombre}</b>? Dejará de mostrarse, pero su historial se conserva y se reactivará si vuelve a registrarse con el mismo código.`,
    { titulo: 'Dar de baja', boton: 'Dar de baja', peligro: true },
  );
  if (!aceptado) return;
  try {
    await api.delete(`/deportistas/${deportista.id}`);
    avisar(`${deportista.nombre} fue dado de baja.`, 'info');
    await alTerminar();
  } catch (error) {
    mostrarError(error);
  }
}

export async function render(vista, { query }) {
  const filtros = Object.fromEntries(query);
  const { datos, categorias, disciplinas } = await api.get(`/deportistas${consulta(filtros)}`);
  const recargar = recargarVista;
  const lista = (valores) => valores.map((v) => ({ valor: v, texto: v }));
  const verCoach = esAdmin() && !coachElegido(); // el admin ve a todos: se indica de quién es cada uno

  montar(vista, html`
    ${encabezado('people', 'Deportistas', 'Registra deportistas y consulta su perfil de rendimiento', html`
      <a class="btn btn-light" href="#/importar"><i class="bi bi-cloud-arrow-up me-1"></i>Importar Excel</a>
      <button class="btn btn-primary" data-accion="nuevo"><i class="bi bi-person-plus me-1"></i>Nuevo deportista</button>`)}

    <div class="card mb-3"><div class="card-body">
      <form class="row g-2 align-items-end" data-filtros>
        <div class="col-md-4"><label class="form-label small">Buscar</label>
          <input class="form-control" name="q" value="${filtros.q || ''}" placeholder="Nombre o código"></div>
        <div class="col-md-3"><label class="form-label small">Categoría</label>
          <select class="form-select" name="categoria">${opciones(lista(categorias), filtros.categoria, { vacia: 'Todas' })}</select></div>
        <div class="col-md-3"><label class="form-label small">Disciplina</label>
          <select class="form-select" name="disciplina">${opciones(lista(disciplinas), filtros.disciplina, { vacia: 'Todas' })}</select></div>
        <div class="col-md-2 d-flex gap-2">
          <button class="btn btn-primary flex-grow-1"><i class="bi bi-funnel"></i> Filtrar</button>
          <a class="btn btn-light" href="#/deportistas" title="Limpiar filtros"><i class="bi bi-x-lg"></i></a>
        </div>
      </form>
    </div></div>

    <div class="card"><div class="card-header small text-muted fw-normal">${datos.length} deportista(s)</div>
      <div class="table-responsive"><table class="table table-hover align-middle" data-tabla>
        <thead class="table-light"><tr>
          <th>Deportista</th>${verCoach ? html`<th>Coach</th>` : ''}<th>Edad</th><th>Categoría</th><th>Disciplina</th>
          <th class="text-center">Evaluaciones</th><th class="text-center">Promedio</th><th>Nivel</th><th class="text-end">Acciones</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="paginacion"></div>
    </div>`);

  vista.querySelector('[data-filtros]').addEventListener('submit', (e) => {
    e.preventDefault();
    ir(`/deportistas${consulta(datosFormulario(e.target))}`);
  });

  tablaPaginada(vista.querySelector('[data-tabla] tbody'), vista.querySelector('.paginacion'), datos, (d) => html`
    <tr class="fila-enlace" data-ir="/deportistas/${d.id}">
      <td><div class="d-flex align-items-center gap-2"><span class="avatar" style="width:34px;height:34px;font-size:.75rem">${iniciales(d.nombre)}</span>
        <div><div class="fw-semibold">${d.nombre}</div><div class="small text-muted">${d.codigo}</div></div></div></td>
      ${verCoach ? html`<td><span class="insignia-coach"><i class="bi bi-person-badge"></i>${d.coach}</span></td>` : ''}
      <td>${d.edad ?? '—'}</td><td>${d.categoria || '—'}</td><td>${d.disciplina || '—'}</td>
      <td class="text-center">${d.total_evaluaciones}</td>
      <td class="text-center">${insigniaPuntaje(d.promedio_general)}</td>
      <td>${insigniaNivel(d.nivel)}</td>
      <td class="text-end text-nowrap">
        <a class="btn btn-sm btn-light" href="#/evaluaciones/nueva?deportista=${d.id}" title="Registrar evaluación" aria-label="Registrar evaluación"><i class="bi bi-clipboard-plus"></i></a>
        <button class="btn btn-sm btn-light" data-accion="editar" data-id="${d.id}" title="Editar" aria-label="Editar"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-light text-danger" data-accion="baja" data-id="${d.id}" title="Dar de baja" aria-label="Dar de baja"><i class="bi bi-person-dash"></i></button>
      </td>
    </tr>`, { columnas: verCoach ? 9 : 8, mensajeVacio: filtros.q || filtros.categoria || filtros.disciplina ? 'No hay deportistas que coincidan con los filtros' : 'Aún no tienes deportistas. Registra el primero o importa un Excel.', icono: 'people' });

  // Un solo listener para todos los botones (sigue funcionando al cambiar de página)
  vista.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const deportista = datos.find((d) => d.id === Number(boton.dataset.id));
    if (boton.dataset.accion === 'nuevo') abrirFormularioDeportista(null, recargar);
    if (boton.dataset.accion === 'editar') abrirFormularioDeportista(deportista, recargar);
    if (boton.dataset.accion === 'baja') darDeBajaDeportista(deportista, recargar);
  });
}
