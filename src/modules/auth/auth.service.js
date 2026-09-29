const bcrypt = require('bcryptjs');
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');

const MAX_INTENTOS = 5;
const VENTANA_MINUTOS = 5;

const esquemaRegistro = {
  nombre: { tipo: 'texto', etiqueta: 'Nombre', requerido: true, maxLargo: 120 },
  correo: { tipo: 'correo', etiqueta: 'Correo', requerido: true },
  password: { tipo: 'texto', etiqueta: 'Contraseña', requerido: true, maxLargo: 200 },
};

const esquemaLogin = {
  correo: { tipo: 'correo', etiqueta: 'Correo', requerido: true },
  password: { tipo: 'texto', etiqueta: 'Contraseña', requerido: true },
};

// Hash de relleno: se compara aunque el correo no exista para no revelar qué cuentas existen
const HASH_RELLENO = bcrypt.hashSync('relleno-para-tiempo-constante', 10);

const publico = ({ id, nombre, correo, rol }) => ({ id, nombre, correo, rol });

async function registrar(datos) {
  const { nombre, correo, password } = validar(esquemaRegistro, datos);
  if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  if (datos.confirmar !== undefined && datos.confirmar !== password) {
    throw new HttpError(400, 'Las contraseñas no coinciden');
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, correo, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (correo) DO NOTHING
     RETURNING id, nombre, correo, rol`,
    [nombre, correo, hash],
  );
  if (!rows.length) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  return publico(rows[0]);
}

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
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }

  await query('DELETE FROM intentos_login WHERE clave = $1', [clave]);
  return publico(usuario);
}

module.exports = { registrar, autenticar };
