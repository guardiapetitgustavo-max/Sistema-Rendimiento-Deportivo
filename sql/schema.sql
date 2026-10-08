-- =============================================================================
-- SportEval AI · Plataforma multi-academia de rendimiento deportivo
-- Esquema completo de la base de datos (PostgreSQL / Supabase)
--
-- CÓMO USARLO: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es seguro ejecutarlo más de una vez: solo crea lo que falta y migra automáticamente
-- las bases creadas con versiones anteriores (sin perder datos).
--
-- Para borrar todo y empezar de cero, ejecuta primero:
--   DROP SCHEMA public CASCADE; CREATE SCHEMA public;
--   (borra TODAS las tablas; vuelve a ejecutar después este archivo)
-- =============================================================================

-- =============================================================================
-- 1. PLATAFORMA (multi-tenant): cada academia es un tenant con datos aislados
-- =============================================================================
CREATE TABLE IF NOT EXISTS academias (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre    TEXT        NOT NULL,
  slug      TEXT        NOT NULL UNIQUE,
  estado    TEXT        NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'suspendida')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración propia de cada academia (AcademySettings)
CREATE TABLE IF NOT EXISTS academia_config (
  academia_id      INTEGER PRIMARY KEY REFERENCES academias(id) ON DELETE CASCADE,
  nombre_comercial TEXT,
  descripcion      TEXT,
  logo             TEXT,        -- imagen pequeña como data URL (png/jpeg/webp)
  pais             TEXT,
  ciudad           TEXT,
  direccion        TEXT,
  telefono         TEXT,
  correo           TEXT,
  zona_horaria     TEXT  NOT NULL DEFAULT 'America/Lima',
  moneda           TEXT  NOT NULL DEFAULT 'PEN',
  color_primario   TEXT  NOT NULL DEFAULT '#3f6bff' CHECK (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  color_secundario TEXT  NOT NULL DEFAULT '#8b5cf6' CHECK (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
  modulos          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- módulos activados/desactivados
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identidad global de las personas. El rol NO está aquí: depende de la academia (membresias).
-- es_super_admin = administra la plataforma (academias), sin acceso a datos deportivos salvo membresía.
CREATE TABLE IF NOT EXISTS usuarios (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre             TEXT        NOT NULL,
  correo             TEXT        NOT NULL UNIQUE,
  password_hash      TEXT        NOT NULL,
  es_super_admin     BOOLEAN     NOT NULL DEFAULT false,
  activo             BOOLEAN     NOT NULL DEFAULT true,
  debe_cambiar_clave BOOLEAN     NOT NULL DEFAULT false,
  ultimo_acceso      TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actualiza bases creadas con versiones anteriores de este archivo
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_super_admin     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo             BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_clave BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso      TIMESTAMPTZ;
UPDATE usuarios SET correo = lower(trim(correo)) WHERE correo <> lower(trim(correo));

-- Pertenencia de una persona a una academia, con su rol en ella (RBAC por academia)
CREATE TABLE IF NOT EXISTS membresias (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  academia_id INTEGER     NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  rol         TEXT        NOT NULL CHECK (rol IN ('admin', 'coach', 'deportista', 'padre')),
  activo      BOOLEAN     NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, academia_id)
);

-- Excepciones de permisos por academia y rol (los valores por defecto están en el código)
CREATE TABLE IF NOT EXISTS rol_permisos (
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  rol         TEXT    NOT NULL CHECK (rol IN ('coach', 'deportista', 'padre')),
  permiso     TEXT    NOT NULL,
  permitido   BOOLEAN NOT NULL,
  PRIMARY KEY (academia_id, rol, permiso)
);

-- Auditoría de eventos importantes (login, altas, cambios, bajas, configuración)
CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER REFERENCES academias(id) ON DELETE CASCADE,  -- null = evento de plataforma
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion      TEXT        NOT NULL,
  entidad     TEXT,
  entidad_id  TEXT,
  detalle     JSONB,
  ip          TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Control anti fuerza bruta del login (clave = IP + correo)
CREATE TABLE IF NOT EXISTS intentos_login (
  clave        TEXT        PRIMARY KEY,
  intentos     INTEGER     NOT NULL DEFAULT 0,
  primer_fallo TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración desde la versión con rol global en usuarios (v2.x): todos pasan a "Mi academia"
-- con su rol de entonces, y los administradores quedan también como super admin.
DO $$
DECLARE principal INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'usuarios' AND column_name = 'rol') THEN
    IF EXISTS (SELECT 1 FROM usuarios) THEN
      SELECT id INTO principal FROM academias ORDER BY id LIMIT 1;
      IF principal IS NULL THEN
        INSERT INTO academias (nombre, slug) VALUES ('Mi academia', 'mi-academia') RETURNING id INTO principal;
      END IF;
      INSERT INTO membresias (usuario_id, academia_id, rol, activo)
        SELECT id, principal, CASE WHEN rol = 'admin' THEN 'admin' ELSE 'coach' END, activo FROM usuarios
        ON CONFLICT (usuario_id, academia_id) DO NOTHING;
      UPDATE usuarios SET es_super_admin = true WHERE rol = 'admin';
    END IF;
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_valido;
    ALTER TABLE usuarios DROP COLUMN rol;
  END IF;
END $$;

-- Toda academia tiene su fila de configuración
INSERT INTO academia_config (academia_id)
  SELECT id FROM academias a WHERE NOT EXISTS (SELECT 1 FROM academia_config c WHERE c.academia_id = a.id);

-- =============================================================================
-- 2. DEPORTISTAS (pertenecen a una academia y tienen un coach responsable)
--    Baja lógica con "activo": nunca se borran para conservar el historial.
-- =============================================================================
CREATE TABLE IF NOT EXISTS deportistas (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,   -- coach responsable
  cuenta_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,           -- cuenta del propio deportista
  codigo         TEXT    NOT NULL,
  nombre         TEXT    NOT NULL,
  edad           INTEGER CHECK (edad BETWEEN 4 AND 100),
  categoria      TEXT,
  disciplina     TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  fecha_registro DATE    NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT deportistas_academia_codigo_key UNIQUE (academia_id, codigo),
  CONSTRAINT deportistas_academia_cuenta_key UNIQUE (academia_id, cuenta_id)
);

ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS academia_id INTEGER REFERENCES academias(id) ON DELETE CASCADE;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS cuenta_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
DO $$ BEGIN
  -- Cada deportista antiguo pasa a la academia de su coach
  UPDATE deportistas d SET academia_id = (
    SELECT m.academia_id FROM membresias m WHERE m.usuario_id = d.usuario_id ORDER BY m.academia_id LIMIT 1)
  WHERE academia_id IS NULL;
  UPDATE deportistas SET academia_id = (SELECT id FROM academias ORDER BY id LIMIT 1) WHERE academia_id IS NULL;
  IF NOT EXISTS (SELECT 1 FROM deportistas WHERE academia_id IS NULL) THEN
    ALTER TABLE deportistas ALTER COLUMN academia_id SET NOT NULL;
  END IF;
  -- El código pasa a ser único por academia (antes era por coach)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deportistas_academia_codigo_key') THEN
    UPDATE deportistas d SET codigo = d.codigo || '-' || d.id
    WHERE EXISTS (SELECT 1 FROM deportistas o WHERE o.academia_id = d.academia_id AND o.codigo = d.codigo AND o.id < d.id);
    ALTER TABLE deportistas DROP CONSTRAINT IF EXISTS deportistas_usuario_id_codigo_key;
    ALTER TABLE deportistas ADD CONSTRAINT deportistas_academia_codigo_key UNIQUE (academia_id, codigo);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deportistas_academia_cuenta_key') THEN
    ALTER TABLE deportistas ADD CONSTRAINT deportistas_academia_cuenta_key UNIQUE (academia_id, cuenta_id);
  END IF;
END $$;

-- Padres / madres / tutores vinculados a deportistas (solo consulta)
CREATE TABLE IF NOT EXISTS tutores (
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  parentesco    TEXT,
  PRIMARY KEY (usuario_id, deportista_id)
);

-- -----------------------------------------------------------------------------
-- Evaluaciones por observación directa (8 capacidades en escala 0-100)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluaciones (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deportista_id      INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  fecha              DATE    NOT NULL DEFAULT CURRENT_DATE,
  velocidad          DOUBLE PRECISION CHECK (velocidad BETWEEN 0 AND 100),
  resistencia        DOUBLE PRECISION CHECK (resistencia BETWEEN 0 AND 100),
  fuerza             DOUBLE PRECISION CHECK (fuerza BETWEEN 0 AND 100),
  agilidad           DOUBLE PRECISION CHECK (agilidad BETWEEN 0 AND 100),
  coordinacion       DOUBLE PRECISION CHECK (coordinacion BETWEEN 0 AND 100),
  tecnica            DOUBLE PRECISION CHECK (tecnica BETWEEN 0 AND 100),
  disciplina_score   DOUBLE PRECISION CHECK (disciplina_score BETWEEN 0 AND 100),
  asistencia         DOUBLE PRECISION CHECK (asistencia BETWEEN 0 AND 100),
  puntuacion_general DOUBLE PRECISION CHECK (puntuacion_general BETWEEN 0 AND 100),
  observaciones      TEXT,
  origen             TEXT    NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'excel')),
  activa             BOOLEAN NOT NULL DEFAULT true,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Registro diario de alimentación, hidratación y descanso
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alimentacion (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deportista_id      INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  fecha              DATE    NOT NULL DEFAULT CURRENT_DATE,
  desayuno           TEXT,
  almuerzo           TEXT,
  cena               TEXT,
  colaciones         TEXT,
  hidratacion_litros DOUBLE PRECISION CHECK (hidratacion_litros BETWEEN 0 AND 24),
  suplementos        TEXT,
  horas_sueno        DOUBLE PRECISION CHECK (horas_sueno BETWEEN 0 AND 24),
  notas              TEXT,
  activo             BOOLEAN NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- Machine Learning: un modelo por academia y coach (o el del administrador para
-- toda la academia) y el historial de predicciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modelos_ml (
  academia_id  INTEGER     NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  usuario_id   INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modelo       JSONB       NOT NULL,
  info         JSONB       NOT NULL,
  entrenado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (academia_id, usuario_id)
);

-- Migración: los modelos antiguos (uno por coach) pasan a la academia del coach
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'modelos_ml' AND column_name = 'academia_id') THEN
    ALTER TABLE modelos_ml ADD COLUMN academia_id INTEGER REFERENCES academias(id) ON DELETE CASCADE;
    UPDATE modelos_ml ml SET academia_id = (
      SELECT m.academia_id FROM membresias m WHERE m.usuario_id = ml.usuario_id ORDER BY m.academia_id LIMIT 1);
    DELETE FROM modelos_ml WHERE academia_id IS NULL;
    ALTER TABLE modelos_ml ALTER COLUMN academia_id SET NOT NULL;
    ALTER TABLE modelos_ml DROP CONSTRAINT IF EXISTS modelos_ml_pkey;
    ALTER TABLE modelos_ml ADD PRIMARY KEY (academia_id, usuario_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS predicciones (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deportista_id        INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  fecha                TIMESTAMPTZ NOT NULL DEFAULT now(),
  rendimiento_predicho DOUBLE PRECISION,
  nivel                TEXT NOT NULL CHECK (nivel IN ('Bajo', 'Medio', 'Alto')),
  confianza            DOUBLE PRECISION,
  probabilidades       JSONB,
  recomendacion        TEXT,
  variables            JSONB,
  modelo_demo          BOOLEAN NOT NULL DEFAULT false
);

-- =============================================================================
-- 3. ESTRUCTURA DE LA ACADEMIA (FASE 2): sedes, instalaciones, deportes,
--    disciplinas, posiciones, categorías y equipos. Todo configurable por academia.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sedes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre      TEXT    NOT NULL,
  direccion   TEXT,
  ciudad      TEXT,
  telefono    TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, nombre)
);

CREATE TABLE IF NOT EXISTS instalaciones (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id  INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  sede_id      INTEGER REFERENCES sedes(id) ON DELETE SET NULL,
  nombre       TEXT    NOT NULL,
  tipo         TEXT    NOT NULL DEFAULT 'campo'
               CHECK (tipo IN ('campo', 'cancha', 'pista', 'piscina', 'gimnasio', 'lago', 'playa', 'personalizada')),
  largo_m      DOUBLE PRECISION CHECK (largo_m > 0),
  carriles     INTEGER CHECK (carriles BETWEEN 1 AND 20),
  profundidad_m DOUBLE PRECISION CHECK (profundidad_m > 0),
  notas        TEXT,
  activo       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (academia_id, nombre)
);

CREATE TABLE IF NOT EXISTS deportes (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id  INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre       TEXT    NOT NULL,
  plantilla    TEXT,   -- plantilla de origen (futbol, natacion…) o null si es personalizado
  modo_medicion TEXT   NOT NULL DEFAULT 'campo'
               CHECK (modo_medicion IN ('campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado')),
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT true,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, nombre)
);

CREATE TABLE IF NOT EXISTS disciplinas (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id  INTEGER NOT NULL REFERENCES deportes(id) ON DELETE CASCADE,
  nombre      TEXT    NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (deporte_id, nombre)
);

CREATE TABLE IF NOT EXISTS posiciones (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id  INTEGER NOT NULL REFERENCES deportes(id) ON DELETE CASCADE,
  nombre      TEXT    NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (deporte_id, nombre)
);

CREATE TABLE IF NOT EXISTS categorias (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre      TEXT    NOT NULL,
  edad_min    INTEGER CHECK (edad_min BETWEEN 3 AND 100),
  edad_max    INTEGER CHECK (edad_max BETWEEN 3 AND 100),
  nivel       TEXT,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (academia_id, nombre),
  CHECK (edad_min IS NULL OR edad_max IS NULL OR edad_min <= edad_max)
);

CREATE TABLE IF NOT EXISTS equipos (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre         TEXT    NOT NULL,
  deporte_id     INTEGER REFERENCES deportes(id) ON DELETE SET NULL,
  categoria_id   INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  coach_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  sede_id        INTEGER REFERENCES sedes(id) ON DELETE SET NULL,
  instalacion_id INTEGER REFERENCES instalaciones(id) ON DELETE SET NULL,
  horario        TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (academia_id, nombre)
);

CREATE TABLE IF NOT EXISTS equipo_miembros (
  equipo_id     INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  desde         DATE    NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (equipo_id, deportista_id)
);

-- Ficha completa del deportista
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS apellidos        TEXT;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS sexo             TEXT;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS deporte_id       INTEGER REFERENCES deportes(id) ON DELETE SET NULL;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS posicion_id      INTEGER REFERENCES posiciones(id) ON DELETE SET NULL;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS categoria_id     INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS altura_cm        DOUBLE PRECISION;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS peso_kg          DOUBLE PRECISION;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS foto             TEXT;
ALTER TABLE deportistas ADD COLUMN IF NOT EXISTS objetivo_general TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deportistas_sexo_valido') THEN
    ALTER TABLE deportistas ADD CONSTRAINT deportistas_sexo_valido CHECK (sexo IS NULL OR sexo IN ('F', 'M', 'X'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deportistas_medidas_validas') THEN
    ALTER TABLE deportistas ADD CONSTRAINT deportistas_medidas_validas
      CHECK ((altura_cm IS NULL OR altura_cm BETWEEN 50 AND 250) AND (peso_kg IS NULL OR peso_kg BETWEEN 10 AND 250));
  END IF;
END $$;

-- =============================================================================
-- 4. METODOLOGÍA Y MEDICIÓN (FASE 3): métricas, pruebas, plantillas de evaluación,
--    sesiones de evaluación y resultados (multideporte, con unidades y dirección de mejora)
-- =============================================================================
CREATE TABLE IF NOT EXISTS metricas (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id      INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  clave            TEXT    NOT NULL,
  nombre           TEXT    NOT NULL,
  tipo_resultado   TEXT    NOT NULL CHECK (tipo_resultado IN ('TIME', 'DISTANCE', 'SPEED', 'PACE', 'COUNT', 'SCORE',
                     'PERCENTAGE', 'HEART_RATE', 'RPE', 'WEIGHT', 'HEIGHT', 'ANGLE', 'CUSTOM')),
  unidad           TEXT    NOT NULL,
  direccion_mejora TEXT    NOT NULL CHECK (direccion_mejora IN ('LOWER_IS_BETTER', 'HIGHER_IS_BETTER', 'TARGET_RANGE', 'CUSTOM')),
  rango_min        DOUBLE PRECISION,
  rango_max        DOUBLE PRECISION,
  decimales        INTEGER NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 4),
  prioridad        INTEGER NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (academia_id, clave)
);

CREATE TABLE IF NOT EXISTS pruebas (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id     INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id      INTEGER REFERENCES deportes(id) ON DELETE CASCADE,   -- null = prueba general
  metrica_id      INTEGER NOT NULL REFERENCES metricas(id),
  clave           TEXT    NOT NULL,
  nombre          TEXT    NOT NULL,
  capacidad       TEXT    NOT NULL DEFAULT 'otra',
  modo            TEXT    NOT NULL DEFAULT 'campo'
                  CHECK (modo IN ('campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado')),
  distancia_m     DOUBLE PRECISION CHECK (distancia_m > 0),
  estilo          TEXT,
  parcial_cada_m  DOUBLE PRECISION CHECK (parcial_cada_m > 0),
  intentos        INTEGER NOT NULL DEFAULT 1 CHECK (intentos BETWEEN 1 AND 10),
  criterio        TEXT    NOT NULL DEFAULT 'mejor' CHECK (criterio IN ('mejor', 'promedio', 'ultimo')),
  campos          JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- datos extra a registrar (brazadas, dificultad…)
  baremo_base     DOUBLE PRECISION,                        -- valor de referencia = 0 puntos
  baremo_excelente DOUBLE PRECISION,                       -- valor de referencia = 100 puntos
  instrucciones   TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, clave)
);

-- Plantillas de evaluación versionadas: editar crea una versión nueva; las sesiones guardan la que usaron
CREATE TABLE IF NOT EXISTS plantillas_evaluacion (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id     INTEGER REFERENCES deportes(id) ON DELETE CASCADE,
  grupo          UUID    NOT NULL DEFAULT gen_random_uuid(),  -- identifica la plantilla a través de sus versiones
  version        INTEGER NOT NULL DEFAULT 1,
  nombre         TEXT    NOT NULL,
  pruebas        JSONB   NOT NULL DEFAULT '[]'::jsonb,         -- ids de pruebas en orden
  categorias     JSONB   NOT NULL DEFAULT '[]'::jsonb,         -- ids de categorías aplicables (vacío = todas)
  frecuencia_dias INTEGER CHECK (frecuencia_dias BETWEEN 1 AND 365),
  vigente        BOOLEAN NOT NULL DEFAULT true,
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo, version)
);

CREATE TABLE IF NOT EXISTS sesiones_evaluacion (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id     INTEGER REFERENCES deportes(id) ON DELETE SET NULL,
  categoria_id   INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  equipo_id      INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  coach_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  instalacion_id INTEGER REFERENCES instalaciones(id) ON DELETE SET NULL,
  plantilla_id   INTEGER REFERENCES plantillas_evaluacion(id) ON DELETE SET NULL,
  nombre         TEXT    NOT NULL,
  fecha          DATE    NOT NULL DEFAULT CURRENT_DATE,
  modo           TEXT    NOT NULL DEFAULT 'campo'
                 CHECK (modo IN ('campo', 'piscina', 'pista', 'cancha', 'gimnasio', 'aguas_abiertas', 'personalizado')),
  condiciones    JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- clima, temperatura, largo de piscina…
  notas          TEXT,
  estado         TEXT    NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en     TIMESTAMPTZ
);

-- Dispositivos externos (fotocélulas, GPS, wearables, cronometraje) que envían mediciones por API (FASE 10)
CREATE TABLE IF NOT EXISTS dispositivos (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  nombre      TEXT    NOT NULL,
  tipo        TEXT    NOT NULL CHECK (tipo IN ('fotocelula', 'gps', 'wearable', 'cronometraje', 'pulsometro', 'otro')),
  clave_hash  TEXT    NOT NULL UNIQUE,     -- SHA-256 de la clave de API (la clave solo se muestra al crearla)
  prefijo     TEXT    NOT NULL,            -- primeros caracteres, para reconocerla
  activo      BOOLEAN NOT NULL DEFAULT true,
  ultimo_uso  TIMESTAMPTZ,
  creado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada intento medido. Guarda SIEMPRE la fuente de la medición (una estimación nunca es "oficial").
CREATE TABLE IF NOT EXISTS resultados (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id        INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id      INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  sesion_id          INTEGER REFERENCES sesiones_evaluacion(id) ON DELETE SET NULL,
  prueba_id          INTEGER NOT NULL REFERENCES pruebas(id),
  metrica_id         INTEGER NOT NULL REFERENCES metricas(id),
  deporte_id         INTEGER REFERENCES deportes(id) ON DELETE SET NULL,
  categoria_id       INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  equipo_id          INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  coach_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  plantilla_id       INTEGER REFERENCES plantillas_evaluacion(id) ON DELETE SET NULL,
  intento            INTEGER NOT NULL DEFAULT 1 CHECK (intento BETWEEN 1 AND 50),
  valor              DOUBLE PRECISION NOT NULL,
  unidad             TEXT    NOT NULL,
  fecha              DATE    NOT NULL DEFAULT CURRENT_DATE,
  hora               TIME,
  notas              TEXT,
  fuente_medicion    TEXT    NOT NULL DEFAULT 'MANUAL' CHECK (fuente_medicion IN ('MANUAL', 'PHONE', 'VIDEO', 'SENSOR', 'EXTERNAL_SYSTEM')),
  dispositivo_id     INTEGER REFERENCES dispositivos(id) ON DELETE SET NULL,
  oficial            BOOLEAN NOT NULL DEFAULT true,
  carril             INTEGER CHECK (carril BETWEEN 1 AND 20),
  parciales          JSONB,      -- [{ "m": 25, "t": 13.1 }, …] acumulados
  datos              JSONB NOT NULL DEFAULT '{}'::jsonb,   -- brazadas, dificultad, largo de piscina, resumen GPS…
  clave_idempotencia TEXT,       -- evita duplicados al sincronizar desde el modo sin conexión
  registrado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  activo             BOOLEAN NOT NULL DEFAULT true,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, clave_idempotencia)
);

-- Cronómetro con dos dispositivos: A marca la salida, B la llegada (relojes sincronizados con el servidor)
CREATE TABLE IF NOT EXISTS cronometros (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id      INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  codigo           TEXT    NOT NULL,
  sesion_id        INTEGER REFERENCES sesiones_evaluacion(id) ON DELETE CASCADE,
  prueba_id        INTEGER NOT NULL REFERENCES pruebas(id),
  deportista_id    INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  intento          INTEGER NOT NULL DEFAULT 1,
  inicio_ms        BIGINT,
  fin_ms           BIGINT,
  incertidumbre_ms INTEGER NOT NULL DEFAULT 0,
  estado           TEXT    NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'en_curso', 'terminado', 'cancelado')),
  resultado_id     BIGINT REFERENCES resultados(id) ON DELETE SET NULL,
  creado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cronometros_codigo_activo
  ON cronometros (academia_id, codigo) WHERE estado IN ('esperando', 'en_curso');

-- =============================================================================
-- 5. ENTRENAMIENTO, ASISTENCIA, RECUPERACIÓN Y OBJETIVOS (FASES 3-4)
-- =============================================================================
CREATE TABLE IF NOT EXISTS plantillas_entrenamiento (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id  INTEGER REFERENCES deportes(id) ON DELETE CASCADE,
  clave       TEXT,
  nombre      TEXT    NOT NULL,
  campos      JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- campos de cada ejercicio para este tipo de sesión
  total       TEXT,                                    -- qué se totaliza: metros, minutos, series
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (academia_id, nombre)
);

CREATE TABLE IF NOT EXISTS sesiones_entrenamiento (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id     INTEGER REFERENCES deportes(id) ON DELETE SET NULL,
  equipo_id      INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  coach_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  instalacion_id INTEGER REFERENCES instalaciones(id) ON DELETE SET NULL,
  plantilla_id   INTEGER REFERENCES plantillas_entrenamiento(id) ON DELETE SET NULL,
  fecha          DATE    NOT NULL DEFAULT CURRENT_DATE,
  hora           TIME,
  duracion_min   INTEGER CHECK (duracion_min BETWEEN 1 AND 600),
  objetivo       TEXT,
  intensidad     INTEGER CHECK (intensidad BETWEEN 1 AND 10),
  detalle        JSONB   NOT NULL DEFAULT '{}'::jsonb,
  observaciones  TEXT,
  estado         TEXT    NOT NULL DEFAULT 'planificada' CHECK (estado IN ('planificada', 'realizada', 'cancelada')),
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ejercicios (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sesion_id    INTEGER NOT NULL REFERENCES sesiones_entrenamiento(id) ON DELETE CASCADE,
  orden        INTEGER NOT NULL DEFAULT 1,
  nombre       TEXT    NOT NULL,
  series       INTEGER CHECK (series BETWEEN 1 AND 200),
  repeticiones INTEGER CHECK (repeticiones BETWEEN 1 AND 1000),
  distancia_m  DOUBLE PRECISION CHECK (distancia_m > 0),
  duracion_min DOUBLE PRECISION CHECK (duracion_min > 0),
  intensidad   INTEGER CHECK (intensidad BETWEEN 1 AND 10),
  descanso_s   INTEGER CHECK (descanso_s >= 0),
  notas        TEXT,
  datos        JSONB   NOT NULL DEFAULT '{}'::jsonb
);

-- Asistencia (a una sesión de entrenamiento o a una fecha) con el esfuerzo percibido de la sesión (sRPE)
CREATE TABLE IF NOT EXISTS asistencia (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  sesion_id     INTEGER REFERENCES sesiones_entrenamiento(id) ON DELETE CASCADE,
  equipo_id     INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  fecha         DATE    NOT NULL DEFAULT CURRENT_DATE,
  estado        TEXT    NOT NULL CHECK (estado IN ('presente', 'ausente', 'tardanza', 'justificado')),
  rpe_sesion    INTEGER CHECK (rpe_sesion BETWEEN 0 AND 10),
  minutos       INTEGER CHECK (minutos BETWEEN 0 AND 600),
  notas         TEXT,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencia_unica ON asistencia (deportista_id, fecha, sesion_id) NULLS NOT DISTINCT;

-- Recuperación diaria (sueño, fatiga, estrés, dolor reportado). Seguimiento, NUNCA diagnóstico médico.
CREATE TABLE IF NOT EXISTS recuperacion (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id      INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id    INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  fecha            DATE    NOT NULL DEFAULT CURRENT_DATE,
  horas_sueno      DOUBLE PRECISION CHECK (horas_sueno BETWEEN 0 AND 24),
  calidad_sueno    INTEGER CHECK (calidad_sueno BETWEEN 1 AND 5),
  fatiga           INTEGER CHECK (fatiga BETWEEN 1 AND 10),
  estres           INTEGER CHECK (estres BETWEEN 1 AND 10),
  recuperacion     INTEGER CHECK (recuperacion BETWEEN 1 AND 10),
  rpe              INTEGER CHECK (rpe BETWEEN 0 AND 10),
  dolor            BOOLEAN NOT NULL DEFAULT false,
  dolor_zona       TEXT,
  dolor_intensidad INTEGER CHECK (dolor_intensidad BETWEEN 0 AND 10),
  notas            TEXT,
  origen           TEXT    NOT NULL DEFAULT 'deportista' CHECK (origen IN ('deportista', 'coach', 'profesional')),
  registrado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deportista_id, fecha)
);

CREATE TABLE IF NOT EXISTS objetivos (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id  INTEGER REFERENCES deportistas(id) ON DELETE CASCADE,
  equipo_id      INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
  categoria_id   INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('rendimiento', 'entrenamiento', 'asistencia')),
  prueba_id      INTEGER REFERENCES pruebas(id) ON DELETE CASCADE,
  descripcion    TEXT    NOT NULL,
  valor_objetivo DOUBLE PRECISION,
  valor_inicial  DOUBLE PRECISION,
  fecha_inicio   DATE    NOT NULL DEFAULT CURRENT_DATE,
  fecha_limite   DATE,
  estado         TEXT    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'alcanzado', 'vencido', 'cancelado')),
  alcanzado_en   DATE,
  creado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (deportista_id IS NOT NULL OR equipo_id IS NOT NULL OR categoria_id IS NOT NULL)
);

-- =============================================================================
-- 6. RENDIMIENTO (FASE 5): scoring configurable y VERSIONADO, y fotos del puntaje
-- =============================================================================
CREATE TABLE IF NOT EXISTS configuraciones_scoring (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deporte_id    INTEGER REFERENCES deportes(id) ON DELETE CASCADE,
  categoria_id  INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  nombre        TEXT    NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  metodo        TEXT    NOT NULL DEFAULT 'baremo' CHECK (metodo IN ('baremo', 'percentil')),
  pesos         JSONB   NOT NULL,             -- { "velocidad": 30, "resistencia": 30, … }
  baremos       JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- { "<prueba_id>": { "base": 6, "excelente": 4 } }
  reglas        JSONB   NOT NULL DEFAULT '{}'::jsonb,
  vigente       BOOLEAN NOT NULL DEFAULT true,
  activa_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reemplaza_id  INTEGER REFERENCES configuraciones_scoring(id) ON DELETE SET NULL,
  creado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Puntaje calculado y guardado con la versión de scoring usada: cambiar el scoring NO altera el pasado
CREATE TABLE IF NOT EXISTS snapshots_rendimiento (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  scoring_id    INTEGER NOT NULL REFERENCES configuraciones_scoring(id),
  fecha         DATE    NOT NULL,
  puntaje       DOUBLE PRECISION,
  cobertura     DOUBLE PRECISION,
  detalle       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deportista_id, scoring_id, fecha)
);

-- =============================================================================
-- 7. INTELIGENCIA (FASE 6): análisis trazables, reglas de alerta, alertas,
--    recomendaciones revisadas por el coach y notificaciones
-- =============================================================================
CREATE TABLE IF NOT EXISTS analisis_ia (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id INTEGER REFERENCES deportistas(id) ON DELETE CASCADE,
  equipo_id     INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('deportista', 'equipo', '360', 'asistente')),
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  modelo        TEXT    NOT NULL,
  version       TEXT    NOT NULL,
  configuracion JSONB   NOT NULL DEFAULT '{}'::jsonb,
  datos_usados  JSONB   NOT NULL DEFAULT '{}'::jsonb,
  resultado     JSONB   NOT NULL,
  suficiente    BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reglas_alerta (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id  INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  tipo         TEXT    NOT NULL,
  nombre       TEXT    NOT NULL,
  parametros   JSONB   NOT NULL DEFAULT '{}'::jsonb,
  prioridad    TEXT    NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  destinatarios JSONB  NOT NULL DEFAULT '["coach", "admin"]'::jsonb,
  activa       BOOLEAN NOT NULL DEFAULT true,
  version      INTEGER NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, tipo)
);

CREATE TABLE IF NOT EXISTS alertas (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id  INTEGER REFERENCES deportistas(id) ON DELETE CASCADE,
  tipo           TEXT    NOT NULL,
  titulo         TEXT    NOT NULL,
  motivo         TEXT    NOT NULL,
  datos          JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- los datos que generaron la alerta
  prioridad      TEXT    NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  estado         TEXT    NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'vista', 'resuelta', 'descartada')),
  responsable_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  visible_deportista BOOLEAN NOT NULL DEFAULT false,
  clave_unica    TEXT    NOT NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academia_id, clave_unica)
);

CREATE TABLE IF NOT EXISTS recomendaciones (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  analisis_id   BIGINT REFERENCES analisis_ia(id) ON DELETE SET NULL,
  categoria     TEXT    NOT NULL DEFAULT 'general',
  texto         TEXT    NOT NULL,
  estado        TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  revisado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  revisado_en   TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo      TEXT    NOT NULL,
  cuerpo      TEXT,
  enlace      TEXT,
  leida       BOOLEAN NOT NULL DEFAULT false,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 8. VIDEO Y PROCESAMIENTO ASÍNCRONO (FASE 7)
-- =============================================================================
CREATE TABLE IF NOT EXISTS videos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id        INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id      INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  deporte_id         INTEGER REFERENCES deportes(id) ON DELETE SET NULL,
  prueba_id          INTEGER REFERENCES pruebas(id) ON DELETE SET NULL,
  tipo_movimiento    TEXT    NOT NULL DEFAULT 'general',
  titulo             TEXT    NOT NULL,
  fecha              DATE    NOT NULL DEFAULT CURRENT_DATE,
  proveedor          TEXT    NOT NULL,          -- supabase | local
  ruta               TEXT    NOT NULL UNIQUE,   -- academias/{id}/videos/{uuid}.ext
  mime               TEXT    NOT NULL,
  tamano_bytes       BIGINT  NOT NULL CHECK (tamano_bytes > 0),
  subido             BOOLEAN NOT NULL DEFAULT false,
  estado             TEXT    NOT NULL DEFAULT 'PENDING' CHECK (estado IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  visible_deportista BOOLEAN NOT NULL DEFAULT false,
  notas              TEXT,
  subido_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  activo             BOOLEAN NOT NULL DEFAULT true,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Separa SIEMPRE lo medido, lo estimado y lo observado por personas
CREATE TABLE IF NOT EXISTS analisis_video (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  video_id      BIGINT  NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  disponible    BOOLEAN NOT NULL DEFAULT false,   -- false = "ANÁLISIS NO DISPONIBLE" para este movimiento
  modelo        TEXT,
  version       TEXT,
  medidos       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  estimaciones  JSONB   NOT NULL DEFAULT '{}'::jsonb,
  observaciones TEXT,
  mensaje       TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cola de trabajos pesados (video, informes masivos…) que procesa un worker fuera de Vercel
CREATE TABLE IF NOT EXISTS trabajos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER REFERENCES academias(id) ON DELETE CASCADE,
  tipo          TEXT    NOT NULL,
  payload       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  estado        TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completado', 'fallido')),
  intentos      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  disponible_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Latido de los servicios externos (p. ej. el worker de video) para saber si están activos
CREATE TABLE IF NOT EXISTS servicios_estado (
  nombre       TEXT PRIMARY KEY,
  ultima_senal TIMESTAMPTZ NOT NULL DEFAULT now(),
  version      TEXT,
  detalle      JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- 9. NUTRICIÓN (FASE 8): horarios, preferencias y restricciones declaradas
-- =============================================================================
ALTER TABLE alimentacion ADD COLUMN IF NOT EXISTS hora_desayuno  TIME;
ALTER TABLE alimentacion ADD COLUMN IF NOT EXISTS hora_almuerzo  TIME;
ALTER TABLE alimentacion ADD COLUMN IF NOT EXISTS hora_cena      TIME;
ALTER TABLE alimentacion ADD COLUMN IF NOT EXISTS origen         TEXT NOT NULL DEFAULT 'coach';
ALTER TABLE alimentacion ADD COLUMN IF NOT EXISTS registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS nutricion_perfiles (
  deportista_id       INTEGER PRIMARY KEY REFERENCES deportistas(id) ON DELETE CASCADE,
  academia_id         INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  preferencias        TEXT,
  restricciones       TEXT,
  alergias_declaradas TEXT,
  objetivo            TEXT,
  profesional_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  notas_profesional   TEXT,
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rol "profesional" (nutricionista, fisioterapeuta…) para que participe un profesional cualificado
ALTER TABLE membresias DROP CONSTRAINT IF EXISTS membresias_rol_check;
ALTER TABLE membresias ADD CONSTRAINT membresias_rol_check CHECK (rol IN ('admin', 'coach', 'deportista', 'padre', 'profesional'));
ALTER TABLE rol_permisos DROP CONSTRAINT IF EXISTS rol_permisos_rol_check;
ALTER TABLE rol_permisos ADD CONSTRAINT rol_permisos_rol_check CHECK (rol IN ('coach', 'deportista', 'padre', 'profesional'));

-- =============================================================================
-- 10. COMERCIAL (FASE 9): planes SaaS con límites configurables, suscripciones,
--     matrículas, pagos y comunicados
-- =============================================================================
CREATE TABLE IF NOT EXISTS planes (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave          TEXT    NOT NULL UNIQUE,
  nombre         TEXT    NOT NULL,
  descripcion    TEXT,
  precio_mensual DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (precio_mensual >= 0),
  moneda         TEXT    NOT NULL DEFAULT 'USD',
  limites        JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- null en un límite = sin límite
  modulos        JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- módulos incluidos
  activo         BOOLEAN NOT NULL DEFAULT true,
  orden          INTEGER NOT NULL DEFAULT 0
);

INSERT INTO planes (clave, nombre, descripcion, precio_mensual, limites, modulos, orden) VALUES
  ('BASIC', 'Basic', 'Para academias que empiezan', 29,
   '{"deportistas": 60, "coaches": 4, "sedes": 1, "almacenamiento_mb": 0, "videos": 0, "ia_analisis_mes": 50, "reportes_mes": 100}',
   '["nutricion", "ia"]', 1),
  ('PRO', 'Pro', 'Medición, IA y video para academias en crecimiento', 79,
   '{"deportistas": 300, "coaches": 20, "sedes": 3, "almacenamiento_mb": 5000, "videos": 300, "ia_analisis_mes": 600, "reportes_mes": 1000}',
   '["nutricion", "ml", "ia", "ia_analisis", "ia_360", "ia_alertas", "video", "comercial"]', 2),
  ('ENTERPRISE', 'Enterprise', 'Sin límites, para redes de academias', 249,
   '{"deportistas": null, "coaches": null, "sedes": null, "almacenamiento_mb": null, "videos": null, "ia_analisis_mes": null, "reportes_mes": null}',
   '["nutricion", "ml", "ia", "ia_analisis", "ia_360", "ia_alertas", "video", "video_ia", "comercial", "integraciones"]', 3)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS suscripciones (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  plan_id     INTEGER NOT NULL REFERENCES planes(id),
  estado      TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('prueba', 'activa', 'vencida', 'suspendida', 'cancelada')),
  inicio      DATE    NOT NULL DEFAULT CURRENT_DATE,
  fin         DATE,
  notas       TEXT,
  actual      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suscripcion_actual ON suscripciones (academia_id) WHERE actual;

-- Las academias existentes quedan en el plan Enterprise (no pierden ninguna función al actualizar)
INSERT INTO suscripciones (academia_id, plan_id, estado)
  SELECT a.id, (SELECT id FROM planes WHERE clave = 'ENTERPRISE'), 'activa' FROM academias a
  WHERE NOT EXISTS (SELECT 1 FROM suscripciones s WHERE s.academia_id = a.id AND s.actual);

CREATE TABLE IF NOT EXISTS pagos_plataforma (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  suscripcion_id INTEGER REFERENCES suscripciones(id) ON DELETE SET NULL,
  monto          DOUBLE PRECISION NOT NULL CHECK (monto >= 0),
  moneda         TEXT    NOT NULL DEFAULT 'USD',
  fecha          DATE    NOT NULL DEFAULT CURRENT_DATE,
  metodo         TEXT,
  referencia     TEXT,
  estado         TEXT    NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente', 'pagado', 'anulado')),
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matriculas (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  concepto      TEXT    NOT NULL,
  monto         DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (monto >= 0),
  moneda        TEXT    NOT NULL DEFAULT 'PEN',
  fecha_inicio  DATE    NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin     DATE,
  estado        TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('pendiente', 'activa', 'vencida', 'retirada')),
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS pagos (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id       INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id     INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  matricula_id      INTEGER REFERENCES matriculas(id) ON DELETE SET NULL,
  concepto          TEXT    NOT NULL,
  monto             DOUBLE PRECISION NOT NULL CHECK (monto >= 0),
  moneda            TEXT    NOT NULL DEFAULT 'PEN',
  fecha_vencimiento DATE    NOT NULL DEFAULT CURRENT_DATE,
  fecha_pago        DATE,
  estado            TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'vencido', 'anulado')),
  metodo            TEXT,
  referencia        TEXT,
  registrado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estado <> 'pagado' OR fecha_pago IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS comunicados (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id   INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  titulo        TEXT    NOT NULL,
  cuerpo        TEXT    NOT NULL,
  destino       TEXT    NOT NULL DEFAULT 'todos' CHECK (destino IN ('todos', 'rol', 'equipo')),
  destino_valor TEXT,
  publicado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  publicado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo        BOOLEAN NOT NULL DEFAULT true
);

-- =============================================================================
-- FASE 11: Indicadores de evaluación (lesiones, encuestas SUS/TAM y uso de reportes)
-- La carga (ACWR, monotonía) y la calidad del GPS se calculan con los datos existentes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS lesiones (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  deportista_id  INTEGER NOT NULL REFERENCES deportistas(id) ON DELETE CASCADE,
  fecha_inicio   DATE    NOT NULL,
  fecha_alta     DATE    CHECK (fecha_alta IS NULL OR fecha_alta >= fecha_inicio),   -- null = sigue lesionado
  zona           TEXT    NOT NULL,
  tipo           TEXT    NOT NULL DEFAULT 'otra'
                 CHECK (tipo IN ('muscular', 'ligamentosa', 'tendinosa', 'osea', 'articular', 'contusion', 'otra')),
  mecanismo      TEXT    CHECK (mecanismo IN ('contacto', 'sin_contacto', 'sobreuso')),
  contexto       TEXT    NOT NULL DEFAULT 'entrenamiento' CHECK (contexto IN ('entrenamiento', 'competencia', 'otro')),
  recurrente     BOOLEAN NOT NULL DEFAULT false,
  descripcion    TEXT,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Respuestas a los cuestionarios SUS (usabilidad) y TAM (aceptación). Se conserva cada envío.
CREATE TABLE IF NOT EXISTS encuestas (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  instrumento TEXT    NOT NULL CHECK (instrumento IN ('SUS', 'TAM')),
  rol         TEXT,
  respuestas  JSONB   NOT NULL,
  puntaje     DOUBLE PRECISION NOT NULL CHECK (puntaje BETWEEN 0 AND 100),
  detalle     JSONB   NOT NULL DEFAULT '{}'::jsonb,
  comentario  TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada reporte generado (con éxito o con error) y la valoración opcional de quien lo descargó
CREATE TABLE IF NOT EXISTS reportes_uso (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academia_id    INTEGER NOT NULL REFERENCES academias(id) ON DELETE CASCADE,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo           TEXT    NOT NULL,
  formato        TEXT    NOT NULL,
  exito          BOOLEAN NOT NULL,
  duracion_ms    INTEGER,
  error          TEXT,
  utilidad       INTEGER CHECK (utilidad BETWEEN 1 AND 5),
  apoyo_decision BOOLEAN,
  comentario     TEXT,
  valorado_en    TIMESTAMPTZ,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesiones_academia     ON lesiones (academia_id, fecha_inicio DESC) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_lesiones_dep          ON lesiones (deportista_id, fecha_inicio DESC) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_encuestas_academia    ON encuestas (academia_id, instrumento, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_uso_academia ON reportes_uso (academia_id, creado_en DESC);

-- -----------------------------------------------------------------------------
-- Índices de las fases 2-10
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_resultados_deportista ON resultados (deportista_id, prueba_id, fecha) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_resultados_academia   ON resultados (academia_id, fecha DESC) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_resultados_sesion     ON resultados (sesion_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_pruebas_academia      ON pruebas (academia_id, deporte_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_sesiones_eval_acad    ON sesiones_evaluacion (academia_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_ent_acad     ON sesiones_entrenamiento (academia_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_academia   ON asistencia (academia_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_sesion     ON asistencia (sesion_id);
CREATE INDEX IF NOT EXISTS idx_recuperacion_dep      ON recuperacion (deportista_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_objetivos_academia    ON objetivos (academia_id, estado);
CREATE INDEX IF NOT EXISTS idx_alertas_academia      ON alertas (academia_id, estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_user   ON notificaciones (usuario_id, leida, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_analisis_dep          ON analisis_ia (deportista_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_videos_dep            ON videos (deportista_id, fecha DESC) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_trabajos_pendientes   ON trabajos (estado, disponible_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_pagos_academia        ON pagos (academia_id, estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_equipo_miembros_dep   ON equipo_miembros (deportista_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_dep         ON snapshots_rendimiento (deportista_id, fecha DESC);

-- -----------------------------------------------------------------------------
-- Índices para las consultas más frecuentes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_deportistas_academia  ON deportistas (academia_id, activo);
CREATE INDEX IF NOT EXISTS idx_deportistas_usuario   ON deportistas (usuario_id, activo);
CREATE INDEX IF NOT EXISTS idx_membresias_academia   ON membresias (academia_id, rol);
CREATE INDEX IF NOT EXISTS idx_auditoria_academia    ON auditoria (academia_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_tutores_deportista    ON tutores (deportista_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_dep      ON evaluaciones (deportista_id, fecha) WHERE activa;
CREATE INDEX IF NOT EXISTS idx_alimentacion_dep      ON alimentacion (deportista_id, fecha) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_predicciones_dep      ON predicciones (deportista_id, fecha DESC);

-- -----------------------------------------------------------------------------
-- Seguridad: activa RLS para bloquear el acceso público de la API automática de
-- Supabase (anon key). La aplicación se conecta con DATABASE_URL como dueña de
-- las tablas, así que no se ve afectada.
-- -----------------------------------------------------------------------------
ALTER TABLE academias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE academia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rol_permisos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE deportistas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alimentacion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelos_ml     ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicciones   ENABLE ROW LEVEL SECURITY;

-- Toda tabla de la aplicación con RLS activado (incluidas las de las fases 2-10)
DO $$
DECLARE tabla record;
BEGIN
  FOR tabla IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabla.tablename);
  END LOOP;
END $$;
