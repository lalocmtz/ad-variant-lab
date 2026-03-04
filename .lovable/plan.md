

## Plan: Integrar ElevenLabs TTS + Infinitalk Video Animation

### Resumen

Convertir el flujo actual (imagen estática + prompt de Kling) en un pipeline completo que entrega **videos animados con voz**. El sistema generará audio con ElevenLabs basado en el guion, luego animará la imagen con Infinitalk (kie.ai) usando ese audio.

### Secrets Necesarios

Antes de implementar, necesito que configures dos API keys:

1. **ELEVENLABS_API_KEY** -- de [elevenlabs.io/app/settings](https://elevenlabs.io)
2. **KIE_API_KEY** -- de [kie.ai/api-key](https://kie.ai/api-key) (Infinitalk)

### Arquitectura del Pipeline Extendido

```text
Flujo actual (no se toca):
  TikTok URL → download-tiktok → preview → analyze-video → generate-variant-image
                                                                     ↓
Nuevo flujo (se agrega):                                       imagen generada
                                                                     ↓
  analyze-video detecta has_voice + content_type ──→ selección de voz ElevenLabs
                                                                     ↓
  Edge: generate-voiceover ──→ script.hook+body+cta → ElevenLabs TTS → audio_url
                                                                     ↓
  Edge: animate-variant ──→ Infinitalk from-audio (imagen + audio + prompt) → taskId
                                                                     ↓
  Edge: check-animation-task ──→ polling taskId → video_url final
                                                                     ↓
  Frontend: ResultsView muestra video player por variante
```

### Nuevos Edge Functions (3)

| Function | Responsabilidad |
|---|---|
| `generate-voiceover` | Recibe script (hook+body+cta), selecciona voz ElevenLabs según content_type/has_voice, genera audio MP3, lo sube a storage, devuelve URL pública |
| `animate-variant` | Envía imagen + audio + prompt a Infinitalk `infinitalk/from-audio`, devuelve taskId |
| `check-animation-task` | Consulta status del task en kie.ai, devuelve video_url cuando esté listo |

### Lógica de Selección de Voz

Basado en `has_voice` y `content_type` del análisis:
- `has_voice: false` → modo silent, NO se genera voiceover, solo texto en pantalla. Infinitalk recibe audio silencioso o se salta
- `HUMAN_TALKING` + `has_voice: true` → voz conversacional (ElevenLabs voice: Sarah/Laura para mujer, Roger/Brian para hombre)
- `HANDS_DEMO` → voz explicativa neutra
- El analyze-video ya detecta `has_voice` -- agregaremos `suggested_voice_gender` al schema para que Gemini sugiera género de voz basado en el actor observado

### Cambios en Frontend

1. **ResultsView / VariantCard redesign para desktop**:
   - Layout horizontal: imagen pequeña (thumbnail) + sección de guion + video player
   - Reemplazar la imagen 9:16 gigante por un thumbnail compacto
   - Agregar video player para el video animado final
   - Mostrar estado de generación (generando audio → animando → listo)

2. **Pipeline extendido en Index.tsx**:
   - Después de generar imágenes, ejecutar secuencialmente: voiceover → animate → poll
   - Nuevos pasos en ProcessingPipeline: "Generando voz", "Animando video", "Finalizando"

3. **VariantResult type update**:
   - Agregar `audio_url`, `animation_task_id`, `video_url`, `suggested_voice_gender`

### Archivos a Crear/Modificar

| Archivo | Acción |
|---|---|
| `supabase/functions/generate-voiceover/index.ts` | Crear -- ElevenLabs TTS |
| `supabase/functions/animate-variant/index.ts` | Crear -- Infinitalk from-audio |
| `supabase/functions/check-animation-task/index.ts` | Crear -- Poll task status |
| `supabase/functions/analyze-video/index.ts` | Modificar -- agregar `suggested_voice_gender` al schema |
| `supabase/config.toml` | Agregar 3 nuevas functions |
| `src/pages/Index.tsx` | Modificar -- extender pipeline con voiceover + animate + poll |
| `src/components/VariantCard.tsx` | Rediseñar -- layout horizontal, video player, estados |
| `src/components/ResultsView.tsx` | Modificar -- layout desktop optimizado |
| `src/components/ProcessingPipeline.tsx` | Modificar -- agregar pasos nuevos |

### Paso Inmediato

Necesito que me proporciones los dos API keys antes de proceder con la implementación.

