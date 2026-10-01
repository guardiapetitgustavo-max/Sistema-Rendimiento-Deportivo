-- =============================================================================
-- Crear o recuperar la cuenta del SUPER ADMINISTRADOR (dueño de la plataforma)
--
-- Úsalo SOLO la primera vez o si olvidaste la contraseña:
-- cada vez que lo ejecutas, la contraseña pasa a ser la que escribas abajo.
--
-- 1. Ejecuta antes sql/schema.sql.
-- 2. Cambia el nombre, el correo y la contraseña (mínimo 6 caracteres) de las 3 líneas marcadas.
-- 3. Supabase → SQL Editor → New query → pega este archivo → Run.
--
-- Resultado: la cuenta queda como super admin (administra academias) y como
-- administradora de la primera academia (la crea si no existe ninguna).
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_nombre   TEXT := 'Gustavo Petit';                    -- ← nombre
  v_correo   TEXT := 'guardiapetitgustavo@gmail.com';    -- ← correo
  v_clave    TEXT := 'CAMBIA_ESTA_CLAVE';                -- ← contraseña
  v_usuario  INTEGER;
  v_academia INTEGER;
BEGIN
  IF to_regclass('membresias') IS NULL THEN
    RAISE EXCEPTION 'Primero ejecuta sql/schema.sql completo';
  END IF;
  IF v_clave = 'CAMBIA' || '_ESTA_CLAVE' OR length(v_clave) < 6 THEN
    RAISE EXCEPTION 'Escribe una contraseña real de al menos 6 caracteres en v_clave';
  END IF;

  INSERT INTO usuarios (nombre, correo, password_hash, es_super_admin, activo, debe_cambiar_clave)
  VALUES (v_nombre, lower(trim(v_correo)), extensions.crypt(v_clave, extensions.gen_salt('bf', 10)), true, true, false)
  ON CONFLICT (correo) DO UPDATE SET
    password_hash = EXCLUDED.password_hash, es_super_admin = true, activo = true, debe_cambiar_clave = false
  RETURNING id INTO v_usuario;

  SELECT id INTO v_academia FROM academias ORDER BY id LIMIT 1;
  IF v_academia IS NULL THEN
    INSERT INTO academias (nombre, slug) VALUES ('Mi academia', 'mi-academia') RETURNING id INTO v_academia;
    INSERT INTO academia_config (academia_id) VALUES (v_academia);
  END IF;

  INSERT INTO membresias (usuario_id, academia_id, rol, activo) VALUES (v_usuario, v_academia, 'admin', true)
  ON CONFLICT (usuario_id, academia_id) DO UPDATE SET rol = 'admin', activo = true;

  DELETE FROM intentos_login;
END $$;

SELECT u.id, u.nombre, u.correo, u.es_super_admin, a.nombre AS academia, m.rol
FROM usuarios u JOIN membresias m ON m.usuario_id = u.id JOIN academias a ON a.id = m.academia_id
WHERE u.es_super_admin;
