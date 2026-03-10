

## Plan: Eliminar timeout + Garantizar audio en videos generados

### Problema 1: Timeout de 10 minutos mata tareas validas
La tarea de Kling sigue procesandose en el servidor pero el frontend la marca como "fallida" a los 10 minutos y deja de hacer polling.

**Solucion:** Eliminar el timeout completamente. El polling continua indefinidamente hasta que KIE devuelva `success` o `fail`. La UI muestra solo el tiempo transcurrido sin limite maximo.

**Archivo:** `src/components/KlingAnimationPanel.tsx`
- Eliminar la constante `TIMEOUT_MS` y toda la logica de timeout en `pollTask` (lineas 82-94)
- Cambiar la barra de progreso para que sea una animacion pulsante (indeterminada) en vez de basada en tiempo
- Cambiar el timer de `"2:30 / 10:00"` a solo `"2:30"` (tiempo transcurrido sin limite)

### Problema 2: Videos entregados sin audio
Kling Motion Control genera video **sin audio** por diseno — solo anima la imagen con el movimiento del video de referencia. El audio del TikTok original se pierde.

**Solucion:** Crear una edge function `merge-audio` que use ffmpeg-wasm para combinar el video de Kling (sin audio) con el audio extraido del video original de TikTok. Cuando el polling detecta que un video esta listo, automaticamente llama a `merge-audio` antes de mostrarlo al usuario.

**Archivos nuevos/modificados:**

| Archivo | Cambio |
|---|---|
| `src/components/KlingAnimationPanel.tsx` | Eliminar timeout, cambiar progreso a indeterminado, agregar paso de merge post-completado |
| `supabase/functions/merge-audio/index.ts` | **Nuevo** — Descarga video Kling + video original, extrae audio del original, los combina con ffmpeg-wasm, sube resultado a storage |
| `supabase/config.toml` | Agregar entrada para `merge-audio` |

### Flujo actualizado post-Kling
```text
Kling completa video (sin audio)
        │
        ▼
Estado UI: "Agregando audio del video original..."
        │
        ▼
Edge function merge-audio:
  1. Descarga video Kling (solo video)
  2. Descarga video TikTok original (tiene audio)
  3. ffmpeg: combina video de Kling + audio de TikTok
  4. Sube MP4 final a storage
  5. Devuelve URL publica
        │
        ▼
UI muestra video final CON audio
```

### Detalle tecnico de merge-audio
- Usa `@ffmpeg/ffmpeg` (version WASM que corre en Deno edge functions)
- Comando equivalente: `ffmpeg -i kling.mp4 -i tiktok.mp4 -c:v copy -map 0:v:0 -map 1:a:0 -shortest output.mp4`
- Solo remuxea (no re-encoda video), por lo que es rapido
- Si el audio es mas largo que el video, se corta al largo del video (`-shortest`)

### Estado de la UI durante merge
Se agrega un nuevo `detailState`: `"merging_audio"` con label `"Agregando audio..."` para que el usuario sepa que falta un paso despues de que Kling termine.

