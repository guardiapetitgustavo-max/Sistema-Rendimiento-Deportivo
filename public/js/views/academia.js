/**
 * Configuración de la academia (administrador): datos generales, marca (logo y colores) y módulos.
 * Los módulos que todavía no existen se muestran como "Próximamente" y no se pueden activar.
 */
import { api } from '../api.js';
import {
  html, montar, encabezado, avisar, conCarga, datosFormulario, pintarErrorFormulario,
} from '../ui.js';

const MAX_LOGO_BYTES = 200 * 1024;

const campo = (nombre, etiqueta, valor, extra = '', ayuda = '') => html`
  <div class="col-md-6"><label class="form-label small fw-semibold" for="cfg-${nombre}">${etiqueta}</label>
    <input class="form-control" id="cfg-${nombre}" name="${nombre}" value="${valor ?? ''}" ${extra}>
    ${ayuda ? html`<div class="form-text">${ayuda}</div>` : ''}</div>`;

function leerImagen(archivo) {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
      reject(new Error('El logo debe ser una imagen PNG, JPG o WEBP'));
      return;
    }
    if (archivo.size > MAX_LOGO_BYTES) {
      reject(new Error('El logo es demasiado grande (máximo 200 KB)'));
      return;
    }
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
    lector.readAsDataURL(archivo);
  });
}

export async function render(vista) {
  const datos = await api.get('/academia');
  const c = datos.config;
  let logoNuevo; // undefined = sin cambios · null = quitar · string = nuevo

  montar(vista, html`
    ${encabezado('building-gear', 'Configuración de la academia', 'Datos, identidad visual y módulos disponibles para tu equipo')}
    <form data-config novalidate>
      <div class="alert alert-danger d-none" data-error role="alert"></div>
      <div class="row g-3">
        <div class="col-xl-8 d-flex flex-column gap-3">
          <div class="card"><div class="card-header"><i class="bi bi-info-circle me-2"></i>Datos generales</div>
            <div class="card-body"><div class="row g-3">
              ${campo('nombre', 'Nombre de la academia *', datos.nombre, 'required maxlength="120"')}
              ${campo('nombre_comercial', 'Nombre comercial', c.nombre_comercial, 'maxlength="120"', 'Se muestra en el menú y en los reportes.')}
              <div class="col-12"><label class="form-label small fw-semibold" for="cfg-descripcion">Descripción</label>
                <textarea class="form-control" id="cfg-descripcion" name="descripcion" rows="2" maxlength="600">${c.descripcion ?? ''}</textarea></div>
              ${campo('pais', 'País', c.pais, 'maxlength="80"')}
              ${campo('ciudad', 'Ciudad', c.ciudad, 'maxlength="80"')}
              ${campo('direccion', 'Dirección', c.direccion, 'maxlength="200"')}
              ${campo('telefono', 'Teléfono', c.telefono, 'maxlength="40"')}
              ${campo('correo', 'Correo de contacto', c.correo, 'type="email"')}
              ${campo('zona_horaria', 'Zona horaria', c.zona_horaria, 'maxlength="60" list="zonas"', 'Formato IANA, por ejemplo America/Lima.')}
              <datalist id="zonas">${['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Guayaquil', 'America/La_Paz', 'America/Caracas', 'Europe/Madrid']
    .map((z) => html`<option value="${z}"></option>`)}</datalist>
              ${campo('moneda', 'Moneda', c.moneda, 'maxlength="3" style="text-transform:uppercase"', 'Código de 3 letras: PEN, USD, EUR…')}
            </div></div></div>

          <div class="card"><div class="card-header"><i class="bi bi-puzzle me-2"></i>Módulos</div>
            <div class="card-body">
              <p class="small text-muted">Un módulo desactivado desaparece del menú de todos y su información deja de estar accesible (no se borra).</p>
              <div class="row g-2">
                ${datos.catalogo_modulos.map((m) => html`<div class="col-md-6"><label class="tarjeta-modulo ${m.disponible ? '' : 'no-disponible'}">
                  <div class="form-check form-switch m-0">
                    <input class="form-check-input" type="checkbox" role="switch" data-modulo="${m.clave}" ${c.modulos[m.clave] ? 'checked' : ''} ${m.disponible ? '' : 'disabled'}>
                  </div>
                  <div><div class="fw-semibold small">${m.etiqueta}
                    ${m.disponible ? '' : html`<span class="badge text-bg-light border ms-1">Próximamente · fase ${m.fase}</span>`}</div>
                    <div class="small text-muted">${m.descripcion}</div></div>
                </label></div>`)}
              </div>
            </div></div>
        </div>

        <div class="col-xl-4 d-flex flex-column gap-3">
          <div class="card"><div class="card-header"><i class="bi bi-palette me-2"></i>Identidad visual</div>
            <div class="card-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                <div class="vista-logo" data-vista-logo>${datos.tiene_logo
    ? html`<img src="/api/academia/logo?t=${Date.now()}" alt="Logo actual">`
    : html`<i class="bi bi-image text-muted"></i>`}</div>
                <div class="d-grid gap-2 flex-grow-1">
                  <label class="btn btn-light btn-sm mb-0"><i class="bi bi-upload me-1"></i>Subir logo
                    <input type="file" accept="image/png,image/jpeg,image/webp" class="d-none" data-archivo-logo></label>
                  <button type="button" class="btn btn-sm btn-outline-danger" data-quitar-logo ${datos.tiene_logo ? '' : 'disabled'}>Quitar logo</button>
                </div>
              </div>
              <div class="form-text mb-3">PNG, JPG o WEBP de hasta 200 KB. Mejor si es cuadrado.</div>
              <div class="row g-3">
                <div class="col-6"><label class="form-label small fw-semibold" for="cfg-color1">Color principal</label>
                  <input type="color" class="form-control form-control-color w-100" id="cfg-color1" name="color_primario" value="${c.color_primario}"></div>
                <div class="col-6"><label class="form-label small fw-semibold" for="cfg-color2">Color secundario</label>
                  <input type="color" class="form-control form-control-color w-100" id="cfg-color2" name="color_secundario" value="${c.color_secundario}"></div>
              </div>
              <div class="muestra-marca mt-3" data-muestra style="--muestra-1:${c.color_primario};--muestra-2:${c.color_secundario}">
                <span class="fw-bold" data-muestra-nombre>${c.nombre_comercial || datos.nombre}</span>
                <span class="btn btn-sm muestra-boton">Botón principal</span>
              </div>
            </div></div>

          <div class="card"><div class="card-body small text-muted">
            <div><b>Identificador:</b> <code>${datos.slug}</code></div>
            <div><b>Estado:</b> ${datos.estado === 'activa' ? 'Activa' : 'Suspendida'}</div>
          </div></div>
        </div>
      </div>
      <div class="barra-guardar"><button class="btn btn-primary px-4" type="submit"><i class="bi bi-check2 me-1"></i>Guardar configuración</button></div>
    </form>`);

  const formulario = vista.querySelector('[data-config]');
  const caja = formulario.querySelector('[data-error]');
  const vistaLogo = vista.querySelector('[data-vista-logo]');
  const muestra = vista.querySelector('[data-muestra]');

  formulario.addEventListener('input', (e) => {
    if (e.target.name === 'color_primario') muestra.style.setProperty('--muestra-1', e.target.value);
    if (e.target.name === 'color_secundario') muestra.style.setProperty('--muestra-2', e.target.value);
    if (['nombre', 'nombre_comercial'].includes(e.target.name)) {
      vista.querySelector('[data-muestra-nombre]').textContent = formulario.nombre_comercial.value || formulario.nombre.value;
    }
  });

  vista.querySelector('[data-archivo-logo]').addEventListener('change', async (e) => {
    const [archivo] = e.target.files;
    if (!archivo) return;
    try {
      logoNuevo = await leerImagen(archivo);
      montar(vistaLogo, html`<img src="${logoNuevo}" alt="Nuevo logo">`);
      vista.querySelector('[data-quitar-logo]').disabled = false;
    } catch (error) {
      avisar(error.message, 'warning');
    }
    e.target.value = '';
  });
  vista.querySelector('[data-quitar-logo]').addEventListener('click', (e) => {
    logoNuevo = null;
    montar(vistaLogo, html`<i class="bi bi-image text-muted"></i>`);
    e.currentTarget.disabled = true;
  });

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    caja.classList.add('d-none');
    const cuerpo = datosFormulario(formulario);
    cuerpo.modulos = Object.fromEntries([...formulario.querySelectorAll('[data-modulo]:not(:disabled)')]
      .map((m) => [m.dataset.modulo, m.checked]));
    if (logoNuevo !== undefined) cuerpo.logo = logoNuevo;
    try {
      await conCarga(formulario.querySelector('[type=submit]'), () => api.put('/academia', cuerpo));
      avisar('Configuración guardada. Se aplica a toda la academia.');
      window.dispatchEvent(new CustomEvent('sesion-cambiada'));
    } catch (error) {
      pintarErrorFormulario(caja, error);
      caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
