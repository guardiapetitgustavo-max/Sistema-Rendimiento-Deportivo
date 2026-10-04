# SportEval AI · Plataforma de rendimiento deportivo

Plataforma **multi-academia** (SaaS) para medir, entrenar y analizar el rendimiento deportivo: Modo Medición en el
celular (también sin conexión), Modo Piscina, cronómetro con dos teléfonos, entrenamientos, asistencia, recuperación,
objetivos, evolución y récords, scoring versionado, alertas, análisis IA trazable, video, nutrición, matrículas y
pagos, planes SaaS e integraciones con fotocélulas/GPS.

> **Arquitectura:** [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · **Validación:** [`docs/VALIDACION.md`](docs/VALIDACION.md)
> Estado: **las 10 fases implementadas** (versión 4.0.0) y validadas con 82 pruebas automáticas.

**Stack:** Node.js + Express (API) · PostgreSQL en Supabase · Frontend HTML/JS con Bootstrap, Chart.js y three.js (3D) · Despliegue en Vercel.

**Interfaz:** portada de presentación con escena 3D interactiva, acceso en pantalla partida, tema claro y oscuro,
tarjetas con inclinación 3D, animaciones de entrada, buscador global, paginación y diseño adaptado a celular.

---

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| Portada | Página de presentación del producto con escena 3D (se adapta si el equipo no soporta 3D). |
| Plataforma | El **super administrador** crea academias con su primer administrador, las suspende o reactiva y ve su uso (sin acceder a datos privados salvo acceso explícito y auditado). |
| Multi-academia | Cada academia tiene sus datos **totalmente aislados**. Una persona puede pertenecer a varias academias y cambiar de una a otra. |
| Roles | **Administrador** (configura y gestiona su academia) · **Coach** (opera con sus deportistas) · **Deportista** y **Padre/madre** (consultan su progreso, sin modificar resultados). |
| Usuarios | El administrador crea las cuentas (no hay registro público), vincula deportistas y padres con sus fichas, activa/desactiva accesos, restablece contraseñas y transfiere deportistas entre coaches. |
| Permisos | Matriz por rol editable por cada academia (qué puede hacer cada coach, deportista y padre). |
| Configuración | Datos de la academia, logo, colores (se aplican a la interfaz) y módulos activables (nutrición, ML, IA…). |
| Auditoría | Registro de inicios de sesión, altas, cambios, bajas y cambios de configuración de cada academia. |
| Mi progreso | Portal de solo lectura para deportistas y padres: evolución, fortalezas y evaluaciones. |
| Deportistas | Alta, edición y baja lógica (el historial nunca se pierde; se reactiva si vuelve). |
| Evaluaciones | 8 capacidades (0-100). La puntuación general se calcula sola si se deja vacía. |
| Importar Excel | Sube un `.xlsx`, revisa la vista previa con errores por fila/columna y confirma. |
| Dashboard | Indicadores, alertas automáticas y 4 gráficos. |
| Perfil | Evolución vs. su disciplina y la academia, fortalezas, debilidades, predicción y alimentación. |
| Machine Learning | Random Forest (JavaScript puro) que clasifica el nivel Bajo / Medio / Alto. |
| Asistente IA | Recomendaciones por reglas (u OpenAI opcional) y **Modo Automático** de un clic. |
| Rutinas | Rutina semanal según el deporte o su familia de deportes, con refuerzo de debilidades. PDF descargable. |
| Alimentación | Comidas, hidratación y horas de sueño por día. |
| Reportes | General, ranking, evolución, seguimiento, estadísticas e individual en Excel y PDF. |
| Mi cuenta | Datos personales, contraseña, tema, cambio de academia y respaldo JSON. El reinicio de datos es solo para el administrador. |
| **Estructura** | Sedes, instalaciones (piscinas con largo y carriles), deportes desde **14 plantillas** (fútbol, natación, atletismo, básquet, vóley, tenis…), disciplinas, posiciones, categorías y equipos con sus miembros. |
| **Metodología** | Métricas con unidad y dirección de mejora (menos es mejor, más es mejor, rango objetivo), pruebas con protocolo y baremo, plantillas de evaluación y **scoring versionados**, reglas de alerta ajustables. |
| **Modo Medición** | Sesiones de evaluación, captura rápida por intento en el celular, cronómetro con parciales, **cola sin conexión** que sincroniza sin duplicar, corrección y anulación auditadas, aviso de valores atípicos. |
| **Modo Piscina** | Varios carriles con salida común, parciales y llegada por carril; ritmo, velocidad y eficiencia de brazada. Piscinas de 25 y 50 m nunca se mezclan. |
| **Cronómetro de 2 teléfonos** | Uno marca la salida y otro la llegada; ambos se sincronizan con el reloj del servidor y el resultado guarda su incertidumbre. |
| **Entrenamientos y asistencia** | Sesiones con ejercicios por tipo de deporte, asistencia con RPE, carga semanal (sRPE) y % de asistencia. |
| **Recuperación y objetivos** | Sueño, fatiga, estrés y dolor (lo registra el propio deportista); objetivos con progreso calculado con datos reales. |
| **Rendimiento** | Evolución por prueba con récords y tendencia estadística, puntaje compuesto, rankings y comparativas solo entre resultados compatibles. |
| **Alertas e IA** | Caídas, récords, baja asistencia, fatiga, sueño, dolor, valores atípicos y objetivos vencidos; análisis del deportista, 360° y de equipo con su evidencia; recomendaciones que aprueba el coach; "DATOS INSUFICIENTES" cuando no hay datos. |
| **Video** | Subida privada (URL firmada), comparación A/B cuadro a cuadro, observaciones y worker de análisis; "ANÁLISIS NO DISPONIBLE" si no hay modelo. |
| **Nutrición** | Perfil, horarios, orientación general de hidratación y notas del rol **profesional** (no clínico). |
| **Comercial** | Matrículas, cuotas mensuales, cobros y vencimientos; comunicados por rol o equipo; planes SaaS con límites y módulos. |
| **Integraciones** | Dispositivos con clave de API (fotocélulas, GPS, wearables, cronometraje); el GPS calcula distancia, ritmo y FC. |
| **Academia demo** | "Sport Academy Demo" con 36 deportistas y 4 meses de datos, creada con un clic desde la Plataforma. |

---

## Estructura del proyecto

```text
├── api/index.js              # Entrada de Vercel (función serverless)
├── public/                   # Frontend estático
│   ├── index.html
│   ├── css/styles.css        # Sistema de diseño (tema claro/oscuro, animaciones, 3D)
│   ├── vendor/               # Librerías incluidas (sin depender de CDN externos)
│   └── js/
│       ├── main.js           # Enrutador (#/ruta), menú, buscador y protecciones globales
│       ├── api.js            # Cliente de la API con tiempo límite y reintentos
│       ├── ui.js             # Plantillas seguras, avisos, modales, paginación y efectos
│       ├── escena3d.js       # Escena 3D de la portada y el acceso (three.js)
│       ├── graficos.js       # Gráficos (Chart.js) adaptados al tema
│       └── views/            # Una vista por pantalla
├── sql/schema.sql            # Base de datos completa para pegar en Supabase
├── sql/crear_admin.sql       # Crea (o recupera) la cuenta del super administrador
├── docs/ARQUITECTURA.md      # Análisis, arquitectura objetivo y hoja de ruta por fases
├── src/
│   ├── app.js                # Aplicación Express
│   ├── server.js             # Servidor local (npm run dev)
│   ├── routes.js             # Rutas de la API
│   ├── config/env.js         # Variables de entorno
│   ├── db/pool.js            # Conexión a PostgreSQL
│   ├── domain/rendimiento.js # Reglas de negocio (niveles, umbrales, promedios)
│   ├── core/                 # Catálogos de permisos y módulos, auditoría
│   ├── middlewares/          # Sesión, academia activa, permisos, seguridad y errores
│   ├── utils/                # Validación, fechas, descargas, rutas CRUD
│   └── modules/              # auth, plataforma, academia, admin (usuarios), portal, deportistas,
│                             # evaluaciones, alimentacion, importacion, ml, ia, rutinas, alertas,
│                             # dashboard, reportes, cuenta
├── src/domain/medicion.js    # Motor de medición: dirección de mejora, tiempos, tendencias, scoring, natación, GPS
├── src/domain/plantillas-deporte.js # 14 plantillas de deporte con pruebas y baremos
├── src/demo/demo.js          # Academia de demostración (npm run demo)
├── worker/                   # Worker de video en Python (fuera de Vercel)
├── tests/                    # Pruebas unitarias, de integración y la batería de validación (node:test)
├── .github/workflows/ci.yml  # Verificación automática en GitHub
├── .env.example
└── vercel.json
```

---

## 1. Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project** (guarda la contraseña de la base de datos).
2. Ve a **SQL Editor → New query**, pega **todo** el contenido de [`sql/schema.sql`](sql/schema.sql) y pulsa **Run**.
3. Abre otra **New query**, pega [`sql/crear_admin.sql`](sql/crear_admin.sql), escribe tu nombre, correo y contraseña
   en las 3 líneas marcadas con `←` y pulsa **Run**. Esa cuenta queda como **super administrador** y como
   administradora de la primera academia. No hay registro público: con ella crearás academias y usuarios.
   *(Si ya tenías datos de una versión anterior, `schema.sql` los migra solo a "Mi academia" sin perder nada.)*
4. Ve a **Connect** (arriba) → **Connection string** → **Transaction pooler** y copia la URL
   (termina en `:6543/postgres`). Reemplaza `[YOUR-PASSWORD]` por tu contraseña.
5. *(Para videos)* **Storage → New bucket** → nombre `videos`, **sin** marcar "Public bucket".

**Actualizar a una versión nueva:** vuelve a ejecutar `sql/schema.sql` completo. Es seguro: solo crea lo que falta y
migra los datos existentes, nunca borra.

## 2. Configurar Vercel

En tu proyecto de Vercel → **Settings → Environment Variables**, agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La URL del *Transaction pooler* de Supabase |
| `JWT_SECRET` | Un texto largo y aleatorio (mínimo 32 caracteres) |
| `IA_PROVIDER` *(opcional)* | `local` u `openai` |
| `OPENAI_API_KEY` *(opcional)* | Tu clave de OpenAI si usas `openai` |
| `SUPABASE_URL` *(videos)* | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` *(videos)* | Supabase → Project Settings → API → `service_role` (secreta) |
| `SUPABASE_BUCKET` *(opcional)* | `videos` |
| `CRON_SECRET` | Texto aleatorio: protege la tarea diaria (alertas, vencimientos) que Vercel ejecuta sola |

Sin las variables de Supabase el módulo de video aparece desactivado con su motivo; todo lo demás funciona.

Luego haz `git push`: Vercel despliega solo. Si el proyecto ya estaba creado, entra a
**Deployments → ⋯ → Redeploy** después de agregar las variables.

Comprueba que todo funciona abriendo `https://TU-PROYECTO.vercel.app/api/salud`.
Debe responder `{"estado":"ok","base_de_datos":"conectada"}`.

## 3. Trabajar en tu computadora (opcional)

```powershell
npm install
copy .env.example .env     # y completa DATABASE_URL y JWT_SECRET
npm run dev
```

Abre <http://localhost:3000>.

## 4. Probar con la academia demo

Entra como super administrador → **Plataforma → Academia demo** (o `npm run demo`). Se crea "Sport Academy Demo"
con cuentas `admin@`, `coach.futbol@`, `coach.natacion@`, `coach.atletismo@`, `nutricion@`, `deportista@` y
`padre@demo.sportacademy.test`, todas con la contraseña `Demo2026!`. Puedes recrearla cuando quieras.

## 5. Worker de video (opcional)

Ver [`worker/README.md`](worker/README.md): un proceso en Python (Docker incluido) que se ejecuta en cualquier
servidor y analiza los videos en segundo plano.

---

## Formato del Excel

Primera fila = encabezados. Se aceptan tildes, mayúsculas y alias (`Fecha de Evaluación`, `Deporte`, `Nombres`…).
Descarga la plantilla desde **Importar Excel → Descargar plantilla**.

| Columna | Obligatoria | Valores |
|---|---|---|
| `codigo`, `nombre` | Sí | Texto |
| `edad` | No | 4 a 100 |
| `categoria`, `disciplina` | No | Texto |
| `fecha` | No | DD/MM/AAAA (vacía = hoy) |
| `velocidad`, `resistencia`, `fuerza`, `agilidad`, `coordinacion`, `tecnica`, `disciplina_score`, `asistencia` | No | 0 a 100 |
| `puntuacion_general` | No | 0 a 100 (vacía = promedio) |
| `observaciones` | No | Texto |

---

## Roles, academias y cuentas

| Rol | Dónde | Qué hace |
|---|---|---|
| Super administrador | Plataforma | Crea, renombra, suspende y reactiva academias. Ve cifras de uso, no datos deportivos. |
| Administrador | Su academia | Configura la academia, sus usuarios, permisos y módulos. Ve y edita todo dentro de ella. |
| Coach | Su academia | Opera con **sus** deportistas y los de **sus equipos** según los permisos que le dé la academia. No cambia la metodología salvo permiso. |
| Profesional | Su academia | Nutricionista, fisioterapeuta…: ve a todos los deportistas, registra recuperación y notas de nutrición; no modifica resultados. |
| Deportista | Su academia | Consulta su propio progreso (solo lectura). |
| Padre / madre | Su academia | Consulta el progreso de los deportistas vinculados (solo lectura). |

- **No hay registro público.** El administrador crea cada cuenta en **Usuarios → Nuevo usuario**; el sistema genera una
  contraseña temporal (o usa la que escribas) y la muestra **una sola vez**. Al entrar por primera vez hay que cambiarla.
- Si el correo ya tiene cuenta en otra academia, solo se le da acceso a esta y conserva su contraseña. Por seguridad,
  el nombre, correo y contraseña de una cuenta compartida solo los cambia la propia persona (o el super admin).
- El administrador usa el **selector de coach** de la barra superior: "Toda la academia" o un coach concreto (necesario
  para importar Excel, entrenar su modelo o reiniciar sus datos).
- Suspender una academia, desactivar un acceso, cambiar un permiso o un módulo se aplica **al instante**.
- ¿Olvidaste la contraseña del super administrador? Ejecuta de nuevo `sql/crear_admin.sql` con una contraseña nueva.

## Reglas del sistema

- **Nivel:** ≥ 75 Alto · 50–74 Medio · < 50 Bajo.
- **Fortaleza:** capacidad ≥ 75 · **Aspecto por mejorar:** < 55 · **Alerta crítica:** < 45.
- **Alerta de caída:** el promedio de la segunda mitad del historial baja 5 puntos o más.
- **Machine Learning:** mínimo 15 evaluaciones completas; si faltan, se puede entrenar con datos
  ficticios de demostración (se marcan claramente como *demo*).

## Calidad y pruebas

```powershell
npm run lint      # revisa el estilo y errores comunes del código
npm test          # pruebas unitarias + motor de medición (no necesitan base de datos)
npm run validar   # batería de validación del análisis de rendimiento (ver docs/VALIDACION.md)
```

La prueba de integración recorre toda la API contra una base PostgreSQL real. Solo se ejecuta si defines
`TEST_DATABASE_URL` apuntando a una **base de pruebas** (nunca la de producción). En GitHub se ejecuta
sola en cada push gracias a `.github/workflows/ci.yml`.

## A prueba de fallos

**Servidor:** reintenta la conexión a la base si se corta, límite de tiempo en cada consulta, límite de
peticiones por IP, errores de la base traducidos a mensajes claros, código de referencia en cada error
para rastrearlo en los registros de Vercel, y `/api/salud` para revisar variables y base de datos.

**Navegador:** librerías servidas desde el propio sitio (no dependen de CDN), reintento automático de
lecturas, tiempo límite en cada petición, aviso de "sin conexión", pantalla de error con botón
**Reintentar**, protección contra doble envío de formularios, la sesión expirada lleva al login con aviso,
y si el equipo no soporta 3D o prefiere menos movimiento, la interfaz se adapta sola.

## Seguridad

Contraseñas con bcrypt · sesión en cookie `HttpOnly` + `SameSite` (y `Secure` en producción) ·
protección CSRF por cabecera · bloqueo tras 5 intentos fallidos de login · cuentas creadas solo por el administrador ·
contraseña temporal obligatoria de cambiar · aislamiento total entre academias · permisos por rol en cada ruta ·
cada coach solo accede a sus datos · sesión validada contra la base en cada petición · auditoría de toda escritura ·
consultas SQL parametrizadas · HTML escapado en el frontend · CSP · RLS activado en Supabase.

> Las predicciones y recomendaciones son herramientas de apoyo al entrenador, no diagnósticos médicos.
