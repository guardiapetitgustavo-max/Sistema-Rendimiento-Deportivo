# Indicadores de evaluación (FASE 11)

Panel **Indicadores** (`#/indicadores`, permiso `indicadores.ver`) con los seis indicadores de la matriz de evaluación.
Todo se calcula con datos reales del periodo elegido (por defecto, los últimos 90 días) y se puede exportar a Excel
(`GET /api/indicadores/exportar`), con las respuestas anónimas de los cuestionarios listas para SPSS o R.

| Dimensión | Indicador | Cómo se mide | Meta usada en el panel |
|---|---|---|---|
| Procesamiento y rastreo de datos espaciales | Rendimiento del rastreo de movimiento | Calidad de cada trayectoria GPS recibida por la API de integraciones: completitud, frecuencia de muestreo, huecos de señal, saltos imposibles (> 45 km/h), precisión del dispositivo, error frente a la distancia oficial de la prueba y tiempo de procesamiento | ≥ 90 % de trayectorias aceptables |
| Usabilidad de la interfaz | Usabilidad del sistema | **SUS** (Brooke, 1996): 10 ítems Likert 1-5 → 0-100 | SUS ≥ 68 |
| Usabilidad de la interfaz | Efectividad de los reportes | Cada reporte generado (éxito o error, tiempo) y su valoración: utilidad 1-5 y si ayudó a tomar una decisión | Índice ≥ 75 / 100 |
| Prevención efectiva de lesiones | Incidencia de lesiones | Lesiones nuevas / horas de exposición × 1000, con IC 95 % de Poisson; se compara con el periodo anterior de igual duración | Menor que el periodo anterior |
| Control de la carga física | Carga y recuperación del atleta | **ACWR** 7:28 (sRPE = RPE × minutos), **monotonía y tensión** de Foster, **índice de bienestar** 0-100 | ≥ 70 % de deportistas con ACWR 0.8-1.3 |
| Control de la carga física | Aceptación técnica de la plataforma | **TAM** (Davis, 1989): utilidad percibida, facilidad de uso e intención de uso, Likert 1-7 → 0-100; más el uso real (cuentas activas en 30 días) | TAM ≥ 75 / 100 (media ≥ 5.5) |

Las metas están en `src/modules/indicadores/indicadores.service.js` (constante `METAS`). Si la tesis fija otras, se cambian ahí.

## Fórmulas

- **ACWR** (medias móviles acopladas, Gabbett 2016): carga aguda = suma de los últimos 7 días; carga crónica = suma de los
  últimos 28 días / 4. Exige 28 días de historial desde la primera carga; con menos se informa "historial insuficiente".
  Zonas: < 0.8 baja · 0.8-1.3 óptima · 1.3-1.5 precaución · > 1.5 riesgo.
- **Monotonía** (Foster 1998) = media diaria de la semana / desviación estándar diaria (los días sin entrenar cuentan como 0).
  **Tensión** = carga semanal × monotonía. Monotonía > 2 se marca como alta.
- **Índice de bienestar** (adaptación del índice de Hooper a los campos del sistema): promedio, llevado a 0-100, de calidad de
  sueño, fatiga (invertida), estrés (invertido), recuperación percibida y dolor (invertido). ≥ 70 bueno · 50-70 moderado · < 50 bajo.
- **Incidencia** = lesiones / horas × 1000. Exposición = minutos de entrenamiento con asistencia (presente o tardanza).
  IC 95 % con la aproximación de Byar al intervalo exacto de Poisson. **Carga lesional** = días de baja / horas × 1000.
  **Gravedad** por días de baja (Fuller et al., 2006): mínima 1-3 · leve 4-7 · moderada 8-28 · grave > 28.
  Para cada lesión se guarda el ACWR del día anterior (¿llegó tras un pico de carga?).
- **SUS** = (Σ impares (x − 1) + Σ pares (5 − x)) × 2.5. Interpretación de Bangor, Kortum y Miller (2009): > 80.3 excelente,
  ≥ 68 buena, ≥ 51 aceptable (marginal), < 51 pobre.
- **TAM**: media de cada constructo (1-7) llevada a 0-100 = (media − 1) / 6 × 100; aceptación global = promedio de los tres.
  Nivel: media ≥ 5.5 alta · ≥ 4 moderada · < 4 baja.
- **Efectividad de los reportes** = promedio de: % generados sin error, utilidad media (1-5 → 0-100) y % de valoraciones que
  dicen que el reporte ayudó a tomar una decisión.
- **Calidad GPS aceptable** = completitud ≥ 95 %, sin saltos imposibles y, si la prueba tiene distancia oficial, error ≤ 5 %.
- En SUS y TAM se informa la media con **IC 95 %** (t de Student) y el **alfa de Cronbach** (con 3 o más respuestas). Se cuenta la
  última respuesta de cada persona en el periodo.

## Cómo se recogen los datos

| Dato | Dónde |
|---|---|
| Carga (RPE × minutos) | Asistencia de cada entrenamiento (ya existía) |
| Bienestar | Recuperación diaria (ya existía) |
| Lesiones | Menú **Lesiones** (permisos `lesiones.ver` / `lesiones.gestionar`; coach y profesional por defecto) |
| Trayectorias GPS | `POST /api/integraciones/api/mediciones` con `gps: [{ lat, lon, t, acc }]` (opcional `distancia_referencia_m`) |
| SUS y TAM | Menú **Evalúa la plataforma**, disponible para todas las cuentas de la academia |
| Reportes | Automático en cada descarga; al terminar se pide una valoración opcional |

Además, la regla de alerta **Pico de carga (ACWR)** (umbral 1.5, configurable en Metodología → Reglas) avisa al coach.

## Alcance y privacidad

Carga, lesiones y rastreo respetan el alcance de cada coach. Los cuestionarios y el uso de reportes son de toda la academia
y solo se muestran agregados (nunca qué respondió cada persona). Las lesiones son seguimiento deportivo, no historial clínico.

## Pruebas

- `tests/indicadores.test.js`: 30 pruebas de las fórmulas con valores conocidos o calculados a mano.
- `tests/indicadores.api.test.js`: recorrido completo contra PostgreSQL con la academia demo (requiere `TEST_DATABASE_URL`).
