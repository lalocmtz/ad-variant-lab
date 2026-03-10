

# Plan: Estandarizar Sora 2 como motor universal de video (9 segundos)

## Resumen

Sora 2 será el **único motor de generación de video** en toda la plataforma. Se eliminan las opciones de Veo, Kling, Hailuo y Wan. Se ajusta la duración estándar a **9 segundos**. Se refuerza el acento **mexicano** en todos los prompts de video y voz.

## Cambios

### 1. Edge Function `animate-bof-scene/index.ts`
- Eliminar lógica multi-motor (Wan/Kling). Solo Sora 2.
- Modelo: `sora-2-image-to-video`, endpoint: `/jobs/createTask`
- Input: `aspect_ratio: "portrait"`, `n_frames: "10"`, `remove_watermark: true`
- Ignorar parámetro `engine` del request (siempre Sora 2)
- Prompt suffix incluirá duración de 9s y acento mexicano

### 2. Edge Function `generate-bof-video/index.ts`
- Ya usa Sora 2. Ajustar `n_frames` y prompt para 9 segundos.
- Reforzar acento mexicano en prompt default.

### 3. Edge Function `generate-video-sora/index.ts`
- Eliminar `ENGINES` registry multi-motor y `AUTO_CHAIN`
- Solo mantener Sora 2 como engine único
- Remover fallback logic. Si Sora 2 falla, reportar error directamente
- Ajustar `maxDurationSeconds: 9`
- `buildVideoPrompt`: enforcar "approximately 9 seconds" y acento mexicano

### 4. Frontend `VariantCard.tsx`
- Eliminar `VIDEO_ENGINES` array y `AUTO_ENGINE`
- Eliminar selector de motor en UI. Solo mostrar "Sora 2 · 9s"
- Enviar `model: "sora2"` siempre al backend

### 5. Frontend `useBofPipeline.ts` (BOF Videos)
- Cambiar `animate-bof-scene` calls de `engine: "wan"` a sin engine (backend es Sora 2)
- Cambiar polling de `engine: "wan"` a `engine: "sora2"`

### 6. Frontend `BrollLabPage.tsx` (B-Roll Lab)
- Cambiar `engine: "wan"` a sin engine en `animate-bof-scene` calls
- Eliminar fallback a Kling
- Actualizar mensaje de step ("Animando escenas con Sora 2...")

### 7. Frontend `Index.tsx` (B-Roll / Video Variants main)
- Cambiar `engine: "wan"` a sin engine en `animate-bof-scene` call
- Cambiar polling `engine: "wan"` a `engine: "sora2"`

### 8. Edge Function `get-video-task/index.ts`
- Sin cambios necesarios: ya soporta Sora 2 como engine legacy (usa `/jobs/recordInfo`)

### 9. Acento mexicano
- En `buildVideoPrompt` del backend, reforzar: "MANDATORY: Use Mexican Spanish (es-MX) accent. Natural Mexican vocabulary. No Argentine, Spanish, or neutral corporate tone."
- Asegurar que las funciones de voz (`generate-bof-voice`) pasen `accent: "mexicano"` por defecto

## Archivos a modificar
- `supabase/functions/animate-bof-scene/index.ts` — simplificar a Sora 2 only
- `supabase/functions/generate-bof-video/index.ts` — ajustar prompt 9s
- `supabase/functions/generate-video-sora/index.ts` — eliminar multi-motor, solo Sora 2, 9s
- `src/components/VariantCard.tsx` — eliminar selector de motor
- `src/hooks/useBofPipeline.ts` — cambiar engine references
- `src/pages/BrollLabPage.tsx` — cambiar engine, eliminar fallback
- `src/pages/Index.tsx` — cambiar engine references

