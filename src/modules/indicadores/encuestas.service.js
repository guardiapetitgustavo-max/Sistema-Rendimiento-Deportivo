/**
 * Cuestionarios de evaluación del sistema (FASE 11):
 *   SUS (System Usability Scale, Brooke 1996): usabilidad, 10 ítems Likert 1-5.
 *   TAM (Technology Acceptance Model, Davis 1989): utilidad, facilidad e intención de uso, 10 ítems Likert 1-7.
 * Los responde cualquier persona de la academia. Los resultados se muestran solo agregados (nunca por persona).
 */
const { query } = require('../../db/pool');
const { HttpError } = require('../../utils/http-error');
const I = require('../../domain/indicadores');

const INSTRUMENTOS = ['SUS', 'TAM'];

function catalogo() {
  return {
    SUS: {
      nombre: 'Usabilidad del sistema (SUS)',
      descripcion: 'Indica qué tan de acuerdo estás con cada frase sobre tu experiencia usando la plataforma.',
      escala: { min: 1, max: 5, minimo: 'Totalmente en desacuerdo', maximo: 'Totalmente de acuerdo' },
      items: I.ITEMS_SUS,
    },
    TAM: {
      nombre: 'Aceptación de la plataforma (TAM)',
      descripcion: 'Indica qué tan de acuerdo estás con cada frase.',
      escala: { min: 1, max: 7, minimo: 'Totalmente en desacuerdo', maximo: 'Totalmente de acuerdo' },
      constructos: I.CONSTRUCTOS_TAM.map((c) => ({ clave: c.clave, nombre: c.nombre, items: c.items })),
      items: I.ITEMS_TAM.map((x) => x.texto),
    },
  };
}

/** Cuándo respondió por última vez esta persona cada cuestionario en su academia activa. */
async function estado(usuario) {
  const { rows } = await query(
    `SELECT instrumento, max(creado_en) AS ultima, count(*)::int AS veces FROM encuestas
     WHERE academia_id = $1 AND usuario_id = $2 GROUP BY instrumento`,
    [usuario.academia.id, usuario.id],
  );
  return Object.fromEntries(INSTRUMENTOS.map((i) => {
    const f = rows.find((r) => r.instrumento === i);
    return [i, { ultima: f?.ultima || null, veces: f?.veces || 0 }];
  }));
}

async function responder(usuario, instrumento, cuerpo = {}) {
  const clave = String(instrumento || '').toUpperCase();
  if (!INSTRUMENTOS.includes(clave)) throw new HttpError(404, 'Cuestionario no encontrado');
  const respuestas = Array.isArray(cuerpo.respuestas) ? cuerpo.respuestas.map(Number) : null;
  let puntaje;
  let detalle;
  try {
    if (clave === 'SUS') {
      puntaje = I.puntajeSus(respuestas);
      detalle = { interpretacion: I.interpretarSus(puntaje) };
    } else {
      const t = I.puntajeTam(respuestas);
      puntaje = t.puntaje;
      detalle = { constructos: t.constructos, nivel: I.nivelAceptacion(t.puntaje) };
    }
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  // Evita envíos repetidos por error (doble clic): uno por cuestionario cada 10 minutos
  const { rows: recientes } = await query(
    `SELECT 1 FROM encuestas WHERE academia_id = $1 AND usuario_id = $2 AND instrumento = $3 AND creado_en > now() - interval '10 minutes'`,
    [usuario.academia.id, usuario.id, clave],
  );
  if (recientes.length) throw new HttpError(409, 'Ya enviaste este cuestionario hace unos minutos. ¡Gracias!');
  const comentario = cuerpo.comentario ? String(cuerpo.comentario).trim().slice(0, 1000) || null : null;
  const { rows } = await query(
    `INSERT INTO encuestas (academia_id, usuario_id, instrumento, rol, respuestas, puntaje, detalle, comentario)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, instrumento, puntaje, detalle, creado_en`,
    [usuario.academia.id, usuario.id, clave, usuario.rol, JSON.stringify(respuestas), puntaje, JSON.stringify(detalle), comentario],
  );
  return rows[0];
}

/**
 * Última respuesta de cada persona en el periodo (así cada persona cuenta una vez).
 * Devuelve filas anónimas: rol, respuestas, puntaje, detalle, comentario, fecha.
 */
async function respuestasDelPeriodo(academia, instrumento, { desde, hasta }) {
  const { rows } = await query(
    `SELECT DISTINCT ON (usuario_id) rol, respuestas, puntaje, detalle, comentario, to_char(creado_en, 'YYYY-MM-DD') AS fecha
     FROM encuestas WHERE academia_id = $1 AND instrumento = $2 AND creado_en::date BETWEEN $3::date AND $4::date
     ORDER BY usuario_id, creado_en DESC`,
    [academia, instrumento, desde, hasta],
  );
  return rows;
}

module.exports = { INSTRUMENTOS, catalogo, estado, responder, respuestasDelPeriodo };
