/**
 * Estructura deportiva de la academia: deportes (desde plantillas o personalizados), categorías,
 * equipos con sus miembros, sedes e instalaciones. Lectura para todos con estructura.ver;
 * cambios solo con estructura.gestionar (los equipos propios también los gestiona su coach).
 */
import { api } from '../api.js';
import { html, montar, encabezado, avisar, mostrarError, confirmar, modalFormulario, conCarga } from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede, usuarioActual } from '../sesion.js';
import { campos, limpiar, tabla, pestanas, insignia } from '../formularios.js';

const MODOS = ['campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado'].map((m) => ({ valor: m, texto: m.replace('_', ' ') }));
const TIPOS_INST = ['campo', 'cancha', 'pista', 'piscina', 'gimnasio', 'lago', 'playa', 'personalizada'].map((m) => ({ valor: m, texto: m }));

const PESTANAS = [
  { clave: 'deportes', texto: 'Deportes', icono: 'trophy' },
  { clave: 'categorias', texto: 'Categorías', icono: 'diagram-3' },
  { clave: 'equipos', texto: 'Equipos', icono: 'people' },
  { clave: 'sedes', texto: 'Sedes e instalaciones', icono: 'geo-alt' },
];

const ops = (lista, texto = (x) => x.nombre) => lista.map((x) => ({ valor: x.id, texto: texto(x) }));

function botonesFila(ruta, fila, editar) {
  if (!puede('estructura.gestionar')) return '';
  return html`<button class="btn btn-sm btn-light" data-editar="${ruta}:${fila.id}" title="Editar"><i class="bi bi-pencil"></i></button>
    <button class="btn btn-sm btn-light text-danger" data-baja="${ruta}:${fila.id}" title="Dar de baja"><i class="bi bi-archive"></i></button>${editar || ''}`;
}

function abrir(ruta, titulo, defs, registro) {
  modalFormulario({
    titulo: `${registro ? 'Editar' : 'Nuevo'}: ${titulo}`,
    cuerpo: campos(defs, registro || {}),
    alGuardar: async (datos) => {
      const limpio = limpiar(defs, datos);
      if (registro) await api.put(`/estructura/${ruta}/${registro.id}`, limpio);
      else await api.post(`/estructura/${ruta}`, limpio);
      avisar('Guardado.');
      recargarVista();
    },
  });
}

export async function render(vista, { query }) {
  const activa = query.get('t') || 'deportes';
  const r = await api.get('/estructura/resumen');
  const gestiona = puede('estructura.gestionar');
  const defs = {
    deportes: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'modo_medicion', etiqueta: 'Modo de medición', tipo: 'select', opciones: MODOS, requerido: true, vacia: false },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', col: 'col-12' },
    ],
    categorias: [
      { nombre: 'nombre', etiqueta: 'Nombre (p. ej. Sub-14)', requerido: true },
      { nombre: 'nivel', etiqueta: 'Nivel' },
      { nombre: 'edad_min', etiqueta: 'Edad mínima', tipo: 'entero', min: 3, max: 100 },
      { nombre: 'edad_max', etiqueta: 'Edad máxima', tipo: 'entero', min: 3, max: 100 },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', col: 'col-12' },
    ],
    equipos: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'deporte_id', etiqueta: 'Deporte', tipo: 'select', opciones: ops(r.deportes) },
      { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: ops(r.categorias) },
      { nombre: 'coach_id', etiqueta: 'Coach responsable', tipo: 'select', opciones: ops(r.coaches) },
      { nombre: 'sede_id', etiqueta: 'Sede', tipo: 'select', opciones: ops(r.sedes) },
      { nombre: 'instalacion_id', etiqueta: 'Instalación', tipo: 'select', opciones: ops(r.instalaciones) },
      { nombre: 'horario', etiqueta: 'Horario', col: 'col-12', placeholder: 'Lun-Mié-Vie 16:00' },
    ],
    sedes: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true }, { nombre: 'ciudad', etiqueta: 'Ciudad' },
      { nombre: 'direccion', etiqueta: 'Dirección' }, { nombre: 'telefono', etiqueta: 'Teléfono' },
    ],
    instalaciones: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS_INST, requerido: true, vacia: false },
      { nombre: 'sede_id', etiqueta: 'Sede', tipo: 'select', opciones: ops(r.sedes) },
      { nombre: 'largo_m', etiqueta: 'Largo (m) · obligatorio en piscinas', tipo: 'numero', min: 1 },
      { nombre: 'carriles', etiqueta: 'Carriles', tipo: 'entero', min: 1, max: 20 },
      { nombre: 'profundidad_m', etiqueta: 'Profundidad (m)', tipo: 'numero', min: 0.1 },
      { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', col: 'col-12' },
    ],
    disciplinas: [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true, col: 'col-12' }],
  };
  const titulos = { deportes: 'deporte', categorias: 'categoría', equipos: 'equipo', sedes: 'sede', instalaciones: 'instalación' };

  let cuerpo = '';
  let datos = {};
  if (activa === 'deportes') {
    const [deportes, plantillas] = await Promise.all([api.get('/estructura/deportes'), api.get('/estructura/plantillas')]);
    datos = { deportes };
    const activas = new Set(deportes.map((d) => d.plantilla).filter(Boolean));
    cuerpo = html`
      ${gestiona ? html`<div class="card mb-3"><div class="card-body">
        <h3 class="h6 fw-bold mb-1">Activar un deporte desde una plantilla</h3>
        <p class="small text-muted">Crea el deporte con sus disciplinas, posiciones, métricas, pruebas (con baremos editables), plantilla de evaluación, tipos de entrenamiento y scoring inicial.</p>
        <div class="d-flex flex-wrap gap-2">${plantillas.map((p) => html`<button class="btn btn-sm ${activas.has(p.clave) ? 'btn-success disabled' : 'btn-outline-primary'}" data-plantilla="${p.clave}">
          ${activas.has(p.clave) ? html`<i class="bi bi-check2 me-1"></i>` : html`<i class="bi bi-plus me-1"></i>`}${p.nombre} <span class="opacity-75">· ${p.total_pruebas} pruebas</span></button>`)}</div>
      </div></div>` : ''}
      <div class="card">${tabla(deportes, [
    { titulo: 'Deporte', valor: (d) => html`<span class="fw-semibold">${d.nombre}</span>${d.plantilla ? html` ${insignia('plantilla', 'light')}` : ''}` },
    { titulo: 'Modo', valor: (d) => d.modo_medicion },
    { titulo: 'Pruebas', valor: (d) => d.pruebas },
    { titulo: 'Deportistas', valor: (d) => d.deportistas },
    { titulo: 'Disciplinas / posiciones', valor: (d) => html`${r.disciplinas.filter((x) => x.deporte_id === d.id).map((x) => x.nombre).join(', ') || '—'}
      <div class="small text-muted">${r.posiciones.filter((x) => x.deporte_id === d.id).map((x) => x.nombre).join(', ')}</div>` },
  ], {
    acciones: (d) => html`${gestiona ? html`<button class="btn btn-sm btn-light" data-disciplina="${d.id}" title="Añadir disciplina"><i class="bi bi-plus-square"></i></button>
      <button class="btn btn-sm btn-light" data-posicion="${d.id}" title="Añadir posición"><i class="bi bi-person-plus"></i></button>` : ''}${botonesFila('deportes', d)}`,
    vacio: 'Aún no hay deportes: activa uno desde una plantilla.',
  })}</div>`;
  } else if (activa === 'categorias') {
    datos.categorias = await api.get('/estructura/categorias');
    cuerpo = html`<div class="card">${tabla(datos.categorias, [
      { titulo: 'Categoría', valor: (c) => html`<span class="fw-semibold">${c.nombre}</span>` },
      { titulo: 'Edades', valor: (c) => (c.edad_min || c.edad_max ? `${c.edad_min ?? '…'} – ${c.edad_max ?? '…'} años` : '—') },
      { titulo: 'Nivel', valor: (c) => c.nivel || '—' },
      { titulo: 'Deportistas', valor: (c) => c.deportistas },
    ], { acciones: (c) => botonesFila('categorias', c) })}</div>`;
  } else if (activa === 'equipos') {
    datos.equipos = await api.get('/estructura/equipos');
    const mios = new Set(r.mis_equipos || []);
    cuerpo = html`<div class="card">${tabla(datos.equipos, [
      { titulo: 'Equipo', valor: (e) => html`<span class="fw-semibold">${e.nombre}</span>` },
      { titulo: 'Deporte', valor: (e) => e.deporte || '—' },
      { titulo: 'Categoría', valor: (e) => e.categoria || '—' },
      { titulo: 'Coach', valor: (e) => e.coach || '—' },
      { titulo: 'Instalación', valor: (e) => e.instalacion || '—' },
      { titulo: 'Horario', valor: (e) => e.horario || '—' },
      { titulo: 'Miembros', valor: (e) => e.miembros },
    ], {
      acciones: (e) => html`${gestiona || mios.has(e.id) ? html`<button class="btn btn-sm btn-light" data-miembros="${e.id}" title="Miembros"><i class="bi bi-people"></i></button>` : ''}${botonesFila('equipos', e)}`,
      vacio: 'Sin equipos.',
    })}</div>`;
  } else {
    const [sedes, instalaciones] = await Promise.all([api.get('/estructura/sedes'), api.get('/estructura/instalaciones')]);
    datos = { sedes, instalaciones };
    cuerpo = html`<div class="row g-3">
      <div class="col-lg-5"><div class="card h-100"><div class="card-header d-flex justify-content-between align-items-center"><span class="fw-semibold">Sedes</span>
        ${gestiona ? html`<button class="btn btn-sm btn-primary" data-nuevo="sedes"><i class="bi bi-plus-lg"></i></button>` : ''}</div>
        ${tabla(sedes, [{ titulo: 'Sede', valor: (s) => s.nombre }, { titulo: 'Ciudad', valor: (s) => s.ciudad || '—' }], { acciones: (s) => botonesFila('sedes', s) })}</div></div>
      <div class="col-lg-7"><div class="card h-100"><div class="card-header d-flex justify-content-between align-items-center"><span class="fw-semibold">Instalaciones</span>
        ${gestiona ? html`<button class="btn btn-sm btn-primary" data-nuevo="instalaciones"><i class="bi bi-plus-lg"></i></button>` : ''}</div>
        ${tabla(instalaciones, [{ titulo: 'Instalación', valor: (i) => i.nombre }, { titulo: 'Tipo', valor: (i) => i.tipo },
    { titulo: 'Largo', valor: (i) => (i.largo_m ? `${i.largo_m} m` : '—') }, { titulo: 'Carriles', valor: (i) => i.carriles || '—' }, { titulo: 'Sede', valor: (i) => i.sede || '—' }],
  { acciones: (i) => botonesFila('instalaciones', i) })}</div></div></div>`;
  }

  const nuevo = activa !== 'sedes' && gestiona ? html`<button class="btn btn-primary" data-nuevo="${activa}"><i class="bi bi-plus-lg me-1"></i>Nuevo</button>` : '';
  montar(vista, html`
    ${encabezado('diagram-3', 'Estructura deportiva', 'Deportes, categorías, equipos, sedes e instalaciones de la academia', nuevo)}
    ${pestanas('estructura', PESTANAS, activa)}
    ${cuerpo}`);

  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/estructura?t=${b.dataset.pestana}`)));
  vista.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.nuevo, titulos[b.dataset.nuevo], defs[b.dataset.nuevo])));
  vista.addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar]');
    const baja = e.target.closest('[data-baja]');
    const plantilla = e.target.closest('[data-plantilla]');
    const miembros = e.target.closest('[data-miembros]');
    const disciplina = e.target.closest('[data-disciplina]');
    const posicion = e.target.closest('[data-posicion]');
    try {
      if (editar) {
        const [ruta, id] = editar.dataset.editar.split(':');
        abrir(ruta, titulos[ruta], defs[ruta], (datos[ruta] || []).find((x) => String(x.id) === id));
      } else if (baja) {
        const [ruta, id] = baja.dataset.baja.split(':');
        if (await confirmar('Se dará de baja (se conserva el historial). ¿Continuar?', { peligro: true, boton: 'Dar de baja' })) {
          await api.delete(`/estructura/${ruta}/${id}`);
          avisar('Dado de baja.');
          recargarVista();
        }
      } else if (plantilla && !plantilla.classList.contains('disabled')) {
        await conCarga(plantilla, async () => {
          const res = await api.post('/estructura/deportes/plantilla', { clave: plantilla.dataset.plantilla });
          avisar(`${res.deporte.nombre} activado: ${res.pruebas} pruebas, ${res.disciplinas} disciplinas y ${res.posiciones} posiciones.`);
        });
        window.dispatchEvent(new CustomEvent('sesion-cambiada'));
      } else if (disciplina || posicion) {
        const ruta = disciplina ? 'disciplinas' : 'posiciones';
        modalFormulario({
          titulo: disciplina ? 'Nueva disciplina' : 'Nueva posición',
          cuerpo: campos(defs.disciplinas),
          alGuardar: async (d) => {
            await api.post(`/estructura/${ruta}`, { ...d, deporte_id: Number((disciplina || posicion).dataset[disciplina ? 'disciplina' : 'posicion']) });
            avisar('Guardado.');
            recargarVista();
          },
        });
      } else if (miembros) {
        await editarMiembros(Number(miembros.dataset.miembros), datos.equipos.find((x) => x.id === Number(miembros.dataset.miembros)));
      }
    } catch (error) {
      mostrarError(error);
    }
  });
}

async function editarMiembros(id, equipo) {
  const [{ datos: deportistas }, actuales] = await Promise.all([api.get('/deportistas', { todaLaAcademia: true }), api.get(`/estructura/equipos/${id}/miembros`)]);
  const marcados = new Set(actuales.map((m) => m.id ?? m.deportista_id));
  const candidatos = deportistas.filter((d) => !equipo.deporte_id || !d.deporte_id || d.deporte_id === equipo.deporte_id || marcados.has(d.id));
  modalFormulario({
    titulo: `Miembros de ${equipo.nombre}`,
    tamano: 'modal-lg',
    cuerpo: html`<p class="small text-muted">Marca los deportistas del equipo. El coach del equipo verá a sus miembros.</p>
      <input class="form-control form-control-sm mb-2" placeholder="Filtrar…" data-filtrar>
      <div class="row g-1" style="max-height:50vh;overflow:auto">${candidatos.map((d) => html`<div class="col-md-6" data-item="${d.nombre.toLowerCase()} ${d.codigo.toLowerCase()}">
        <label class="form-check border rounded p-2 ps-5 w-100"><input class="form-check-input" type="checkbox" name="d_${d.id}" ${marcados.has(d.id) ? 'checked' : ''}>
        ${d.nombre} <span class="text-muted small">(${d.codigo}${d.categoria ? ` · ${d.categoria}` : ''})</span></label></div>`)}</div>`,
    alGuardar: async (datos) => {
      const ids = Object.entries(datos).filter(([k, v]) => k.startsWith('d_') && v === true).map(([k]) => Number(k.slice(2)));
      await api.put(`/estructura/equipos/${id}/miembros`, { deportistas: ids });
      avisar(`Equipo actualizado: ${ids.length} miembros.`);
      recargarVista();
    },
  }).querySelector('[data-filtrar]').addEventListener('input', (e) => {
    const t = e.target.value.toLowerCase();
    e.target.closest('.modal').querySelectorAll('[data-item]').forEach((x) => { x.classList.toggle('d-none', !x.dataset.item.includes(t)); });
  });
  return usuarioActual();
}
