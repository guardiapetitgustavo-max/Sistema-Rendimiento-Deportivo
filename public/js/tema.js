/** Tema claro / oscuro. La preferencia se recuerda en este navegador (si está permitido). */
export const temaActual = () => document.documentElement.getAttribute('data-bs-theme') || 'light';

export function alternarTema() {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', nuevo);
  try {
    window.localStorage.setItem('tema', nuevo);
  } catch {
    // Navegación privada o almacenamiento bloqueado: el tema se aplica solo en esta visita
  }
  return nuevo;
}
