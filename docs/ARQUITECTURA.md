# SportEval AI · Análisis y arquitectura

> Documento de trabajo del equipo. Responde al punto **56 · Primer paso obligatorio** de la especificación:
> analiza el sistema actual, define la arquitectura objetivo y detalla la **FASE 1**, que es la única que se implementa
> en esta entrega. Las fases 2 a 10 quedan planificadas, no programadas.
>
> **Estado:** ✅ FASE 1 implementada y verificada (ver el final del documento). Siguiente: FASE 2, cuando se apruebe.

---

## 1. Arquitectura actual

Aplicación web **monolítica** con dos piezas desplegadas juntas en Vercel:

```text
Navegador (HTML + JS sin framework)  ──fetch /api──▶  Función serverless Express (api/index.js)  ──pg──▶  PostgreSQL (Supabase)
```

- **Backend:** una sola aplicación Express montada como función serverless. Cada módulo tiene `*.routes.js` (HTTP) y
  `*.service.js` (reglas + SQL). La lógica de dominio pura vive en `src/domain/rendimiento.js`.
- **Frontend:** SPA con enrutador por hash (`#/ruta`), vistas en `public/js/views/`, plantillas HTML con escape
  automático, Bootstrap 5, Chart.js y three.js servidos desde el propio sitio.
- **Sesión:** cookie `HttpOnly` con un JWT que solo contiene el id del usuario; en cada petición se relee el usuario
  desde la base (un cambio de rol o desactivación se aplica al instante).

## 2. Tecnologías actuales

| Capa | Tecnología |
|---|---|
| Servidor | Node.js ≥ 20, Express 5, `pg`, `bcryptjs`, `jsonwebtoken`, `multer` (memoria), ExcelJS, PDFKit |
| Base de datos | PostgreSQL 17 en Supabase (conexión por *Transaction pooler*, puerto 6543) |
| Cliente | JavaScript ES modules sin build, Bootstrap 5.3, Bootstrap Icons, Chart.js, three.js |
| Despliegue | Vercel (función `api/index.js` + estáticos de `public/`) conectado a GitHub |
| Calidad | ESLint 9, `node:test` (unitarias + integración contra PostgreSQL real), GitHub Actions |

## 3. Estructura de carpetas actual

```text
api/index.js                 Entrada serverless
public/                      Frontend (index.html, css, js/views/*, vendor/)
sql/schema.sql               Esquema idempotente (se pega en Supabase)
sql/crear_admin.sql          Alta / recuperación del administrador
src/app.js, server.js        Express y servidor local
src/routes.js                Mapa de rutas de la API
src/config, db, domain, middlewares, utils
src/modules/<módulo>/        auth, admin, cuenta, deportistas, evaluaciones, alimentacion,
                             importacion, ml, ia, rutinas, alertas, dashboard, reportes
tests/                       unidad.test.js, api.test.js
```

## 4. Base de datos actual

| Tabla | Contenido | Observación |
|---|---|---|
| `usuarios` | cuentas con `rol` (`admin`/`coach`), `activo`, `debe_cambiar_clave` | el rol es global: no distingue plataforma de academia |
| `intentos_login` | anti fuerza bruta | |
| `deportistas` | pertenecen a un coach (`usuario_id`), baja lógica | **no hay academia** |
| `evaluaciones` | **8 columnas fijas** 0-100 (velocidad … asistencia) | no admite unidades, tiempos, distancias ni dirección de mejora |
| `alimentacion` | registro diario | |
| `modelos_ml`, `predicciones` | Random Forest por coach | |

## 5. Funcionalidades existentes

Login con bloqueo por intentos · administrador que crea coaches (sin registro público), los activa/desactiva,
restablece claves y transfiere deportistas · deportistas con baja lógica · evaluaciones manuales y por Excel
(vista previa + confirmación) · dashboard con alertas y gráficos · perfil del deportista · rutinas por deporte ·
alimentación · Random Forest en JavaScript · asistente de reglas (+ OpenAI opcional) · reportes Excel/PDF ·
respaldo JSON · tema claro/oscuro · escena 3D · diseño adaptable a celular.

## 6. Componentes reutilizables

- **Infraestructura:** pool con reintentos y tiempo límite, traducción de errores de PostgreSQL, seguridad
  (CSRF por cabecera, cabeceras, límite de peticiones), validador declarativo `validar()`, descargas, `rutasCrud()`.
- **Frontend:** `html` con escape, `montar`, modales, `confirmar`, `tablaPaginada`, avisos, skeletons, gráficos
  adaptados al tema, cliente API con reintentos y tiempo límite, tema claro/oscuro.
- **Dominio y exportación:** Random Forest (se reutilizará sobre métricas normalizadas), exportación Excel/PDF,
  lector de Excel tolerante a tildes y alias.

## 7. Problemas arquitectónicos

1. **No es multi-tenant.** Los datos cuelgan del coach, no de una academia. Es el cambio más importante y se resuelve en la FASE 1.
2. **Rol global en `usuarios`.** Una persona no puede ser administradora de una academia y coach de otra, ni existe super admin.
3. **Permisos fijos en el código.** No hay RBAC configurable ni auditoría.
4. **Evaluación rígida.** Las 8 capacidades 0-100 son columnas; no hay pruebas, métricas, unidades, intentos,
   fuente de medición ni dirección de mejora. Impide natación, atletismo, etc. (se resuelve en FASES 2-3).
5. **Lógica de deporte en el código.** `rutinas.data.js` tiene plantillas por deporte escritas a mano; deben pasar a datos configurables.
6. **Datos inventados en dos funciones**, en conflicto con la regla "no inventar resultados":
   - *Auto-completar* rellena capacidades vacías con promedios.
   - El entrenamiento de ML con *datos de demostración* usa datos sintéticos (hoy se marca como demo).
   Se restringirán a la academia demo y se retirarán del flujo real en la FASE 5/6.
7. **SQL dentro de los servicios.** Los módulos nuevos usan repositorios; los existentes se migran de forma gradual.
8. **Límites de Vercel:** 4.5 MB por petición y 60 s por función. Los videos deben subirse directo al almacenamiento, y el procesamiento pesado debe ir fuera de Vercel.

## 8. Arquitectura objetivo

**Monolito modular** (lo pide la especificación) que conserva la tecnología actual, más un **worker** separado para lo pesado.

```text
                     ┌────────────────────── Vercel ──────────────────────┐
Navegador / móvil ──▶│ Frontend estático  +  API Express (monolito modular)│──▶ PostgreSQL (Supabase)
  (Modo Medición     │  presentation → application → domain → infra       │──▶ Supabase Storage (videos, logos)
   offline-first)    └────────────────────────────────────────────────────┘
                                          │ tabla `trabajos` (cola)
                                          ▼
                     Worker Python (FastAPI + visión por computadora) · IA · reportes pesados
                     (Render / Railway / Fly; se agrega en FASE 6-7)
```

**Decisión tecnológica.** La especificación prefiere FastAPI + Next.js, pero también exige *"no cambiar tecnologías
sin una razón clara"*. Se mantiene **Node + Express + frontend sin build** para la plataforma, porque:

- ya funciona en producción (Vercel + Supabase);
- tiene pruebas y el equipo ya lo conoce;
- reescribirlo retrasaría el producto sin aportar funcionalidad.

**Python sí se usará** donde hay una razón técnica clara: el worker de visión por computadora (MediaPipe, OpenCV),
cuyo ecosistema es Python. Migrar el frontend a Next.js/TypeScript queda como opción posterior e independiente.

Capas dentro de cada módulo:

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Presentation | `*.routes.js` | HTTP, permisos, forma de la respuesta. **Sin lógica de negocio.** |
| Application | `*.service.js` | casos de uso, transacciones, auditoría |
| Domain | `src/domain/*` | reglas puras (dirección de mejora, scoring, comparaciones) |
| Infrastructure | `*.repo.js`, `src/db` | SQL parametrizado, **siempre filtrado por academia** |
| Validación (DTO) | esquemas `validar()` | entrada limpia y tipada |

## 9. Modelo de datos objetivo

Nombres en español, igual que el código actual. Equivalencias con la especificación entre paréntesis.
**★ = se crea en la FASE 1.**

**Plataforma y tenant**

| Tabla | Clave |
|---|---|
| ★ `academias` (tenants/academies) | `id`, `nombre`, `slug`, `estado` (activa/suspendida) |
| ★ `academia_config` (academy_settings) | datos generales, branding, módulos activados (JSONB), zona horaria, moneda |
| ★ `usuarios` (users) | identidad global + `es_super_admin` |
| ★ `membresias` (users↔academies + roles) | `usuario_id`, `academia_id`, `rol`, `activo` |
| ★ `rol_permisos` (role_permissions) | `academia_id`, `rol`, `permiso`, `permitido` (excepciones al catálogo) |
| ★ `auditoria` (audit_logs) | `academia_id`, `usuario_id`, `accion`, `entidad`, `detalle`, `ip` |
| `planes`, `suscripciones`, `pagos`, `matriculas` | FASE 9, límites en JSONB (nada fijo en el código) |

**Estructura deportiva (FASE 2)**

`sedes` (branches) · `instalaciones` (facilities: tipo, largo, carriles) · `deportes` · `disciplinas` ·
`posiciones` · `categorias` (edad mín/máx, nivel) · `equipos` · `equipo_miembros` · ★ `tutores` (parents↔athletes) ·
`deportistas` (+ ★ `academia_id`, ★ `cuenta_id`).

**Metodología (FASES 2-5), versionada**

- `metricas`: unidad, `tipo_resultado` (TIME, DISTANCE, SPEED, PACE, COUNT, SCORE, PERCENTAGE, HEART_RATE, RPE, WEIGHT, HEIGHT, ANGLE, CUSTOM) y `direccion_mejora` (LOWER_IS_BETTER, HIGHER_IS_BETTER, TARGET_RANGE, CUSTOM).
- `pruebas` (tests): métrica, deporte, modo de medición, campos extra en JSON (estilo, distancia…).
- `plantillas_evaluacion` + `plantilla_versiones`.
- `configuraciones_scoring` + `scoring_versiones`: pesos y reglas, `activa_desde`. **Inmutables una vez usadas.**
- `objetivos` · `reglas_alerta`.

**Operación (FASES 3-4)**

- `evaluaciones`: sesión de evaluación, con la versión de plantilla usada.
- `resultados` (evaluation_results): `academia_id`, deportista, deporte, categoría, equipo, coach, evaluación, plantilla, prueba, `intento`, `valor`, `unidad`, fecha/hora, notas, `fuente_medicion` (MANUAL, PHONE, VIDEO, SENSOR, EXTERNAL_SYSTEM), `dispositivo_id`, `carril`, `parciales` JSONB, `clave_idempotencia`.
- `sesiones` (sport/training sessions) · `sesion_participantes` · `ejercicios` · `asistencia` · `registros_recuperacion` (sueño, fatiga, RPE, estrés, dolor) · `nutricion`.

**Inteligencia (FASES 5-7)**

`snapshots_rendimiento` (puntaje + `scoring_version_id`) · `analisis_ia` (datos usados, modelo, versión, configuración,
resultado) · `alertas` · `recomendaciones` · `videos` · `analisis_video` · `notificaciones` · `trabajos` (cola).

**Migración de los datos actuales:** las 8 capacidades se convertirán en 8 métricas SCORE 0-100 de una plantilla
"Evaluación por observación". Así ningún histórico se pierde.

## 10. Estrategia multi-tenant

- **Base compartida, esquema compartido, `academia_id` en toda tabla de la academia.** Es lo adecuado para cientos
  de academias en Supabase y permite reportes de plataforma sin cruzar datos privados.
- **La academia activa nunca la decide el cliente a ciegas.** La sesión trae la academia elegida, y el servidor
  comprueba en cada petición que el usuario tenga una **membresía activa** en ella y que la academia no esté
  suspendida. Todo servicio recibe un contexto `{ academiaId, coachId }` y **todo SQL filtra por `academia_id`**.
- Unicidad por academia; por ejemplo, el código de deportista es único por academia, no global.
- **Archivos:** rutas `academias/{id}/…` en un bucket privado, con URLs firmadas de corta duración emitidas tras comprobar permisos.
- **IA y ML:** modelos y análisis guardados con `academia_id`; el contexto que recibe la IA sale solo de la academia activa.
- **Defensa en profundidad:** RLS activado en todas las tablas (bloquea la API pública de Supabase). Más adelante se
  añadirán políticas por `academia_id` usando `set_config('app.academia_id')`.
- **Pruebas automáticas de aislamiento:** un usuario de la academia A nunca ve, edita ni cuenta datos de B.

## 11. Estrategia multideporte

**Sport Configuration Engine** dirigido por datos: un deporte es un registro, no código.

- Catálogo global de **plantillas de deporte** (fútbol, natación, atletismo, vóley…). Cada academia **copia y adapta**
  su versión, o crea deportes propios.
- Cada deporte define disciplinas, posiciones, métricas, pruebas, modos de medición, campos de entrenamiento y
  métricas prioritarias.
- La interfaz se genera a partir de **definiciones de campos** (JSON: tipo, unidad, opciones). No hay `if (deporte === 'fútbol')`.
- **Comparaciones solo entre resultados compatibles:** misma prueba, unidad, deporte y configuración. Para comparar
  entre deportes se usan puntajes normalizados explícitos.

## 12. Estrategia de configuración por academia

- `academia_config` guarda datos generales, branding, zona horaria, moneda y **módulos activados** (nutrición, video,
  cada módulo de IA, ML).
- Un módulo desactivado **desaparece del menú y su API responde 403**.
- **Permisos:** catálogo de permisos en el código con valores por defecto por rol; cada academia guarda solo sus
  excepciones en `rol_permisos`. El rol *administrador* siempre tiene todo.
- **Metodología versionada:** métricas, plantillas, scoring, objetivos y alertas tienen versiones. Cada resultado
  guarda la versión con la que se calculó, y el pasado nunca se recalcula en silencio.

## 13. Estrategia de IA (SportEval Intelligence)

1. **Motor analítico determinista** sobre datos reales: tendencias, mejores marcas, dirección de mejora, asistencia,
   recuperación, objetivos. Produce resultados estructurados con los **datos utilizados**.
2. **Umbrales de suficiencia:** si no hay datos suficientes, la respuesta es literalmente `DATOS INSUFICIENTES`.
3. **Redacción opcional con un LLM** (OpenAI o Claude) que recibe **solo el contexto agregado** (`academy_context`,
   `sport_context`, `athlete_context`…) y no puede añadir cifras. Se guarda modelo, versión, configuración y resultado
   en `analisis_ia`.
4. **Asistente:** traduce la pregunta a **consultas parametrizadas predefinidas** (nunca SQL libre), ejecutadas con los
   permisos y la academia del usuario.
5. **Alertas:** reglas configurables por academia (caída, baja asistencia, fatiga repetida, récord…) que registran el
   motivo, los datos y el responsable.
6. **Nunca diagnóstico médico ni dietas clínicas.**

## 14. Estrategia de video

- **Subida directa** del navegador a Supabase Storage con URL firmada. Así se evita el límite de 4.5 MB de Vercel.
- Registro en `videos` con estados `PENDING → PROCESSING → COMPLETED | FAILED`, y un `trabajo` en la cola.
- **Worker Python** (FastAPI + MediaPipe/OpenCV) fuera de Vercel: toma trabajos, procesa y guarda en `analisis_video`
  separando **medido / estimado / observado**.
- Si no existe un modelo real para ese tipo de movimiento, el resultado es **`ANÁLISIS NO DISPONIBLE`**. Nada simulado.
- Comparación A vs B solo entre videos del mismo tipo de movimiento. Acceso a videos auditado.

## 15. Estrategia de Modo Medición

- Flujo de pocos toques: **deporte → categoría → equipo → evaluación → prueba → deportista → medir → guardar → siguiente**.
  Recuerda la última selección.
- **Offline-first:** cada resultado se guarda primero en el dispositivo (IndexedDB) con una `clave_idempotencia` y se
  sincroniza al volver la señal, sin duplicados.
- **Cronometraje por niveles:**
  1. Cronómetro manual con intentos y mejor marca, usando `performance.now()` para mayor precisión.
  2. Dos dispositivos: A marca la salida y B la llegada; el servidor calcula `FINISH − START` corrigiendo el desfase de reloj de cada equipo.
  3. Video.
  4. Fotocélulas.
  5. GPS y sistemas externos.

  Siempre se guarda `fuente_medicion`, y una estimación nunca se presenta como marca oficial.
- **Modos:** Campo, Piscina, Pista, Cancha, Gimnasio, Aguas abiertas y Personalizado. Un modo es una configuración de
  pantalla, no código aparte.

## 16. Estrategia para deportes acuáticos

- Instalación tipo piscina con largo (25/50 m) y número de carriles.
- Pruebas definidas por **distancia × estilo** (libre, espalda, pecho, mariposa, combinado).
- **Modo Piscina:** una fila por carril con su deportista y cronómetro. Guarda carril, distancia, estilo, tiempo,
  intento, piscina, coach, evaluación y fecha.
- **Parciales** como lista JSON (`[{"m":25,"t":13.1}, …]`) comparables solo con la misma prueba y el mismo largo de piscina.
- Métricas derivadas calculadas y marcadas como tales: ritmo, velocidad, frecuencia y distancia por brazada.
- **Aguas abiertas, waterpolo y saltos** usan el mismo motor de métricas y pruebas, más la integración con
  dispositivos externos de la FASE 10.

## 17. Estructura del frontend

- Se mantiene la SPA sin build. **Menús y dashboards distintos por rol**, generados a partir de permisos y módulos
  (el menú de un coach no es el del administrador).
- `public/js/views/<área>/…` por dominio: `plataforma/`, `academia/`, `operacion/`, `portal/`.
- Componentes compartidos en `ui.js`: tablas, filtros, paginación, modales, estados de carga, vacío y error.
- **Modo Medición** como vista a pantalla completa, optimizada para celular y tablet, con botones grandes y sin menús.

## 18. Estructura del backend

```text
src/
  core/ (config, db, http, seguridad, contexto de academia, permisos, auditoría)
  domain/ (reglas puras: rendimiento, scoring, dirección de mejora)
  modules/<módulo>/  <m>.routes.js · <m>.service.js · <m>.repo.js · <m>.schema.js
```

Módulos: `auth`, `plataforma` (academias, planes), `academia` (config, permisos, auditoría), `usuarios`,
`deportes`, `categorias`, `equipos`, `instalaciones`, `deportistas`, `medicion`, `evaluaciones`, `entrenamiento`,
`asistencia`, `recuperacion`, `objetivos`, `rendimiento`, `ia`, `alertas`, `video`, `nutricion`, `reportes`,
`facturacion`, `notificaciones`.

## 19. Roadmap

| Fase | Contenido | Entregable verificable |
|---|---|---|
| **1** | Auth, RBAC, multi-tenant, base de datos, configuración de academia, auditoría | Varias academias aisladas, 5 roles, permisos editables, módulos activables |
| 2 | Sedes, instalaciones, deportes, disciplinas, posiciones, categorías, equipos, deportistas completos, tutores | Estructura de una academia multideporte completa |
| 3 | Motor de métricas y pruebas, Modo Medición (campo, piscina, pista), cronómetro nivel 1-2, evaluaciones, asistencia | Medir en el lugar de entrenamiento, también sin señal |
| 4 | Entrenamientos con plantillas por deporte, participantes, recuperación, sueño, fatiga, objetivos | Ciclo medir → entrenar |
| 5 | Scoring versionado, evolución, récords, comparativas, dashboards por rol, reportes con branding | Evolución y rendimiento configurables |
| 6 | IA: análisis, 360°, alertas, recomendaciones y asistente con datos reales; worker y cola | IA trazable sin datos inventados |
| 7 | Video: subida, almacenamiento, procesamiento y visión por computadora | Análisis real o "ANÁLISIS NO DISPONIBLE" |
| 8 | Nutrición: seguimiento, hidratación, orientación general | Módulo opcional por academia |
| 9 | Planes, suscripciones, matrículas, pagos, límites por plan | Producto vendible |
| 10 | Sensores, GPS, wearables, fotocélulas, cronometraje externo | Fuentes de medición externas |

## 20. FASE 1 detallada

**Objetivo:** que una sola instalación sirva a varias academias con datos aislados, roles reales y configuración
propia, **sin romper nada de lo que ya funciona**.

**Base de datos**, en `sql/schema.sql`, idempotente y con migración automática de los datos actuales:

- `academias`, `academia_config`, `membresias`, `rol_permisos`, `auditoria`, `tutores`.
- `usuarios.es_super_admin`.
- `deportistas.academia_id` (obligatorio) y `deportistas.cuenta_id` (cuenta del deportista).
- Código de deportista único por academia.
- `modelos_ml` por academia.
- **Migración:** si ya hay datos, se crea "Mi academia" y todos los usuarios y deportistas pasan a ella con su rol
  actual; los administradores existentes pasan a ser también super admin. La columna `usuarios.rol` se reemplaza por
  `membresias.rol`.

**Roles:**

| Rol | Ámbito | Puede |
|---|---|---|
| Super admin | Plataforma | Crear, editar, suspender y reactivar academias; ver su uso. **No ve datos deportivos** si no es miembro. |
| Administrador | Su academia | Configurar la academia, usuarios, permisos y módulos; ve y edita todo dentro de ella. |
| Coach | Su academia | Operar según permisos; solo sus deportistas. |
| Deportista | Su academia | Portal de solo lectura con su propio perfil y evaluaciones. |
| Padre/Madre | Su academia | Portal de solo lectura con los deportistas vinculados. |

**Backend:**

- **Contexto de academia en cada petición:** membresía activa y academia no suspendida.
- **Permisos:** catálogo por rol; cada ruta exige su permiso de ver o de gestionar.
- **Módulos:** un módulo desactivado responde 403.
- **Auditoría automática:** registra todas las escrituras, los inicios de sesión (correctos y fallidos) y los cambios de configuración.
- **Endpoints nuevos:** `/api/plataforma/*`, `/api/academia/*` (configuración, permisos, auditoría), `/api/portal/*`
  y el cambio de academia activa.

**Frontend:**

- Selector de academia.
- Menú y dashboard según rol, permisos y módulos.
- Pantallas nuevas: **Plataforma** (super admin), **Mi academia** (datos, branding y módulos), **Permisos**,
  **Auditoría** y **Mi progreso** (portal del deportista y del padre).
- Gestión de usuarios con los 4 roles de academia y la vinculación de deportista o padre con su ficha.
- El branding (nombre, logo, color) se aplica a la interfaz.

**Criterios de aceptación (con prueba automática):**

1. Dos academias con datos propios: ninguna ve, edita ni cuenta datos de la otra (deportistas, evaluaciones, usuarios, reportes, ML, auditoría).
2. El super admin crea una academia con su administrador, la suspende (sus usuarios pierden acceso al instante) y la reactiva.
3. Un permiso retirado al coach bloquea la API (403) y oculta la opción del menú.
4. Un módulo desactivado bloquea la API (403) y desaparece del menú.
5. El deportista y el padre solo ven sus fichas vinculadas y no pueden modificar resultados.
6. Toda escritura queda en la auditoría de su academia.
7. Una base creada con la versión anterior se migra sin perder datos.
8. Siguen pasando todas las pruebas y funciones anteriores; la interfaz se ve bien en celular.

---

## Estado de la FASE 1 (implementada)

**Verificación**

- 31 pruebas automáticas (`npm test`), incluida la de integración con dos academias que comprueba los 8 criterios de aceptación.
- 27 comprobaciones en navegador real con los 5 roles, en escritorio y en celular.
- Migración probada sobre bases de las versiones 1.x y 2.2 con datos, incluidos códigos duplicados entre coaches.

**Archivos**

- **Nuevos:**
  - `src/core/permisos.js`, `src/core/modulos.js`, `src/core/auditoria.js`
  - `src/modules/plataforma/*`, `src/modules/academia/*`, `src/modules/portal/*`
  - `public/js/buscador.js`
  - `public/js/views/plataforma.js`, `academia.js`, `permisos.js`, `auditoria.js`, `portal.js`
  - `docs/ARQUITECTURA.md`
- **Reescritos:**
  - `sql/schema.sql`, `sql/crear_admin.sql`
  - `src/middlewares/sesion.js`, `src/middlewares/roles.js`, `src/routes.js`
  - `src/modules/admin/*`
  - `public/js/main.js`, `public/js/sesion.js`, `public/js/views/admin.js`
- **Adaptados a la academia activa:**
  - servicios de deportistas, evaluaciones, alimentación, ML, IA, importación, reportes, cuenta y auth;
  - vistas de dashboard, deportistas, evaluaciones, perfil, cuenta y portada;
  - `api.js`, `ui.js`, `styles.css`, las pruebas y el README.

**Pendiente para la FASE 2**

- Sedes, instalaciones, deportes, disciplinas, posiciones, categorías y equipos como entidades configurables.
- Deportistas con fecha de nacimiento, sexo, posición y equipo.
