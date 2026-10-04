/**
 * Comercial de la academia (matrículas, cuotas y pagos) y comunicados.
 */
import { api, consulta } from '../api.js';
import { html, montar, encabezado, avisar, mostrarError, modalFormulario, fecha, fechaHora, vacio, confirmar, conCarga } from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { campos, limpiar, tabla, pestanas, insignia } from '../formularios.js';

const COLOR_PAGO = { pagado: 'success', pendiente: 'warning', vencido: 'danger', anulado: 'secondary' };
const PESTANAS = [{ clave: 'pagos', texto: 'Pagos y cuotas', icono: 'cash-coin' }, { clave: 'matriculas', texto: 'Matrículas', icono: 'card-list' }];
const dinero = (m, moneda) => `${moneda || 'PEN'} ${Number(m).toFixed(2)}`;

export async function render(vista, { query }) {
  const activa = query.get('t') || 'pagos';
  const gestiona = puede('comercial.gestionar');
  const { datos: deportistas } = await api.get('/deportistas', { todaLaAcademia: true });
  const opsDep = deportistas.map((d) => ({ valor: d.id, texto: `${d.nombre} (${d.codigo})` }));
  let cuerpo = '';
  let despues = () => {};
  if (activa === 'pagos') {
    const estado = query.get('estado') || '';
    const [pagos, resumen] = await Promise.all([api.get(`/comercial/pagos${consulta({ estado })}`), api.get('/comercial/pagos/resumen')]);
    const total = (e) => resumen.filter((r) => r.estado === e).reduce((s, r) => s + r.total, 0);
    const n = (e) => resumen.filter((r) => r.estado === e).reduce((s, r) => s + r.n, 0);
    const defs = [
      { nombre: 'deportista_id', etiqueta: 'Deportista', tipo: 'select', requerido: true, opciones: opsDep },
      { nombre: 'concepto', etiqueta: 'Concepto', requerido: true },
      { nombre: 'monto', etiqueta: 'Monto', tipo: 'numero', requerido: true, min: 0 },
      { nombre: 'moneda', etiqueta: 'Moneda', defecto: 'PEN' },
      { nombre: 'fecha_vencimiento', etiqueta: 'Vencimiento', tipo: 'fecha', requerido: true },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacia: false, opciones: ['pendiente', 'pagado', 'anulado'].map((e) => ({ valor: e, texto: e })) },
      { nombre: 'fecha_pago', etiqueta: 'Fecha de pago', tipo: 'fecha' }, { nombre: 'metodo', etiqueta: 'Método' }, { nombre: 'referencia', etiqueta: 'Referencia', col: 'col-12' },
    ];
    cuerpo = html`<div class="row g-3 mb-3">
        <div class="col-6 col-md-4"><div class="card"><div class="card-body"><div class="etiqueta-dato">Cobrado este mes</div><div class="valor-dato text-success">${dinero(total('pagado'))}</div><div class="small text-muted">${n('pagado')} pagos</div></div></div></div>
        <div class="col-6 col-md-4"><div class="card"><div class="card-body"><div class="etiqueta-dato">Pendiente</div><div class="valor-dato text-warning">${dinero(total('pendiente'))}</div><div class="small text-muted">${n('pendiente')} cuotas</div></div></div></div>
        <div class="col-12 col-md-4"><div class="card"><div class="card-body"><div class="etiqueta-dato">Vencido</div><div class="valor-dato text-danger">${dinero(total('vencido'))}</div><div class="small text-muted">${n('vencido')} cuotas</div></div></div></div></div>
      <div class="d-flex flex-wrap gap-2 mb-2">${['', 'pendiente', 'vencido', 'pagado'].map((e) => html`<a class="btn btn-sm ${estado === e ? 'btn-primary' : 'btn-light'}" href="#/comercial?t=pagos${e ? `&estado=${e}` : ''}">${e || 'Todos'}</a>`)}
        ${gestiona ? html`<button class="btn btn-sm btn-outline-primary ms-auto" data-cuotas><i class="bi bi-calendar-plus me-1"></i>Generar cuotas del mes</button>
        <button class="btn btn-sm btn-primary" data-nuevo-pago><i class="bi bi-plus-lg me-1"></i>Pago</button>` : ''}</div>
      <div class="card">${tabla(pagos.slice(0, 500), [
    { titulo: 'Vence', valor: (p) => fecha(p.fecha_vencimiento) }, { titulo: 'Deportista', valor: (p) => p.deportista },
    { titulo: 'Concepto', valor: (p) => p.concepto }, { titulo: 'Monto', valor: (p) => dinero(p.monto, p.moneda) },
    { titulo: 'Estado', valor: (p) => html`${insignia(p.estado, COLOR_PAGO[p.estado])}${p.fecha_pago ? html` <span class="small text-muted">${fecha(p.fecha_pago)}${p.metodo ? ` · ${p.metodo}` : ''}</span>` : ''}` },
  ], { acciones: (p) => (gestiona && ['pendiente', 'vencido'].includes(p.estado) ? html`<button class="btn btn-sm btn-success" data-cobrar="${p.id}">Cobrar</button>` : '') })}</div>`;
    despues = () => {
      vista.querySelector('[data-nuevo-pago]')?.addEventListener('click', () => modalFormulario({
        titulo: 'Nuevo pago o cuota', tamano: 'modal-lg', cuerpo: campos(defs),
        alGuardar: async (d) => { await api.post('/comercial/pagos', limpiar(defs, d)); avisar('Pago registrado.'); recargarVista(); },
      }));
      vista.querySelector('[data-cuotas]')?.addEventListener('click', async (e) => {
        try { const r = await conCarga(e.currentTarget, () => api.post('/comercial/cuotas', {})); avisar(`Cuotas de ${r.mes}: ${r.generadas} generadas.`); recargarVista(); } catch (error) { mostrarError(error); }
      });
      vista.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cobrar]');
        if (!b) return;
        modalFormulario({
          titulo: 'Registrar cobro',
          cuerpo: campos([{ nombre: 'fecha_pago', etiqueta: 'Fecha', tipo: 'fecha', defecto: new Date().toLocaleDateString('en-CA') }, { nombre: 'metodo', etiqueta: 'Método' }, { nombre: 'referencia', etiqueta: 'Referencia', col: 'col-12' }]),
          alGuardar: async (d) => { await api.put(`/comercial/pagos/${b.dataset.cobrar}`, { ...d, estado: 'pagado' }); avisar('Cobro registrado.'); recargarVista(); },
        });
      });
    };
  } else {
    const matriculas = await api.get('/comercial/matriculas');
    const defs = [
      { nombre: 'deportista_id', etiqueta: 'Deportista', tipo: 'select', requerido: true, opciones: opsDep },
      { nombre: 'concepto', etiqueta: 'Concepto', requerido: true, defecto: 'Mensualidad' },
      { nombre: 'monto', etiqueta: 'Monto mensual', tipo: 'numero', min: 0 }, { nombre: 'moneda', etiqueta: 'Moneda', defecto: 'PEN' },
      { nombre: 'fecha_inicio', etiqueta: 'Inicio', tipo: 'fecha' }, { nombre: 'fecha_fin', etiqueta: 'Fin', tipo: 'fecha' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacia: false, opciones: ['activa', 'pendiente', 'vencida', 'retirada'].map((e) => ({ valor: e, texto: e })) },
      { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', col: 'col-12' },
    ];
    cuerpo = html`${gestiona ? html`<div class="text-end mb-2"><button class="btn btn-sm btn-primary" data-nueva><i class="bi bi-plus-lg me-1"></i>Matrícula</button></div>` : ''}
      <div class="card">${tabla(matriculas, [
    { titulo: 'Deportista', valor: (m) => m.deportista }, { titulo: 'Concepto', valor: (m) => m.concepto },
    { titulo: 'Monto', valor: (m) => dinero(m.monto, m.moneda) }, { titulo: 'Vigencia', valor: (m) => `${fecha(m.fecha_inicio)} → ${m.fecha_fin ? fecha(m.fecha_fin) : '…'}` },
    { titulo: 'Estado', valor: (m) => insignia(m.estado, m.estado === 'activa' ? 'success' : 'secondary') },
  ], { acciones: (m) => (gestiona ? html`<button class="btn btn-sm btn-light" data-editar="${m.id}"><i class="bi bi-pencil"></i></button>` : '') })}</div>`;
    despues = () => {
      const abrir = (m) => modalFormulario({
        titulo: m ? 'Editar matrícula' : 'Nueva matrícula', tamano: 'modal-lg', cuerpo: campos(defs, m || {}),
        alGuardar: async (d) => { if (m) await api.put(`/comercial/matriculas/${m.id}`, limpiar(defs, d)); else await api.post('/comercial/matriculas', limpiar(defs, d)); recargarVista(); },
      });
      vista.querySelector('[data-nueva]')?.addEventListener('click', () => abrir(null));
      vista.addEventListener('click', (e) => { const b = e.target.closest('[data-editar]'); if (b) abrir(matriculas.find((m) => m.id === Number(b.dataset.editar))); });
    };
  }
  montar(vista, html`${encabezado('cash-stack', 'Matrículas y pagos', 'Cuotas, cobros y vencimientos (los padres ven los de sus hijos)')}${pestanas('comercial', PESTANAS, activa)}${cuerpo}`);
  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/comercial?t=${b.dataset.pestana}`)));
  despues();
}

export async function comunicados(vista) {
  const [lista, resumen] = await Promise.all([api.get('/comunicados'), puede('comunicados.publicar') ? api.get('/estructura/resumen').catch(() => ({ equipos: [] })) : { equipos: [] }]);
  const publica = puede('comunicados.publicar');
  montar(vista, html`${encabezado('megaphone', 'Comunicados', 'Avisos de la academia', publica ? html`<button class="btn btn-primary" data-publicar><i class="bi bi-plus-lg me-1"></i>Publicar</button>` : '')}
    ${lista.length ? lista.map((c) => html`<div class="card mb-2"><div class="card-body">
      <div class="d-flex justify-content-between gap-2"><h3 class="h6 fw-bold mb-1">${c.titulo}</h3>
        ${publica ? html`<button class="btn btn-sm btn-light text-danger" data-retirar="${c.id}"><i class="bi bi-trash"></i></button>` : ''}</div>
      <div class="small text-muted mb-2">${fechaHora(c.publicado_en)} · ${c.autor || ''} · para ${c.destino === 'todos' ? 'todos' : `${c.destino}: ${c.destino_valor}`}</div>
      <div style="white-space:pre-line">${c.cuerpo}</div></div></div>`) : vacio('No hay comunicados.', 'megaphone')}`);
  vista.querySelector('[data-publicar]')?.addEventListener('click', () => {
    const defs = [
      { nombre: 'titulo', etiqueta: 'Título', requerido: true, col: 'col-12' },
      { nombre: 'cuerpo', etiqueta: 'Mensaje', tipo: 'textarea', filas: 5, requerido: true, col: 'col-12' },
      { nombre: 'destino', etiqueta: 'Para', tipo: 'select', vacia: false, opciones: [{ valor: 'todos', texto: 'Toda la academia' }, { valor: 'rol', texto: 'Un rol' }, { valor: 'equipo', texto: 'Un equipo' }] },
      { nombre: 'destino_valor', etiqueta: 'Rol o equipo', tipo: 'select', opciones: [...['coach', 'deportista', 'padre', 'profesional'].map((r) => ({ valor: r, texto: `Rol: ${r}` })), ...resumen.equipos.map((e) => ({ valor: e.id, texto: `Equipo: ${e.nombre}` }))] },
    ];
    modalFormulario({ titulo: 'Nuevo comunicado', tamano: 'modal-lg', cuerpo: campos(defs), alGuardar: async (d) => { await api.post('/comunicados', d); avisar('Comunicado publicado.'); recargarVista(); } });
  });
  vista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-retirar]');
    if (b && await confirmar('¿Retirar el comunicado?', { peligro: true })) {
      try { await api.delete(`/comunicados/${b.dataset.retirar}`); recargarVista(); } catch (error) { mostrarError(error); }
    }
  });
}
