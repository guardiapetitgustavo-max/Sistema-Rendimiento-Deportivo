/**
 * Indicadores de evaluación (FASE 11): panel con las seis métricas de la matriz de evaluación, el registro de
 * lesiones y los cuestionarios SUS / TAM que responde cualquier persona de la academia.
 */
import { api, consulta } from '../api.js';
import {
  html, montar, encabezado, fecha, vacio, avisar, mostrarError, conCarga, modalFormulario, confirmar, opcionesDeportistas,
} from '../ui.js';
import { ir, recargarVista } from '../navegacion.js';
import { puede } from '../sesion.js';
import { tabla, pestanas, insignia, campos, limpiar } from '../formularios.js';
import { serieMedicion, barrasLibres, dona } from '../graficos.js';
import { COLORES } from '../constantes.js';

const PESTANAS = [
  { clave: 'resumen', texto: 'Resumen', icono: 'speedometer2' },
  { clave: 'carga', texto: 'Carga y recuperación', icono: 'activity' },
  { clave: 'lesiones', texto: 'Lesiones', icono: 'bandaid' },
  { clave: 'rastreo', texto: 'Rastreo GPS', icono: 'geo-alt' },
  { clave: 'usabilidad', texto: 'Usabilidad', icono: 'ui-checks' },
  { clave: 'reportes', texto: 'Reportes', icono: 'file-earmark-bar-graph' },
  { clave: 'aceptacion', texto: 'Aceptación', icono: 'hand-thumbs-up' },
];
const ICONO = { rastreo: 'geo-alt', usabilidad: 'ui-checks', reportes: 'file-earmark-bar-graph', lesiones: 'bandaid', carga: 'activity', aceptacion: 'hand-thumbs-up' };
const ESTADO = {
  cumple: { texto: 'Cumple la meta', color: 'success', icono: 'check-circle-fill' },
  no_cumple: { texto: 'No cumple la meta', color: 'danger', icono: 'x-circle-fill' },
  sin_datos: { texto: 'Datos insuficientes', color: 'secondary', icono: 'dash-circle' },
};
const ZONA = {
  baja: { texto: 'Baja', color: 'info' }, optima: { texto: 'Óptima', color: 'success' }, precaucion: { texto: 'Precaución', color: 'warning' }, riesgo: { texto: 'Riesgo', color: 'danger' },
};
const BIENESTAR = { bueno: 'success', moderado: 'warning', bajo: 'danger' };
const TEXTO = {
  muscular: 'Muscular', ligamentosa: 'Ligamentosa', tendinosa: 'Tendinosa', osea: 'Ósea', articular: 'Articular', contusion: 'Contusión', otra: 'Otra',
  contacto: 'Contacto', sin_contacto: 'Sin contacto', sobreuso: 'Sobreuso', entrenamiento: 'Entrenamiento', competencia: 'Competencia', otro: 'Otro',
  sin_baja: 'Sin baja', minima: 'Mínima (1-3 d)', leve: 'Leve (4-7 d)', moderada: 'Moderada (8-28 d)', grave: 'Grave (> 28 d)', en_curso: 'En curso',
  admin: 'Administrador', coach: 'Coach', profesional: 'Profesional', deportista: 'Deportista', padre: 'Padre / madre', 'sin dato': 'Sin dato',
  alta: 'Alta', baja: 'Baja',
};
const t = (v) => TEXTO[v] || v;
const n = (v, sufijo = '') => (v === null || v === undefined ? '—' : `${v}${sufijo}`);
const COLORES_SERIE = [COLORES.acento, COLORES.claro, COLORES.violeta, COLORES.amarillo, COLORES.verde, COLORES.rojo, COLORES.gris, COLORES.lima];

const kpi = (valor, etiqueta, ayuda = '') => html`<div class="col-6 col-lg"><div class="card h-100"><div class="card-body py-3">
  <div class="valor-dato">${valor}</div><div class="etiqueta-dato">${etiqueta}</div>${ayuda ? html`<div class="small text-muted mt-1">${ayuda}</div>` : ''}</div></div></div>`;
const metodo = (texto) => html`<p class="small text-muted mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>${texto}</p>`;
const tarjeta = (titulo, cuerpo, extra = '') => html`<div class="card h-100"><div class="card-header d-flex justify-content-between align-items-center gap-2"><span>${titulo}</span>${extra}</div><div class="card-body">${cuerpo}</div></div>`;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export async function render(vista, { query }) {
  const activa = PESTANAS.some((p) => p.clave === query.get('t')) ? query.get('t') : 'resumen';
  const filtro = { desde: query.get('desde') || '', hasta: query.get('hasta') || '' };
  const d = await api.get(`/indicadores${consulta(filtro)}`);
  const p = d.periodo;
  const enlace = (extra) => `/indicadores?${new URLSearchParams({ t: activa, ...filtro, ...extra })}`;

  const cuerpos = {
    resumen: () => resumen(d),
    carga: () => carga(d.carga),
    lesiones: () => lesiones(d.lesiones),
    rastreo: () => rastreo(d.rastreo),
    usabilidad: () => usabilidad(d.usabilidad),
    reportes: () => reportes(d.reportes),
    aceptacion: () => aceptacion(d.aceptacion),
  };
  const { contenido, despues } = cuerpos[activa]();

  montar(vista, html`
    ${encabezado('clipboard-data', 'Indicadores', 'Matriz de evaluación: rastreo, usabilidad, reportes, lesiones, carga y aceptación', html`
      <button class="btn btn-light" data-exportar><i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel</button>
      <a class="btn btn-outline-primary" href="#/encuestas"><i class="bi bi-ui-checks me-1"></i>Responder cuestionarios</a>`)}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
      <span class="small text-muted"><i class="bi bi-calendar-range me-1"></i>Periodo</span>
      <input type="date" class="form-control form-control-sm w-auto" data-desde value="${p.desde}" aria-label="Desde">
      <span class="small text-muted">a</span>
      <input type="date" class="form-control form-control-sm w-auto" data-hasta value="${p.hasta}" aria-label="Hasta">
      <button class="btn btn-sm btn-primary" data-aplicar>Aplicar</button>
      <div class="btn-group btn-group-sm ms-md-2">${[30, 90, 180, 365].map((dias) => html`<button class="btn btn-light" data-rapido="${dias}">${dias} d</button>`)}</div>
      <span class="small text-muted ms-auto">${p.dias} días · ${fecha(p.desde)} – ${fecha(p.hasta)}</span>
    </div></div>
    ${pestanas('indicadores', PESTANAS, activa)}
    ${contenido}`);

  vista.querySelectorAll('[data-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/indicadores?${new URLSearchParams({ t: b.dataset.pestana, ...filtro })}`)));
  vista.querySelector('[data-aplicar]').addEventListener('click', () => ir(enlace({ desde: vista.querySelector('[data-desde]').value, hasta: vista.querySelector('[data-hasta]').value })));
  vista.querySelectorAll('[data-rapido]').forEach((b) => b.addEventListener('click', () => {
    const hasta = new Date().toLocaleDateString('en-CA');
    const desde = new Date(Date.now() - (Number(b.dataset.rapido) - 1) * 86400000).toLocaleDateString('en-CA');
    ir(enlace({ desde, hasta }));
  }));
  vista.querySelector('[data-exportar]').addEventListener('click', (e) =>
    conCarga(e.currentTarget, () => api.descargar(`/indicadores/exportar${consulta({ desde: p.desde, hasta: p.hasta })}`)).catch(mostrarError));
  vista.querySelectorAll('[data-ir-pestana]').forEach((b) => b.addEventListener('click', () => ir(`/indicadores?${new URLSearchParams({ t: b.dataset.irPestana, ...filtro })}`)));
  despues(vista);
}

function resumen(d) {
  const dimensiones = [...new Set(d.indicadores.map((i) => i.dimension))];
  const contenido = html`
    ${dimensiones.map((dim) => html`<h3 class="h6 text-muted text-uppercase small fw-bold mt-2 mb-2">${dim}</h3>
      <div class="row g-3 mb-3">${d.indicadores.filter((i) => i.dimension === dim).map((i) => {
    const e = ESTADO[i.estado];
    return html`<div class="col-md-6"><button type="button" class="card tarjeta-indicador estado-${i.estado} h-100 w-100 text-start" data-ir-pestana="${i.clave}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
              <div class="d-flex align-items-center gap-2"><span class="icono-indicador"><i class="bi bi-${ICONO[i.clave]}"></i></span><span class="fw-bold">${i.nombre}</span></div>
              <span class="badge text-bg-${e.color}"><i class="bi bi-${e.icono} me-1"></i>${e.texto}</span>
            </div>
            <div class="d-flex align-items-baseline gap-2"><span class="valor-dato">${n(i.valor)}</span><span class="text-muted small">${i.unidad}</span></div>
            <div class="small mt-1">${i.detalle}</div>
            <div class="small text-muted mt-2"><i class="bi bi-flag me-1"></i>Meta: ${i.meta} · n = ${n(i.n)}</div>
          </div></button></div>`;
  })}</div>`)}`;
  return { contenido, despues: () => {} };
}

function carga(c) {
  const r = c.resumen;
  const contenido = html`
    <div class="row g-3 mb-3">
      ${kpi(n(r.pct_optima, ' %'), 'En zona óptima (0.8-1.3)', `${r.con_acwr} de ${r.deportistas} con historial suficiente`)}
      ${kpi(n(r.acwr_medio), 'ACWR medio')}
      ${kpi(r.zonas.riesgo, 'En riesgo (> 1.5)', `${r.zonas.precaucion} en precaución`)}
      ${kpi(n(r.monotonia_media), 'Monotonía media', `${r.monotonia_alta} con monotonía > 2`)}
      ${kpi(n(r.bienestar_medio), 'Bienestar medio (0-100)', `${r.bienestar_bajo} con bienestar bajo`)}
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-8">${tarjeta('ACWR medio del grupo por semana', html`<div class="grafico"><canvas data-g-acwr></canvas></div>`)}</div>
      <div class="col-lg-4">${tarjeta('Deportistas por zona', r.con_acwr ? html`<div class="grafico"><canvas data-g-zonas></canvas></div>` : vacio('Hace falta un historial de 28 días de carga (RPE × minutos) en la asistencia.', 'activity'))}</div>
    </div>
    <div class="card">${tabla(c.deportistas, [
    { titulo: 'Deportista', valor: (x) => html`<a href="#/deportistas/${x.deportista_id}">${x.deportista}</a> <span class="small text-muted">${x.codigo}</span>` },
    { titulo: 'ACWR', valor: (x) => (x.acwr !== null ? html`<span class="badge text-bg-${ZONA[x.zona].color}">${x.acwr} · ${ZONA[x.zona].texto}</span>` : html`<span class="small text-muted">${x.dias_historial} d de historial</span>`) },
    { titulo: 'Aguda (7 d)', valor: (x) => n(x.aguda), clase: 'text-end' },
    { titulo: 'Crónica (sem.)', valor: (x) => n(x.cronica), clase: 'text-end' },
    { titulo: 'Monotonía', valor: (x) => (x.monotonia !== null ? html`<span class="${x.monotonia_alta ? 'text-danger fw-semibold' : ''}">${x.monotonia}</span>` : '—'), clase: 'text-end' },
    { titulo: 'Tensión', valor: (x) => n(x.tension), clase: 'text-end' },
    { titulo: 'Bienestar 7 d', valor: (x) => (x.bienestar_7d !== null ? insignia(`${x.bienestar_7d}`, BIENESTAR[x.bienestar_estado]) : '—') },
    { titulo: 'Sueño 7 d', valor: (x) => n(x.sueno_7d, ' h') },
  ], { vacio: 'No hay deportistas en tu alcance.' })}</div>
    ${metodo(c.metodo)}`;
  return {
    contenido,
    despues: (v) => {
      const lienzo = v.querySelector('[data-g-acwr]');
      if (lienzo) {
        const s = c.semanal;
        serieMedicion(lienzo, s.map((x) => fecha(x.semana_fin)), [
          { nombre: 'ACWR medio', valores: s.map((x) => x.acwr_medio) },
          { nombre: 'Límite de riesgo (1.5)', valores: s.map(() => 1.5), punteada: true, color: COLORES.rojo },
          { nombre: 'Límite inferior óptimo (0.8)', valores: s.map(() => 0.8), punteada: true, color: COLORES.gris },
        ], { unidad: 'ACWR' });
      }
      const zonas = v.querySelector('[data-g-zonas]');
      if (zonas) dona(zonas, ['Baja', 'Óptima', 'Precaución', 'Riesgo'], ['baja', 'optima', 'precaucion', 'riesgo'].map((z) => r.zonas[z]), [COLORES.claro, COLORES.verde, COLORES.amarillo, COLORES.rojo]);
    },
  };
}

function lesiones(l) {
  const gestiona = puede('lesiones.gestionar');
  const ic = (x) => (x.ic95 ? `IC 95 %: ${x.ic95[0]} – ${x.ic95[1]}` : '');
  const contenido = html`
    <div class="row g-3 mb-3">
      ${kpi(n(l.actual.tasa), 'Lesiones por 1000 h', `${l.actual.lesiones} lesiones en ${l.actual.horas} h · ${ic(l.actual)}`)}
      ${kpi(n(l.anterior.tasa), 'Periodo anterior', `${l.anterior.lesiones} lesiones en ${l.anterior.horas} h`)}
      ${kpi(l.variacion_pct === null ? '—' : html`<span class="${l.variacion_pct <= 0 ? 'text-success' : 'text-danger'}">${l.variacion_pct > 0 ? '+' : ''}${l.variacion_pct} %</span>`, 'Variación de la incidencia', l.efectiva === null ? '' : l.efectiva ? 'La incidencia bajó o se mantuvo' : 'La incidencia subió')}
      ${kpi(n(l.carga_lesional), 'Días perdidos por 1000 h', `${l.dias_perdidos} días de baja`)}
      ${kpi(n(l.prevalencia_pct, ' %'), 'Lesionados ahora', `${l.lesionados_ahora} de ${l.deportistas} deportistas`)}
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-8">${tarjeta('Incidencia mensual (lesiones / 1000 h)', l.mensual.length ? html`<div class="grafico"><canvas data-g-mensual></canvas></div>` : vacio('Sin exposición registrada en el periodo.'))}</div>
      <div class="col-lg-4">${tarjeta('Carga previa a la lesión', l.relacion_carga.evaluables
    ? html`<div class="valor-dato">${n(l.relacion_carga.pct_tras_acwr_alto, ' %')}</div>
        <div class="etiqueta-dato mb-2">de las lesiones llegó con ACWR > 1.3 el día anterior</div>
        <div class="small text-muted">${l.relacion_carga.tras_acwr_alto} de ${l.relacion_carga.evaluables} lesiones con historial de carga suficiente.</div>`
    : vacio('Sin lesiones con 28 días de historial de carga.', 'activity'))}</div>
    </div>
    <div class="row g-3 mb-3">
      ${[['Por tipo', l.por_tipo], ['Por mecanismo', l.por_mecanismo], ['Por gravedad', l.por_gravedad]].map(([titulo, lista], i) => html`<div class="col-md-4">${tarjeta(titulo,
    lista.length ? html`<div style="height:220px"><canvas data-g-dona="${i}"></canvas></div>` : vacio('Sin lesiones en el periodo.'))}</div>`)}
    </div>
    <div class="card mb-3"><div class="card-header d-flex justify-content-between align-items-center">
      <span>Lesiones del periodo</span>
      <a class="btn btn-sm btn-primary" href="#/lesiones"><i class="bi bi-bandaid me-1"></i>${gestiona ? 'Registrar o dar el alta' : 'Ver registro'}</a></div>
      ${tabla(l.lista, [
    { titulo: 'Fecha', valor: (x) => fecha(x.fecha_inicio) },
    { titulo: 'Deportista', valor: (x) => x.deportista },
    { titulo: 'Lesión', valor: (x) => html`${x.zona}<div class="small text-muted">${t(x.tipo)} · ${t(x.mecanismo) || '—'} · ${t(x.contexto)}</div>` },
    { titulo: 'Baja', valor: (x) => html`${x.dias_baja} d<div class="small text-muted">${x.en_curso ? 'En curso' : t(x.gravedad)}</div>` },
    { titulo: 'ACWR previo', valor: (x) => (x.acwr_previo !== null && x.acwr_previo !== undefined ? html`<span class="badge text-bg-${ZONA[x.zona_previa].color}">${x.acwr_previo}</span>` : '—') },
  ], { vacio: 'Sin lesiones en el periodo.' })}</div>
    ${metodo(l.metodo)}`;
  return {
    contenido,
    despues: (v) => {
      const m = v.querySelector('[data-g-mensual]');
      if (m) barrasLibres(m, l.mensual.map((x) => x.mes), l.mensual.map((x) => x.tasa), { color: COLORES.violeta, etiqueta: 'Lesiones / 1000 h' });
      [l.por_tipo, l.por_mecanismo, l.por_gravedad].forEach((lista, i) => {
        const lienzo = v.querySelector(`[data-g-dona="${i}"]`);
        if (lienzo) dona(lienzo, lista.map((x) => t(x.etiqueta)), lista.map((x) => x.total), COLORES_SERIE);
      });
    },
  };
}

function rastreo(r) {
  const contenido = r.evaluadas ? html`
    <div class="row g-3 mb-3">
      ${kpi(n(r.pct_aceptables, ' %'), 'Trayectorias aceptables', `${r.evaluadas} trayectorias evaluadas`)}
      ${kpi(n(r.completitud_media, ' %'), 'Completitud media')}
      ${kpi(n(r.error_distancia_medio_pct, ' %'), 'Error de distancia medio', `${r.con_distancia_referencia} con distancia oficial`)}
      ${kpi(n(r.frecuencia_media_hz, ' Hz'), 'Frecuencia de muestreo', `${n(r.puntos_medios)} puntos por trayectoria`)}
      ${kpi(n(r.precision_media_m, ' m'), 'Precisión del dispositivo', `${r.saltos_imposibles} saltos · ${r.huecos} huecos de señal`)}
      ${kpi(n(r.procesamiento_medio_ms, ' ms'), 'Procesamiento medio')}
    </div>
    <div class="card">${tabla(r.lista, [
    { titulo: 'Fecha', valor: (x) => fecha(x.fecha) },
    { titulo: 'Deportista', valor: (x) => html`${x.deportista}<div class="small text-muted">${x.prueba}</div>` },
    { titulo: 'Puntos', valor: (x) => html`${x.puntos_validos}/${x.puntos_recibidos}<div class="small text-muted">${x.completitud_pct} %</div>`, clase: 'text-end' },
    { titulo: 'Muestreo', valor: (x) => n(x.frecuencia_hz, ' Hz') },
    { titulo: 'Distancia', valor: (x) => html`${n(x.distancia_medida_m, ' m')}${x.distancia_referencia_m ? html`<div class="small text-muted">oficial ${x.distancia_referencia_m} m · error ${x.error_distancia_pct} %</div>` : ''}` },
    { titulo: 'Incidencias', valor: (x) => (x.saltos_imposibles || x.huecos ? html`<span class="text-danger small">${x.saltos_imposibles} saltos · ${x.huecos} huecos</span>` : html`<span class="small text-muted">Ninguna</span>`) },
    { titulo: 'Calidad', valor: (x) => (x.aceptable ? insignia('Aceptable', 'success') : insignia('Revisar', 'danger')) },
  ])}</div>${metodo(r.metodo)}`
    : html`<div class="card"><div class="card-body">${vacio('Todavía no llegaron trayectorias GPS en este periodo.', 'geo-alt')}
      <p class="small text-muted text-center mb-0">Registra un dispositivo en <a href="#/integraciones">Integraciones</a> y envía las mediciones con el campo <code>gps</code>
      (lista de puntos <code>{ lat, lon, t, acc }</code>). La calidad de cada trayectoria se calcula al recibirla.</p></div></div>${metodo(r.metodo)}`;
  return { contenido, despues: () => {} };
}

function usabilidad(u) {
  const contenido = html`
    <div class="row g-3 mb-3">
      ${kpi(n(u.media), 'Puntaje SUS medio', u.interpretacion ? `${u.interpretacion.adjetivo} (grado ${u.interpretacion.grado})` : 'Sin respuestas')}
      ${kpi(u.ic95 ? `${u.ic95[0]} – ${u.ic95[1]}` : '—', 'IC 95 %', `DE ${n(u.de)}`)}
      ${kpi(u.n, 'Personas que respondieron', 'Cuenta la última respuesta de cada una')}
      ${kpi(n(u.pct_sobre_68, ' %'), 'Con SUS ≥ 68')}
      ${kpi(n(u.alfa_cronbach), 'Alfa de Cronbach', u.fiabilidad ? `Fiabilidad ${u.fiabilidad}` : 'Requiere 3 respuestas')}
    </div>
    ${u.n ? html`<div class="row g-3 mb-3">
      <div class="col-lg-7">${tarjeta('Media por pregunta (1-5)', html`<div style="height:320px"><canvas data-g-items></canvas></div>
        <p class="small text-muted mb-0">En las preguntas impares lo deseable es un valor alto; en las pares (redactadas en negativo), uno bajo.</p>`)}</div>
      <div class="col-lg-5">${tarjeta('Por rol', tabla(u.por_rol, [{ titulo: 'Rol', valor: (x) => t(x.rol) }, { titulo: 'n', valor: (x) => x.n }, { titulo: 'SUS medio', valor: (x) => x.media }]))}
        <div class="mt-3">${comentarios(u.comentarios)}</div></div>
    </div>` : ''}
    ${metodo(u.metodo)}`;
  return {
    contenido,
    despues: (v) => {
      const lienzo = v.querySelector('[data-g-items]');
      if (lienzo) barrasLibres(lienzo, u.items.map((_, i) => `P${i + 1}`), u.items.map((x) => x.media), { color: u.items.map((_, i) => (i % 2 ? COLORES.amarillo : COLORES.acento)), etiqueta: 'Media' });
    },
  };
}

const comentarios = (lista) => (lista.length ? tarjeta('Comentarios (anónimos)', html`<ul class="list-unstyled mb-0 small">${lista.map((c) => html`<li class="mb-2">
  <i class="bi bi-chat-left-quote me-1 text-muted"></i>${c.comentario}<div class="text-muted">${t(c.rol) || c.tipo || ''} · ${fecha(c.fecha)}${c.utilidad ? ` · utilidad ${c.utilidad}/5` : ''}</div></li>`)}</ul>`) : '');

function reportes(r) {
  const contenido = html`
    <div class="row g-3 mb-3">
      ${kpi(n(r.efectividad), 'Índice de efectividad (0-100)')}
      ${kpi(n(r.tasa_exito, ' %'), 'Generados sin error', `${r.exitosos} de ${r.generados}`)}
      ${kpi(r.utilidad_media === null ? '—' : `${r.utilidad_media}/5`, 'Utilidad percibida', `${r.valorados} valoraciones (${n(r.pct_valorados, ' %')})`)}
      ${kpi(n(r.pct_apoyo_decision, ' %'), 'Ayudaron a tomar una decisión')}
      ${kpi(n(r.duracion_media_ms, ' ms'), 'Tiempo medio de generación', `p95 ${n(r.duracion_p95_ms, ' ms')} · ${r.usuarios} personas`)}
    </div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="card">${tabla(r.por_tipo, [
    { titulo: 'Reporte', valor: (x) => html`<span class="text-capitalize">${x.tipo}</span>` },
    { titulo: 'Generados', valor: (x) => x.generados, clase: 'text-end' },
    { titulo: 'Éxito', valor: (x) => n(x.exito, ' %'), clase: 'text-end' },
    { titulo: 'Utilidad', valor: (x) => (x.utilidad === null ? '—' : `${x.utilidad}/5`), clase: 'text-end' },
    { titulo: 'Valorados', valor: (x) => x.valorados, clase: 'text-end' },
  ], { vacio: 'No se generaron reportes en el periodo.' })}</div></div>
      <div class="col-lg-5">${comentarios(r.comentarios)}</div>
    </div>
    ${metodo(r.metodo)}`;
  return { contenido, despues: () => {} };
}

function aceptacion(a) {
  const contenido = html`
    <div class="row g-3 mb-3">
      ${kpi(n(a.media), 'TAM global (0-100)', a.nivel ? `Aceptación ${t(a.nivel).toLowerCase()}` : 'Sin respuestas')}
      ${kpi(a.ic95 ? `${a.ic95[0]} – ${a.ic95[1]}` : '—', 'IC 95 %', `DE ${n(a.de)}`)}
      ${kpi(a.n, 'Personas que respondieron')}
      ${kpi(n(a.uso.pct_activos, ' %'), 'Uso real: activos en 30 días', `${a.uso.activos_30d} de ${a.uso.miembros} cuentas`)}
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-7"><div class="card">${tabla(a.constructos, [
    { titulo: 'Constructo', valor: (x) => html`<span class="fw-semibold">${x.nombre}</span>` },
    { titulo: 'Media (1-7)', valor: (x) => n(x.media_likert), clase: 'text-end' },
    { titulo: 'Puntaje (0-100)', valor: (x) => n(x.media), clase: 'text-end' },
    { titulo: 'IC 95 %', valor: (x) => (x.ic95 ? `${x.ic95[0]} – ${x.ic95[1]}` : '—') },
    { titulo: 'α de Cronbach', valor: (x) => (x.alfa_cronbach === null ? '—' : html`${x.alfa_cronbach} <span class="small text-muted">${x.fiabilidad}</span>`) },
  ])}</div></div>
      <div class="col-lg-5">${tarjeta('Por rol', tabla(a.por_rol, [{ titulo: 'Rol', valor: (x) => t(x.rol) }, { titulo: 'n', valor: (x) => x.n }, { titulo: 'TAM medio', valor: (x) => x.media }], { vacio: 'Sin respuestas.' }))}</div>
    </div>
    ${comentarios(a.comentarios)}
    ${metodo(a.metodo)}`;
  return { contenido, despues: () => {} };
}

// ---------------------------------------------------------------------------
// Registro de lesiones
// ---------------------------------------------------------------------------
const opcionesDe = (lista) => lista.map((v) => ({ valor: v, texto: t(v) }));

export async function lesionesVista(vista, { query }) {
  const estado = query.get('estado') || '';
  const [lista, { datos: deportistas }, cat] = await Promise.all([
    api.get(`/lesiones${consulta({ estado })}`), api.get('/deportistas'), api.get('/lesiones/catalogos'),
  ]);
  const gestiona = puede('lesiones.gestionar');
  const hoy = new Date().toLocaleDateString('en-CA');
  const defs = [
    { nombre: 'fecha_inicio', etiqueta: 'Fecha de la lesión', tipo: 'fecha', requerido: true, defecto: hoy, max: hoy },
    { nombre: 'fecha_alta', etiqueta: 'Fecha de alta', tipo: 'fecha', max: hoy, ayuda: 'Déjala vacía si sigue lesionado.' },
    { nombre: 'zona', etiqueta: 'Zona del cuerpo', requerido: true, placeholder: 'Ej.: tobillo derecho', maxLargo: 80 },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', vacia: false, opciones: opcionesDe(cat.tipos), defecto: 'muscular' },
    { nombre: 'mecanismo', etiqueta: 'Mecanismo', tipo: 'select', opciones: opcionesDe(cat.mecanismos) },
    { nombre: 'contexto', etiqueta: 'Contexto', tipo: 'select', vacia: false, opciones: opcionesDe(cat.contextos), defecto: 'entrenamiento' },
    { nombre: 'recurrente', etiqueta: 'Es una recaída (misma zona y tipo)', tipo: 'check' },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', col: 'col-12', maxLargo: 500 },
  ];

  montar(vista, html`
    ${encabezado('bandaid', 'Lesiones', 'Registro para calcular la incidencia por 1000 h de exposición. Seguimiento deportivo, no historial clínico.',
    gestiona ? html`<button class="btn btn-primary" data-nueva><i class="bi bi-plus-lg me-1"></i>Registrar lesión</button>` : '')}
    <div class="card mb-3"><div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
      <select class="form-select form-select-sm w-auto" data-estado>
        ${[['', 'Todas'], ['en_curso', 'En curso'], ['alta', 'Con alta']].map(([v, texto]) => html`<option value="${v}" ${v === estado ? 'selected' : ''}>${texto}</option>`)}
      </select>
      ${puede('indicadores.ver') ? html`<a class="btn btn-sm btn-light ms-auto" href="#/indicadores?t=lesiones"><i class="bi bi-clipboard-data me-1"></i>Ver incidencia</a>` : ''}
    </div></div>
    <div class="card">${tabla(lista, [
    { titulo: 'Fecha', valor: (x) => fecha(x.fecha_inicio) },
    { titulo: 'Deportista', valor: (x) => html`<a href="#/deportistas/${x.deportista_id}">${x.deportista}</a> <span class="small text-muted">${x.codigo}</span>` },
    { titulo: 'Lesión', valor: (x) => html`<span class="fw-semibold">${x.zona}</span>${x.recurrente ? html` <span class="badge text-bg-warning">Recaída</span>` : ''}
      <div class="small text-muted">${t(x.tipo)} · ${x.mecanismo ? t(x.mecanismo) : 'mecanismo sin dato'} · ${t(x.contexto)}</div>` },
    { titulo: 'Baja', valor: (x) => html`${x.dias_baja} días<div class="small text-muted">${x.en_curso ? 'en curso' : t(x.gravedad)}</div>` },
    { titulo: 'Estado', valor: (x) => (x.en_curso ? insignia('Lesionado', 'danger') : html`${insignia('Alta', 'success')} <span class="small text-muted">${fecha(x.fecha_alta)}</span>`) },
  ], {
    acciones: (x) => (gestiona ? html`${x.en_curso ? html`<button class="btn btn-sm btn-success" data-alta="${x.id}" title="Dar el alta hoy"><i class="bi bi-check2-circle me-1"></i>Alta</button>` : ''}
      <button class="btn btn-sm btn-light" data-editar="${x.id}" title="Editar"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-light text-danger" data-borrar="${x.id}" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''),
    vacio: 'No hay lesiones registradas.',
  })}</div>`);

  vista.querySelector('[data-estado]').addEventListener('change', (e) => ir(`/lesiones${e.target.value ? `?estado=${e.target.value}` : ''}`));
  const formulario = (lesion = null) => modalFormulario({
    titulo: lesion ? `Editar lesión de ${lesion.deportista}` : 'Registrar lesión',
    tamano: 'modal-lg',
    cuerpo: html`${lesion ? '' : html`<div class="mb-3"><label class="form-label small fw-semibold">Deportista *</label>
      <select class="form-select" name="deportista_id" required>${opcionesDeportistas(deportistas, '')}</select></div>`}${campos(defs, lesion || {})}`,
    alGuardar: async (datos) => {
      const cuerpo = { ...limpiar(defs, datos), recurrente: datos.recurrente === true };
      if (lesion) await api.put(`/lesiones/${lesion.id}`, cuerpo);
      else await api.post('/lesiones', { ...cuerpo, deportista_id: Number(datos.deportista_id) });
      avisar(lesion ? 'Lesión actualizada.' : 'Lesión registrada.');
      recargarVista();
    },
  });
  vista.querySelector('[data-nueva]')?.addEventListener('click', () => formulario());
  vista.addEventListener('click', async (e) => {
    const alta = e.target.closest('[data-alta]');
    const editar = e.target.closest('[data-editar]');
    const borrar = e.target.closest('[data-borrar]');
    try {
      if (alta) {
        await conCarga(alta, () => api.put(`/lesiones/${alta.dataset.alta}`, { fecha_alta: hoy }));
        avisar('Alta registrada.');
        recargarVista();
      } else if (editar) {
        formulario(lista.find((x) => x.id === Number(editar.dataset.editar)));
      } else if (borrar && await confirmar('¿Eliminar este registro de lesión? Dejará de contar para la incidencia.', { peligro: true, boton: 'Eliminar' })) {
        await api.delete(`/lesiones/${borrar.dataset.borrar}`);
        avisar('Registro eliminado.');
        recargarVista();
      }
    } catch (error) {
      mostrarError(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Cuestionarios SUS y TAM
// ---------------------------------------------------------------------------
function escalaLikert(nombre, indice, { min, max, minimo, maximo }, pregunta) {
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return html`<fieldset class="pregunta-likert mb-3">
    <legend class="small fw-semibold mb-2"><span class="text-muted me-1">${indice}.</span>${pregunta}</legend>
    <div class="escala-likert" role="radiogroup">
      <span class="extremo">${minimo}</span>
      ${valores.map((v) => html`<label class="opcion-likert"><input type="radio" class="btn-check" name="${nombre}" value="${v}" required autocomplete="off">
        <span class="btn btn-outline-primary btn-sm">${v}</span></label>`)}
      <span class="extremo">${maximo}</span>
    </div></fieldset>`;
}

export async function encuestasVista(vista, { query }) {
  const { catalogo, estado } = await api.get('/encuestas');
  const activo = ['SUS', 'TAM'].includes(query.get('c')) ? query.get('c') : null;

  if (!activo) {
    montar(vista, html`
      ${encabezado('ui-checks', 'Evalúa la plataforma', 'Dos cuestionarios breves y anónimos: tus respuestas solo se muestran agregadas.')}
      <div class="row g-3">${['SUS', 'TAM'].map((clave) => {
    const c = catalogo[clave];
    const e = estado[clave];
    return html`<div class="col-md-6"><div class="card h-100"><div class="card-body d-flex flex-column">
          <div class="d-flex align-items-center gap-2 mb-2"><span class="icono-indicador"><i class="bi bi-${clave === 'SUS' ? 'ui-checks' : 'hand-thumbs-up'}"></i></span>
            <h3 class="h6 fw-bold mb-0">${c.nombre}</h3></div>
          <p class="small text-muted">${c.items.length} preguntas · escala de ${c.escala.min} a ${c.escala.max} · unos 2 minutos.</p>
          <p class="small mb-3">${e.ultima ? html`<i class="bi bi-check-circle-fill text-success me-1"></i>Lo respondiste el ${fecha(e.ultima)}. Puedes volver a responderlo si cambió tu opinión.`
    : html`<i class="bi bi-circle me-1 text-muted"></i>Aún no lo respondiste.`}</p>
          <a class="btn btn-primary mt-auto" href="#/encuestas?c=${clave}">${e.ultima ? 'Responder de nuevo' : 'Responder'}</a>
        </div></div></div>`;
  })}</div>`);
    return;
  }

  const c = catalogo[activo];
  const preguntas = activo === 'TAM'
    ? c.constructos.map((con, k) => {
      const previos = c.constructos.slice(0, k).reduce((s, x) => s + x.items.length, 0);
      return html`<h3 class="h6 fw-bold mt-3 mb-3">${con.nombre}</h3>${con.items.map((texto, i) => escalaLikert(`p${previos + i}`, previos + i + 1, c.escala, texto))}`;
    })
    : c.items.map((texto, i) => escalaLikert(`p${i}`, i + 1, c.escala, texto));

  montar(vista, html`
    ${encabezado('ui-checks', c.nombre, c.descripcion, html`<a class="btn btn-light" href="#/encuestas"><i class="bi bi-arrow-left me-1"></i>Volver</a>`)}
    <form class="card" novalidate data-encuesta><div class="card-body">
      <div class="alert alert-danger d-none" data-error role="alert"></div>
      ${preguntas}
      <label class="form-label small fw-semibold mt-2" for="comentario-encuesta">Comentario (opcional)</label>
      <textarea class="form-control mb-3" id="comentario-encuesta" name="comentario" rows="2" maxlength="1000" placeholder="¿Qué mejorarías?"></textarea>
      <button class="btn btn-primary" type="submit"><i class="bi bi-send me-1"></i>Enviar respuestas</button>
    </div></form>`);

  const form = vista.querySelector('[data-encuesta]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const caja = form.querySelector('[data-error]');
    const respuestas = c.items.map((_, i) => Number(form.querySelector(`input[name="p${i}"]:checked`)?.value || 0));
    const faltan = respuestas.map((v, i) => (v ? null : i + 1)).filter(Boolean);
    if (faltan.length) {
      montar(caja, html`<i class="bi bi-exclamation-triangle-fill me-1"></i>Te falta responder: ${faltan.join(', ')}.`);
      caja.classList.remove('d-none');
      form.querySelector(`input[name="p${faltan[0] - 1}"]`)?.closest('fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    try {
      const r = await conCarga(form.querySelector('[type="submit"]'), () => api.post(`/encuestas/${activo}`, { respuestas, comentario: form.comentario.value }));
      avisar(`¡Gracias! Tu puntaje ${activo} fue ${Math.round(r.puntaje)}/100.`);
      ir('/encuestas');
    } catch (error) {
      montar(caja, html`<i class="bi bi-exclamation-triangle-fill me-1"></i>${error.message}`);
      caja.classList.remove('d-none');
    }
  });
}

// ---------------------------------------------------------------------------
// Valoración rápida de un reporte recién descargado (indicador "efectividad de los reportes")
// ---------------------------------------------------------------------------
export function pedirValoracion(id) {
  if (!id) return;
  try {
    if (sessionStorage.getItem('valoracion-omitida') === '1') return;
  } catch { /* almacenamiento no disponible */ }
  const elemento = modalFormulario({
    titulo: '¿Te fue útil este reporte?',
    boton: 'Enviar valoración',
    cuerpo: html`<p class="small text-muted">Una valoración de 5 segundos nos ayuda a medir la efectividad de los reportes.</p>
      <div class="d-flex gap-1 mb-3 justify-content-center" role="radiogroup" aria-label="Utilidad de 1 a 5">
        ${[1, 2, 3, 4, 5].map((v) => html`<label><input type="radio" class="btn-check" name="utilidad" value="${v}" required autocomplete="off">
          <span class="btn btn-outline-warning"><i class="bi bi-star-fill"></i> ${v}</span></label>`)}
      </div>
      <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="apoyo_decision" id="apoyo-decision">
        <label class="form-check-label" for="apoyo-decision">Me ayudó a tomar una decisión (entrenamiento, carga, comunicación con familias…)</label></div>
      <textarea class="form-control" name="comentario" rows="2" maxlength="500" placeholder="Comentario (opcional)"></textarea>
      <button type="button" class="btn btn-link btn-sm px-0 mt-2" data-omitir data-bs-dismiss="modal">No volver a preguntar en esta sesión</button>`,
    alGuardar: async (datos) => {
      if (!datos.utilidad) throw new Error('Elige de 1 a 5 estrellas');
      await api.put(`/reportes/uso/${id}/valoracion`, { utilidad: Number(datos.utilidad), apoyo_decision: datos.apoyo_decision === true, comentario: datos.comentario });
      avisar('¡Gracias por tu valoración!');
    },
  });
  elemento.querySelector('[data-omitir]').addEventListener('click', () => {
    try { sessionStorage.setItem('valoracion-omitida', '1'); } catch { /* sin almacenamiento */ }
  });
}
