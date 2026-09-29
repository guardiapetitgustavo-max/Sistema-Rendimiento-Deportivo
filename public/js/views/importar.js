/** Importación de evaluaciones desde Excel: subir → revisar vista previa → confirmar. */
import { api } from '../api.js';
import { html, montar, encabezado, vacio, avisar, mostrarError, conCarga } from '../ui.js';
import { ir } from '../navegacion.js';
import { esAdmin, coachElegido, nombreCoach } from '../sesion.js';

const TAMANO_MAXIMO = 4 * 1024 * 1024;

const ESTRUCTURA = [
  ['codigo', 'Obligatorio. Código único del deportista (ej. DEP-001)'],
  ['nombre', 'Obligatorio. Nombre completo'],
  ['edad, categoria, disciplina', 'Opcionales. Datos del deportista'],
  ['fecha', 'DD/MM/AAAA. Si falta se usa la fecha de hoy'],
  ['velocidad … asistencia', '8 capacidades en escala 0-100'],
  ['puntuacion_general', 'Opcional. Si está vacía se calcula el promedio'],
  ['observaciones', 'Opcional. Comentarios del coach'],
];

function vistaPrevia(contenedor, resultado) {
  const columnas = resultado.columnas_detectadas;
  montar(contenedor, html`
    <div class="card mb-3"><div class="card-header"><i class="bi bi-2-circle me-2"></i>Paso 2 · Revisar y confirmar</div>
      <div class="card-body">
        <div class="row g-3 mb-3 text-center">
          <div class="col-4"><div class="valor-dato">${resultado.total_filas}</div><div class="etiqueta-dato">Filas leídas</div></div>
          <div class="col-4"><div class="valor-dato text-success">${resultado.filas_validas}</div><div class="etiqueta-dato">Válidas</div></div>
          <div class="col-4"><div class="valor-dato text-danger">${resultado.filas_con_error}</div><div class="etiqueta-dato">Con errores</div></div>
        </div>
        ${resultado.columnas_extra.length ? html`<div class="alert alert-info small py-2">
          <i class="bi bi-info-circle me-1"></i>Columnas no reconocidas (se ignoran): <b>${resultado.columnas_extra.join(', ')}</b></div>` : ''}
        ${resultado.errores.length ? html`<div class="alert alert-warning small">
          <div class="fw-semibold mb-1"><i class="bi bi-exclamation-triangle me-1"></i>Filas con errores (no se importarán):</div>
          <div class="table-responsive" style="max-height:220px"><table class="table table-sm mb-0">
            <thead><tr><th>Fila</th><th>Columna</th><th>Problema</th></tr></thead>
            <tbody>${resultado.errores.map((e) => html`<tr><td>${e.fila}</td><td>${e.columna}</td><td>${e.mensaje}</td></tr>`)}</tbody>
          </table></div></div>` : ''}
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="baja-ausentes">
          <label class="form-check-label small" for="baja-ausentes">Dar de baja a los deportistas que <b>no</b> aparecen en este Excel
            (su información se conserva y se reactivan si vuelven a aparecer).</label>
        </div>
        <button class="btn btn-success" data-confirmar ${resultado.filas_validas ? '' : 'disabled'}>
          <i class="bi bi-check2-circle me-1"></i>${resultado.filas_validas ? `Importar ${resultado.filas_validas} fila(s) válida(s)` : 'Sin filas válidas para importar'}
        </button>
      </div>
    </div>
    <div class="card"><div class="card-header small">Vista previa (primeras ${resultado.vista_previa.length} filas)</div>
      <div class="card-body p-0"><div class="table-responsive" style="max-height:420px">
        <table class="table table-sm table-striped mb-0 small">
          <thead class="table-light"><tr><th>Fila</th>${columnas.map((c) => html`<th>${c}</th>`)}</tr></thead>
          <tbody>${resultado.vista_previa.map((f) => html`<tr><td>${f.fila}</td>${columnas.map((c) => html`<td>${f[c]}</td>`)}</tr>`)}</tbody>
        </table>
      </div></div>
    </div>`);

  contenedor.querySelector('[data-confirmar]')?.addEventListener('click', async (e) => {
    try {
      const respuesta = await conCarga(e.currentTarget, () => api.post('/importacion/confirmar', {
        registros: resultado.registros,
        baja_ausentes: contenedor.querySelector('#baja-ausentes').checked,
      }));
      avisar(respuesta.mensaje);
      ir('/dashboard');
    } catch (error) {
      mostrarError(error);
    }
  });
}

export function render(vista) {
  // Los deportistas importados pertenecen a un coach: el administrador debe elegir cuál
  if (esAdmin() && !coachElegido()) {
    montar(vista, html`
      ${encabezado('cloud-arrow-up', 'Importar Excel', 'Carga evaluaciones de varios deportistas de una sola vez')}
      <div class="card"><div class="card-body text-center py-5">
        <div class="estado-vacio pb-2"><div class="icono"><i class="bi bi-person-badge"></i></div></div>
        <h3 class="h5 fw-bold">Elige primero un coach</h3>
        <p class="text-muted mb-0">Los deportistas del Excel se asignarán al coach que elijas en el selector de la barra superior.</p>
      </div></div>`);
    return;
  }
  montar(vista, html`
    ${encabezado('cloud-arrow-up', 'Importar Excel', esAdmin()
    ? `Los deportistas se asignarán a ${nombreCoach(coachElegido()) || 'el coach elegido'}`
    : 'Carga evaluaciones de varios deportistas de una sola vez', html`
      <button class="btn btn-outline-success" data-plantilla><i class="bi bi-download me-1"></i>Descargar plantilla</button>`)}
    <div class="row g-3 mb-3">
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-1-circle me-2"></i>Paso 1 · Seleccionar archivo</div>
        <div class="card-body">
          <form data-subir>
            <label class="zona-archivo mb-3" data-zona>
              <i class="bi bi-file-earmark-spreadsheet fs-1 d-block mb-2"></i>
              <span class="fw-semibold d-block" data-nombre-archivo>Arrastra tu Excel aquí o haz clic para elegirlo</span>
              <span class="small text-muted">Formato .xlsx · máximo 4 MB</span>
              <input class="visually-hidden" type="file" name="archivo" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required>
            </label>
            <button class="btn btn-primary w-100"><i class="bi bi-upload me-1"></i>Subir y previsualizar</button>
          </form>
          <p class="small text-muted mt-3 mb-0">Solo archivos .xlsx de hasta 4 MB. Se reconocen encabezados con tildes, mayúsculas y alias
            comunes (ej. "Fecha de Evaluación", "Deporte", "Nombres"). Nada se guarda hasta que confirmes.</p>
        </div>
      </div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header"><i class="bi bi-table me-2"></i>Estructura esperada</div>
        <div class="card-body p-0"><table class="table table-sm mb-0 small">
          <tbody>${ESTRUCTURA.map(([c, d]) => html`<tr><td class="fw-semibold text-nowrap">${c}</td><td>${d}</td></tr>`)}</tbody>
        </table></div>
      </div></div>
    </div>
    <div data-resultado>${vacio('Sube un archivo para ver la vista previa', 'file-earmark-arrow-up')}</div>`);

  const resultado = vista.querySelector('[data-resultado]');
  const zona = vista.querySelector('[data-zona]');
  const entrada = zona.querySelector('input');
  const mostrarNombre = () => {
    zona.querySelector('[data-nombre-archivo]').textContent = entrada.files[0]?.name || 'Arrastra tu Excel aquí o haz clic para elegirlo';
  };
  entrada.addEventListener('change', mostrarNombre);
  ['dragenter', 'dragover'].forEach((evento) => zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.add('activa'); }));
  ['dragleave', 'drop'].forEach((evento) => zona.addEventListener(evento, () => zona.classList.remove('activa')));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files.length) return;
    entrada.files = e.dataTransfer.files;
    mostrarNombre();
  });
  vista.querySelector('[data-plantilla]').addEventListener('click', () => api.descargar('/importacion/plantilla').catch(mostrarError));
  vista.querySelector('[data-subir]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const archivo = e.target.archivo.files[0];
    if (!archivo) return avisar('Selecciona un archivo .xlsx', 'warning');
    if (!archivo.name.toLowerCase().endsWith('.xlsx')) return avisar('El archivo debe ser de Excel (.xlsx). Si tienes .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.', 'warning');
    if (archivo.size > TAMANO_MAXIMO) return avisar('El archivo supera los 4 MB. Divide la planilla en partes más pequeñas.', 'warning');
    if (archivo.size === 0) return avisar('El archivo está vacío.', 'warning');
    const datos = new FormData();
    datos.append('archivo', archivo);
    try {
      const respuesta = await conCarga(e.target.querySelector('button'), () => api.post('/importacion/previsualizar', datos));
      vistaPrevia(resultado, respuesta);
      resultado.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      mostrarError(error);
    }
    return undefined;
  });
}
