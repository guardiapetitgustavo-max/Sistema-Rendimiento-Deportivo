/**
 * Escena 3D de la portada y del acceso (three.js).
 *
 * Un "balón de datos" (icosaedro facetado con nodos luminosos), dos anillos orbitales
 * como pistas de atletismo y un campo de partículas que reacciona al mouse.
 *
 * Es a prueba de fallos: si el navegador no soporta WebGL, si la librería no carga o si el
 * usuario prefiere menos movimiento, la página sigue funcionando con un fondo estático.
 * Devuelve una función para liberar la memoria de la GPU al cambiar de pantalla.
 */
const COLORES = { primario: 0x4f7cff, cian: 0x22d3ee, lima: 0xb8f34a, violeta: 0x8b5cf6 };

function soportaWebGL() {
  try {
    const lienzo = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (lienzo.getContext('webgl2') || lienzo.getContext('webgl')));
  } catch {
    return false;
  }
}

function crearParticulas(THREE, cantidad, radioMin, radioMax) {
  const posiciones = new Float32Array(cantidad * 3);
  for (let i = 0; i < cantidad; i += 1) {
    const radio = radioMin + Math.random() * (radioMax - radioMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    posiciones[i * 3] = radio * Math.sin(phi) * Math.cos(theta);
    posiciones[i * 3 + 1] = radio * Math.sin(phi) * Math.sin(theta);
    posiciones[i * 3 + 2] = radio * Math.cos(phi);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  const material = new THREE.PointsMaterial({
    color: COLORES.cian, size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometria, material);
}

function crearBalon(THREE) {
  const grupo = new THREE.Group();
  const forma = new THREE.IcosahedronGeometry(1.35, 1);

  const nucleo = new THREE.Mesh(forma, new THREE.MeshStandardMaterial({
    color: 0x0f1b3d, emissive: 0x0b1633, metalness: 0.55, roughness: 0.3, flatShading: true,
  }));
  const aristas = new THREE.LineSegments(
    new THREE.EdgesGeometry(forma),
    new THREE.LineBasicMaterial({ color: COLORES.primario, transparent: true, opacity: 0.9 }),
  );
  const nodos = new THREE.Points(forma, new THREE.PointsMaterial({
    color: COLORES.lima, size: 0.11, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 2),
    new THREE.MeshBasicMaterial({ color: COLORES.cian, wireframe: true, transparent: true, opacity: 0.07 }),
  );
  grupo.add(nucleo, aristas, nodos, halo);
  return grupo;
}

function crearAnillo(THREE, radio, color, inclinacion) {
  const anillo = new THREE.Mesh(
    new THREE.TorusGeometry(radio, 0.012, 8, 160),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
  );
  anillo.rotation.set(inclinacion.x, inclinacion.y, 0);
  const marcador = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    new THREE.MeshBasicMaterial({ color }),
  );
  marcador.position.x = radio;
  anillo.add(marcador);
  return anillo;
}

/**
 * Inicia la escena dentro de `lienzo` (un <canvas>). Devuelve una función de limpieza.
 * `opciones.desplazamientoX` mueve el balón hacia un lado (útil en pantallas partidas).
 */
export async function iniciarEscena(lienzo, { desplazamientoX = 0 } = {}) {
  const contenedor = lienzo.parentElement;
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!soportaWebGL()) {
    contenedor?.classList.add('escena-sin-3d');
    return () => {};
  }

  let THREE;
  try {
    THREE = await import('/vendor/three.module.min.js');
  } catch {
    contenedor?.classList.add('escena-sin-3d');
    return () => {};
  }
  if (!lienzo.isConnected) return () => {};

  let renderizador;
  try {
    renderizador = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    contenedor?.classList.add('escena-sin-3d');
    return () => {};
  }
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const escena = new THREE.Scene();
  escena.fog = new THREE.FogExp2(0x070b18, 0.06);
  const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camara.position.set(0, 0, 7);

  escena.add(new THREE.AmbientLight(0x6b7cff, 0.6));
  const luz1 = new THREE.PointLight(COLORES.cian, 30, 20);
  luz1.position.set(3, 3, 4);
  const luz2 = new THREE.PointLight(COLORES.violeta, 25, 20);
  luz2.position.set(-4, -2, 3);
  escena.add(luz1, luz2);

  const balon = crearBalon(THREE);
  const anillos = [
    crearAnillo(THREE, 2.3, COLORES.cian, { x: 1.2, y: 0.3 }),
    crearAnillo(THREE, 2.9, COLORES.lima, { x: 1.9, y: -0.5 }),
    crearAnillo(THREE, 3.5, COLORES.violeta, { x: 0.9, y: 0.9 }),
  ];
  const centro = new THREE.Group();
  centro.add(balon, ...anillos);
  centro.position.x = desplazamientoX;
  const particulas = crearParticulas(THREE, 1400, 4, 14);
  escena.add(centro, particulas);

  const puntero = { x: 0, y: 0 };
  const alMover = (e) => {
    puntero.x = (e.clientX / window.innerWidth) * 2 - 1;
    puntero.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', alMover, { passive: true });

  function ajustarTamano() {
    const { clientWidth: ancho, clientHeight: alto } = lienzo;
    if (!ancho || !alto) return;
    renderizador.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.position.z = ancho < 640 ? 9 : 7;
    camara.updateProjectionMatrix();
  }
  const observador = new ResizeObserver(ajustarTamano);
  observador.observe(lienzo);
  ajustarTamano();

  let visible = true;
  const vigia = new IntersectionObserver(([entrada]) => { visible = entrada.isIntersecting; });
  vigia.observe(lienzo);

  const inicio = performance.now();
  let cuadro = 0;
  function dibujar() {
    const t = (performance.now() - inicio) / 1000;
    balon.rotation.y = t * 0.25;
    balon.rotation.x = Math.sin(t * 0.3) * 0.25;
    anillos.forEach((anillo, i) => { anillo.rotation.z = t * (0.35 + i * 0.15) * (i % 2 ? -1 : 1); });
    particulas.rotation.y = t * 0.02;
    camara.position.x += (puntero.x * 0.8 - camara.position.x) * 0.04;
    camara.position.y += (-puntero.y * 0.5 - camara.position.y) * 0.04;
    camara.lookAt(desplazamientoX * 0.5, 0, 0);
    renderizador.render(escena, camara);
  }
  function animar() {
    cuadro = requestAnimationFrame(animar);
    if (visible && !document.hidden) dibujar();
  }
  if (sinMovimiento) dibujar();
  else animar();
  contenedor?.classList.add('escena-lista');

  return function limpiar() {
    cancelAnimationFrame(cuadro);
    window.removeEventListener('pointermove', alMover);
    observador.disconnect();
    vigia.disconnect();
    escena.traverse((objeto) => {
      objeto.geometry?.dispose();
      [objeto.material].flat().filter(Boolean).forEach((m) => m.dispose());
    });
    renderizador.dispose();
  };
}
