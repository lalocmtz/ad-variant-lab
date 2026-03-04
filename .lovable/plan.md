

## Diagnostico

Viendo las imágenes: Variantes A y B son casi clones del original (mismo actor, solo cambia color de playera). Variante C es la unica buena (persona completamente diferente, HD). Hay dos problemas de raiz:

### Problema 1: Sin diversidad explicita por variante
El `analyze-video` genera `base_image_prompt_9x16` para cada variante, pero NO fuerza descripciones de actores radicalmente diferentes. Gemini produce prompts genéricos como "a young latino man" para las 3 variantes, y el modelo de imagen genera la misma persona con variaciones minimas.

### Problema 2: Modelo incorrecto
Se usa `google/gemini-3-pro-image-preview` pero el usuario pidio explicitamente **nano banana** (`google/gemini-2.5-flash-image`).

### Problema 3: No hay variante index en el prompt
Cada variante se genera con el mismo prompt base sin indicar "esta es variante 1 de 3, DEBE ser una persona completamente diferente a las demás". No hay mecanismo de diversidad.

---

## Plan de Correccion

### 1. `analyze-video/index.ts` — Forzar diversidad explicita de actores

Agregar al system prompt una **tabla de diversidad obligatoria** que exija que cada variante tenga un actor con etnia, edad, genero y rasgos fisicos EXPLICITAMENTE diferentes. El `base_image_prompt_9x16` debe incluir descripcion detallada del actor unico (ej: "A 45-year-old Black woman with braided hair", "A 22-year-old East Asian man with buzzcut").

Agregar al tool schema un campo `actor_description` obligatorio por variante.

### 2. `generate-variant-image/index.ts` — Tres cambios criticos

**a)** Cambiar modelo a `google/gemini-2.5-flash-image` (nano banana).

**b)** Inyectar `variant_index` y `total_variants` en el prompt para que el modelo sepa que DEBE crear una persona unica.

**c)** Agregar al prompt una seccion de **CRITICAL DIVERSITY RULE**: "This is variant {X} of {N}. The person MUST be completely different from the original video actor. Specify: {actor_description from analysis}. Generate a PHOTOREALISTIC, HIGH DEFINITION image."

**d)** Agregar instruccion de calidad HD explicita: "Output resolution must be maximum quality. Ultra-realistic, high-definition, sharp detail."

### 3. `Index.tsx` — Pasar variant_index al generador

En el loop de generacion, pasar `variant_index` (0, 1, 2...) y `total_variants` al edge function para que el prompt sepa cual variante es.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/analyze-video/index.ts` | Forzar actor_description unico y diverso por variante en system prompt + schema |
| `supabase/functions/generate-variant-image/index.ts` | Cambiar a nano banana, inyectar diversidad + HD + variant_index |
| `src/pages/Index.tsx` | Pasar variant_index y total_variants al generate-variant-image |

