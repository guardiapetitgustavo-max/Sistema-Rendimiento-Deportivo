const { Router } = require('express');
const servicio = require('./integraciones.service');
const { idValido } = require('../../utils/validar');

/** Gestión de dispositivos (dentro de la academia, solo administrador: integraciones.gestionar). */
const gestion = Router();
gestion.get('/dispositivos', async (req, res) => res.json(await servicio.listar(req.alcance)));
gestion.post('/dispositivos', async (req, res) => res.status(201).json(await servicio.crear(req.alcance, req.usuario, req.body)));
gestion.delete('/dispositivos/:id', async (req, res) => {
  await servicio.desactivar(req.alcance, idValido(req.params.id));
  res.status(204).end();
});

/**
 * API pública para dispositivos: autenticada con la clave del dispositivo (Bearer), sin cookies,
 * por eso no aplica CSRF. La academia sale SIEMPRE de la clave, nunca del cuerpo.
 */
const publica = Router();
publica.post('/mediciones', async (req, res) => {
  const disp = await servicio.autenticar(req.get('authorization'));
  if (Array.isArray(req.body?.mediciones)) return res.json(await servicio.recibirLote(disp, req.body.mediciones));
  const r = await servicio.recibirMedicion(disp, req.body);
  return res.status(r.duplicado ? 200 : 201).json({ id: r.id, duplicado: Boolean(r.duplicado), valor: r.valor, unidad: r.unidad, fuente: r.fuente_medicion, lectura: r.lectura });
});

module.exports = { gestion, publica };
