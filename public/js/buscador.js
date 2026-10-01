/** Buscador global de deportistas de la barra superior. */
import { api, consulta } from './api.js';
import { html, montar } from './ui.js';

export function activarBuscador(contenedor) {
  const entrada = contenedor.querySelector('input');
  let resultados = null;
  let temporizador = null;
  let ultimaBusqueda = 0;
  let seleccion = -1;

  const cerrar = () => {
    resultados?.remove();
    resultados = null;
    seleccion = -1;
  };

  async function buscar(texto) {
    const turno = ++ultimaBusqueda;
    try {
      const { datos } = await api.get(`/deportistas${consulta({ q: texto })}`);
      if (turno !== ultimaBusqueda || document.activeElement !== entrada) return;
      cerrar();
      resultados = document.createElement('div');
      resultados.className = 'buscador-resultados';
      resultados.setAttribute('role', 'listbox');
      montar(resultados, datos.length ? html`${datos.slice(0, 8).map((d) => html`
        <a href="#/deportistas/${d.id}" role="option"><span><b>${d.nombre}</b> <span class="text-muted small">${d.codigo}</span></span>
          <span class="small text-muted">${d.disciplina || ''}</span></a>`)}`
        : html`<div class="p-3 small text-muted">Sin resultados para “${texto}”.</div>`);
      contenedor.append(resultados);
    } catch {
      cerrar();
    }
  }

  entrada.addEventListener('input', () => {
    clearTimeout(temporizador);
    const texto = entrada.value.trim();
    if (texto.length < 2) return cerrar();
    temporizador = setTimeout(() => buscar(texto), 250);
    return undefined;
  });
  entrada.addEventListener('keydown', (e) => {
    const enlaces = resultados ? [...resultados.querySelectorAll('a')] : [];
    if (e.key === 'Escape') { cerrar(); entrada.blur(); }
    if (!enlaces.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      seleccion = (seleccion + (e.key === 'ArrowDown' ? 1 : -1) + enlaces.length) % enlaces.length;
      enlaces.forEach((a, i) => a.classList.toggle('activo', i === seleccion));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      enlaces[Math.max(0, seleccion)].click();
    }
  });
  contenedor.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      entrada.value = '';
      cerrar();
    }
  });
  entrada.addEventListener('blur', () => setTimeout(cerrar, 180));
}

