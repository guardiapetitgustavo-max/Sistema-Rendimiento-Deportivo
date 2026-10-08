const { Router } = require('express');
const servicio = require('./indicadores.service');
const lesiones = require('./lesiones.service');
const encuestas = require('./encuestas.service');
const { rutasCrud } = require('../../utils/rutas-crud');
const { aExcel } = require('../reportes/exportar');
const { enviarDescarga } = require('../../utils/descarga');

/** Panel de indicadores (permiso indicadores.ver, ver routes.js). */
const indicadores = Router();
indicadores.get('/', async (req, res) => res.json(await servicio.panel(req.alcance, req.query)));
indicadores.get('/exportar', async (req, res) => {
  const hojas = await servicio.exportar(req.alcance, req.query);
  const p = servicio.periodo(req.query);
  enviarDescarga(res, await aExcel(hojas), `indicadores_${p.desde}_${p.hasta}.xlsx`, 'excel');
});

/** Registro de lesiones: GET con lesiones.ver; escritura con lesiones.gestionar (ver routes.js). */
const registroLesiones = Router();
registroLesiones.get('/catalogos', (req, res) => res.json({ tipos: lesiones.TIPOS, mecanismos: lesiones.MECANISMOS, contextos: lesiones.CONTEXTOS }));
rutasCrud(lesiones, registroLesiones);

/** Cuestionarios SUS y TAM: cualquier persona de la academia puede responderlos. */
const cuestionarios = Router();
cuestionarios.get('/', async (req, res) => res.json({ catalogo: encuestas.catalogo(), estado: await encuestas.estado(req.usuario) }));
cuestionarios.post('/:instrumento', async (req, res) => res.status(201).json(await encuestas.responder(req.usuario, req.params.instrumento, req.body)));

module.exports = { indicadores, lesiones: registroLesiones, encuestas: cuestionarios };
