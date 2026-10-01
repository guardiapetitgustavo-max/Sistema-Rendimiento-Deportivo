-- =============================================================================
-- SportEval AI · Plataforma multi-academia de rendimiento deportivo
-- Esquema completo de la base de datos (PostgreSQL / Supabase)
--
-- CÓMO USARLO: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Es seguro ejecutarlo más de una vez: solo crea lo que falta y migra automáticamente
-- las bases creadas con versiones anteriores (sin perder datos).
--
-- Para borrar todo y empezar de cero, ejecuta primero:
--   DROP TABLE IF EXISTS auditoria, rol_permisos, tutores, predicciones, modelos_ml, alimentacion,
--     evaluaciones, deportistas, membresias, academia_config, intentos_login, usuarios, academias CASCADE;
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
