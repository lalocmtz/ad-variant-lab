

## Diagnóstico: 3 Problemas de Raíz

Después de inspeccionar todo el flujo (frontend, edge functions, logs, y network requests), encontré **tres fallos críticos** que explican exactamente lo que ves:

### 1. La imagen del producto que subes SE IGNORA COMPLETAMENTE
El formulario (`InputStep.tsx`) recoge el `File` del producto y lo pasa a `Index.tsx`, pero `Index.tsx` **nunca lo sube a storage ni lo convierte a base64**. La imagen se descarta silenciosamente — nunca llega a ninguna edge function.

### 2. Gemini NO ve el video — solo lee el título
La función `analyze-video` recibe el `video_url` pero **solo lo menciona como texto** en el prompt. Gemini nunca recibe contenido visual. Está inventando la descripción del producto basándose únicamente en el título ("300 cápsulas de aceite de orégano") — por eso describe "botella blanca de VivoNu" cuando el producto real es una bolsa verde.

### 3. La generación de imagen no tiene referencia visual
`generate-variant-image` genera puramente de texto. No recibe ni la imagen del producto ni un frame del video. El modelo inventa un packaging genérico.

**Dato clave encontrado**: La API de RapidAPI ya devuelve campos `cover` y `origin_cover` (imágenes JPEG del video) que nunca se extraen. Estos son frames reales del video que SÍ se pueden pasar como `image_url` a Gemini y al modelo de imagen.

---

## Plan de Corrección (de raíz)

### Paso 1: `download-tiktok` — Extraer cover del video
- Extraer `data.cover` y `data.origin_cover` de la respuesta de RapidAPI (son URLs de imagen JPEG)
- Devolverlos como `cover_url` en la respuesta junto con `video_url`
- Este cover es el "hook frame" real del video

### Paso 2: Frontend `Index.tsx` — Subir imagen de producto a storage
- Antes de llamar a `analyze-video`, subir `formData.productImage` al bucket `videos` como imagen (JPEG/PNG)
- Obtener la URL pública
- Pasar `product_image_url` y `cover_url` a las funciones de análisis y generación
- Hacer obligatoria la imagen del producto: bloquear el botón si no hay imagen

### Paso 3: `InputStep.tsx` — Hacer obligatoria la imagen del producto
- Cambiar validación: `isValid` requiere `productImage !== null`
- Actualizar texto para indicar que es obligatorio

### Paso 4: `analyze-video` — Gemini VE el frame del video
- Recibir `cover_url` y `product_image_url`
- Enviar ambas como contenido multimodal (`image_url` type) — son JPEGs, formato soportado
- Gemini ahora puede VER el producto real y la escena real para describir geometría, pose, y producto con precisión

### Paso 5: `generate-variant-image` — Imagen generada CON referencias visuales
- Recibir `product_image_url` (obligatorio) y `cover_url` como imágenes de referencia
- Pasar ambas al modelo de imagen como `image_url` en el contenido multimodal
- El prompt de reconstrucción ahora tiene las dos referencias obligatorias para bloquear packaging y composición

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/download-tiktok/index.ts` | Extraer y devolver `cover_url` de RapidAPI |
| `src/components/InputStep.tsx` | Hacer obligatoria la imagen del producto |
| `src/pages/Index.tsx` | Subir imagen del producto a storage, propagar `cover_url` y `product_image_url` |
| `supabase/functions/analyze-video/index.ts` | Recibir y pasar imágenes como contenido multimodal a Gemini |
| `supabase/functions/generate-variant-image/index.ts` | Recibir y pasar imágenes de referencia al modelo de generación |

