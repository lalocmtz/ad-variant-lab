

## Diagnostico

De los network requests veo que la tarea `49863d08ef4bc3d7dacd704d84847f2c` lleva **mas de 7 minutos** en estado `"waiting"` y el polling sigue cada 12 segundos **sin limite**. El frontend no tiene ningun timeout, asi que seguira haciendo polling indefinidamente.

Hay 3 problemas concretos:

### 1. Polling infinito sin timeout
`KlingAnimationPanel` crea un `setInterval` que nunca se detiene a menos que el estado sea `success` o `fail`. Si KIE AI deja la tarea en `waiting` o `queuing` por mucho tiempo (o la tarea muere silenciosamente), el usuario queda atrapado con el spinner para siempre.

### 2. Sin indicador de progreso real
Solo muestra "Procesando en Kling..." con un spinner generico. No hay barra de progreso, tiempo transcurrido, ni estimacion.

### 3. Variantes A y B identicas a la original
El prompt en `generate-variant-image` no diferencia suficientemente entre variantes. Aunque dice "variant X of N", no fuerza cambios especificos por variante. Falta un seed de variacion o descriptores unicos por indice.

---

## Plan de Correccion

### 1. `KlingAnimationPanel.tsx` — Timeout y progreso

- Agregar un **timeout de 10 minutos** por tarea. Si se excede, cancelar el polling y mostrar error con opcion de reintentar.
- Agregar un **timer de tiempo transcurrido** visible por cada tarea en procesamiento (ej: "2:30 / 10:00").
- Agregar una **barra de progreso** estimada que avance gradualmente (basada en tiempo, no en estado real, ya que KIE no reporta progreso granular).
- Mapear los estados de KIE (`waiting`, `queuing`, `generating`) a mensajes descriptivos en la UI: "En cola...", "Generando video...", etc.
- Guardar `startTime` por tarea para calcular el tiempo transcurrido.

### 2. `poll-kling/index.ts` — Propagar estado granular

- Ademas de `status`, devolver el `state` raw de KIE (`waiting`, `queuing`, `generating`) para que el frontend muestre mensajes mas precisos.
- Ya lo hace con `raw`, pero hacer el mapeo explicito en el response: agregar campo `detail_state`.

### 3. `generate-variant-image/index.ts` — Forzar diferenciacion entre variantes

- Agregar **descriptores fisicos unicos por indice de variante** en el prompt. Ejemplo:
  - Variante 0: "slightly rounder face, thicker eyebrows, wider nose"
  - Variante 1: "angular jawline, thinner lips, narrower eyes"
  - Variante 2: "softer features, fuller lips, higher cheekbones"
- Agregar instruccion explicita: "This variant MUST look COMPLETELY DIFFERENT from variants generated before. Do NOT reuse the same face."
- Incluir el `variant_index` como parte de una tabla de rasgos faciales predefinidos para forzar diversidad.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/KlingAnimationPanel.tsx` | Timeout 10min, timer transcurrido, barra de progreso, estados descriptivos |
| `supabase/functions/poll-kling/index.ts` | Agregar `detail_state` en response |
| `supabase/functions/generate-variant-image/index.ts` | Descriptores faciales unicos por variante |

