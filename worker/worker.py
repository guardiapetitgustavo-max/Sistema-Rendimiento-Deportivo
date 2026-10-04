"""
Worker de análisis de video de SportEval AI (FASE 7).

Se ejecuta FUERA de Vercel (un contenedor, una VM o un servidor propio). Toma trabajos de la tabla
`trabajos` (tipo 'analisis_video'), descarga el video con una URL firmada, y guarda el resultado en
`analisis_video` separando SIEMPRE:
  - medidos:       datos medidos del archivo (duración, fps, resolución) con ffprobe,
  - estimaciones:  valores estimados por un modelo (marcados como estimados, nunca oficiales),
  - mensaje:       "ANÁLISIS NO DISPONIBLE" cuando no hay un modelo validado para ese movimiento.

Publica un latido en `servicios_estado` para que la aplicación sepa si el servicio está activo.
Variables: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET (videos),
ALMACENAMIENTO_LOCAL (solo desarrollo), INTERVALO_S (5).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np

VERSION = "1.0.0"
NOMBRE = "worker-video"
NO_DISPONIBLE = "ANÁLISIS NO DISPONIBLE"
MAX_INTENTOS = 3


# ---------------------------------------------------------------------------
# Lógica pura (probada en test_worker.py)
# ---------------------------------------------------------------------------
def cadencia_desde_serie(valores, fps, minimo_ciclos=4):
    """
    Frecuencia dominante (ciclos por minuto) de una serie periódica (p. ej. la altura del tobillo por cuadro),
    con autocorrelación. Devuelve None si la señal no es suficientemente periódica.
    """
    x = np.asarray([v for v in valores if v is not None and np.isfinite(v)], dtype=float)
    if fps <= 0 or len(x) < fps * 2:
        return None
    x = x - x.mean()
    if np.allclose(x, 0):
        return None
    ac = np.correlate(x, x, mode="full")[len(x) - 1:]
    ac = ac / ac[0]
    minimo = int(fps * 0.2)   # 300 ciclos/min como máximo
    maximo = int(fps * 2.0)   # 30 ciclos/min como mínimo
    if maximo >= len(ac) or minimo < 1:
        return None
    ventana = ac[minimo:maximo]
    retardo = int(np.argmax(ventana)) + minimo
    if ac[retardo] < 0.3 or len(x) / retardo < minimo_ciclos:
        return None
    return round(60.0 * fps / retardo, 1)


def metadatos_ffprobe(salida_json):
    """Extrae duración, fps y resolución de la salida JSON de ffprobe."""
    datos = json.loads(salida_json)
    video = next((s for s in datos.get("streams", []) if s.get("codec_type") == "video"), None)
    if not video:
        return {}
    num, _, den = (video.get("avg_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    duracion = float(datos.get("format", {}).get("duration") or video.get("duration") or 0)
    return {
        "duracion_s": round(duracion, 2),
        "fps": round(fps, 2),
        "resolucion": f'{video.get("width")}x{video.get("height")}',
        "codec": video.get("codec_name"),
    }


def modelos_disponibles():
    """Movimientos con un modelo real instalado. Sin mediapipe no hay ninguno."""
    try:
        import mediapipe  # noqa: F401
        import cv2  # noqa: F401
        return ["carrera", "sprint"]
    except ImportError:
        return []


def analizar(ruta, movimiento):
    """Devuelve (disponible, medidos, estimaciones, mensaje, modelo)."""
    medidos = {}
    if shutil.which("ffprobe"):
        r = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", ruta],
                           capture_output=True, text=True, timeout=60)
        if r.returncode == 0:
            medidos = {"archivo": metadatos_ffprobe(r.stdout)}
    if movimiento not in modelos_disponibles():
        return False, medidos, {}, f'{NO_DISPONIBLE}: no hay un modelo validado para el movimiento "{movimiento}".', None
    serie, fps = serie_tobillo(ruta)
    cad = cadencia_desde_serie(serie, fps)
    if cad is None:
        return False, medidos, {}, f"{NO_DISPONIBLE}: no se detectó un patrón de zancada fiable en el video.", "mediapipe-pose"
    estim = {"cadencia_pasos_min": {"valor": cad * 2, "estimado": True, "metodo": "autocorrelación del tobillo (pose)"}}
    return True, medidos, estim, "Estimación por visión por computadora: orientativa, no es un resultado oficial.", "mediapipe-pose"


def serie_tobillo(ruta):
    """Altura normalizada del tobillo derecho por cuadro (requiere mediapipe y opencv)."""
    import cv2
    import mediapipe as mp
    cap = cv2.VideoCapture(ruta)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    serie = []
    with mp.solutions.pose.Pose(static_image_mode=False) as pose:
        while True:
            ok, cuadro = cap.read()
            if not ok:
                break
            res = pose.process(cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB))
            lm = res.pose_landmarks.landmark[28] if res.pose_landmarks else None
            serie.append(lm.y if lm and lm.visibility > 0.5 else None)
    cap.release()
    return serie, fps


# ---------------------------------------------------------------------------
# Infraestructura (base de datos y almacenamiento)
# ---------------------------------------------------------------------------
def descargar(video, destino):
    local = os.environ.get("ALMACENAMIENTO_LOCAL")
    if video["proveedor"] == "local" and local:
        shutil.copy(os.path.join(local, video["ruta"]), destino)
        return
    import requests
    base = os.environ["SUPABASE_URL"].rstrip("/")
    clave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    bucket = os.environ.get("SUPABASE_BUCKET", "videos")
    cab = {"Authorization": f"Bearer {clave}", "apikey": clave}
    firmada = requests.post(f"{base}/storage/v1/object/sign/{bucket}/{video['ruta']}", json={"expiresIn": 600}, headers=cab, timeout=20)
    firmada.raise_for_status()
    with requests.get(f"{base}/storage/v1{firmada.json()['signedURL']}", stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(destino, "wb") as f:
            for parte in r.iter_content(1 << 20):
                f.write(parte)


def latido(con):
    con.execute(
        """INSERT INTO servicios_estado (nombre, ultima_senal, version, detalle) VALUES (%s, now(), %s, %s)
           ON CONFLICT (nombre) DO UPDATE SET ultima_senal = now(), version = EXCLUDED.version, detalle = EXCLUDED.detalle""",
        (NOMBRE, VERSION, json.dumps({"movimientos": modelos_disponibles(), "ffprobe": bool(shutil.which("ffprobe"))})),
    )


def tomar_trabajo(con):
    return con.execute(
        """UPDATE trabajos SET estado = 'procesando', intentos = intentos + 1, actualizado_en = now()
           WHERE id = (SELECT id FROM trabajos WHERE estado = 'pendiente' AND tipo = 'analisis_video' AND disponible_en <= now()
                       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING id, academia_id, payload, intentos""").fetchone()


def procesar(con, trabajo):
    tid, academia, payload, intentos = trabajo
    video = con.execute(
        "SELECT id, ruta, proveedor, tipo_movimiento FROM videos WHERE id = %s AND academia_id = %s AND activo",
        (payload["video_id"], academia)).fetchone()
    if not video:
        con.execute("UPDATE trabajos SET estado = 'fallido', error = 'Video no encontrado' WHERE id = %s", (tid,))
        return
    vid = {"id": video[0], "ruta": video[1], "proveedor": video[2], "movimiento": video[3]}
    con.execute("UPDATE videos SET estado = 'PROCESSING' WHERE id = %s", (vid["id"],))
    con.commit()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            destino = os.path.join(tmp, os.path.basename(vid["ruta"]))
            descargar(vid, destino)
            disponible, medidos, estim, mensaje, modelo = analizar(destino, vid["movimiento"])
        con.execute(
            """INSERT INTO analisis_video (video_id, academia_id, disponible, modelo, version, medidos, estimaciones, mensaje)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (vid["id"], academia, disponible, modelo, VERSION, json.dumps(medidos), json.dumps(estim), mensaje))
        con.execute("UPDATE videos SET estado = 'COMPLETED' WHERE id = %s", (vid["id"],))
        con.execute("UPDATE trabajos SET estado = 'completado', actualizado_en = now(), error = NULL WHERE id = %s", (tid,))
    except Exception as error:  # noqa: BLE001 - se registra y se reintenta
        final = intentos >= MAX_INTENTOS
        con.execute(
            """UPDATE trabajos SET estado = %s, error = %s, actualizado_en = now(),
               disponible_en = now() + make_interval(mins => %s) WHERE id = %s""",
            ("fallido" if final else "pendiente", str(error)[:500], 2 ** intentos, tid))
        if final:
            con.execute("UPDATE videos SET estado = 'FAILED' WHERE id = %s", (vid["id"],))
            con.execute("""INSERT INTO analisis_video (video_id, academia_id, disponible, mensaje) VALUES (%s, %s, false, %s)""",
                        (vid["id"], academia, f"{NO_DISPONIBLE}: el procesamiento falló ({str(error)[:120]})."))
    con.commit()


def main():
    import psycopg
    intervalo = float(os.environ.get("INTERVALO_S", "5"))
    print(f"{NOMBRE} {VERSION} · modelos: {modelos_disponibles() or 'ninguno'}", flush=True)
    while True:
        try:
            with psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None) as con:
                while True:
                    latido(con)
                    con.commit()
                    trabajo = tomar_trabajo(con)
                    con.commit()
                    if trabajo:
                        procesar(con, trabajo)
                    else:
                        time.sleep(intervalo)
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as error:  # noqa: BLE001 - reconecta ante cortes de red
            print(f"Error: {error}. Reintentando en 10 s", file=sys.stderr, flush=True)
            time.sleep(10)


if __name__ == "__main__":
    main()
