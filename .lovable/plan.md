

## Plan: Ajuste de duración a 9s, simplificación de UI y visibilidad del prompt de video

### Problema
1. Los guiones se generan para ~35 segundos porque el backend (`analyze-video`) fuerza compresión a 15 segundos, no a 9 que es la duración real del video generado por Sora 2.
2. Las tarjetas de variantes muestran botones innecesarios (Aprobar, Rechazar, Copiar Prompt, Descargar Imagen) cuando lo único útil es **Descargar Video** y **Regenerar**.
3. El prompt que se usa para generar el video no es fácilmente editable dentro de la tarjeta misma — está en una sección separada arriba.
4. La descarga de video usa `target="_blank"` en vez de forzar descarga real.

### Cambios

#### 1. Backend: Cambiar target de 15s a 9s en `analyze-video`
**Archivo:** `supabase/functions/analyze-video/index.ts`

- Reemplazar todas las referencias a "15 seconds" / "15s" / "15-second" por "9 seconds" / "9s" / "9-second" en el system prompt y user content.
- Cambiar la estructura de timeline de 5 beats (0-15s) a una comprimida de 9 segundos:
  - 0.0–1.5s: Hook
  - 1.5–3.5s: Contexto/reframe
  - 3.5–6.5s: Demo/beneficio principal
  - 6.5–8.0s: Prueba/objeción
  - 8.0–9.0s: CTA
- Actualizar la compresión condicional (líneas 22-28) para comprimir a 9s en lugar de 15s.
- Cambiar `duracion_total_segundos_objetivo` a `"9"`.
- Cambiar `linea_de_tiempo_15s` a `linea_de_tiempo_9s` con segmentos que cubran 0.0-9.0s.

#### 2. Frontend: Simplificar VariantCard
**Archivo:** `src/components/VariantCard.tsx`

Eliminar de la UI:
- Botones "Aprobar" y "Rechazar" (líneas 606-621)
- Botón "Copiar Prompt" (líneas 428-434)
- Botón "Descargar Imagen" standalone (líneas 435-444)
- Sección de prompt visible en la tarjeta (líneas 414-425) — se mantiene en PromptSection arriba
- Botón de descarga de imagen en esquina superior derecha (líneas 401-408)

Conservar:
- Imagen de la variante como preview
- Botón "Generar Video" (Sora 2) cuando no hay video
- Estado de generación activa
- Video player cuando está completado
- **Descargar Video** como botón principal
- **Regenerar** (icono) como botón secundario
- Fallback chain info y ExecutionTimeline para diagnóstico

Agregar:
- Textarea editable del prompt dentro de la tarjeta, debajo del video/imagen, colapsable con "Ver/Editar Prompt"
- Que el prompt editado ahí se use directamente al regenerar video

#### 3. Mejorar descarga de video
**Archivo:** `src/components/VariantCard.tsx`

Cambiar `handleDownloadVideo` para hacer `fetch` + `blob` + `URL.createObjectURL` en vez de `target="_blank"`, forzando descarga real del archivo `.mp4`.

#### 4. Limpiar props innecesarios
**Archivo:** `src/components/VariantCard.tsx`
- Eliminar `onApprove` y `onReject` de las props

**Archivo:** `src/components/ResultsView.tsx`
- Dejar de pasar `onApprove` / `onReject` a VariantCard (simplificar el interface)

### Resumen de archivos

| Archivo | Cambio |
|---|---|
| `supabase/functions/analyze-video/index.ts` | Cambiar target de 15s a 9s en todo el prompt engineering |
| `src/components/VariantCard.tsx` | Simplificar a solo Descargar Video + Regenerar, agregar prompt editable inline, mejorar descarga |
| `src/components/ResultsView.tsx` | Remover props de approve/reject |

### No se toca
- Orquestador, rutas, sidebar, otros módulos, PromptSection global (se mantiene), backend de generación de video.

