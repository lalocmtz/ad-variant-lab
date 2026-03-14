

## Plan: Eliminar ElevenLabs del BOF — Sora genera video con voz integrada

### Cambio principal
Quitar completamente la generación de voz con ElevenLabs y el paso de merge. En su lugar, incluir el script completo en el prompt de Sora 2 con instrucciones explícitas de que el video debe incluir narración hablada con ese texto exacto.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/hooks/useBofPipeline.ts` | Eliminar `generateVoice`, eliminar `voicePromises`, eliminar paso `STEP_VOICE` y `STEP_MERGE`. En `buildAnimationPrompt` agregar sección `=== GUION HABLADO ===` con el script completo para que Sora lo narre. Fase 2 solo anima y pasa directo a resultados. |
| `src/components/bof/BofPipeline.tsx` | Quitar los pasos "Generando voz (ElevenLabs)" y "Fusionando video + audio final". Solo quedan: Scripts → Imágenes → Aprobación → Animando escenas. |
| `src/components/bof/BofResultsView.tsx` | Reemplazar `SyncedPlayer` por un `<video>` simple. Eliminar toda referencia a `voice_audio_url` y audio separado. |

### Prompt enriquecido para Sora
El `buildAnimationPrompt` incluirá una sección como:
```
=== GUION HABLADO ===
El personaje/narrador en el video DEBE decir exactamente este texto en voz alta:
"[script_text de la variante]"

La voz debe sonar natural, como un creador de TikTok grabando con su teléfono.
```

Esto asegura que Sora genere el audio de la narración como parte del video.

