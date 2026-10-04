"""Pruebas de la lógica pura del worker: python -m unittest test_worker.py"""
import json
import unittest

import numpy as np

from worker import cadencia_desde_serie, metadatos_ffprobe, analizar, NO_DISPONIBLE


class PruebasWorker(unittest.TestCase):
    def test_cadencia_de_una_senal_conocida(self):
        fps = 30
        t = np.arange(0, 10, 1 / fps)
        senal = np.sin(2 * np.pi * 1.5 * t) + np.random.default_rng(1).normal(0, 0.05, len(t))  # 1.5 Hz = 90 ciclos/min
        self.assertAlmostEqual(cadencia_desde_serie(senal, fps), 90.0, delta=2.0)

    def test_ruido_no_da_cadencia(self):
        ruido = np.random.default_rng(2).normal(0, 1, 300)
        self.assertIsNone(cadencia_desde_serie(ruido, 30))

    def test_serie_corta_o_plana(self):
        self.assertIsNone(cadencia_desde_serie([1, 2, 3], 30))
        self.assertIsNone(cadencia_desde_serie([0.5] * 300, 30))

    def test_metadatos(self):
        salida = json.dumps({"streams": [{"codec_type": "video", "avg_frame_rate": "30000/1001", "width": 1920, "height": 1080, "codec_name": "h264"}],
                             "format": {"duration": "12.345"}})
        m = metadatos_ffprobe(salida)
        self.assertEqual(m["resolucion"], "1920x1080")
        self.assertAlmostEqual(m["fps"], 29.97, places=2)
        self.assertEqual(m["duracion_s"], 12.35)

    def test_sin_modelo_no_inventa(self):
        disponible, _, estim, mensaje, _ = analizar("/no/existe.mp4", "viraje")
        self.assertFalse(disponible)
        self.assertEqual(estim, {})
        self.assertTrue(mensaje.startswith(NO_DISPONIBLE))


if __name__ == "__main__":
    unittest.main()
