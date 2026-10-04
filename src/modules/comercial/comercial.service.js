/**
 * Comercial de la academia (FASE 9): matrículas, cuotas/pagos con vencimiento y comunicados.
 * Los padres ven los pagos y comunicados de sus hijos desde el portal (solo lectura).
 */
const { query } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { validar } = require('../../utils/validar');
const { hoyISO } = require('../../utils/valores');
const { perteneceAcademia } = require('../../core/alcance');

const esquemaMatricula = {
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', requerido: true, min: 1 },
  concepto: { tipo: 'texto', etiqueta: 'Concepto', requerido: true, maxLargo: 120 },
  monto: { tipo: 'numero', etiqueta: 'Monto', min: 0, max: 1000000 },
  moneda: { tipo: 'texto', etiqueta: 'Moneda', maxLargo: 3 },
  fecha_inicio: { tipo: 'fecha', etiqueta: 'Inicio' },
  fecha_fin: { tipo: 'fecha', etiqueta: 'Fin' },
  estado: { tipo: 'texto', etiqueta: 'Estado', maxLargo: 10 },
  notas: { tipo: 'texto', etiqueta: 'Notas', maxLargo: 500 },
};

const esquemaPago = {
  deportista_id: { tipo: 'entero', etiqueta: 'Deportista', requerido: true, min: 1 },
  matricula_id: { tipo: 'entero', etiqueta: 'Matrícula', min: 1 },
  concepto: { tipo: 'texto', etiqueta: 'Concepto', requerido: true, maxLargo: 120 },
  monto: { tipo: 'numero', etiqueta: 'Monto', requerido: true, min: 0, max: 1000000 },
  moneda: { tipo: 'texto', etiqueta: 'Moneda', maxLargo: 3 },
  fecha_vencimiento: { tipo: 'fecha', etiqueta: 'Vencimiento', requerido: true },
  fecha_pago: { tipo: 'fecha', etiqueta: 'Fecha de pago' },
  estado: { tipo: 'texto', etiqueta: 'Estado', maxLargo: 10 },
  metodo: { tipo: 'texto', etiqueta: 'Método', maxLargo: 40 },
  referencia: { tipo: 'texto', etiqueta: 'Referencia', maxLargo: 80 },
};

async function deportistaDeAcademia(academia, id) {
  const dep = await perteneceAcademia('deportistas', id, academia, 'El deportista');
  if (!dep.activo) throw new HttpError(400, 'El deportista está dado de baja');
  return dep;
}

// ---- Matrículas
async function listarMatriculas(alcance, consulta = {}) {
  const { rows } = await query(
    `SELECT m.*, to_char(m.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(m.fecha_fin, 'YYYY-MM-DD') AS fecha_fin, d.nombre AS deportista, d.codigo
     FROM matriculas m JOIN deportistas d ON d.id = m.deportista_id WHERE m.academia_id = $1 AND ($2::int IS NULL OR m.deportista_id = $2)
     ORDER BY m.fecha_inicio DESC, m.id DESC LIMIT 1000`,
    [alcance.academia, Number(consulta.deportista_id) || null],
  );
  return rows;
}

async function guardarMatricula(alcance, datos, id = null) {
  let actual = null;
  if (id) {
    const { rows } = await query('SELECT * FROM matriculas WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
    if (!rows.length) throw noEncontrado('Matrícula');
    [actual] = rows;
  }
  const d = validar(esquemaMatricula, actual ? { ...actual, ...datos } : datos);
  await deportistaDeAcademia(alcance.academia, d.deportista_id);
  d.estado = d.estado || 'activa';
  if (!['pendiente', 'activa', 'vencida', 'retirada'].includes(d.estado)) throw new HttpError(400, 'Estado de matrícula no válido');
  if (d.fecha_fin && d.fecha_inicio && d.fecha_fin < d.fecha_inicio) throw new HttpError(400, 'La fecha de fin no puede ser anterior al inicio');
  const valores = [d.deportista_id, d.concepto, d.monto ?? 0, (d.moneda || 'PEN').toUpperCase(), d.fecha_inicio || hoyISO(), d.fecha_fin, d.estado, d.notas];
  if (actual) {
    const { rows } = await query(
      `UPDATE matriculas SET deportista_id = $3, concepto = $4, monto = $5, moneda = $6, fecha_inicio = $7, fecha_fin = $8, estado = $9, notas = $10
       WHERE id = $1 AND academia_id = $2 RETURNING *`, [id, alcance.academia, ...valores],
    );
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO matriculas (academia_id, deportista_id, concepto, monto, moneda, fecha_inicio, fecha_fin, estado, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [alcance.academia, ...valores],
  );
  return rows[0];
}

// ---- Pagos
/** Los pagos pendientes con vencimiento pasado se muestran (y guardan) como vencidos. */
async function marcarVencidos(academia = null) {
  const { rowCount } = await query(
    `UPDATE pagos SET estado = 'vencido' WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE AND ($1::int IS NULL OR academia_id = $1)`, [academia],
  );
  return rowCount;
}

async function listarPagos(alcance, consulta = {}) {
  await marcarVencidos(alcance.academia);
  const valores = [alcance.academia];
  const filtros = ['p.academia_id = $1'];
  if (Number(consulta.deportista_id)) { valores.push(Number(consulta.deportista_id)); filtros.push(`p.deportista_id = $${valores.length}`); }
  if (consulta.estado) { valores.push(String(consulta.estado)); filtros.push(`p.estado = $${valores.length}`); }
  const { rows } = await query(
    `SELECT p.*, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento, to_char(p.fecha_pago, 'YYYY-MM-DD') AS fecha_pago,
            d.nombre AS deportista, d.codigo FROM pagos p JOIN deportistas d ON d.id = p.deportista_id
     WHERE ${filtros.join(' AND ')} ORDER BY p.fecha_vencimiento DESC, p.id DESC LIMIT 2000`, valores,
  );
  return rows;
}

async function resumenPagos(alcance) {
  await marcarVencidos(alcance.academia);
  const { rows } = await query(
    `SELECT estado, moneda, count(*)::int AS n, coalesce(sum(monto), 0)::float AS total FROM pagos WHERE academia_id = $1
     AND (estado <> 'pagado' OR fecha_pago >= date_trunc('month', CURRENT_DATE)) GROUP BY estado, moneda`, [alcance.academia],
  );
  return rows;
}

async function guardarPago(alcance, usuario, datos, id = null) {
  let actual = null;
  if (id) {
    const { rows } = await query("SELECT *, to_char(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento, to_char(fecha_pago, 'YYYY-MM-DD') AS fecha_pago FROM pagos WHERE id = $1 AND academia_id = $2", [id, alcance.academia]);
    if (!rows.length) throw noEncontrado('Pago');
    [actual] = rows;
    if (actual.estado === 'pagado' && datos.estado !== 'anulado') throw new HttpError(409, 'Un pago cobrado no se modifica; anúlalo y registra uno nuevo');
  }
  const d = validar(esquemaPago, actual ? { ...actual, ...datos } : datos);
  await deportistaDeAcademia(alcance.academia, d.deportista_id);
  if (d.matricula_id) await perteneceAcademia('matriculas', d.matricula_id, alcance.academia, 'La matrícula');
  d.estado = d.estado || 'pendiente';
  if (!['pendiente', 'pagado', 'vencido', 'anulado'].includes(d.estado)) throw new HttpError(400, 'Estado de pago no válido');
  if (d.estado === 'pagado') d.fecha_pago = d.fecha_pago || hoyISO();
  const valores = [d.deportista_id, d.matricula_id, d.concepto, d.monto, (d.moneda || 'PEN').toUpperCase(), d.fecha_vencimiento, d.fecha_pago, d.estado, d.metodo, d.referencia];
  if (actual) {
    const { rows } = await query(
      `UPDATE pagos SET deportista_id = $3, matricula_id = $4, concepto = $5, monto = $6, moneda = $7, fecha_vencimiento = $8, fecha_pago = $9,
         estado = $10, metodo = $11, referencia = $12 WHERE id = $1 AND academia_id = $2 RETURNING *`, [id, alcance.academia, ...valores],
    );
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO pagos (academia_id, deportista_id, matricula_id, concepto, monto, moneda, fecha_vencimiento, fecha_pago, estado, metodo, referencia, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`, [alcance.academia, ...valores, usuario.id],
  );
  return rows[0];
}

/** Genera las cuotas de un mes para todas las matrículas activas (no duplica si ya existen). */
async function generarCuotas(alcance, usuario, datos = {}) {
  const mes = /^\d{4}-\d{2}$/.test(String(datos.mes || '')) ? datos.mes : hoyISO().slice(0, 7);
  const dia = Math.min(28, Math.max(1, Number(datos.dia_vencimiento) || 5));
  const { rows } = await query(
    `INSERT INTO pagos (academia_id, deportista_id, matricula_id, concepto, monto, moneda, fecha_vencimiento, registrado_por)
     SELECT m.academia_id, m.deportista_id, m.id, m.concepto || ' ' || $2, m.monto, m.moneda, ($2 || '-' || lpad($3::text, 2, '0'))::date, $4
     FROM matriculas m JOIN deportistas d ON d.id = m.deportista_id
     WHERE m.academia_id = $1 AND m.estado = 'activa' AND d.activo AND m.monto > 0
       AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.matricula_id = m.id AND to_char(p.fecha_vencimiento, 'YYYY-MM') = $2 AND p.estado <> 'anulado')
     RETURNING id`,
    [alcance.academia, mes, dia, usuario.id],
  );
  return { mes, generadas: rows.length };
}

// ---- Comunicados
async function listarComunicados(usuario, { todos = false } = {}) {
  const { rows } = await query(
    `SELECT c.*, u.nombre AS autor FROM comunicados c LEFT JOIN usuarios u ON u.id = c.publicado_por
     WHERE c.academia_id = $1 AND c.activo AND ($2 OR c.destino = 'todos' OR (c.destino = 'rol' AND c.destino_valor = $3)
       OR (c.destino = 'equipo' AND EXISTS (
         SELECT 1 FROM equipos e WHERE e.id::text = c.destino_valor AND (e.coach_id = $4 OR EXISTS (
           SELECT 1 FROM equipo_miembros em JOIN deportistas d ON d.id = em.deportista_id
           WHERE em.equipo_id = e.id AND (d.cuenta_id = $4 OR EXISTS (SELECT 1 FROM tutores t WHERE t.deportista_id = d.id AND t.usuario_id = $4)))))))
     ORDER BY c.publicado_en DESC LIMIT 100`,
    [usuario.academia.id, todos, usuario.rol, usuario.id],
  );
  return rows;
}

async function publicarComunicado(alcance, usuario, datos = {}) {
  const d = validar({
    titulo: { tipo: 'texto', etiqueta: 'Título', requerido: true, maxLargo: 120 },
    cuerpo: { tipo: 'texto', etiqueta: 'Mensaje', requerido: true, maxLargo: 4000 },
    destino: { tipo: 'texto', etiqueta: 'Destino', maxLargo: 10 },
    destino_valor: { tipo: 'texto', etiqueta: 'Destinatarios', maxLargo: 40 },
  }, datos);
  d.destino = d.destino || 'todos';
  if (!['todos', 'rol', 'equipo'].includes(d.destino)) throw new HttpError(400, 'Destino no válido');
  if (d.destino === 'rol' && !['coach', 'deportista', 'padre', 'profesional'].includes(d.destino_valor)) throw new HttpError(400, 'Elige el rol destinatario');
  if (d.destino === 'equipo') await perteneceAcademia('equipos', Number(d.destino_valor), alcance.academia, 'El equipo');
  if (d.destino === 'todos') d.destino_valor = null;
  const { rows } = await query(
    'INSERT INTO comunicados (academia_id, titulo, cuerpo, destino, destino_valor, publicado_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [alcance.academia, d.titulo, d.cuerpo, d.destino, d.destino_valor, usuario.id],
  );
  return rows[0];
}

async function retirarComunicado(alcance, id) {
  const { rowCount } = await query('UPDATE comunicados SET activo = false WHERE id = $1 AND academia_id = $2', [id, alcance.academia]);
  if (!rowCount) throw noEncontrado('Comunicado');
}

module.exports = {
  listarMatriculas, guardarMatricula, listarPagos, resumenPagos, guardarPago, generarCuotas, marcarVencidos,
  listarComunicados, publicarComunicado, retirarComunicado,
};
