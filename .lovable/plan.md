

## Diagnostico

Hay dos problemas claros:

### Problema 1: Diversidad demografica forzada en analyze-video
En `analyze-video/index.ts` lineas 36-53, hay una "MANDATORY ACTOR DIVERSITY TABLE" que explicitamente fuerza etnias diferentes (Black/African, East Asian, Caucasian) y dice "NO TWO variants may share the same ethnicity". Esto contradice directamente el prompt que el usuario proporciono, que dice: "Match the EXACT ethnicity and skin tone of the original person". Hay que eliminar esa tabla de diversidad y reemplazarla con instrucciones que mantengan la misma demografia del original.

### Problema 2: Kling rechaza las imagenes (File type not supported)
Los logs muestran que `animate-kling` envia `image_url` como `data:image/png;base64,...` (un data URL enorme). KIE AI no soporta data URLs base64 — necesita una URL HTTP publica. La solucion es que antes de enviar a Kling, el edge function suba la imagen base64 al storage bucket "videos" y use la URL publica resultante.

---

## Plan de Correccion

### 1. `analyze-video/index.ts` — Eliminar tabla de diversidad etnica

Reemplazar las lineas 36-53 (MANDATORY ACTOR DIVERSITY TABLE) con instrucciones que sigan el prompt original del usuario:
- Mantener la MISMA etnia, tono de piel, grupo de edad y genero del actor original
- Solo cambiar rasgos faciales (estructura facial, ojos, nariz, boca) para crear individuos distintos
- Cada variante debe ser una persona diferente pero del MISMO perfil demografico
- Mantener estilo UGC/TikTok amateur, sin aspecto de foto de stock

### 2. `animate-kling/index.ts` — Convertir base64 a URL publica

Antes de enviar a KIE AI:
1. Detectar si `image_url` es un data URL base64
2. Si lo es, decodificar el base64 y subir el buffer al bucket "videos" de storage
3. Obtener la URL publica del archivo subido
4. Enviar esa URL HTTP a KIE AI en lugar del data URL

Esto requiere crear un cliente Supabase dentro del edge function usando `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/analyze-video/index.ts` | Eliminar tabla de diversidad, aplicar "same demographic, different face" |
| `supabase/functions/animate-kling/index.ts` | Subir base64 a storage antes de enviar URL a KIE AI |

