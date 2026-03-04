
Diagnóstico (con evidencia real):
1) No es saldo ni falta de API key.
- `animate-kling` está llamando correctamente a KIE (hay logs de request).
- Probé el mismo flujo con un video MP4 público corto y devolvió `taskId` válido (`4525cb8e...`), así que la cuenta sí puede crear tareas.

2) El bloqueo actual es de formato del video de movimiento recortado.
- Log exacto: `KIE AI response: {"code":500,"msg":"File type not supported","data":null}`
- En ese mismo request, `video_url` era: `.../trimmed_1772606974687.webm`
- Conclusión: el recorte que sale del trimmer (`.webm`, codec de MediaRecorder) no está siendo aceptado por KIE en este endpoint/modelo.

3) Hay un segundo problema de manejo de errores (UX):
- `animate-kling` solo valida `response.ok`, pero KIE devuelve error en JSON (`code/msg`) incluso cuando el HTTP puede venir en 200.
- Por eso en frontend aparece genérico “Error enviando tarea” en vez del motivo real.

Qué falta exactamente:
- Falta enviar un **video de referencia compatible** para Motion Control (clip <=30s en formato aceptado por KIE para este flujo, recomendado MP4).
- Y falta propagar correctamente el error real de KIE al usuario.

Plan de implementación (conciso):
1) Corregir export del recorte a formato compatible
- Archivo: `src/components/VideoTrimmerDialog.tsx`
- Cambiar estrategia de recorte para generar/guardar `trimmed_*.mp4` (no webm).
- Si el navegador no puede exportar MP4 en local, mostrar fallback explícito (no “listo para animar”): “Este navegador exporta WEBM no compatible; usa clip MP4”.

2) Endurecer validación en backend antes de crear tarea
- Archivo: `supabase/functions/animate-kling/index.ts`
- Validar `video_url` (extensión/content-type remoto) y rechazar temprano formatos no compatibles con mensaje claro.
- Validar también respuesta semántica de KIE (`data.code` y `data.msg`), no solo `response.ok`.
- Devolver error legible (422) al frontend: p.ej. “Formato de video no soportado por Kling Motion Control”.

3) Mejorar mensaje de error en UI
- Archivo: `src/components/KlingAnimationPanel.tsx`
- Mostrar `data.error` exacto retornado por `animate-kling` (en lugar de fallback genérico).
- Mantener botón Reintentar, pero con causa visible para que el usuario sepa qué corregir.

4) Verificación de cierre
- Caso A: video largo -> recortar -> se sube MP4 -> `animate-kling` devuelve `taskId`.
- Caso B: forzar WEBM -> backend responde error explícito de formato (sin mensaje genérico).
- Caso C: polling continúa normal hasta `completed` y muestra video final.

Archivos a tocar:
- `src/components/VideoTrimmerDialog.tsx`
- `supabase/functions/animate-kling/index.ts`
- `src/components/KlingAnimationPanel.tsx`
