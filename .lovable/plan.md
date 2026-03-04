

## Plan: Trimmer sin restricción de duración + Nuevo prompt de Motion Control

### Cambio 1: Permitir recortar cualquier video (`KlingAnimationPanel.tsx`)
- Eliminar la lógica `isTooLong` que solo muestra el trimmer cuando el video excede 30s.
- Siempre mostrar la opción de "Recortar video" como botón opcional, sin importar la duración.
- Si el video ya es ≤30s, permitir usarlo directamente O recortarlo si el usuario quiere.
- Si el video es >30s, seguir requiriendo recorte antes de animar (obligatorio).

### Cambio 2: Reemplazar prompt de animación (`animate-kling/index.ts`)
- Sustituir el prompt actual (líneas 95-114) por el prompt completo proporcionado por el usuario, que incluye:
  - Instrucciones explícitas de VISUAL REFERENCE y MOTION REFERENCE
  - Sección CRITICAL CONSTRAINTS para prevenir artefactos (morphing, hallucinations, product stability)
  - Secciones PRESERVE FROM VIDEO y PRESERVE FROM IMAGE
  - Estilo UGC TikTok

### Archivos a modificar
| Archivo | Cambio |
|---|---|
| `src/components/KlingAnimationPanel.tsx` | Mostrar trimmer para cualquier duración |
| `supabase/functions/animate-kling/index.ts` | Reemplazar prompt con el proporcionado |

