

## Plan: Mejorar el flujo de análisis y generación de imágenes

### Problema raíz
El sistema actual tiene dos fallos críticos:
1. **Gemini NO está viendo el video**. Solo recibe la URL como texto y metadata (título, duración, autor). Gemini tiene capacidad multimodal y puede analizar video directamente si se le pasa como `image_url` en el contenido.
2. **La generación de imagen es solo texto**. No se pasa ninguna referencia visual (ni el frame del video, ni la imagen del producto). El modelo genera "a ciegas".

### Cambios

#### 1. `analyze-video/index.ts` — Hacer que Gemini VEA el video
- Enviar el `video_url` como contenido multimodal (`image_url` type) para que Gemini-2.5-Pro realmente analice los frames del video.
- Reestructurar el prompt con el esquema mejorado del usuario: `content_type` como enum (`HUMAN_TALKING|HANDS_DEMO|PRODUCT_ONLY|TEXT_ONLY`), `beat_timeline` como objetos `{beat, time, what_happens}`, `motion_signature` detallado, `hook_frame` index, `product_interaction` con campos específicos.
- Añadir lógica de `has_voice` real basada en lo que Gemini observe en el video.
- Mejorar el prompt de Kling motion para incluir datos concretos (camera distance, hand used, product orientation, gesture rhythm, cut timing, beat order).

#### 2. `generate-variant-image/index.ts` — Pasar referencia visual del video
- Enviar el `video_url` (o el frame del hook) como `image_url` al modelo de generación de imagen para que tenga referencia visual real de la composición original.
- Reestructurar el prompt para ser menos descriptivo/creativo y más de reconstrucción con restricciones duras, insertando los datos de `scene_geometry` de forma explícita.
- Agregar `negative_prompt` global: `no logos, no watermarks, no random text, no extra hands, no distorted fingers, no product redesign`.

#### 3. `Index.tsx` — Pasar `video_url` hasta la generación de imagen
- Propagar el `video_url` descargado al paso de generación de imagen para que se pueda usar como referencia visual.

#### 4. Pipeline steps — Alinear con la realidad
- Ajustar los pasos del pipeline para reflejar lo que realmente sucede (descargar → analizar con Gemini multimodal → generar imágenes con referencia).

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/analyze-video/index.ts` | Enviar video como contenido multimodal + prompt mejorado |
| `supabase/functions/generate-variant-image/index.ts` | Recibir y usar `video_url` como referencia visual |
| `src/pages/Index.tsx` | Pasar `video_url` a generate-variant-image |

