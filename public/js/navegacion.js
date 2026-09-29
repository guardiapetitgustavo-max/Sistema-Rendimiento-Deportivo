/** Navegación compartida por todas las vistas (evita dependencias circulares con main.js). */
export const ir = (ruta) => {
  window.location.hash = `#${ruta}`;
};

export function actualizarAlertas(total) {
  const insignia = document.getElementById('insignia-alertas');
  if (!insignia) return;
  insignia.textContent = total;
  insignia.classList.toggle('d-none', !total);
}

/** Vuelve a cargar la pantalla actual con datos frescos (tras guardar o borrar algo). */
export function recargarVista() {
  window.dispatchEvent(new CustomEvent('recargar-vista'));
}
