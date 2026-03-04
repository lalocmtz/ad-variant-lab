

## Plan: Histórico de resultados + Mejora radical del prompt de imagen

### 1. Tabla `analysis_history` en la base de datos

Crear una tabla para almacenar cada ejecución:

```sql
create table public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  tiktok_url text not null,
  created_at timestamptz default now(),
  variant_count int,
  results jsonb not null
);
alter table public.analysis_history enable row level security;
-- Acceso público de lectura/escritura (sin auth en este proyecto)
create policy "Public read" on public.analysis_history for select using (true);
create policy "Public insert" on public.analysis_history for insert with check (true);
```

### 2. Frontend: Guardar y consultar historial

- En `Index.tsx`, tras recibir resultados exitosos, insertar un registro en `analysis_history` con el URL, fecha, y JSON de resultados.
- Crear componente `HistoryPanel.tsx` que muestre una lista de análisis previos (URL truncado, fecha formateada, botón para ver resultados).
- Agregar ruta `/history` o bien un panel lateral/sección en la página principal para acceder al historial.
- Al clickear un registro del historial, cargar los resultados guardados en la vista de resultados.

### 3. Mejora del prompt de análisis (`analyze-video`)

Actualizar el `systemPrompt` y `userPrompt` en la edge function para que Gemini devuelva campos adicionales de geometría de escena por variante:

- `scene_geometry`: `{ camera_distance, product_hand, product_position, camera_angle, lighting_direction }`

Estos campos se inyectarán automáticamente en el prompt de imagen.

Agregar `scene_geometry` al schema de la tool call.

### 4. Mejora radical del prompt de imagen (`generate-variant-image`)

Reescribir completamente el prompt en la edge function usando la estructura de 7 bloqueos que proporcionaste:

1. **PRODUCT LOCK** — packaging idéntico al original
2. **SCENE GEOMETRY LOCK** — misma composición de cámara (usando los datos de `scene_geometry` del análisis)
3. **POSE LOCK** — misma posición de manos/producto
4. **IDENTITY CHANGE ONLY** — solo cambia la persona
5. **ULTRA REALISTIC UGC STYLE** — aspecto natural de smartphone
6. **PRODUCT PRIORITY** — producto claramente visible
7. **NATURAL SOCIAL MEDIA LOOK** — no publicitario

El prompt se construirá dinámicamente insertando los datos de geometría de escena extraídos por Gemini.

### 5. Mejora del prompt de Kling Motion (`analyze-video`)

Actualizar las instrucciones para que `hisfield_master_motion_prompt` siga la estructura mejorada:
- VISUAL REFERENCE + MOTION REFERENCE explícitos
- Preservar distancia de cámara, ritmo de gestos, interacción con producto
- Solo reemplazar identidad del actor y detalles de fondo
- Compresión a 10-12s si el video original excede 25s

### Archivos que se modificarán/crearán

| Archivo | Acción |
|---|---|
| `supabase/migrations/...` | Nueva tabla `analysis_history` |
| `supabase/functions/analyze-video/index.ts` | Prompts mejorados + campo `scene_geometry` |
| `supabase/functions/generate-variant-image/index.ts` | Prompt de reconstrucción de escena completo |
| `src/pages/Index.tsx` | Guardar en historial tras éxito |
| `src/components/HistoryPanel.tsx` | Nuevo componente de historial |
| `src/pages/History.tsx` | Nueva página de historial |
| `src/App.tsx` | Ruta `/history` |
| `src/pages/Index.tsx` tipos | Agregar `scene_geometry` a `VariantResult` |

