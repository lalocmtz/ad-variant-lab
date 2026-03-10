

# Plan: Reestructurar Pipeline BOF B-Roll

## Diagnóstico

El pipeline BOF actual ya tiene la arquitectura multi-escena correcta en `useBofPipeline.ts`:
1. Scripts → 2. Imágenes (3 escenas) → 3. Animación (Kling 2.6) → 4. Voz → 5. Completado

**Problemas a resolver:**

1. **`animate-bof-scene` usa Kling 2.6 con modelo `kling-v2-6`** — funciona pero es lento/caro. Debe cambiarse a **Wan 2.6 Flash** como default con Kling como fallback.
2. **`generate-bof-video` (Sora 2)** sigue existiendo y se usa desde `Index.tsx` (Video Variants). Para BOF, ya no se usa directamente pero debería marcarse como legacy.
3. **No hay concatenación de clips** — actualmente `raw_video_url` es solo el primer clip. Falta un paso de stitching.
4. **Voz se genera secuencialmente después de video** — debería ser paralelo.
5. **Pipeline UI** muestra 6 pasos pero falta "Uniendo clips" como paso separado.

## Cambios Propuestos

### 1. Edge Function: `animate-bof-scene/index.ts`
- Cambiar motor default de `kling-v2-6` a `wan/2-6-image-to-video` (Wan 2.6 Flash)
- Agregar parámetro `engine` opcional para permitir fallback a `kling-v2-6`
- Configurar input correcto para Wan: `image_urls` (array), `duration: "5"`, `resolution: "1080p"`, `aspect_ratio: "9:16"`
- Mantener lógica de upload base64 → storage intacta

### 2. Hook: `src/hooks/useBofPipeline.ts`
- Pasar `engine: "wan"` a `animate-bof-scene` por defecto
- **Paralelizar voz y animación**: Lanzar `generate-bof-voice` al mismo tiempo que la animación, no después
- Agregar paso de stitching (pipeline step 4) — por ahora, el "stitch" será tomar todos los `clip_urls` y el primero como `raw_video_url` (la concatenación real requiere ffmpeg que no está disponible en edge functions, pero los clips individuales son el entregable útil)
- Actualizar `pipelineStep` indices para reflejar 7 pasos

### 3. UI Pipeline: `src/components/bof/BofPipeline.tsx`
- Actualizar `PIPELINE_STEPS` a 7 pasos:
  1. Generando scripts
  2. Generando escenas visuales  
  3. Generando imágenes
  4. Animando escenas
  5. Uniendo clips
  6. Generando voz
  7. Fusionando audio + video

### 4. Tipos: `src/lib/bof_types.ts`
- Agregar `"animating_clips" | "stitching_video" | "merging_audio_video"` a `BofBatchStatus`

### 5. NO tocar
- `generate-bof-video` (legacy, usado por Video Variants en Index.tsx)
- `generate-bof-voice` 
- `merge-broll-audio`
- `BofInputForm`
- `BofResultsView` (ya soporta multi-scene)
- `get-video-task` (ya funciona correctamente)
- Flujo de avatar
- `analyze-video`, `analyze-bof-source`

## Detalle Técnico

### Wan 2.6 Flash config para `animate-bof-scene`:
```typescript
const requestBody = {
  model: "wan/2-6-image-to-video",
  input: {
    image_urls: [publicImageUrl],
    prompt: sanitizedPrompt,
    duration: "5",
    resolution: "1080p",
    aspect_ratio: "9:16",
  },
};
```

### Paralelización en `useBofPipeline.ts`:
```text
CURRENT:    Images → Animate → Poll → Voice → Done
PROPOSED:   Images → [Animate + Voice] (parallel) → Done
```

La voz no depende del video, así que se lanzan en paralelo usando `Promise.all`.

### Polling
- Se mantiene `get-video-task` con `engine: "kling"` (ambos Wan y Kling usan el endpoint legacy de KIE)
- El frontend ya hace polling paralelo de todos los clips

## Archivos a Modificar
1. `supabase/functions/animate-bof-scene/index.ts` — cambiar motor a Wan 2.6
2. `src/hooks/useBofPipeline.ts` — paralelizar voz, actualizar steps
3. `src/components/bof/BofPipeline.tsx` — 7 pasos en UI
4. `src/lib/bof_types.ts` — nuevos estados

## Archivos que NO se tocan
- `generate-bof-video` (legacy Sora, usado por Video Variants)
- `generate-bof-voice`, `merge-broll-audio`
- `BofInputForm`, `BofResultsView`
- `get-video-task`, `Index.tsx`
- Todo el flujo de avatar

