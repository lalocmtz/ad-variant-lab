

## Plan: Configurar APIs y construir el backend completo

### APIs necesarias

Basándome en la arquitectura del sistema, necesito solicitar **2 API keys**:

1. **RapidAPI Key** — Para el TikTok Video Downloader (descargar videos de TikTok Shop)
2. **Kie AI API Key** — Para Nano Banana Pro (generación de imágenes hiperrealistas 9:16)

**No necesito** pedir key para Gemini/análisis de video porque Lovable AI ya tiene acceso a `google/gemini-2.5-pro` y otros modelos a través del `LOVABLE_API_KEY` que ya está configurado.

### Lo que se construirá

#### Edge Functions (3 funciones backend):

1. **`download-tiktok`** — Recibe URL de TikTok, llama a RapidAPI para descargar el video, lo guarda en storage, extrae metadata
2. **`analyze-video`** — Envía keyframes + audio info a Gemini (`google/gemini-2.5-pro`) vía Lovable AI, devuelve el JSON blueprint + variantes
3. **`generate-variant-image`** — Llama a Kie AI Nano Banana Pro para generar 1 imagen 9:16 por variante

#### Storage bucket:
- `videos` — Para almacenar videos descargados y keyframes

#### Frontend:
- Conectar `Index.tsx` al flujo real (edge functions en vez de mock data)
- Simplificar `VariantCard` a solo: imagen + prompt Kling (copiable)
- Toda la UI en español

### Paso inmediato

Antes de implementar, necesito que ingreses las 2 API keys. Te las solicitaré en el siguiente mensaje.

