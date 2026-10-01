/**
 * Configuración de la academia activa (AcademySettings), permisos por rol y auditoría.
 * Todo se lee y escribe SIEMPRE para la academia del usuario (nunca se recibe el id del cliente).
 */
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const permisos = require('../../core/permisos');
const modulos = require('../../core/modulos');

const MAX_LOGO = 300 * 1024; // caracteres del data URL (~220 KB de imagen)
const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const texto = (etiqueta, maxLargo = 160) => ({ tipo: 'texto', etiqueta, maxLargo });
const esquemaConfig = {
  nombre: { tipo: 'texto', etiqueta: 'Nombre de la academia', requerido: true, maxLargo: 120 },
  nombre_comercial: texto('Nombre comercial', 120),
  descripcion: texto('Descripción', 600),
  pais: texto('País', 80),
  ciudad: texto('Ciudad', 80),
  direccion: texto('Dirección', 200),
  telefono: texto('Teléfono', 40),
  correo: { tipo: 'correo', etiqueta: 'Correo de contacto' },
  zona_horaria: texto('Zona horaria', 60),
  moneda: texto('Moneda', 3),
  color_primario: texto('Color primario', 7),
  color_secundario: texto('Color secundario', 7),
};
const CAMPOS_CONFIG = Object.keys(esquemaConfig).filter((c) => c !== 'nombre');

async function obtener(academia) {
  const { rows } = await query(
    `SELECT a.id, a.nombre, a.slug, a.estado, a.creado_en, to_jsonb(c) - 'academia_id' - 'logo' AS config, (c.logo IS NOT NULL) AS tiene_logo
     FROM academias a JOIN academia_config c ON c.academia_id = a.id WHERE a.id = $1`,
    [academia],
  );
  if (!rows.length) throw noEncontrado('Academia');
  const { config, ...resto } = rows[0];
  return {
    ...resto,
    config: { ...config, modulos: modulos.efectivos(config.modulos) },
    catalogo_modulos: modulos.MODULOS,
  };
}

function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona }).format(); // lanza si la zona no existe
    return true;
  } catch {
    return false;
  }
}

/** Actualiza datos generales, branding, logo y módulos. Devuelve también qué campos cambiaron (para auditoría). */
async function actualizar(academia, datos = {}) {
  const d = validar(esquemaConfig, datos, { parcial: true });
  if (d.color_primario && !COLOR.test(d.color_primario)) throw new HttpError(400, 'El color primario debe tener el formato #RRGGBB');
  if (d.color_secundario && !COLOR.test(d.color_secundario)) throw new HttpError(400, 'El color secundario debe tener el formato #RRGGBB');
  if (d.zona_horaria && !zonaValida(d.zona_horaria)) throw new HttpError(400, 'La zona horaria no es válida (ejemplo: America/Lima)');
  if (d.moneda && !/^[A-Za-z]{3}$/.test(d.moneda)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras (PEN, USD, EUR…)');
  if (d.moneda) d.moneda = d.moneda.toUpperCase();
  for (const obligatorio of ['zona_horaria', 'moneda', 'color_primario', 'color_secundario']) {
    if (obligatorio in d && !d[obligatorio]) delete d[obligatorio]; // vacío = se conserva el valor actual
  }

  let logo;
  if (datos.logo !== undefined) {
    if (datos.logo === null || datos.logo === '') logo = null;
    else if (typeof datos.logo !== 'string' || !LOGO_VALIDO.test(datos.logo)) throw new HttpError(400, 'El logo debe ser una imagen PNG, JPG o WEBP');
    else if (datos.logo.length > MAX_LOGO) throw new HttpError(413, 'El logo es demasiado grande (máximo 200 KB)');
    else logo = datos.logo;
  }

  let nuevosModulos;
  if (datos.modulos !== undefined) {
    if (typeof datos.modulos !== 'object' || datos.modulos === null || Array.isArray(datos.modulos)) {
      throw new HttpError(400, 'Formato de módulos no válido');
    }
    nuevosModulos = {};
    for (const [clave, valor] of Object.entries(datos.modulos)) {
      if (!modulos.existe(clave) || typeof valor !== 'boolean') throw new HttpError(400, `Módulo no válido: ${clave}`);
      if (valor && !modulos.disponible(clave)) throw new HttpError(400, `El módulo "${clave}" todavía no está disponible`);
      nuevosModulos[clave] = valor;
    }
  }

  const campos = CAMPOS_CONFIG.filter((c) => c in d);
  await transaccion(async (cliente) => {
    if (d.nombre) await cliente.query('UPDATE academias SET nombre = $2 WHERE id = $1', [academia, d.nombre]);
    const sets = campos.map((c, i) => `${c} = $${i + 2}`);
    const valores = campos.map((c) => d[c]);
    if (logo !== undefined) { sets.push(`logo = $${valores.length + 2}`); valores.push(logo); }
    if (nuevosModulos) { sets.push(`modulos = modulos || $${valores.length + 2}::jsonb`); valores.push(JSON.stringify(nuevosModulos)); }
    if (sets.length) {
      await cliente.query(`UPDATE academia_config SET ${sets.join(', ')}, actualizado_en = now() WHERE academia_id = $1`, [academia, ...valores]);
    }
  });

  const cambios = [...(d.nombre ? ['nombre'] : []), ...campos, ...(logo !== undefined ? ['logo'] : []), ...(nuevosModulos ? Object.keys(nuevosModulos).map((m) => `modulo:${m}`) : [])];
  return { academia: await obtener(academia), cambios };
}

async function logo(academia) {
  const { rows } = await query('SELECT logo FROM academia_config WHERE academia_id = $1', [academia]);
  const dataUrl = rows[0]?.logo;
  if (!dataUrl) throw noEncontrado('Logo');
  const [, tipo, base64] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl) || [];
  if (!tipo) throw noEncontrado('Logo');
  return { tipo, contenido: Buffer.from(base64, 'base64') };
}

// ---------------------------------------------------------------------------
// Permisos por rol
// ---------------------------------------------------------------------------
async function obtenerPermisos(academia) {
  const { rows } = await query('SELECT rol, permiso, permitido FROM rol_permisos WHERE academia_id = $1', [academia]);
  const excepciones = {};
  for (const r of rows) (excepciones[r.rol] ||= {})[r.permiso] = r.permitido;

  return {
    roles: permisos.ROLES_CONFIGURABLES.map((rol) => ({ clave: rol, nombre: permisos.NOMBRE_ROL[rol] })),
    permisos: permisos.PERMISOS.map((p) => ({
      clave: p.clave,
      grupo: p.grupo,
      etiqueta: p.etiqueta,
      modulo: p.modulo || null,
      solo_admin: Boolean(p.soloAdmin),
      valores: Object.fromEntries(permisos.ROLES_CONFIGURABLES.map((rol) => [rol, permisos.configurable(p.clave, rol)
        ? { configurable: true, permitido: permisos.efectivos(rol, excepciones[rol]).includes(p.clave), por_defecto: p.roles[rol] }
        : { configurable: false, permitido: false }])),
    })),
  };
}

/** Guarda cambios de permisos: [{ rol, permiso, permitido }]. Solo guarda lo que difiere del valor por defecto. */
async function guardarPermisos(academia, cambios) {
  if (!Array.isArray(cambios) || !cambios.length) throw new HttpError(400, 'No hay cambios de permisos');
  for (const c of cambios) {
    if (!permisos.configurable(c?.permiso, c?.rol) || typeof c.permitido !== 'boolean') {
      throw new HttpError(400, `Permiso no configurable: ${c?.permiso} para ${c?.rol}`);
    }
  }
  await transaccion(async (cliente) => {
    for (const { rol, permiso, permitido } of cambios) {
      const porDefecto = permisos.PERMISOS.find((p) => p.clave === permiso).roles[rol];
      if (permitido === porDefecto) {
        await cliente.query('DELETE FROM rol_permisos WHERE academia_id = $1 AND rol = $2 AND permiso = $3', [academia, rol, permiso]);
      } else {
        await cliente.query(
          `INSERT INTO rol_permisos (academia_id, rol, permiso, permitido) VALUES ($1, $2, $3, $4)
           ON CONFLICT (academia_id, rol, permiso) DO UPDATE SET permitido = EXCLUDED.permitido`,
          [academia, rol, permiso, permitido],
        );
      }
    }
  });
  return obtenerPermisos(academia);
}

// ---------------------------------------------------------------------------
// Auditoría (solo de la academia activa)
// ---------------------------------------------------------------------------
async function auditoria(academia, { accion = '', usuario = '', desde = '', limite = 200 } = {}) {
  const valores = [academia];
  const condiciones = ['a.academia_id = $1'];
  if (accion) { valores.push(`${accion}%`); condiciones.push(`a.accion ILIKE $${valores.length}`); }
  if (usuario && /^\d+$/.test(String(usuario))) { valores.push(Number(usuario)); condiciones.push(`a.usuario_id = $${valores.length}`); }
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) { valores.push(desde); condiciones.push(`a.creado_en >= $${valores.length}::date`); }
  valores.push(Math.min(Math.max(Number(limite) || 200, 1), 500));
  const { rows } = await query(
    `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.ip, a.creado_en, u.nombre AS usuario, u.correo
     FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY a.creado_en DESC, a.id DESC
     LIMIT $${valores.length}`,
    valores,
  );
  return rows;
}

module.exports = {
  obtener, actualizar, logo, obtenerPermisos, guardarPermisos, auditoria,
};
