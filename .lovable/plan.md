

## Plan: Rediseñar BOF Videos como máquina de videos ganadores

### Resumen
Reestructurar el pipeline BOF para que: (1) genere imágenes de escenas primero y las muestre para aprobación/regeneración, (2) después de aprobar, anime con Sora 2 usando prompts ricos y en paralelo genere voz, (3) fusione video + audio automáticamente para entregar un video final con locución incluida y descargable. Eliminar botones de "Duplicar estilo" y "Regenerar" del resultado final.

### Nuevo flujo del pipeline

```text
Scripts → Imágenes de escenas → PAUSA: Aprobación por variante
                                  ├── Aprobar ✓
                                  └── Regenerar ↻ (escena individual)
                                        │
                                  Usuario aprueba todas
                                        │
                                        ▼
                          Animar escenas (Sora 2) + Voz (ElevenLabs) en paralelo
                                        │
                                        ▼
                          Merge audio + video (por variante) → Video final descargable
```

### Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/hooks/useBofPipeline.ts` | Dividir pipeline en 2 fases: Fase 1 (scripts + imágenes → pausa), Fase 2 (animar + voz + merge). Agregar estado `"approval"` entre `"processing"` y `"results"`. Agregar funciones `handleApproveScene`, `handleRegenerateScene`, `handleContinueAfterApproval`. Eliminar `handleDuplicateStyle` y `handleRegenerateVariant`. |
| `src/pages/BofVideosPage.tsx` | Agregar paso `"approval"` que muestra un nuevo componente de aprobación de imágenes BOF. |
| `src/components/bof/BofImageApproval.tsx` | **Nuevo** — Panel de aprobación estilo B-Roll Lab pero para BOF: muestra las 3 escenas por variante con botón aprobar/regenerar. Botón "Continuar" solo activo cuando todas las escenas de todas las variantes están aprobadas. |
| `src/components/bof/BofResultsView.tsx` | Simplificar: eliminar botones "Regenerar" y "Duplicar estilo". Mostrar solo video final (no clips sueltos ni audio separado). Agregar botón de descarga prominente. |
| `src/components/bof/BofPipeline.tsx` | Actualizar pasos del pipeline: Scripts → Imágenes → Aprobación → Animación → Voz → Merge → Listo. |
| `src/lib/bof_types.ts` | Agregar `"approval"` a `BofStep`. Agregar campo `final_merged_url` a `BofVariantResult`. |

### Detalle técnico del merge automático

Después de que el polling confirma que los 3 clips de Sora 2 están listos y la voz de ElevenLabs se generó:
1. Subir audio MP3 al storage
2. Tomar el primer clip completado como video base
3. Llamar a la edge function `merge-audio` existente (o una variante que acepte video_url + audio_url) para combinar video Sora + audio ElevenLabs
4. El resultado es un MP4 final con locución incluida → `final_merged_url`
5. Ese URL es lo que se muestra y se descarga

### Prompts de animación enriquecidos

En lugar de 3 prompts genéricos, los prompts de Sora 2 se construirán usando:
- El `script_text` de la variante (para contexto de lo que se está vendiendo)
- El `scene_label` del formato (para el tipo de toma)
- Las `camera_rules` del formato
- El `product_name` y `main_benefit`

Esto genera videos más realistas y orientados a venta.

