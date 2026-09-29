-- =============================================================================
-- Crear o recuperar la cuenta de ADMINISTRADOR
--
-- Como no hay registro público, el primer administrador se crea aquí.
-- 1. Ejecuta antes sql/schema.sql.
-- 2. Cambia el nombre, el correo y la contraseña de abajo (mínimo 6 caracteres).
-- 3. Supabase → SQL Editor → New query → pega este archivo → Run.
--
-- Si el correo ya existe, lo convierte en administrador, lo activa y le pone
-- esta contraseña. Es seguro ejecutarlo más de una vez.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
VALUES (
  'Administrador',
  lower('guardiapetitgustavo@gmail.com'),
  extensions.crypt('CAMBIA_ESTA_CLAVE', extensions.gen_salt('bf', 10)),
  'admin',
  true
)
ON CONFLICT (correo) DO UPDATE SET
  rol           = 'admin',
  activo        = true,
  password_hash = EXCLUDED.password_hash;

DELETE FROM intentos_login;

SELECT id, nombre, correo, rol, activo FROM usuarios WHERE rol = 'admin';
