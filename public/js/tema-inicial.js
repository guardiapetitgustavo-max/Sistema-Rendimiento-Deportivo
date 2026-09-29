// Aplica el tema (claro/oscuro) antes de dibujar la página para evitar parpadeos.
(function aplicarTema() {
  var guardado = null;
  try {
    guardado = window.localStorage.getItem('tema');
  } catch (error) {
    guardado = error ? null : guardado; // almacenamiento bloqueado: se usa el tema del sistema
  }
  var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-bs-theme', guardado || (oscuro ? 'dark' : 'light'));
}());
