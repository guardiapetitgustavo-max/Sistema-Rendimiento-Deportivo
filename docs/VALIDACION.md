# Validación: ¿SportEval AI es apto para analizar el rendimiento deportivo?

**Respuesta corta: sí, para lo que mide y con los límites que se explican abajo.** El sistema calcula
correctamente (contra valores conocidos de antemano) mejoras, récords, puntajes, rankings, tendencias, ritmos de
natación, distancias GPS y tiempos con dos teléfonos; aísla los datos de cada academia; no mezcla resultados que
no son comparables; y cuando no tiene datos suficientes lo dice en vez de inventar.

La batería está en [`tests/validacion.test.js`](../tests/validacion.test.js) y se ejecuta con:

```powershell
npm run validar                                     # parte 1: motor de cálculo (no necesita base de datos)
$env:TEST_DATABASE_URL="postgresql://…/pruebas"; npm run validar   # parte 1 + parte 2 extremo a extremo
```

Resultado de la última ejecución: **51 de 51 comprobaciones superadas** (82 de 82 contando todas las pruebas del
proyecto: `npm test`). Fecha: 03/10/2026, PostgreSQL 16 local con la academia demo.

---

## 1. Cálculos con verdad conocida

| Caso | Esperado | Obtenido |
|---|---|---|
| 30 m: 5.12 s → 4.82 s (menos es mejor) | mejora 5.86 % | ✅ mejora 5.86 % |
| Salto vertical: 42 → 49 cm (más es mejor) | mejora 16.67 % | ✅ 16.67 % |
| Cooper: 2200 → 2430 m | mejora 10.45 % | ✅ 10.45 % |
| Un tiempo que sube (4.82 → 5.12) | empeora | ✅ empeora |
| Frecuencia de brazada con rango objetivo 40-55 | 52 mejor que 38; 56 mejor que 30 | ✅ |
| "1:04.32" escrito a mano | 64.32 s | ✅ (y "1:75" se rechaza) |
| Intentos 5.1 / 4.9 / 5.0 (mejor, promedio, último) | 4.9 / 5.0 / 5.0 | ✅ |
| Récord personal solo si supera estrictamente | 4.8 tras 4.9 → récord; 4.9 tras 4.9 → no | ✅ |
| Baremo 30 m (6 s = 0 pts, 4 s = 100): 5 s | 50 puntos | ✅ (recorta a 0-100) |
| Puntaje con una capacidad sin datos | promedio ponderado de las que tienen datos + cobertura 80 % | ✅ (no inventa la que falta) |
| 200 m en 150 s | ritmo 75 s/100 m | ✅ |
| 100 m en 1:04.32 con 64 brazadas | 1.555 m/s · 1.56 m por brazada | ✅ |
| Parciales que no cuadran con el tiempo final | rechazados | ✅ |
| Dos teléfonos con relojes desfasados −350 ms y +1200 ms, carrera real de 10.000 s | 10.000 s ± incertidumbre | ✅ 10.000 s (±100 ms declarados) |
| 1° de latitud | 111.195 km | ✅ (error < 0.1 %) |
| Vuelta de 400 m registrada con 200 puntos GPS | 400 m | ✅ 400.0 m |
| Trayectoria GPS de 1000 m enviada por un dispositivo | 1000 m | ✅ |

## 2. Tendencias: precisión estadística

Una tendencia ("mejora", "empeora", "estable") se calcula con regresión lineal sobre las mediciones de **la misma
prueba y contexto** y solo se informa si (a) hay al menos 3 mediciones en al menos 7 días, (b) el cambio supera el
2 % y (c) la pendiente es **estadísticamente significativa** (prueba t al 90 %). Se simularon 1000 deportistas por
escenario (6 mediciones en 10 semanas):

| Escenario | Resultado |
|---|---|
| Sin cambio real, ruido de medición 1.5 % | 8.1 % de falsos positivos (esperado ≤ 10 %) |
| Sin cambio real, ruido 1.0 % | 4.7 % de falsos positivos |
| Mejora real del 5 %, ruido 1.5 % | detectada en el **74.9 %** de los deportistas, nunca como "empeora" |
| Mejora real del 3 %, ruido 1.5 % | 40.3 % (con 10 mediciones: 58.8 %; con ruido 1.0 %: 64.9 %) |
| Empeoramiento real del 4 % | detectado en el 53.4 %, nunca como "mejora" |

**Cómo leerlo:** el sistema prefiere decir "estable" antes que afirmar una mejora que podría ser ruido. Cambios
pequeños (≈3 %) necesitan más mediciones o pruebas más fiables para detectarse. Recomendación práctica: medir cada
prueba al menos 6 veces por temporada, con el mismo protocolo, y usar varios intentos (el sistema toma el mejor o
el promedio según la prueba).

> Antes de añadir la prueba de significación, el 27 % de los deportistas sin cambio real aparecían como "mejora"
> o "empeora". La validación detectó el problema y se corrigió.

## 3. Extremo a extremo con la academia demo

La demo ("Sport Academy Demo": 36 deportistas de Fútbol, Natación y Atletismo, Sub-12 a Sub-18, 3 coaches,
1 nutricionista, 1 deportista y 1 madre con cuenta) se genera con datos sintéticos de **verdad conocida**: cada
deportista tiene una capacidad base, un ritmo de mejora y, en algunos casos, una caída programada, ausencias o
fatiga. Se crea en 0.75 s (1998 resultados, 270 entrenamientos, 936 asistencias, 509 registros de recuperación).

| Comprobación | Resultado |
|---|---|
| Caídas de rendimiento programadas en 4 deportistas | ✅ **4 de 4 detectadas, 0 falsas alarmas** |
| Baja asistencia programada en 4 deportistas | ✅ 4 detectadas + 1 deportista que por azar quedó en 72.7 % (< 75 %, correcto según la regla) |
| Fatiga alta 3 días seguidos y dolor reportado | ✅ detectados (3 y 3) |
| Una diferencia de 1 acierto sobre 10 | ✅ no se considera "caída" (resolución de la medida) |
| Error de tipeo (10 m en 1.00 s) | ✅ alerta de **valor atípico**, no récord |
| Volver a evaluar las alertas | ✅ no duplica |
| Estimación por video (fuente VIDEO) | ✅ nunca es oficial: no entra en rankings ni evolución |
| Mismo resultado enviado dos veces (modo sin conexión) | ✅ una sola fila (idempotencia) |
| Corrección de un resultado | ✅ guarda valor anterior, motivo, quién y cuándo |
| Piscina de 25 m y de 50 m | ✅ rankings y evoluciones separados |
| Ranking de 30 m / de salto | ✅ ascendente / descendente |
| Cambiar el scoring (v1 → v2) | ✅ el puntaje guardado con v1 (68.1) no cambia; el nuevo usa v2 (80.5) |
| Cambiar la distancia de una prueba con resultados | ✅ bloqueado (409): se crea una prueba nueva |
| Coach sin permiso intenta cambiar la metodología | ✅ 403 |
| Deportista o padre intenta registrar/corregir/anular resultados | ✅ 403 |
| Coach de natación intenta ver o medir a un futbolista | ✅ 404 |
| Otra academia intenta leer/modificar 12 tipos de datos de la demo | ✅ 12 de 12 bloqueados |
| Análisis IA de un deportista sin resultados | ✅ "DATOS INSUFICIENTES", sin fortalezas ni tendencias inventadas |
| Análisis con datos | ✅ cada hallazgo lleva su evidencia; recomendaciones "pendientes" hasta que un coach las aprueba |
| Objetivo de rendimiento | ✅ progreso calculado y "alcanzado" al lograr la marca |
| Plan con límite de 1 deportista | ✅ alta bloqueada (403) y módulos fuera del plan desactivados |
| Dispositivo con clave válida / falsa | ✅ guarda con fuente SENSOR / 401 |
| Video sin modelo de visión para ese movimiento | ✅ worker real: "ANÁLISIS NO DISPONIBLE" + metadatos medidos (2 s, 25 fps, 320×240) |
| Cada reproducción de un video | ✅ queda en la auditoría |
| Tareas programadas sin CRON_SECRET | ✅ 401 |

**Tiempos de respuesta** (local, academia demo): panel 20 ms · ranking 6 ms · evolución 6 ms · alertas 10 ms ·
asistencia 15 ms · 500 resultados 46 ms · análisis 360° 26 ms. En Supabase + Vercel añade la latencia de red
(normalmente 20-150 ms por consulta).

## 4. Pruebas en navegador

Recorridos con Chromium (escritorio y celular 390 px) con los 5 roles de la demo y el super administrador:
35 pantallas sin errores de JavaScript ni desbordes horizontales; captura en el Modo Medición con cronómetro y
"usar tiempo"; **modo sin conexión** (resultado guardado en el teléfono y sincronizado al volver la red, sin
duplicar); **Modo Piscina** con 3 carriles, salida común, parciales y llegadas; análisis 360°; alertas;
notificaciones; planes y creación de la demo desde la Plataforma.

## 5. Límites honestos (lo que el sistema NO hace)

- **No reemplaza un instrumento de medición.** La exactitud de cada marca depende de cómo se toma: un cronómetro
  manual tiene ~0.1-0.2 s de error humano; el cronómetro de dos teléfonos declara su incertidumbre (normalmente
  50-150 ms según la red). Para décimas de segundo en velocidad usa fotocélulas (API de integraciones).
- **Las estimaciones por video no son resultados oficiales.** Sin un modelo validado para un movimiento, el sistema
  muestra "ANÁLISIS NO DISPONIBLE". El worker incluido mide los datos del archivo; la estimación de cadencia por
  pose es opcional (requiere instalar MediaPipe) y siempre se marca como estimada.
- **Los baremos son configurables, no normas científicas universales.** Los de las plantillas son valores de
  referencia razonables para jóvenes; cada academia debe ajustarlos a su población (Metodología → Scoring).
- **La "IA" es un motor de reglas trazable**, no un modelo generativo: no inventa, pero tampoco "opina" más allá de
  los datos. Las recomendaciones requieren aprobación humana.
- **Recuperación y nutrición son seguimiento, no diagnóstico médico.** El dolor solo genera una alerta para que una
  persona lo revise.
- Las tendencias con pocas mediciones (3-5) o cambios pequeños (< 3 %) suelen salir "estable" (ver punto 2).
