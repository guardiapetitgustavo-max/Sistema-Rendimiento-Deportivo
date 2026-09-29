-- =============================================================================
-- SportEval AI · Sistema de Rendimiento Deportivo
-- Esquema completo de la base de datos (PostgreSQL / Supabase)
--
-- CÓMO USARLO: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es seguro ejecutarlo más de una vez: solo crea lo que todavía no existe.
--
-- Para borrar todo y empezar de cero, ejecuta primero:
--   DROP TABLE IF EXISTS predicciones, modelos_ml, alimentacion, evaluaciones,
--                        deportistas, intentos_login, usuarios CASCADE;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Usuarios (coaches). Cada coach ve y gestiona solo sus propios deportistas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  correo        TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  rol           TEXT        NOT NULL DEFAULT 'coach',
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Control anti fuerza bruta del login (clave = IP + correo)
CREATE TABLE IF NOT EXISTS intentos_login (
  clave        TEXT        PRIMARY KEY,
  intentos     INTEGER     NOT NULL DEFAULT 0,
  primer_fallo TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Deportistas. Baja lógica con "activo": nunca se borran para conservar historial.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deportistas (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo         TEXT    NOT NULL,
  nombre         TEXT    NOT NULL,
  edad           INTEGER CHECK (edad BETWEEN 4 AND 100),
  categoria      TEXT,
  disciplina     TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  fecha_registro DATE    NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (usuario_id, codigo)
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
-- Machine Learning: un modelo entrenado por coach y el historial de predicciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modelos_ml (
  usuario_id   INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  modelo       JSONB       NOT NULL,
  info         JSONB       NOT NULL,
  entrenado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- -----------------------------------------------------------------------------
-- Índices para las consultas más frecuentes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_deportistas_usuario   ON deportistas (usuario_id, activo);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_dep      ON evaluaciones (deportista_id, fecha) WHERE activa;
CREATE INDEX IF NOT EXISTS idx_alimentacion_dep      ON alimentacion (deportista_id, fecha) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_predicciones_dep      ON predicciones (deportista_id, fecha DESC);

-- -----------------------------------------------------------------------------
-- Seguridad: activa RLS para bloquear el acceso público de la API automática de
-- Supabase (anon key). La aplicación se conecta con DATABASE_URL como dueña de
-- las tablas, así que no se ve afectada.
-- -----------------------------------------------------------------------------
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE deportistas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alimentacion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelos_ml     ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicciones   ENABLE ROW LEVEL SECURITY;
