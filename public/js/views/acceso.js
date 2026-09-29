/**
 * Pantalla pública de inicio de sesión, con escena 3D.
 * No hay registro público: las cuentas de los coaches las crea el administrador.
 */
import { api } from '../api.js';
import { html, montar, conCarga, datosFormulario, pintarErrorFormulario } from '../ui.js';
import { iniciarEscena } from '../escena3d.js';

async function pantalla(contenedor, { titulo, subtitulo, campos, boton, pie, accion, alEntrar }) {
  montar(contenedor, html`
    <div class="publico acceso" data-bs-theme="dark">
      <section class="acceso-visual">
        <div class="escena"><canvas aria-hidden="true"></canvas><div class="rejilla-fondo"></div></div>
        <a class="d-flex align-items-center gap-2 text-white fw-bold fs-5" href="#/">
          <span class="logo-marca"><i class="bi bi-lightning-charge-fill"></i></span>SportEval AI
        </a>
        <div class="d-none-movil" style="max-width:460px">
          <h2 class="display-6 fw-bold mb-3">El rendimiento de tu academia, <span class="texto-degradado">en un solo lugar</span>.</h2>
          <p class="text-muted mb-0">Evaluaciones, alertas, Machine Learning, rutinas y reportes para tomar mejores decisiones cada semana.</p>
        </div>
      </section>
      <section class="acceso-formulario">
        <div class="tarjeta-acceso">
          <h1 class="h3 fw-bold mb-1">${titulo}</h1>
          <p class="text-muted mb-4">${subtitulo}</p>
          <div class="alert alert-danger d-none small" data-error role="alert"></div>
          <form novalidate>
            ${campos}
            <button type="submit" class="btn btn-primary btn-brillo w-100 py-2 mt-2">${boton}</button>
          </form>
          <p class="text-center small mt-4 mb-0 text-muted">${pie}</p>
        </div>
      </section>
    </div>`);

  const formulario = contenedor.querySelector('form');
  const cajaError = contenedor.querySelector('[data-error]');
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    cajaError.classList.add('d-none');
    try {
      const usuario = await conCarga(formulario.querySelector('[type="submit"]'), () => accion(datosFormulario(formulario)));
      if (usuario) alEntrar(usuario);
    } catch (error) {
      pintarErrorFormulario(cajaError, error);
    }
  });
  contenedor.querySelectorAll('[data-ver-clave]').forEach((boton) => boton.addEventListener('click', () => {
    const entrada = boton.parentElement.querySelector('input');
    entrada.type = entrada.type === 'password' ? 'text' : 'password';
    boton.querySelector('i').className = `bi bi-${entrada.type === 'password' ? 'eye' : 'eye-slash'}`;
  }));
  formulario.querySelector('input')?.focus();
  window.scrollTo({ top: 0 });

  return iniciarEscena(contenedor.querySelector('canvas'));
}

const campo = (nombre, etiqueta, icono, tipo = 'text', extra = '') => html`
  <div class="mb-3">
    <label class="form-label small fw-semibold" for="${nombre}">${etiqueta}</label>
    <div class="input-group">
      <span class="input-group-text"><i class="bi bi-${icono}"></i></span>
      <input class="form-control" id="${nombre}" name="${nombre}" type="${tipo}" required ${extra}>
      ${tipo === 'password' ? html`<button class="btn btn-outline-secondary" type="button" data-ver-clave aria-label="Mostrar u ocultar contraseña"><i class="bi bi-eye"></i></button>` : ''}
    </div>
  </div>`;

export function login(contenedor, { alEntrar }) {
  return pantalla(contenedor, {
    titulo: 'Bienvenido de nuevo',
    subtitulo: 'Inicia sesión con la cuenta que te entregó tu administrador.',
    campos: html`${campo('correo', 'Correo electrónico', 'envelope', 'email', 'autocomplete="email"')}
      ${campo('password', 'Contraseña', 'lock', 'password', 'autocomplete="current-password"')}`,
    boton: html`Iniciar sesión <i class="bi bi-arrow-right ms-1"></i>`,
    pie: html`<i class="bi bi-shield-lock me-1"></i>¿No tienes cuenta? Pídesela al administrador de tu academia.`,
    accion: (datos) => api.post('/auth/login', datos),
    alEntrar,
  });
}
