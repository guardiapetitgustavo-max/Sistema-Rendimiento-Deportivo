/** Portada pública (página de presentación del producto) con escena 3D. */
import { html, montar, activarInclinacion } from '../ui.js';
import { iniciarEscena } from '../escena3d.js';

const FUNCIONES = [
  { icono: 'clipboard2-pulse', color: 'azul', titulo: 'Evaluación por observación', texto: '8 capacidades en escala 0-100: velocidad, resistencia, fuerza, agilidad, coordinación, técnica, disciplina y asistencia.' },
  { icono: 'cloud-arrow-up', color: 'cian', titulo: 'Importación desde Excel', texto: 'Sube la planilla de tu academia, revisa los errores fila por fila y confirma. Reconoce tildes, mayúsculas y alias.' },
  { icono: 'bell', color: 'ambar', titulo: 'Alertas automáticas', texto: 'Detecta rendimiento bajo, caídas entre periodos y capacidades en nivel crítico sin que tengas que buscarlas.' },
  { icono: 'cpu', color: 'violeta', titulo: 'Machine Learning', texto: 'Un modelo Random Forest clasifica el nivel de cada deportista y muestra qué capacidades pesan más.' },
  { icono: 'stars', color: 'azul', titulo: 'Asistente IA del coach', texto: 'Recomendaciones personalizadas y un Modo Automático que completa datos, entrena y predice en un clic.' },
  { icono: 'calendar-week', color: 'verde', titulo: 'Rutinas por deporte', texto: 'Rutina semanal según la disciplina y las debilidades de cada deportista, descargable en PDF.' },
  { icono: 'cup-hot', color: 'cian', titulo: 'Alimentación y descanso', texto: 'Registra comidas, hidratación y horas de sueño para relacionarlos con el rendimiento.' },
  { icono: 'file-earmark-bar-graph', color: 'violeta', titulo: 'Reportes profesionales', texto: 'General, ranking, evolución, seguimiento, estadísticas e individual, en Excel y PDF.' },
];

const CIFRAS = [
  { valor: '8', texto: 'capacidades evaluadas' },
  { valor: '14', texto: 'plantillas de rutina por deporte y familia' },
  { valor: '6', texto: 'reportes en Excel y PDF' },
  { valor: '1 clic', texto: 'para completar, entrenar y predecir' },
];

const PASOS = [
  { titulo: 'Carga a tus deportistas', texto: 'Regístralos uno a uno o importa tu Excel con todas las evaluaciones de la temporada.' },
  { titulo: 'Analiza en segundos', texto: 'El dashboard, las alertas y el modelo de Machine Learning te muestran quién necesita atención.' },
  { titulo: 'Actúa con un plan', texto: 'Genera rutinas por deporte, recomendaciones y reportes para compartir con tu equipo y las familias.' },
];

const SEGURIDAD = [
  'Contraseñas cifradas y sesiones protegidas',
  'Cada coach ve únicamente a sus deportistas',
  'Historial permanente: las bajas no borran datos',
  'Respaldo descargable de toda tu información',
];

export async function render(contenedor, { usuario }) {
  const botonesAcceso = usuario
    ? html`<a class="btn btn-primary btn-brillo" href="#/dashboard">Ir a mi panel <i class="bi bi-arrow-right ms-1"></i></a>`
    : html`<a class="btn btn-primary btn-brillo" href="#/login">Iniciar sesión <i class="bi bi-box-arrow-in-right ms-1"></i></a>`;

  montar(contenedor, html`
    <div class="publico" data-bs-theme="dark">
      <nav class="nav-publica" id="nav-publica">
        <div class="container d-flex align-items-center gap-3">
          <a class="d-flex align-items-center gap-2 text-white fw-bold fs-5" href="#/">
            <span class="logo-marca"><i class="bi bi-lightning-charge-fill"></i></span>SportEval AI
          </a>
          <div class="d-none d-lg-flex gap-4 ms-4">
            <a href="#/" data-ir-a="funciones">Funciones</a>
            <a href="#/" data-ir-a="como-funciona">Cómo funciona</a>
            <a href="#/" data-ir-a="seguridad">Seguridad</a>
          </div>
          <div class="ms-auto d-flex align-items-center gap-2">${botonesAcceso}</div>
        </div>
      </nav>

      <header class="heroe">
        <div class="escena" id="escena-portada"><canvas aria-hidden="true"></canvas><div class="rejilla-fondo"></div></div>
        <div class="container position-relative">
          <div class="row align-items-center g-5">
            <div class="col-lg-6">
              <span class="etiqueta-brillante mb-4"><span class="punto-vivo"></span>Para academias, clubes y entrenadores</span>
              <h1 class="mt-3 mb-4">Evalúa, predice y <span class="texto-degradado">potencia el rendimiento</span> de tus deportistas</h1>
              <p class="lead mb-4">SportEval AI reúne evaluaciones, alertas, Machine Learning, rutinas por deporte y reportes
                en una sola plataforma web. Sin instalar nada y desde cualquier dispositivo.</p>
              <div class="d-flex flex-wrap gap-2 mb-4">
                ${usuario
    ? html`<a class="btn btn-primary btn-lg btn-brillo px-4" href="#/dashboard">Ir a mi panel <i class="bi bi-arrow-right ms-1"></i></a>`
    : html`<a class="btn btn-primary btn-lg btn-brillo px-4" href="#/login">Iniciar sesión <i class="bi bi-arrow-right ms-1"></i></a>`}
                <a class="btn btn-outline-light btn-lg px-4" href="#/" data-ir-a="funciones">Ver funciones</a>
              </div>
              <div class="d-flex flex-wrap gap-3 small text-muted">
                <span><i class="bi bi-check2-circle text-success me-1"></i>Funciona en celular y PC</span>
                <span><i class="bi bi-check2-circle text-success me-1"></i>Excel y PDF incluidos</span>
                <span><i class="bi bi-check2-circle text-success me-1"></i>Datos protegidos</span>
              </div>
            </div>
            <div class="col-lg-6 d-none d-md-block">
              <div class="flotantes" aria-hidden="true">
                <div class="chip-flotante"><span class="icono-dato icono-azul"><i class="bi bi-lightning"></i></span>
                  <div><div class="etiqueta-dato">Velocidad</div><div class="valor-dato">82 <small class="text-success fs-6">+6</small></div></div></div>
                <div class="chip-flotante"><span class="icono-dato icono-verde"><i class="bi bi-cpu"></i></span>
                  <div><div class="etiqueta-dato">Nivel predicho</div><div class="valor-dato">Alto <small class="text-muted fs-6">94%</small></div></div></div>
                <div class="chip-flotante"><span class="icono-dato icono-ambar"><i class="bi bi-bell"></i></span>
                  <div><div class="etiqueta-dato">Alerta automática</div><div class="fw-semibold text-white small">Resistencia en nivel crítico</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section class="banda-cifras py-5">
        <div class="container"><div class="row g-4 text-center">
          ${CIFRAS.map((c) => html`<div class="col-6 col-lg-3 revelar"><div class="display-6 fw-bold texto-degradado">${c.valor}</div><div class="text-muted small">${c.texto}</div></div>`)}
        </div></div>
      </section>

      <section class="seccion" id="funciones">
        <div class="container">
          <div class="text-center mb-5 revelar">
            <span class="etiqueta-brillante mb-3">Todo en un solo lugar</span>
            <h2 class="mt-3">Lo que tu academia necesita para decidir con datos</h2>
            <p class="text-muted mx-auto" style="max-width:640px">Deja atrás las planillas sueltas: cada evaluación se suma al historial del deportista y alimenta los análisis.</p>
          </div>
          <div class="row g-4">
            ${FUNCIONES.map((f) => html`<div class="col-md-6 col-lg-3 revelar">
              <article class="tarjeta-funcion"><span class="icono-dato icono-${f.color}"><i class="bi bi-${f.icono}"></i></span>
                <h3>${f.titulo}</h3><p>${f.texto}</p></article></div>`)}
          </div>
        </div>
      </section>

      <section class="seccion pt-0" id="como-funciona">
        <div class="container">
          <div class="text-center mb-5 revelar"><h2>Empieza en tres pasos</h2></div>
          <div class="row g-4">
            ${PASOS.map((p, i) => html`<div class="col-md-4 revelar"><div class="tarjeta-funcion">
              <div class="paso-numero mb-3">${i + 1}</div><h3>${p.titulo}</h3><p>${p.texto}</p></div></div>`)}
          </div>
        </div>
      </section>

      <section class="seccion pt-0" id="seguridad">
        <div class="container"><div class="row g-5 align-items-center">
          <div class="col-lg-5 revelar">
            <h2 class="mb-3">Seguridad y confianza desde el primer día</h2>
            <p class="text-muted">La información de tus deportistas es sensible. SportEval AI la protege y la mantiene disponible cuando la necesitas.</p>
          </div>
          <div class="col-lg-7"><div class="row g-3">
            ${SEGURIDAD.map((s) => html`<div class="col-sm-6 revelar"><div class="tarjeta-funcion d-flex align-items-center gap-3 py-3">
              <i class="bi bi-shield-check fs-4 text-success"></i><span class="fw-semibold">${s}</span></div></div>`)}
          </div></div>
        </div></div>
      </section>

      <section class="seccion pt-0">
        <div class="container"><div class="cta-final revelar">
          <h2 class="text-white mb-3">Tu próxima temporada empieza con datos</h2>
          <p class="text-white-50 mb-4">Tu administrador crea tu cuenta de coach; entra y carga tu primera evaluación en minutos.</p>
          <a class="btn btn-light btn-lg px-4 fw-bold" href="${usuario ? '#/dashboard' : '#/login'}">${usuario ? 'Ir a mi panel' : 'Iniciar sesión'}</a>
        </div></div>
      </section>

      <footer class="py-4 border-top" style="border-color:var(--borde)!important">
        <div class="container d-flex flex-wrap justify-content-between gap-2 small text-muted">
          <span>© ${new Date().getFullYear()} SportEval AI</span>
          <span>Las predicciones y recomendaciones son apoyo para el entrenador, no diagnósticos médicos.</span>
        </div>
      </footer>
    </div>`);

  const nav = contenedor.querySelector('#nav-publica');
  const alDesplazar = () => nav.classList.toggle('con-fondo', window.scrollY > 20);
  window.addEventListener('scroll', alDesplazar, { passive: true });
  alDesplazar();

  contenedor.querySelectorAll('[data-ir-a]').forEach((enlace) => enlace.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(enlace.dataset.irA)?.scrollIntoView({ behavior: 'smooth' });
  }));

  const revelador = new IntersectionObserver((entradas) => entradas.forEach((entrada) => {
    if (entrada.isIntersecting) {
      entrada.target.classList.add('visible');
      revelador.unobserve(entrada.target);
    }
  }), { threshold: 0.15 });
  contenedor.querySelectorAll('.revelar').forEach((el) => revelador.observe(el));
  activarInclinacion(contenedor, '.tarjeta-funcion', 10);

  window.scrollTo({ top: 0 });
  const escena = contenedor.querySelector('#escena-portada');
  const limpiarEscena = await iniciarEscena(escena.querySelector('canvas'), { desplazamientoX: window.innerWidth >= 992 ? 2.2 : 0 });

  return () => {
    window.removeEventListener('scroll', alDesplazar);
    revelador.disconnect();
    limpiarEscena();
  };
}
