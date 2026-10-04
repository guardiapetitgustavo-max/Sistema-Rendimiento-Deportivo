# Worker de análisis de video

Proceso en **Python** que se ejecuta fuera de Vercel (Vercel no puede procesar video: límite de tiempo y memoria).
Toma los trabajos `analisis_video` de la tabla `trabajos`, descarga el video con una URL firmada de Supabase Storage
y guarda en `analisis_video`, siempre por separado:

- **medidos:** datos medidos del archivo con `ffprobe` (duración, fps, resolución, códec);
- **estimaciones:** valores de un modelo de visión (p. ej. cadencia por pose), marcados como *estimados*;
- **mensaje:** `ANÁLISIS NO DISPONIBLE` cuando no hay un modelo validado para ese movimiento.

Cada pocos segundos publica un latido en `servicios_estado`; la pantalla **Videos** muestra si el servicio está activo.
Si un trabajo falla se reintenta (espera 2, 4 y 8 minutos) y, tras 3 intentos, queda como fallido sin inventar nada.

## Ejecutar

```bash
cd worker
pip install -r requirements.txt
export DATABASE_URL="postgresql://…"            # la misma de Vercel (mejor el Session pooler, puerto 5432)
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="…"             # secreta
python worker.py
```

Con Docker: `docker build -t sporteval-worker . && docker run --env-file .env sporteval-worker`
(sirve en Railway, Render, Fly.io, una VM o un servidor de la academia).

## Activar la estimación de cadencia (opcional)

Descomenta `mediapipe` y `opencv-python-headless` en `requirements.txt`. El worker anunciará los movimientos
`carrera` y `sprint`; los videos con ese movimiento recibirán una cadencia **estimada** (nunca oficial). Cualquier otro
movimiento seguirá mostrando "ANÁLISIS NO DISPONIBLE" hasta que se añada y valide un modelo para él.

## Pruebas

```bash
python -m unittest test_worker.py
```
