const bcrypt = require('bcryptjs');
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const auditoria = require('../../core/auditoria');

const MAX_INTENTOS = 5;
const VENTANA_MINUTOS = 5;

const esquemaLogin = {
  correo: { tipo: 'correo', etiqueta: 'Correo', requerido: true },
  password: { tipo: 'texto', etiqueta: 'Contraseña', requerido: true },
};

// Las cuentas no se registran solas: las crea un administrador (módulo admin).

// Hash de relleno: se compara aunque el correo no exista para no revelar qué cuentas existen
const HASH_RELLENO = bcrypt.hashSync('relleno-para-tiempo-constante', 10);

const publico = ({ id, nombre, correo, es_super_admin: superAdmin, debe_cambiar_clave: debeCambiarClave }) => ({
  id, nombre, correo, es_super_admin: Boolean(superAdmin), debe_cambiar_clave: Boolean(debeCambiarClave),
});

/** Bloquea una combinación IP + correo tras varios intentos fallidos (anti fuerza bruta). */
async function estaBloqueado(clave) {
  const { rows } = await query(
    `SELECT intentos >= $2 AS bloqueado FROM intentos_login
     WHERE clave = $1 AND primer_fallo > now() - make_interval(mins => $3)`,
    [clave, MAX_INTENTOS, VENTANA_MINUTOS],
  );
  return Boolean(rows[0]?.bloqueado);
}

async function registrarFallo(clave) {
  if (Math.random() < 0.05) await query("DELETE FROM intentos_login WHERE primer_fallo < now() - interval '1 day'");
  return query(
    `INSERT INTO intentos_login (clave, intentos) VALUES ($1, 1)
     ON CONFLICT (clave) DO UPDATE SET
       intentos     = CASE WHEN intentos_login.primer_fallo < now() - make_interval(mins => $2)
                           THEN 1 ELSE intentos_login.intentos + 1 END,
       primer_fallo = CASE WHEN intentos_login.primer_fallo < now() - make_interval(mins => $2)
                           THEN now() ELSE intentos_login.primer_fallo END`,
    [clave, VENTANA_MINUTOS],
  );
}

async function autenticar(datos, ip) {
  const { correo, password } = validar(esquemaLogin, datos);
  const clave = `${ip}::${correo}`;

  if (await estaBloqueado(clave)) {
    throw new HttpError(429, 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.');
  }

  const { rows } = await query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
  const usuario = rows[0];
  const valida = await bcrypt.compare(password, usuario?.password_hash || HASH_RELLENO);
  if (!usuario || !valida) {
    await registrarFallo(clave);
    await auditoria.registrar({ accion: 'login_fallido', entidad: 'usuarios', detalle: { correo }, ip });
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }

  await query('DELETE FROM intentos_login WHERE clave = $1', [clave]);
  // Se comprueba después de la contraseña para no revelar qué cuentas existen
  if (!usuario.activo) throw new HttpError(403, 'Tu cuenta está desactivada. Contacta al administrador.');
  await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);
  return publico(usuario);
}

/** Academias a las que pertenece el usuario (para el selector de academia). */
async function academiasDe(usuarioId) {
  const { rows } = await query(
    `SELECT a.id, a.nombre, a.estado, m.rol FROM membresias m JOIN academias a ON a.id = m.academia_id
     WHERE m.usuario_id = $1 AND m.activo ORDER BY a.nombre`,
    [usuarioId],
  );
  return rows;
}

/** Todo lo que el frontend necesita para adaptar menús y pantallas al rol, permisos y módulos. */
async function datosSesion(contexto) {
  return {
    ...publico(contexto),
    rol: contexto.rol,
    academia: contexto.academia,
    permisos: contexto.permisos,
    academia_suspendida: contexto.academia_suspendida,
    academias: await academiasDe(contexto.id),
  };
}

/** Comprueba que el usuario pueda entrar a esa academia (membresía activa y academia activa). */
async function puedeEntrar(usuarioId, academiaId) {
  const { rows } = await query(
    `SELECT 1 FROM membresias m JOIN academias a ON a.id = m.academia_id
     WHERE m.usuario_id = $1 AND m.academia_id = $2 AND m.activo AND a.estado = 'activa'`,
    [usuarioId, academiaId],
  );
  if (!rows.length) throw new HttpError(403, 'No tienes acceso a esa academia o está suspendida');
}

module.exports = { autenticar, publico, datosSesion, puedeEntrar };
