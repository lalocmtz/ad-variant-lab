

## Plan: Modulo de Animacion Kling Motion Control

### Resumen
Agregar un modulo independiente post-generacion de imagenes que permite al usuario animar las variantes usando la API de Kling Motion Control (KIE AI). No se toca ningun codigo existente del flujo de descarga, analisis o generacion de imagenes.

### 1. Nueva Edge Function: `animate-kling/index.ts`

Recibe: `image_url` (variante generada), `video_url` (video original TikTok).

Hace POST a `https://api.kie.ai/api/v1/jobs/createTask` con:
- Model: `kling-2.6/motion-control`
- El prompt maestro hardcodeado (el que proporcionaste)
- `input_urls`: [image_url]
- `video_urls`: [video_url]
- `character_orientation`: "video"
- `mode`: "720p"
- Header: `Authorization: Bearer ${KIE_API_KEY}`

Devuelve el `taskId`.

### 2. Nueva Edge Function: `poll-kling/index.ts`

Recibe: `taskId`. Consulta el estado de la tarea en KIE AI. Devuelve `status` y `video_url` cuando esta listo.

### 3. Frontend: `ResultsView.tsx` - Agregar seccion de animacion

Debajo de la grilla de variantes:
- Dropdown: "¿Cuantos videos quieres generar? (1 a 5)"
- Boton: "Animar Variantes (Kling Motion)"
- Al hacer clic, envia las primeras N imagenes + video_url al backend
- Grilla de resultados de video con skeleton/spinner por variante ("Animando variante X...")
- Polling cada 12 segundos por tarea hasta obtener URL del .mp4
- Reemplaza spinner con `<video>` player al completarse

### 4. `ResultsView.tsx` - Props adicionales

Necesita recibir `videoUrl` (del video original descargado) desde `Index.tsx` para pasarlo al modulo de animacion.

### 5. `Index.tsx` - Pasar video_url a ResultsView

Pasar `downloadedData.video_url` como prop a `ResultsView` sin modificar el flujo existente.

### Archivos a crear/modificar

| Archivo | Accion |
|---|---|
| `supabase/functions/animate-kling/index.ts` | **Crear** - POST a KIE AI createTask |
| `supabase/functions/poll-kling/index.ts` | **Crear** - Polling de estado de tarea |
| `src/components/ResultsView.tsx` | **Modificar** - Agregar UI de animacion |
| `src/components/KlingAnimationPanel.tsx` | **Crear** - Componente de animacion con polling |
| `src/pages/Index.tsx` | **Modificar** - Pasar videoUrl a ResultsView |

### Detalle tecnico del polling

El componente `KlingAnimationPanel` mantendra un array de `{ taskId, status, videoUrl }`. Usara `setInterval` de 12s por cada tarea activa. Cuando `status === "completed"`, muestra el video. Si `status === "failed"`, muestra error con opcion de reintentar.

