/**
 * Estructura de la academia (FASE 2): sedes, instalaciones, deportes, disciplinas, posiciones,
 * categorías y equipos. Los deportes se crean desde una plantilla (se copia toda su configuración)
 * o desde cero (deporte personalizado).
 */
const { query, transaccion } = require('../../db/pool');
const { HttpError, noEncontrado } = require('../../utils/http-error');
const { crearCatalogo } = require('../../core/catalogo');
const { verificarLimite } = require('../../core/limites');
const { condicionDeportista } = require('../../core/alcance');
const plantillas = require('../../domain/plantillas-deporte');
const { MODOS } = require('../../domain/medicion');

const texto = (etiqueta, maxLargo = 120, requerido = false) => ({ tipo: 'texto', etiqueta, maxLargo, requerido });

function enLista(valor, lista, etiqueta) {
  if (valor && !lista.includes(valor)) throw new HttpError(400, `${etiqueta} no válido: ${valor}`);
}

const sedes = crearCatalogo({
  tabla: 'sedes',
  entidad: 'Sede',
  esquema: {
    nombre: texto('Nombre', 120, true), direccion: texto('Dirección', 200), ciudad: texto('Ciudad', 80), telefono: texto('Teléfono', 40),
  },
});

const TIPOS_INSTALACION = ['campo', 'cancha', 'pista', 'piscina', 'gimnasio', 'lago', 'playa', 'personalizada'];
const instalaciones = crearCatalogo({
  tabla: 'instalaciones',
  entidad: 'Instalación',
  esquema: {
    nombre: texto('Nombre', 120, true),
    tipo: texto('Tipo', 20, true),
    sede_id: { tipo: 'entero', etiqueta: 'Sede', min: 1 },
    largo_m: { tipo: 'numero', etiqueta: 'Largo (m)', min: 1, max: 100000 },
    carriles: { tipo: 'entero', etiqueta: 'Carriles', min: 1, max: 20 },
    profundidad_m: { tipo: 'numero', etiqueta: 'Profundidad (m)', min: 0.1, max: 30 },
    notas: texto('Notas', 400),
  },
  referencias: { sede_id: { tabla: 'sedes', etiqueta: 'La sede' } },
  filtros: { sede_id: 'sede_id' },
  seleccion: 'SELECT x.*, s.nombre AS sede FROM instalaciones x LEFT JOIN sedes s ON s.id = x.sede_id',
  preparar: (d) => {
    enLista(d.tipo, TIPOS_INSTALACION, 'Tipo de instalación');
    if (d.tipo === 'piscina' && !d.largo_m) throw new HttpError(400, 'Indica el largo de la piscina (25 o 50 m) para poder comparar tiempos');
    return d;
  },
});

const deportes = crearCatalogo({
  tabla: 'deportes',
  entidad: 'Deporte',
  esquema: { nombre: texto('Nombre', 80, true), modo_medicion: texto('Modo de medición', 20, true), descripcion: texto('Descripción', 400) },
  seleccion: `SELECT x.*,
    (SELECT count(*)::int FROM pruebas p WHERE p.deporte_id = x.id AND p.activo) AS pruebas,
    (SELECT count(*)::int FROM deportistas d WHERE d.deporte_id = x.id AND d.activo) AS deportistas
    FROM deportes x`,
  preparar: (d) => { enLista(d.modo_medicion, MODOS, 'Modo de medición'); return d; },
});

const disciplinas = crearCatalogo({
  tabla: 'disciplinas',
  entidad: 'Disciplina',
  esquema: { nombre: texto('Nombre', 80, true), deporte_id: { tipo: 'entero', etiqueta: 'Deporte', requerido: true, min: 1 } },
  referencias: { deporte_id: { tabla: 'deportes', etiqueta: 'El deporte' } },
  filtros: { deporte_id: 'deporte_id' },
});

const posiciones = crearCatalogo({
  tabla: 'posiciones',
  entidad: 'Posición',
  esquema: { nombre: texto('Nombre', 80, true), deporte_id: { tipo: 'entero', etiqueta: 'Deporte', requerido: true, min: 1 } },
  referencias: { deporte_id: { tabla: 'deportes', etiqueta: 'El deporte' } },
  filtros: { deporte_id: 'deporte_id' },
});

const categorias = crearCatalogo({
  tabla: 'categorias',
  entidad: 'Categoría',
  esquema: {
    nombre: texto('Nombre', 60, true),
    edad_min: { tipo: 'entero', etiqueta: 'Edad mínima', min: 3, max: 100 },
    edad_max: { tipo: 'entero', etiqueta: 'Edad máxima', min: 3, max: 100 },
    nivel: texto('Nivel', 60),
    descripcion: texto('Descripción', 400),
  },
  orden: 'x.edad_min NULLS LAST, x.nombre',
  seleccion: `SELECT x.*, (SELECT count(*)::int FROM deportistas d WHERE d.categoria_id = x.id AND d.activo) AS deportistas
    FROM categorias x`,
  preparar: (d) => {
    if (d.edad_min !== null && d.edad_max !== null && d.edad_min > d.edad_max) throw new HttpError(400, 'La edad mínima no puede ser mayor que la máxima');
    return d;
  },
});

const equipos = crearCatalogo({
  tabla: 'equipos',
  entidad: 'Equipo',
  esquema: {
    nombre: texto('Nombre', 80, true),
    deporte_id: { tipo: 'entero', etiqueta: 'Deporte', min: 1 },
    categoria_id: { tipo: 'entero', etiqueta: 'Categoría', min: 1 },
    coach_id: { tipo: 'entero', etiqueta: 'Coach', min: 1 },
    sede_id: { tipo: 'entero', etiqueta: 'Sede', min: 1 },
    instalacion_id: { tipo: 'entero', etiqueta: 'Instalación', min: 1 },
    horario: texto('Horario', 200),
  },
  referencias: {
    deporte_id: { tabla: 'deportes', etiqueta: 'El deporte' },
    categoria_id: { tabla: 'categorias', etiqueta: 'La categoría' },
    sede_id: { tabla: 'sedes', etiqueta: 'La sede' },
    instalacion_id: { tabla: 'instalaciones', etiqueta: 'La instalación' },
    coach_id: 'coach',
  },
  filtros: { deporte_id: 'deporte_id', categoria_id: 'categoria_id', coach_id: 'coach_id' },
  seleccion: `SELECT x.*, dp.nombre AS deporte, c.nombre AS categoria, u.nombre AS coach, s.nombre AS sede, i.nombre AS instalacion,
    (SELECT count(*)::int FROM equipo_miembros em JOIN deportistas d ON d.id = em.deportista_id WHERE em.equipo_id = x.id AND d.activo) AS miembros
    FROM equipos x
    LEFT JOIN deportes dp ON dp.id = x.deporte_id LEFT JOIN categorias c ON c.id = x.categoria_id
    LEFT JOIN usuarios u ON u.id = x.coach_id LEFT JOIN sedes s ON s.id = x.sede_id LEFT JOIN instalaciones i ON i.id = x.instalacion_id`,
});

/** Un coach solo ve sus equipos; el administrador, todos. */
async function listarEquipos(alcance, consulta = {}) {
  const lista = await equipos.listar(alcance, consulta);
  return alcance.coach ? lista.filter((e) => e.coach_id === alcance.coach) : lista;
}

async function miembros(alcance, equipoId) {
  await equipos.obtener(alcance, equipoId);
  const { rows } = await query(
    `SELECT d.id, d.codigo, d.nombre, d.apellidos, d.categoria, d.disciplina, d.fecha_nacimiento, d.posicion_id, p.nombre AS posicion, em.desde
     FROM equipo_miembros em JOIN deportistas d ON d.id = em.deportista_id LEFT JOIN posiciones p ON p.id = d.posicion_id
     WHERE em.equipo_id = $1 AND d.activo AND d.academia_id = $2 ORDER BY d.nombre`,
    [equipoId, alcance.academia],
  );
  return rows;
}

/** Reemplaza los miembros de un equipo (deportistas de la academia visibles para quien lo hace). */
async function asignarMiembros(alcance, equipoId, deportistas) {
  const equipo = await equipos.obtener(alcance, equipoId);
  if (alcance.coach && equipo.coach_id !== alcance.coach) throw new HttpError(403, 'Solo el coach del equipo o el administrador pueden cambiar sus miembros');
  const ids = [...new Set((deportistas || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length) {
    const { rows } = await query(
      `SELECT d.id FROM deportistas d WHERE d.id = ANY($3::int[]) AND d.activo AND ${condicionDeportista('d', '$1', '$2')}`,
      [alcance.academia, alcance.coach, ids],
    );
    if (rows.length !== ids.length) throw new HttpError(400, 'Algún deportista no existe en la academia o no está a tu cargo');
  }
  await transaccion(async (cliente) => {
    await cliente.query('DELETE FROM equipo_miembros WHERE equipo_id = $1 AND NOT (deportista_id = ANY($2::int[]))', [equipoId, ids]);
    if (ids.length) {
      await cliente.query('INSERT INTO equipo_miembros (equipo_id, deportista_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [equipoId, ids]);
    }
  });
  return miembros(alcance, equipoId);
}

async function crearSede(alcance, datos, actor) {
  if (actor?.academia) await verificarLimite(actor, 'sedes');
  return sedes.crear(alcance, datos);
}

// ---------------------------------------------------------------------------
// Activar un deporte desde su plantilla (copia completa y editable)
// ---------------------------------------------------------------------------
async function asegurarMetrica(cliente, academia, clave) {
  const def = plantillas.METRICAS[clave];
  const { rows } = await cliente.query(
    `INSERT INTO metricas (academia_id, clave, nombre, tipo_resultado, unidad, direccion_mejora, rango_min, rango_max, decimales)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (academia_id, clave) DO UPDATE SET clave = EXCLUDED.clave
     RETURNING id`,
    [academia, clave, def.nombre, def.tipo, def.unidad, def.direccion, def.rango?.min ?? null, def.rango?.max ?? null, def.decimales],
  );
  return rows[0].id;
}

async function asegurarPrueba(cliente, academia, deporteId, def, esGeneral) {
  const { rows: existentes } = await cliente.query('SELECT id FROM pruebas WHERE academia_id = $1 AND clave = $2', [academia, def.clave]);
  if (existentes.length) return { id: existentes[0].id, nueva: false };
  const metricaId = await asegurarMetrica(cliente, academia, def.metrica);
  const { rows } = await cliente.query(
    `INSERT INTO pruebas (academia_id, deporte_id, metrica_id, clave, nombre, capacidad, modo, distancia_m, estilo, parcial_cada_m,
                          intentos, campos, baremo_base, baremo_excelente)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [academia, esGeneral ? null : deporteId, metricaId, def.clave, def.nombre, def.capacidad, def.modo || 'campo',
      def.distancia_m ?? null, def.estilo ?? null, def.parcial_cada_m ?? null, def.intentos || 1, JSON.stringify(def.campos || []),
      def.baremo?.base ?? null, def.baremo?.excelente ?? null],
  );
  return { id: rows[0].id, nueva: true };
}

async function activarPlantilla(alcance, clave, actor) {
  const plantilla = plantillas.DEPORTES[clave];
  if (!plantilla) throw new HttpError(400, `No existe la plantilla de deporte "${clave}"`);
  const generales = new Set(plantillas.PRUEBAS_GENERALES.map((p) => p.clave));
  const academia = alcance.academia;

  return transaccion(async (cliente) => {
    const { rows: existe } = await cliente.query('SELECT id FROM deportes WHERE academia_id = $1 AND (plantilla = $2 OR lower(nombre) = lower($3))', [academia, clave, plantilla.nombre]);
    if (existe.length) throw new HttpError(409, `${plantilla.nombre} ya está activado en tu academia`);

    const { rows: [deporte] } = await cliente.query(
      'INSERT INTO deportes (academia_id, nombre, plantilla, modo_medicion) VALUES ($1, $2, $3, $4) RETURNING *',
      [academia, plantilla.nombre, clave, plantilla.modo],
    );
    for (const nombre of plantilla.disciplinas) {
      await cliente.query('INSERT INTO disciplinas (academia_id, deporte_id, nombre) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [academia, deporte.id, nombre]);
    }
    for (const nombre of plantilla.posiciones) {
      await cliente.query('INSERT INTO posiciones (academia_id, deporte_id, nombre) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [academia, deporte.id, nombre]);
    }

    const ids = [];
    let nuevas = 0;
    const baremos = {};
    for (const def of plantillas.pruebasDe(clave)) {
      const prueba = await asegurarPrueba(cliente, academia, deporte.id, def, generales.has(def.clave));
      ids.push(prueba.id);
      if (prueba.nueva) nuevas += 1;
      if (def.baremo) baremos[prueba.id] = { base: def.baremo.base, excelente: def.baremo.excelente };
    }

    await cliente.query(
      `INSERT INTO plantillas_evaluacion (academia_id, deporte_id, nombre, pruebas, frecuencia_dias, creado_por)
       VALUES ($1, $2, $3, $4, 60, $5)`,
      [academia, deporte.id, `Evaluación física de ${plantilla.nombre}`, JSON.stringify(ids), actor?.id ?? null],
    );
    for (const tipo of plantilla.entrenamiento) {
      const def = plantillas.ENTRENAMIENTO[tipo];
      await cliente.query(
        `INSERT INTO plantillas_entrenamiento (academia_id, deporte_id, clave, nombre, campos, total)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (academia_id, nombre) DO NOTHING`,
        [academia, deporte.id, tipo, `${def.nombre}${tipo === 'fuerza' ? '' : ` · ${plantilla.nombre}`}`, JSON.stringify(def.campos), def.total],
      );
    }
    await cliente.query(
      `INSERT INTO configuraciones_scoring (academia_id, deporte_id, nombre, pesos, baremos, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [academia, deporte.id, `Puntuación ${plantilla.nombre}`, JSON.stringify(plantilla.pesos), JSON.stringify(baremos), actor?.id ?? null],
    );
    return {
      deporte, pruebas: ids.length, pruebas_nuevas: nuevas, disciplinas: plantilla.disciplinas.length, posiciones: plantilla.posiciones.length,
    };
  });
}

/** Resumen de la estructura para selectores (una sola petición). */
async function resumen(alcance) {
  const consultas = {
    sedes: 'SELECT id, nombre FROM sedes WHERE academia_id = $1 AND activo ORDER BY nombre',
    instalaciones: 'SELECT id, nombre, tipo, largo_m, carriles, sede_id FROM instalaciones WHERE academia_id = $1 AND activo ORDER BY nombre',
    deportes: 'SELECT id, nombre, plantilla, modo_medicion FROM deportes WHERE academia_id = $1 AND activo ORDER BY nombre',
    disciplinas: 'SELECT id, nombre, deporte_id FROM disciplinas WHERE academia_id = $1 AND activo ORDER BY nombre',
    posiciones: 'SELECT id, nombre, deporte_id FROM posiciones WHERE academia_id = $1 AND activo ORDER BY nombre',
    categorias: 'SELECT id, nombre, edad_min, edad_max, nivel FROM categorias WHERE academia_id = $1 AND activo ORDER BY edad_min NULLS LAST, nombre',
    equipos: 'SELECT id, nombre, deporte_id, categoria_id, coach_id, horario, instalacion_id FROM equipos WHERE academia_id = $1 AND activo ORDER BY nombre',
    coaches: `SELECT u.id, u.nombre, m.rol FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
              WHERE m.academia_id = $1 AND m.activo AND m.rol IN ('coach', 'admin') ORDER BY u.nombre`,
  };
  const entradas = await Promise.all(Object.entries(consultas).map(async ([k, sql]) => [k, (await query(sql, [alcance.academia])).rows]));
  const datos = Object.fromEntries(entradas);
  if (alcance.coach) datos.mis_equipos = datos.equipos.filter((e) => e.coach_id === alcance.coach).map((e) => e.id);
  return datos;
}

async function obtenerDeporte(alcance, id) {
  const deporte = await deportes.obtener(alcance, id);
  if (!deporte) throw noEncontrado('Deporte');
  return deporte;
}

module.exports = {
  sedes, instalaciones, deportes, disciplinas, posiciones, categorias, equipos,
  listarEquipos, miembros, asignarMiembros, crearSede, activarPlantilla, resumen, obtenerDeporte,
  plantillasDisponibles: plantillas.listarPlantillas,
};
