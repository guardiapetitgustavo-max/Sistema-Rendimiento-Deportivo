/**
 * Recuperación diaria (FASE 4): sueño, fatiga, estrés, recuperación percibida, RPE y dolor reportado.
 * Es SEGUIMIENTO, nunca diagnóstico médico: el dolor solo genera una alerta para que una persona lo revise.
 * Lo registra el propio deportista (portal) o el staff (coach/profesional). Una fila por deportista y día.
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { condicionDeportista, deportistaEnAlcance } = require('../../core/alcance');
const { redondear } = require('../../domain/medicion');

const esquema = {
  fecha: { tipo: 'fecha', etiqueta: 'Fecha', requerido: true },
  horas_sueno: { tipo: 'numero', etiqueta: 'Horas de sueño', min: 0, max: 24 },
  calidad_sueno: { tipo: 'entero', etiqueta: 'Calidad del sueño', min: 1, max: 5 },
  fatiga: { tipo: 'entero', etiqueta: 'Fatiga', min: 1, max: 10 },
  estres: { tipo: 'entero', etiqueta: 'Estrés', min: 1, max: 10 },
  recuperacion: { tipo: 'entero', etiqueta: 'Recuperación percibida', min: 1, max: 10 },
  rpe: { tipo: 'entero', etiqueta: 'Esfuerzo percibido (RPE)', min: 0, max: 10 },
  dolor: { tipo: 'booleano', etiqueta: 'Dolor' },
  dolor_zona: { tipo: 'texto', etiqueta: 'Zona del dolor', maxLargo: 80 },
  dolor_intensidad: { tipo: 'entero', etiqueta: 'Intensidad del dolor', min: 0, max: 10 },
  notas: { tipo: 'texto', etiqueta: 'Notas', maxLargo: 500 },
};

const CAMPOS = Object.keys(esquema).filter((c) => c !== 'fecha');

async function guardar(academia, deportistaId, datos, origen, usuarioId) {
  const d = validar(esquema, datos);
  if (CAMPOS.every((c) => d[c] === null || d[c] === false)) throw new HttpError(400, 'Registra al menos un dato de recuperación');
  if (d.fecha > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'No se puede registrar la recuperación de un día futuro');
  if (!d.dolor) { d.dolor_zona = null; d.dolor_intensidad = null; }
  const { rows } = await query(
    `INSERT INTO recuperacion (academia_id, deportista_id, fecha, ${CAMPOS.join(', ')}, origen, registrado_por)
     VALUES ($1, $2, $3, ${CAMPOS.map((_, i) => `$${i + 4}`).join(', ')}, $${CAMPOS.length + 4}, $${CAMPOS.length + 5})
     ON CONFLICT (deportista_id, fecha) DO UPDATE SET ${CAMPOS.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
       origen = EXCLUDED.origen, registrado_por = EXCLUDED.registrado_por
     RETURNING *, to_char(fecha, 'YYYY-MM-DD') AS fecha`,
    [academia, deportistaId, d.fecha, ...CAMPOS.map((c) => d[c]), origen, usuarioId],
  );
  return rows[0];
}

/** Staff: el deportista debe estar en su alcance. */
async function registrarStaff(alcance, usuario, datos = {}) {
  const dep = await deportistaEnAlcance(alcance, Number(datos.deportista_id));
  return guardar(alcance.academia, dep.id, datos, usuario.rol === 'profesional' ? 'profesional' : 'coach', usuario.id);
}

/** Portal: el deportista solo registra lo SUYO (ficha vinculada a su cuenta). */
async function registrarPropio(usuario, datos = {}) {
  const { rows } = await query('SELECT id FROM deportistas WHERE cuenta_id = $1 AND academia_id = $2 AND activo', [usuario.id, usuario.academia.id]);
  if (!rows.length) throw new HttpError(403, 'Tu cuenta no está vinculada a una ficha de deportista');
  const id = Number(datos.deportista_id) || rows[0].id;
  if (!rows.some((r) => r.id === id)) throw new HttpError(403, 'Solo puedes registrar tu propia recuperación');
  return guardar(usuario.academia.id, id, datos, 'deportista', usuario.id);
}

async function listar(alcance, consulta = {}) {
  const valores = [alcance.academia, alcance.coach];
  const filtros = [condicionDeportista('d', '$1', '$2')];
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`r.deportista_id = $${valores.length}`); }
  if (consulta.desde) { valores.push(String(consulta.desde).slice(0, 10)); filtros.push(`r.fecha >= $${valores.length}::date`); }
  const { rows } = await query(
    `SELECT r.*, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, d.nombre AS deportista, d.codigo FROM recuperacion r JOIN deportistas d ON d.id = r.deportista_id
     WHERE ${filtros.join(' AND ')} ORDER BY r.fecha DESC, d.nombre LIMIT 3000`,
    valores,
  );
  return rows;
}

const media = (lista) => (lista.length ? redondear(lista.reduce((s, v) => s + v, 0) / lista.length, 1) : null);

/** Resumen de los últimos N días de un conjunto de registros (para el perfil y el análisis 360). */
function resumen(registros, dias = 7, hoy = new Date()) {
  const limite = new Date(hoy.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const recientes = registros.filter((r) => String(r.fecha) >= limite);
  const num = (c) => recientes.map((r) => r[c]).filter((v) => typeof v === 'number');
  return {
    dias,
    registros: recientes.length,
    sueno_medio_h: media(num('horas_sueno')),
    fatiga_media: media(num('fatiga')),
    estres_medio: media(num('estres')),
    recuperacion_media: media(num('recuperacion')),
    rpe_medio: media(num('rpe')),
    dias_con_dolor: recientes.filter((r) => r.dolor).length,
  };
}

module.exports = { registrarStaff, registrarPropio, listar, resumen, guardar };
