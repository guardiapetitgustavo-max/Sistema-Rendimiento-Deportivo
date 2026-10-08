/**
 * Academia de demostración "Sport Academy Demo" (Fútbol, Natación y Atletismo; Sub-12 a Sub-18).
 *
 * Genera datos SINTÉTICOS pero coherentes (semilla fija → siempre los mismos): 3 coaches, 1 profesional,
 * 36 deportistas, 7 sesiones de evaluación por deporte en 4 meses con progresiones realistas (y algunos casos
 * de empeoramiento para que salten alertas), entrenamientos con asistencia y sRPE, recuperación, objetivos,
 * nutrición, matrículas/pagos y comunicados. Luego ejecuta el motor de alertas y calcula los puntajes.
 *
 * Las inserciones masivas van en lote (jsonb_to_recordset) para que termine en pocos segundos incluso en Vercel.
 * Todas las cuentas de la demo usan el dominio @demo.sportacademy.test.
 */
const bcrypt = require('bcryptjs');
const { query, transaccion } = require('../db/pool');
const { HttpError } = require('../utils/http-error');
const { redondear, parsearTiempo } = require('../domain/medicion');
const estructura = require('../modules/estructura/estructura.service');
const motor = require('../modules/inteligencia/motor-alertas');
const rendimiento = require('../modules/rendimiento/rendimiento.service');
const I = require('../domain/indicadores');

const SLUG = 'sport-academy-demo';
const DOMINIO = '@demo.sportacademy.test';
const CLAVE_DEMO = 'Demo2026!';

// ---- Aleatorio reproducible (mulberry32)
function prng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261003);
const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];

const fecha = (diasAtras) => new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);

const NOMBRES_M = ['Mateo', 'Santiago', 'Sebastián', 'Thiago', 'Diego', 'Gabriel', 'Lucas', 'Adrián', 'Joaquín', 'Nicolás', 'Daniel', 'Martín', 'Bruno', 'Rodrigo', 'Andrés', 'Leonardo', 'Emiliano', 'Fabián'];
const NOMBRES_F = ['Valentina', 'Camila', 'Luciana', 'Isabella', 'Mariana', 'Daniela', 'Sofía', 'Fernanda', 'Antonella', 'Ximena', 'Renata', 'Valeria', 'Alessandra', 'Gabriela', 'Paula', 'Micaela', 'Romina', 'Lucía'];
const APELLIDOS = ['Quispe', 'Flores', 'Rojas', 'Vargas', 'Mendoza', 'Torres', 'Castillo', 'Ramírez', 'Huamán', 'Chávez', 'Salazar', 'Paredes', 'Gutiérrez', 'Ríos', 'Silva', 'Cárdenas', 'Medina', 'Espinoza', 'Delgado', 'Navarro'];

const CATEGORIAS = [
  { nombre: 'Sub-12', edad_min: 10, edad_max: 11 },
  { nombre: 'Sub-14', edad_min: 12, edad_max: 13 },
  { nombre: 'Sub-16', edad_min: 14, edad_max: 15 },
  { nombre: 'Sub-18', edad_min: 16, edad_max: 17 },
];

/**
 * Modelo de cada prueba: media a los 13 años, cambio por año de edad, desviación entre deportistas,
 * límites físicos y redondeo. `entero` para conteos.
 */
const MODELOS = {
  sprint_10m: { media: 2.15, porAnio: -0.04, de: 0.1, min: 1.6, max: 3, dec: 2 },
  sprint_30m: { media: 5.0, porAnio: -0.12, de: 0.25, min: 3.8, max: 7, dec: 2 },
  yoyo_ir1: { media: 1000, porAnio: 120, de: 220, min: 200, max: 2800, dec: -1 },
  salto_vertical: { media: 31, porAnio: 2.5, de: 4.5, min: 15, max: 70, dec: 1 },
  t_test: { media: 11.6, porAnio: -0.25, de: 0.6, min: 8.5, max: 16, dec: 2 },
  fut_pase: { media: 6, porAnio: 0.3, de: 1.3, min: 0, max: 10, dec: 0 },
  nat_50_libre: { media: 36, porAnio: -1.8, de: 3.5, min: 23, max: 60, dec: 2 },
  nat_100_libre: { media: 80, porAnio: -4, de: 7, min: 50, max: 130, dec: 2 },
  nat_200_libre: { media: 175, porAnio: -8, de: 14, min: 110, max: 280, dec: 2 },
  nat_50_espalda: { media: 42, porAnio: -2, de: 4, min: 27, max: 70, dec: 2 },
  atl_60m: { media: 8.9, porAnio: -0.18, de: 0.4, min: 6.8, max: 12, dec: 2 },
  atl_100m: { media: 14.0, porAnio: -0.3, de: 0.7, min: 10.5, max: 19, dec: 2 },
  atl_400m: { media: 70, porAnio: -2, de: 5, min: 48, max: 100, dec: 2 },
  atl_salto_largo: { media: 4.3, porAnio: 0.18, de: 0.35, min: 2.5, max: 7.5, dec: 2 },
  cooper: { media: 2300, porAnio: 80, de: 230, min: 1200, max: 3800, dec: -1 },
};
const PRUEBAS_POR_DEPORTE = {
  futbol: ['sprint_10m', 'sprint_30m', 'yoyo_ir1', 'salto_vertical', 't_test', 'fut_pase'],
  natacion: ['nat_50_libre', 'nat_100_libre', 'nat_200_libre', 'nat_50_espalda'],
  atletismo: ['atl_60m', 'atl_100m', 'atl_400m', 'atl_salto_largo', 'cooper', 'salto_vertical'],
};
const DIAS_EVALUACION = [118, 98, 78, 58, 40, 21, 4];

const redondearA = (v, dec) => (dec < 0 ? Math.round(v / 10 ** -dec) * 10 ** -dec : redondear(v, dec));

const tiposCache = new Map();
/** Tipos reales de las columnas de una tabla (para jsonb_to_recordset). */
async function tiposDe(tabla) {
  if (!tiposCache.has(tabla)) {
    const { rows } = await query(
      `SELECT a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo FROM pg_attribute a
       WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`, [tabla],
    );
    tiposCache.set(tabla, Object.fromEntries(rows.map((r) => [r.columna, r.tipo])));
  }
  return tiposCache.get(tabla);
}

/** Inserta muchas filas en una sola consulta (los tipos se leen del catálogo de Postgres). */
async function insertarLote(tabla, filas, columnas, _tipos, retorno = '') {
  if (!filas.length) return [];
  const tipos = await tiposDe(tabla);
  const definicion = columnas.map((c) => `${c} ${tipos[c]}`).join(', ');
  const { rows } = await query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) SELECT ${columnas.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${definicion}) ${retorno}`,
    [JSON.stringify(filas.map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] ?? null]))))],
  );
  return rows;
}

async function borrarDemo() {
  await query('DELETE FROM academias WHERE slug = $1', [SLUG]);
  await query('DELETE FROM usuarios WHERE correo LIKE $1 AND NOT es_super_admin', [`%${DOMINIO}`]);
}

/**
 * Datos de los indicadores de evaluación: lesiones en los dos últimos trimestres (menos en el actual), carreras de 400 m
 * registradas con GPS por la API de integraciones (algunas con mala señal), respuestas a los cuestionarios SUS y TAM
 * de las cuentas de la demo y reportes generados con su valoración.
 */
async function datosIndicadores({ academia, usuarios, atletas, resultados, prueba }) {
  const porDep = (dep) => atletas.filter((a) => a.dep === dep);
  const [fut, nat, atl] = [porDep('futbol'), porDep('natacion'), porDep('atletismo')];
  // [días atrás, deportista, zona, tipo, mecanismo, contexto, días de baja (null = sigue lesionado)]
  const casos = [
    [160, fut[1], 'Isquiotibial izquierdo', 'muscular', 'sin_contacto', 'entrenamiento', 12],
    [141, fut[4], 'Tobillo derecho', 'ligamentosa', 'contacto', 'competencia', 21],
    [128, fut[7], 'Rodilla izquierda', 'ligamentosa', 'contacto', 'competencia', 35],
    [116, nat[2], 'Hombro derecho', 'tendinosa', 'sobreuso', 'entrenamiento', 9],
    [104, atl[3], 'Gemelo derecho', 'muscular', 'sin_contacto', 'entrenamiento', 6],
    [96, fut[9], 'Muñeca izquierda', 'contusion', 'contacto', 'entrenamiento', 3],
    [61, fut[2], 'Tobillo izquierdo', 'ligamentosa', 'contacto', 'competencia', 14],
    [26, atl[6], 'Aductor', 'muscular', 'sin_contacto', 'entrenamiento', 10],
  ];
  const conFatiga = atletas.find((a) => a.fatiga);
  if (conFatiga) casos.push([1, conFatiga, 'Isquiotibial derecho', 'muscular', 'sin_contacto', 'entrenamiento', null]);
  await insertarLote('lesiones', casos.filter(([, a]) => a).map(([dias, a, zona, tipo, mecanismo, contexto, baja]) => ({
    academia_id: academia, deportista_id: a.id, fecha_inicio: fecha(dias), fecha_alta: baja === null ? null : fecha(Math.max(0, dias - baja)),
    zona, tipo, mecanismo, contexto, recurrente: zona.startsWith('Tobillo') && dias < 100, registrado_por: a.coach,
    descripcion: baja === null ? 'Molestia tras el entrenamiento; en seguimiento' : null,
  })), ['academia_id', 'deportista_id', 'fecha_inicio', 'fecha_alta', 'zona', 'tipo', 'mecanismo', 'contexto', 'recurrente', 'registrado_por', 'descripcion']);

  // Carreras de 400 m con reloj GPS (1 Hz) en una pista de 400 m, enviadas por la API de integraciones
  const integraciones = require('../modules/integraciones/integraciones.service');
  const { rows: [disp] } = await query(
    `INSERT INTO dispositivos (academia_id, nombre, tipo, clave_hash, prefijo, creado_por) VALUES ($1, 'Relojes GPS de pista (demo)', 'gps', $2, 'sk_dev_demo', $3)
     RETURNING id, academia_id, tipo`,
    [academia, require('node:crypto').randomBytes(32).toString('hex'), usuarios.admin],
  );
  const p400 = prueba.atl_400m;
  const centro = { lat: -12.0675, lon: -77.0336 }; // pista de atletismo en Lima (aprox.)
  const radio = 400 / (2 * Math.PI);
  const mLat = 1 / 111320;
  const mLon = 1 / (111320 * Math.cos((centro.lat * Math.PI) / 180));
  let gps = 0;
  for (const [k, a] of atl.entries()) {
    const marcas = resultados.filter((r) => r.deportista_id === a.id && r.prueba_id === p400?.id && r.oficial).map((r) => r.valor);
    const base = marcas.length ? marcas.at(-1) : 70;
    for (const [j, dias] of [45, 24, 6].entries()) {
      const duracion = Math.round(base * (1 + normal() * 0.015));
      const malaSenal = (k + j) % 7 === 3; // bajo árboles / tribuna: más ruido, huecos y un salto
      const inicio = Date.parse(`${fecha(dias)}T15:30:00Z`);
      const puntos = [];
      for (let t = 0; t <= duracion; t += 1) {
        const ang = (2 * Math.PI * t) / duracion;
        const ruido = malaSenal ? 3 : 0.5;
        let lat = centro.lat + (radio * Math.sin(ang) + normal() * ruido) * mLat;
        const lon = centro.lon + (radio * Math.cos(ang) + normal() * ruido) * mLon;
        if (malaSenal && t === Math.floor(duracion / 2)) lat += 80 * mLat; // salto imposible
        const perdido = malaSenal ? rnd() < 0.08 : rnd() < 0.005;
        puntos.push(perdido ? { lat: null, lon: null, t: inicio + t * 1000 } : { lat, lon, t: inicio + t * 1000, acc: redondear((malaSenal ? 8 : 3) + rnd() * 2, 1) });
      }
      await integraciones.recibirMedicion(disp, {
        deportista_id: a.id, prueba_id: p400.id, fecha: fecha(dias), gps: puntos, clave_idempotencia: `demo-gps-${a.id}-${dias}`,
        notas: 'Registrado con reloj GPS (demo)',
      });
      gps += 1;
    }
  }

  // Cuestionarios: cada cuenta de la demo responde SUS y TAM (algunas dos veces; cuenta la última)
  const perfiles = [
    ['admin', 'admin', 0.9], ['coach.futbol', 'coach', 0.8], ['coach.natacion', 'coach', 0.7], ['coach.atletismo', 'coach', 0.85],
    ['nutricion', 'profesional', 0.6], ['deportista', 'deportista', 0.75], ['padre', 'padre', 0.5],
  ];
  const likert = (afinidad, max, invertido) => {
    const v = Math.round(1 + (max - 1) * Math.min(1, Math.max(0, afinidad + normal() * 0.12)));
    return invertido ? max + 1 - v : v;
  };
  const filasEnc = [];
  const comentariosSus = { padre: 'Me costó encontrar los pagos al principio.', 'coach.natacion': 'El Modo Piscina es muy práctico; el menú es largo.' };
  for (const [alias, rol, afinidad] of perfiles) {
    const sus = Array.from({ length: 10 }, (_, i) => likert(afinidad, 5, i % 2 === 1));
    const ps = I.puntajeSus(sus);
    filasEnc.push({ academia_id: academia, usuario_id: usuarios[alias], instrumento: 'SUS', rol, respuestas: sus, puntaje: ps,
      detalle: { interpretacion: I.interpretarSus(ps) }, comentario: comentariosSus[alias] || null, creado_en: `${fecha(20 + Math.floor(rnd() * 30))}T14:00:00Z` });
    const tam = Array.from({ length: I.ITEMS_TAM.length }, () => likert(afinidad + 0.05, 7, false));
    const pt = I.puntajeTam(tam);
    filasEnc.push({ academia_id: academia, usuario_id: usuarios[alias], instrumento: 'TAM', rol, respuestas: tam, puntaje: pt.puntaje,
      detalle: { constructos: pt.constructos, nivel: I.nivelAceptacion(pt.puntaje) }, comentario: null, creado_en: `${fecha(10 + Math.floor(rnd() * 20))}T14:30:00Z` });
  }
  await insertarLote('encuestas', filasEnc, ['academia_id', 'usuario_id', 'instrumento', 'rol', 'respuestas', 'puntaje', 'detalle', 'comentario', 'creado_en']);

  // Reportes generados en los últimos 4 meses (2 fallaron), la mayoría valorados
  const tipos = ['general', 'ranking', 'evolucion', 'seguimiento', 'marcas', 'asistencia', 'alertas', 'individual'];
  const quienes = ['admin', 'coach.futbol', 'coach.natacion', 'coach.atletismo'];
  const usos = Array.from({ length: 48 }, (_, i) => {
    const exito = i % 23 !== 7;
    const valorado = exito && rnd() < 0.7;
    const utilidad = valorado ? Math.min(5, Math.max(2, Math.round(4.1 + normal() * 0.7))) : null;
    return {
      academia_id: academia, usuario_id: usuarios[elegir(quienes)], tipo: elegir(tipos), formato: rnd() < 0.6 ? 'pdf' : 'excel', exito,
      duracion_ms: Math.round(180 + rnd() * 900), error: exito ? null : 'Tiempo de espera agotado al generar el PDF',
      utilidad, apoyo_decision: valorado ? rnd() < (utilidad >= 4 ? 0.8 : 0.3) : null, valorado_en: valorado ? new Date().toISOString() : null,
      creado_en: `${fecha(Math.floor(rnd() * 120))}T${String(9 + Math.floor(rnd() * 9)).padStart(2, '0')}:00:00Z`,
    };
  });
  await insertarLote('reportes_uso', usos, ['academia_id', 'usuario_id', 'tipo', 'formato', 'exito', 'duracion_ms', 'error', 'utilidad', 'apoyo_decision', 'valorado_en', 'creado_en']);
  return { lesiones: casos.length, trayectorias_gps: gps, encuestas: filasEnc.length, reportes_generados: usos.length };
}

async function crearDemo({ superAdminId = null, reiniciar = true } = {}) {
  const { rows: existe } = await query('SELECT id FROM academias WHERE slug = $1', [SLUG]);
  if (existe.length && !reiniciar) throw new HttpError(409, 'La academia demo ya existe');
  await borrarDemo();
  const inicio = Date.now();
  const hash = await bcrypt.hash(CLAVE_DEMO, 10);

  // 1. Academia, configuración, plan y cuentas
  const { academia, usuarios } = await transaccion(async (c) => {
    const { rows: [a] } = await c.query("INSERT INTO academias (nombre, slug) VALUES ('Sport Academy Demo', $1) RETURNING id", [SLUG]);
    await c.query(`INSERT INTO academia_config (academia_id, nombre_comercial, descripcion, ciudad, pais, color_primario, color_secundario)
      VALUES ($1, 'Sport Academy Demo', 'Academia de demostración con datos sintéticos', 'Lima', 'Perú', '#2563eb', '#10b981')`, [a.id]);
    await c.query("INSERT INTO suscripciones (academia_id, plan_id, estado) SELECT $1, id, 'activa' FROM planes WHERE clave = 'ENTERPRISE'", [a.id]);
    const cuentas = [
      ['admin', 'Ana Directora', 'admin'], ['coach.futbol', 'Carlos Entrenador (Fútbol)', 'coach'],
      ['coach.natacion', 'Natalia Entrenadora (Natación)', 'coach'], ['coach.atletismo', 'Andrés Entrenador (Atletismo)', 'coach'],
      ['nutricion', 'Laura Nutricionista', 'profesional'], ['deportista', 'Mateo Quispe (deportista)', 'deportista'], ['padre', 'Rosa Quispe (madre)', 'padre'],
    ];
    const u = {};
    for (const [alias, nombre, rol] of cuentas) {
      const { rows: [n] } = await c.query(
        'INSERT INTO usuarios (nombre, correo, password_hash, debe_cambiar_clave) VALUES ($1, $2, $3, false) RETURNING id', [nombre, `${alias}${DOMINIO}`, hash],
      );
      await c.query('INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, $3)', [n.id, a.id, rol]);
      u[alias] = n.id;
    }
    if (superAdminId) {
      await c.query(`INSERT INTO membresias (usuario_id, academia_id, rol) VALUES ($1, $2, 'admin')
        ON CONFLICT (usuario_id, academia_id) DO UPDATE SET activo = true`, [superAdminId, a.id]);
    }
    return { academia: a.id, usuarios: u };
  });

  try {
    const alcance = { academia, coach: null };
    const actor = { id: usuarios.admin };

    // 2. Deportes desde plantillas, sede, instalaciones, categorías
    const deportes = {};
    for (const clave of ['futbol', 'natacion', 'atletismo']) deportes[clave] = (await estructura.activarPlantilla(alcance, clave, actor)).deporte.id;
    const { rows: [sede] } = await query("INSERT INTO sedes (academia_id, nombre, direccion, ciudad) VALUES ($1, 'Sede Central', 'Av. del Deporte 123', 'Lima') RETURNING id", [academia]);
    const inst = {};
    for (const [k, nombre, tipo, largo, carriles] of [['cancha', 'Cancha de fútbol', 'cancha', 100, null], ['piscina', 'Piscina semiolímpica', 'piscina', 25, 6], ['pista', 'Pista atlética', 'pista', 400, 8]]) {
      const { rows: [i] } = await query('INSERT INTO instalaciones (academia_id, sede_id, nombre, tipo, largo_m, carriles) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [academia, sede.id, nombre, tipo, largo, carriles]);
      inst[k] = i.id;
    }
    const cats = {};
    for (const c of CATEGORIAS) {
      const { rows: [r] } = await query('INSERT INTO categorias (academia_id, nombre, edad_min, edad_max) VALUES ($1, $2, $3, $4) RETURNING id', [academia, c.nombre, c.edad_min, c.edad_max]);
      cats[c.nombre] = { ...c, id: r.id };
    }
    const { rows: pruebasDb } = await query(
      `SELECT p.id, p.clave, p.metrica_id, p.intentos, p.distancia_m, p.parcial_cada_m, m.unidad, m.direccion_mejora FROM pruebas p JOIN metricas m ON m.id = p.metrica_id WHERE p.academia_id = $1`, [academia],
    );
    const prueba = Object.fromEntries(pruebasDb.map((p) => [p.clave, p]));
    const { rows: posiciones } = await query('SELECT id, nombre FROM posiciones WHERE academia_id = $1 AND deporte_id = $2', [academia, deportes.futbol]);
    const { rows: plantillasEv } = await query('SELECT id, deporte_id FROM plantillas_evaluacion WHERE academia_id = $1', [academia]);
    const { rows: plantillasEnt } = await query('SELECT id, deporte_id, clave FROM plantillas_entrenamiento WHERE academia_id = $1', [academia]);

    // 3. Equipos y deportistas (12 por deporte)
    const coachDe = { futbol: usuarios['coach.futbol'], natacion: usuarios['coach.natacion'], atletismo: usuarios['coach.atletismo'] };
    const instDe = { futbol: inst.cancha, natacion: inst.piscina, atletismo: inst.pista };
    const reparto = {
      futbol: [['Sub-12', 3], ['Sub-14', 5], ['Sub-16', 4]],
      natacion: [['Sub-12', 3], ['Sub-14', 4], ['Sub-16', 3], ['Sub-18', 2]],
      atletismo: [['Sub-14', 3], ['Sub-16', 5], ['Sub-18', 4]],
    };
    const equipos = {};
    const atletas = [];
    let n = 1;
    for (const [dep, grupos] of Object.entries(reparto)) {
      for (const [cat, cuantos] of grupos) {
        const nombreEq = `${{ futbol: 'Fútbol', natacion: 'Natación', atletismo: 'Atletismo' }[dep]} ${cat}`;
        const { rows: [eq] } = await query(
          `INSERT INTO equipos (academia_id, nombre, deporte_id, categoria_id, coach_id, sede_id, instalacion_id, horario)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Lun-Mié-Vie 16:00') RETURNING id`,
          [academia, nombreEq, deportes[dep], cats[cat].id, coachDe[dep], sede.id, instDe[dep]],
        );
        equipos[`${dep}:${cat}`] = { id: eq.id, dep, cat };
        for (let i = 0; i < cuantos; i += 1) {
          const sexo = dep === 'futbol' ? (rnd() < 0.8 ? 'M' : 'F') : (rnd() < 0.5 ? 'M' : 'F');
          const edad = cats[cat].edad_min + (rnd() < 0.5 ? 0 : 1);
          const nac = new Date(Date.now() - (edad * 365.25 + 30 + rnd() * 300) * 86400000).toISOString().slice(0, 10);
          const esMateo = dep === 'futbol' && cat === 'Sub-14' && i === 0; // ficha vinculada a la cuenta de deportista
          const nombre = esMateo ? 'Mateo' : elegir(sexo === 'M' ? NOMBRES_M : NOMBRES_F);
          const apellidos = esMateo ? 'Quispe Rojas' : `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
          atletas.push({
            codigo: `SAD-${String(n).padStart(3, '0')}`, nombre: `${nombre} ${apellidos.split(' ')[0]}`, apellidos, sexo, edad, fecha_nacimiento: nac,
            dep, cat, equipo: eq.id, coach: coachDe[dep], deporte_id: deportes[dep], categoria_id: cats[cat].id,
            posicion_id: dep === 'futbol' ? elegir(posiciones).id : null,
            altura_cm: Math.round(140 + (edad - 10) * 5.5 + normal() * 6 + (sexo === 'M' ? 3 : 0)),
            peso_kg: Math.round(35 + (edad - 10) * 4.5 + normal() * 5),
            cuenta_id: esMateo ? usuarios.deportista : null,
            // capacidad individual (z) y ritmo de mejora en 4 meses (fracción); algunos empeoran al final
            z: normal() * 0.9, mejora: 0.015 + rnd() * 0.05, caida: (n % 9 === 4), baja_asistencia: (n % 11 === 3), fatiga: (n % 13 === 5),
          });
          n += 1;
        }
      }
    }
    const filasDep = await insertarLote('deportistas', atletas.map((a) => ({
      ...a, academia_id: academia, usuario_id: a.coach, categoria: a.cat, disciplina: a.dep === 'futbol' ? 'Fútbol 11' : null,
      objetivo_general: 'Mejorar el rendimiento físico de forma progresiva',
    })), ['academia_id', 'usuario_id', 'cuenta_id', 'codigo', 'nombre', 'apellidos', 'edad', 'categoria', 'disciplina', 'fecha_nacimiento', 'sexo',
      'deporte_id', 'posicion_id', 'categoria_id', 'altura_cm', 'peso_kg', 'objetivo_general'],
    { academia_id: 'int', usuario_id: 'int', cuenta_id: 'int', edad: 'int', fecha_nacimiento: 'date', deporte_id: 'int', posicion_id: 'int', categoria_id: 'int', altura_cm: 'float8', peso_kg: 'float8' },
    'RETURNING id, codigo');
    const idPorCodigo = new Map(filasDep.map((r) => [r.codigo, r.id]));
    for (const a of atletas) a.id = idPorCodigo.get(a.codigo);
    await insertarLote('equipo_miembros', atletas.map((a) => ({ equipo_id: a.equipo, deportista_id: a.id, desde: fecha(150) })),
      ['equipo_id', 'deportista_id', 'desde'], { equipo_id: 'int', deportista_id: 'int', desde: 'date' });
    const mateo = atletas.find((a) => a.cuenta_id);
    await query("INSERT INTO tutores (usuario_id, deportista_id, parentesco) VALUES ($1, $2, 'Madre')", [usuarios.padre, mateo.id]);

    // 4. Sesiones de evaluación y resultados con progresión realista
    const resultados = [];
    const sesiones = [];
    for (const dep of Object.keys(reparto)) {
      const plantilla = plantillasEv.find((p) => p.deporte_id === deportes[dep]);
      for (const [k, dias] of DIAS_EVALUACION.entries()) {
        sesiones.push({
          academia_id: academia, deporte_id: deportes[dep], coach_id: coachDe[dep], instalacion_id: instDe[dep], plantilla_id: plantilla.id,
          nombre: `Evaluación ${k + 1} · ${{ futbol: 'Fútbol', natacion: 'Natación', atletismo: 'Atletismo' }[dep]}`, fecha: fecha(dias),
          modo: dep === 'natacion' ? 'piscina' : dep === 'atletismo' ? 'pista' : 'campo',
          condiciones: dep === 'natacion' ? { largo_piscina: 25 } : { clima: elegir(['Soleado', 'Nublado']), temperatura: 18 + Math.round(rnd() * 8) },
          estado: k === DIAS_EVALUACION.length - 1 ? 'abierta' : 'cerrada', creado_por: coachDe[dep], dep, dias, indice: k,
        });
      }
    }
    const filasSes = await insertarLote('sesiones_evaluacion', sesiones,
      ['academia_id', 'deporte_id', 'coach_id', 'instalacion_id', 'plantilla_id', 'nombre', 'fecha', 'modo', 'condiciones', 'estado', 'creado_por'],
      { academia_id: 'int', deporte_id: 'int', coach_id: 'int', instalacion_id: 'int', plantilla_id: 'int', fecha: 'date', condiciones: 'jsonb' }, 'RETURNING id, nombre');
    sesiones.forEach((s, i) => { s.id = filasSes[i].id; });

    for (const s of sesiones) {
      const progreso = (118 - s.dias) / 114; // 0 → 1 a lo largo de los 4 meses
      for (const a of atletas.filter((x) => x.dep === s.dep)) {
        if (rnd() < 0.06 && s.indice > 0 && s.indice < 6) continue; // ausencias puntuales a una evaluación
        for (const clave of PRUEBAS_POR_DEPORTE[s.dep]) {
          const mod = MODELOS[clave];
          const p = prueba[clave];
          const menorMejor = p.direccion_mejora === 'LOWER_IS_BETTER';
          const signo = menorMejor ? -1 : 1;
          const base = mod.media + mod.porAnio * (a.edad - 13) + signo * a.z * mod.de;
          let factor = 1 + signo * a.mejora * progreso;
          if (a.caida && s.indice === DIAS_EVALUACION.length - 1) factor = 1 - signo * 0.08; // empeora claramente al final
          const intentos = p.intentos || 1;
          for (let intento = 1; intento <= intentos; intento += 1) {
            let valor = base * factor * (1 + normal() * 0.012);
            valor = Math.min(mod.max, Math.max(mod.min, redondearA(valor, mod.dec)));
            const datos = {};
            let parciales = null;
            if (s.dep === 'natacion') {
              datos.largo_piscina = 25;
              datos.brazadas = Math.round((p.distancia_m / 25) * (17 + normal() * 1.5));
              if (p.parcial_cada_m && p.distancia_m >= 100) {
                const tramosN = p.distancia_m / 25;
                const pesos = Array.from({ length: tramosN }, (_, t) => (t === 0 ? 0.92 : 1 + t * 0.012));
                const suma = pesos.reduce((x, y) => x + y, 0);
                let acumulado = 0;
                parciales = pesos.map((w, t) => {
                  acumulado += (valor * w) / suma;
                  return { m: (t + 1) * 25, t: t === tramosN - 1 ? valor : redondear(acumulado, 2) };
                });
              }
            }
            resultados.push({
              academia_id: academia, deportista_id: a.id, sesion_id: s.id, prueba_id: p.id, metrica_id: p.metrica_id, deporte_id: a.deporte_id,
              categoria_id: a.categoria_id, equipo_id: a.equipo, coach_id: a.coach, plantilla_id: s.plantilla_id, intento, valor, unidad: p.unidad,
              fecha: s.fecha, fuente_medicion: 'MANUAL', oficial: true, parciales,
              datos, registrado_por: a.coach,
            });
          }
        }
      }
    }
    // Una estimación por video (no oficial) para mostrar que nunca se mezcla con las marcas oficiales
    resultados.push({
      academia_id: academia, deportista_id: mateo.id, prueba_id: prueba.sprint_30m.id, metrica_id: prueba.sprint_30m.metrica_id, deporte_id: mateo.deporte_id,
      categoria_id: mateo.categoria_id, intento: 1, valor: 4.71, unidad: 's', fecha: fecha(10), fuente_medicion: 'VIDEO', oficial: false,
      datos: { estimado: true, observacion: 'Tiempo estimado desde un video del entrenamiento' }, registrado_por: mateo.coach,
    });
    const tiposRes = {
      academia_id: 'int', deportista_id: 'int', sesion_id: 'int', prueba_id: 'int', metrica_id: 'int', deporte_id: 'int', categoria_id: 'int', equipo_id: 'int',
      coach_id: 'int', plantilla_id: 'int', intento: 'int', valor: 'float8', fecha: 'date', oficial: 'boolean', parciales: 'jsonb', datos: 'jsonb', registrado_por: 'int',
    };
    const colsRes = Object.keys(tiposRes).concat(['unidad', 'fuente_medicion']);
    for (let i = 0; i < resultados.length; i += 1500) await insertarLote('resultados', resultados.slice(i, i + 1500), colsRes, tiposRes);

    // 5. Entrenamientos (3 por semana y equipo, 26 semanas) con ejercicios, asistencia y sRPE.
    //    El equipo de fútbol pasa de dos semanas suaves a preparar un torneo: se ve un pico de ACWR (alerta de carga).
    const SEMANAS_ENTRENAMIENTO = 25;
    const ejerciciosDe = {
      futbol: [['Activación y movilidad', null, null, null, 12, 3], ['Rondos 4v2', 4, null, null, 4, 6], ['Sprints 20 m', 6, null, 20, null, 9], ['Fútbol reducido 7v7', 3, null, null, 8, 7]],
      natacion: [['Calentamiento libre', 1, null, 400, null, 3], ['Series 8×50 libre', 8, null, 50, null, 8], ['Técnica de patada', 4, null, 100, null, 5], ['Vuelta a la calma', 1, null, 200, null, 2]],
      atletismo: [['Calentamiento y técnica de carrera', 1, null, null, 15, 3], ['Series 6×100 m', 6, null, 100, null, 8], ['Saltos pliométricos', 4, 8, null, null, 7], ['Trote regenerativo', 1, null, 1200, null, 3]],
    };
    const sesEnt = [];
    for (const eq of Object.values(equipos)) {
      const plantilla = plantillasEnt.find((p) => p.deporte_id === deportes[eq.dep] && p.clave !== 'fuerza');
      // Lunes, miércoles y viernes "relativos": hace 5, 3 y 1 días en la semana actual; la semana -1 queda planificada
      for (let semana = SEMANAS_ENTRENAMIENTO; semana >= -1; semana -= 1) {
        for (const desfase of [0, 2, 4]) {
          const dias = semana * 7 + (5 - desfase);
          const realizada = dias >= 1;
          // Fútbol: dos semanas de descanso activo y luego la preparación de un torneo (pico de carga)
          const torneo = eq.dep === 'futbol' && dias >= 1 && dias <= 6;
          const descanso = eq.dep === 'futbol' && dias >= 8 && dias <= 21;
          const duracion = 75 + Math.round(rnd() * 3) * 15;
          const intensidadBase = 4 + Math.round(rnd() * 4);
          sesEnt.push({
            academia_id: academia, deporte_id: deportes[eq.dep], equipo_id: eq.id, coach_id: coachDe[eq.dep], instalacion_id: instDe[eq.dep],
            plantilla_id: plantilla?.id || null, fecha: fecha(dias), hora: '16:00', duracion_min: torneo ? 150 : descanso ? 60 : duracion,
            objetivo: torneo ? 'Preparación de torneo' : descanso ? 'Descanso activo'
              : elegir(['Velocidad y técnica', 'Resistencia aeróbica', 'Potencia', 'Técnica específica', 'Recuperación activa']),
            intensidad: torneo ? 9 : descanso ? 3 : intensidadBase, estado: realizada ? 'realizada' : 'planificada', creado_por: coachDe[eq.dep], dep: eq.dep, equipo: eq.id, dias,
          });
        }
      }
    }
    const filasEnt = await insertarLote('sesiones_entrenamiento', sesEnt,
      ['academia_id', 'deporte_id', 'equipo_id', 'coach_id', 'instalacion_id', 'plantilla_id', 'fecha', 'hora', 'duracion_min', 'objetivo', 'intensidad', 'estado', 'creado_por'],
      { academia_id: 'int', deporte_id: 'int', equipo_id: 'int', coach_id: 'int', instalacion_id: 'int', plantilla_id: 'int', fecha: 'date', hora: 'time', duracion_min: 'int', intensidad: 'int' },
      'RETURNING id');
    sesEnt.forEach((s, i) => { s.id = filasEnt[i].id; });
    const ejercicios = [];
    const asistencia = [];
    for (const s of sesEnt) {
      ejerciciosDe[s.dep].forEach(([nombre, series, reps, dist, dur, intens], i) => ejercicios.push({
        sesion_id: s.id, orden: i + 1, nombre, series, repeticiones: reps, distancia_m: dist, duracion_min: dur, intensidad: intens,
      }));
      if (s.estado !== 'realizada') continue;
      for (const a of atletas.filter((x) => x.equipo === s.equipo)) {
        const pAus = a.baja_asistencia ? 0.45 : 0.08;
        const r = rnd();
        const estado = r < pAus ? 'ausente' : r < pAus + 0.04 ? 'justificado' : r < pAus + 0.1 ? 'tardanza' : 'presente';
        const presente = estado === 'presente' || estado === 'tardanza';
        asistencia.push({
          academia_id: academia, deportista_id: a.id, sesion_id: s.id, equipo_id: s.equipo, fecha: s.fecha, estado,
          rpe_sesion: presente ? Math.min(10, Math.max(1, Math.round(s.intensidad + normal()))) : null,
          minutos: presente ? s.duracion_min - (estado === 'tardanza' ? 15 : 0) : null, registrado_por: s.coach_id,
        });
      }
    }
    await insertarLote('ejercicios', ejercicios, ['sesion_id', 'orden', 'nombre', 'series', 'repeticiones', 'distancia_m', 'duracion_min', 'intensidad'],
      { sesion_id: 'int', orden: 'int', series: 'int', repeticiones: 'int', distancia_m: 'float8', duracion_min: 'float8', intensidad: 'int' });
    for (let i = 0; i < asistencia.length; i += 1500) {
      await insertarLote('asistencia', asistencia.slice(i, i + 1500), ['academia_id', 'deportista_id', 'sesion_id', 'equipo_id', 'fecha', 'estado', 'rpe_sesion', 'minutos', 'registrado_por'],
        { academia_id: 'int', deportista_id: 'int', sesion_id: 'int', equipo_id: 'int', fecha: 'date', rpe_sesion: 'int', minutos: 'int', registrado_por: 'int' });
    }

    // 6. Recuperación de los últimos 21 días (algunos con fatiga alta seguida, poco sueño o dolor)
    const recuperacion = [];
    for (const a of atletas) {
      for (let d = 20; d >= 0; d -= 1) {
        if (rnd() < 0.35 && !a.fatiga && a !== mateo) continue;
        const fatigado = a.fatiga && d <= 3;
        const dolor = a.fatiga && d === 1;
        recuperacion.push({
          academia_id: academia, deportista_id: a.id, fecha: fecha(d),
          horas_sueno: redondear(Math.min(11, Math.max(4.5, (a.fatiga ? 6.4 : 8.1) + normal() * 0.7)), 1), calidad_sueno: Math.min(5, Math.max(1, Math.round(3.6 + normal() * 0.8))),
          fatiga: fatigado ? 8 + Math.round(rnd()) : Math.min(10, Math.max(1, Math.round(4 + normal() * 1.4))),
          estres: Math.min(10, Math.max(1, Math.round(4 + normal() * 1.5))), recuperacion: Math.min(10, Math.max(1, Math.round(7 + normal() * 1.3))),
          rpe: Math.min(10, Math.max(0, Math.round(6 + normal() * 1.4))), dolor, dolor_zona: dolor ? 'Isquiotibial derecho' : null, dolor_intensidad: dolor ? 7 : null,
          origen: a === mateo ? 'deportista' : 'coach', registrado_por: a === mateo ? usuarios.deportista : a.coach,
        });
      }
    }
    await insertarLote('recuperacion', recuperacion, ['academia_id', 'deportista_id', 'fecha', 'horas_sueno', 'calidad_sueno', 'fatiga', 'estres', 'recuperacion', 'rpe', 'dolor', 'dolor_zona', 'dolor_intensidad', 'origen', 'registrado_por'],
      { academia_id: 'int', deportista_id: 'int', fecha: 'date', horas_sueno: 'float8', calidad_sueno: 'int', fatiga: 'int', estres: 'int', recuperacion: 'int', rpe: 'int', dolor: 'boolean', dolor_intensidad: 'int', registrado_por: 'int' });

    // 7. Objetivos (rendimiento, asistencia; uno vencido)
    const objetivos = [];
    for (const a of atletas.filter((_, i) => i % 3 === 0)) {
      const clave = PRUEBAS_POR_DEPORTE[a.dep][a.dep === 'natacion' ? 0 : 1];
      const p = prueba[clave];
      const marcas = resultados.filter((r) => r.deportista_id === a.id && r.prueba_id === p.id && r.oficial).map((r) => r.valor);
      const menor = p.direccion_mejora === 'LOWER_IS_BETTER';
      const mejor = menor ? Math.min(...marcas) : Math.max(...marcas);
      objetivos.push({
        academia_id: academia, deportista_id: a.id, tipo: 'rendimiento', prueba_id: p.id, descripcion: `Mejorar ${clave.replace(/_/g, ' ')} un 3%`,
        valor_objetivo: redondear(menor ? mejor * 0.97 : mejor * 1.03, 2), valor_inicial: redondear(mejor, 2), fecha_inicio: fecha(20), fecha_limite: fecha(-60), creado_por: a.coach,
      });
    }
    objetivos.push({
      academia_id: academia, deportista_id: atletas[5].id, tipo: 'asistencia', descripcion: 'Asistir al 90% de los entrenamientos', valor_objetivo: 90,
      fecha_inicio: fecha(60), fecha_limite: fecha(3), creado_por: atletas[5].coach,
    });
    for (const eq of Object.values(equipos).slice(0, 3)) {
      objetivos.push({ academia_id: academia, equipo_id: eq.id, tipo: 'asistencia', descripcion: 'Asistencia del equipo ≥ 85%', valor_objetivo: 85, fecha_inicio: fecha(30), fecha_limite: fecha(-30), creado_por: coachDe[eq.dep] });
    }
    await insertarLote('objetivos', objetivos, ['academia_id', 'deportista_id', 'equipo_id', 'tipo', 'prueba_id', 'descripcion', 'valor_objetivo', 'valor_inicial', 'fecha_inicio', 'fecha_limite', 'creado_por'],
      { academia_id: 'int', deportista_id: 'int', equipo_id: 'int', prueba_id: 'int', valor_objetivo: 'float8', valor_inicial: 'float8', fecha_inicio: 'date', fecha_limite: 'date', creado_por: 'int' });

    // 8. Nutrición (registros de 10 deportistas) y perfil de Mateo
    const comidas = [['Avena con fruta', 'Arroz con pollo y ensalada', 'Sopa de quinua', 'Yogur y plátano'], ['Pan integral con huevo', 'Pescado con papas', 'Tallarines con verduras', 'Frutos secos']];
    const alim = [];
    for (const a of atletas.slice(0, 10)) {
      for (let d = 13; d >= 0; d -= 2) {
        const c = elegir(comidas);
        alim.push({
          deportista_id: a.id, fecha: fecha(d), desayuno: rnd() < 0.85 ? c[0] : null, almuerzo: c[1], cena: c[2], colaciones: c[3],
          hidratacion_litros: redondear(1.2 + rnd() * 1.4, 1), horas_sueno: redondear(7 + normal() * 0.7, 1), hora_desayuno: '07:00', hora_almuerzo: '13:00', hora_cena: '20:00',
          origen: a === mateo ? 'deportista' : 'coach', registrado_por: a === mateo ? usuarios.deportista : a.coach,
        });
      }
    }
    await insertarLote('alimentacion', alim, ['deportista_id', 'fecha', 'desayuno', 'almuerzo', 'cena', 'colaciones', 'hidratacion_litros', 'horas_sueno', 'hora_desayuno', 'hora_almuerzo', 'hora_cena', 'origen', 'registrado_por'],
      { deportista_id: 'int', fecha: 'date', hidratacion_litros: 'float8', horas_sueno: 'float8', hora_desayuno: 'time', hora_almuerzo: 'time', hora_cena: 'time', registrado_por: 'int' });
    await query(`INSERT INTO nutricion_perfiles (deportista_id, academia_id, preferencias, restricciones, alergias_declaradas, objetivo, profesional_id, notas_profesional)
      VALUES ($1, $2, 'Le gustan las frutas y el pescado', 'Ninguna', 'Ninguna declarada', 'Rendir en los entrenamientos de la tarde', $3,
      'Reforzar el desayuno los días de entrenamiento y llevar agua a cada sesión.')`, [mateo.id, academia, usuarios.nutricion]);

    // 9. Comercial: matrícula mensual y cuotas de 3 meses
    const matriculas = await insertarLote('matriculas', atletas.map((a) => ({
      academia_id: academia, deportista_id: a.id, concepto: 'Mensualidad', monto: a.dep === 'natacion' ? 180 : 150, moneda: 'PEN', fecha_inicio: fecha(150), estado: 'activa',
    })), ['academia_id', 'deportista_id', 'concepto', 'monto', 'moneda', 'fecha_inicio', 'estado'], { academia_id: 'int', deportista_id: 'int', monto: 'float8', fecha_inicio: 'date' },
    'RETURNING id, deportista_id, monto');
    const pagos = [];
    for (const m of matriculas) {
      for (const [k, dias] of [60, 30, 0].entries()) {
        const venc = fecha(dias);
        const pagado = k < 2 ? rnd() < 0.9 : rnd() < 0.4;
        pagos.push({
          academia_id: academia, deportista_id: m.deportista_id, matricula_id: m.id, concepto: `Mensualidad ${venc.slice(0, 7)}`, monto: m.monto, moneda: 'PEN',
          fecha_vencimiento: venc, fecha_pago: pagado ? venc : null, estado: pagado ? 'pagado' : (dias > 0 ? 'vencido' : 'pendiente'), metodo: pagado ? elegir(['Yape', 'Transferencia', 'Efectivo']) : null,
          registrado_por: usuarios.admin,
        });
      }
    }
    await insertarLote('pagos', pagos, ['academia_id', 'deportista_id', 'matricula_id', 'concepto', 'monto', 'moneda', 'fecha_vencimiento', 'fecha_pago', 'estado', 'metodo', 'registrado_por'],
      { academia_id: 'int', deportista_id: 'int', matricula_id: 'int', monto: 'float8', fecha_vencimiento: 'date', fecha_pago: 'date', registrado_por: 'int' });
    await query(`INSERT INTO comunicados (academia_id, titulo, cuerpo, destino, destino_valor, publicado_por) VALUES
      ($1, 'Bienvenidos a la nueva temporada', 'Este mes empezamos las evaluaciones físicas. Revisen el calendario de cada equipo.', 'todos', NULL, $2),
      ($1, 'Reunión de padres', 'El sábado a las 10:00 presentaremos los avances de cada deportista.', 'rol', 'padre', $2)`, [academia, usuarios.admin]);

    // 10. Evaluaciones por observación (escala 0-100, módulo clásico) para que el ML tenga datos
    const evals = [];
    for (const a of atletas) {
      for (const dias of [90, 45, 7]) {
        const v = () => Math.min(100, Math.max(20, Math.round(62 + a.z * 10 + (90 - dias) / 9 + normal() * 6)));
        const fila = { deportista_id: a.id, fecha: fecha(dias), velocidad: v(), resistencia: v(), fuerza: v(), agilidad: v(), coordinacion: v(), tecnica: v(), disciplina_score: v(), asistencia: a.baja_asistencia ? 55 : v() };
        fila.puntuacion_general = redondear((fila.velocidad + fila.resistencia + fila.fuerza + fila.agilidad + fila.coordinacion + fila.tecnica + fila.disciplina_score + fila.asistencia) / 8, 1);
        evals.push(fila);
      }
    }
    const capsEval = ['velocidad', 'resistencia', 'fuerza', 'agilidad', 'coordinacion', 'tecnica', 'disciplina_score', 'asistencia', 'puntuacion_general'];
    await insertarLote('evaluaciones', evals, ['deportista_id', 'fecha', ...capsEval],
      { deportista_id: 'int', fecha: 'date', ...Object.fromEntries(capsEval.map((c) => [c, 'float8'])) });

    // 10b. Indicadores (FASE 11): lesiones, rastreo GPS, encuestas SUS/TAM y uso de reportes
    const indicadores = await datosIndicadores({ academia, usuarios, atletas, resultados, prueba });

    // 11. Motor de alertas y puntajes (con la versión de scoring vigente)
    const alertas = await motor.evaluar(academia);
    // Puntajes de cada fecha de evaluación (historial), calculados en memoria y guardados en lote
    const oficiales = await rendimiento.resultadosOficiales(academia, 'true', []);
    const configs = new Map();
    const snapshots = [];
    for (const a of atletas) {
      if (!configs.has(a.deporte_id)) configs.set(a.deporte_id, await rendimiento.scoringVigente(academia, a.deporte_id, null));
      const config = configs.get(a.deporte_id);
      const grupos = rendimiento.agruparCompatibles(oficiales.filter((r) => r.deportista_id === a.id));
      for (const dias of [...DIAS_EVALUACION, 0]) {
        const calc = rendimiento.calcularPuntaje(grupos, config, fecha(dias));
        if (calc.total === null) continue;
        snapshots.push({
          academia_id: academia, deportista_id: a.id, scoring_id: config.id, fecha: fecha(dias), puntaje: calc.total, cobertura: calc.cobertura,
          detalle: { capacidades: calc.capacidades, pruebas: calc.pruebas },
        });
      }
    }
    await insertarLote('snapshots_rendimiento', snapshots, ['academia_id', 'deportista_id', 'scoring_id', 'fecha', 'puntaje', 'cobertura', 'detalle']);

    return {
      academia_id: academia, deportistas: atletas.length, coaches: 3, resultados: resultados.length, sesiones_evaluacion: sesiones.length,
      entrenamientos: sesEnt.length, asistencia: asistencia.length, recuperacion: recuperacion.length, objetivos: objetivos.length,
      alertas: alertas.creadas, ...indicadores, duracion_ms: Date.now() - inicio,
      cuentas: Object.keys(usuarios).map((alias) => `${alias}${DOMINIO}`), clave: CLAVE_DEMO,
    };
  } catch (error) {
    await borrarDemo().catch(() => null);
    throw error;
  }
}

module.exports = { crearDemo, borrarDemo, SLUG, DOMINIO, CLAVE_DEMO, MODELOS, parsearTiempo };
