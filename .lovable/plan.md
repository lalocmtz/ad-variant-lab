

## Plan: Convertir en SaaS — Agregar Generador de Static Ads

### Vision General

Transformar la app de una sola herramienta (Video Variants) a una plataforma SaaS con dos módulos principales accesibles desde una navegación lateral. El nuevo módulo "Static Ads Generator" permite crear anuncios estáticos para Meta a partir de brand kits, templates de anuncios ganadores y perfiles de cliente generados por IA.

**No se toca nada del flujo actual de Video Variants.**

---

### Cambio 1: Navegación SaaS

Reemplazar el header actual por un sidebar/layout con dos secciones:

| Módulo | Ruta | Descripción |
|---|---|---|
| Video Variants | `/` | El generador actual (sin cambios) |
| Static Ads | `/static-ads` | Nuevo módulo |

- Layout compartido con sidebar colapsable
- Logo "PV" → rebrandear como plataforma
- Cada módulo es una ruta independiente

---

### Cambio 2: Base de datos — Nuevas tablas

| Tabla | Columnas clave |
|---|---|
| `brands` | id, name, description, colors (jsonb), fonts (jsonb), brand_intelligence (text) |
| `brand_assets` | id, brand_id (FK), name, category (product_image, logo, lifestyle), image_url, storage_path |
| `ad_templates` | id, brand_id (FK), name, image_url, storage_path |
| `customer_profiles` | id, brand_id (FK), name, age_range, pain_points, desires, messaging_angle (jsonb completo) |
| `campaigns` | id, brand_id (FK), name, template_id (FK), asset_id (FK), status, cta, aspect_ratio, created_at |
| `campaign_ads` | id, campaign_id (FK), profile_id (FK), prompt (text), image_url, status |

RLS: todas públicas (sin auth por ahora, consistente con el módulo actual).

---

### Cambio 3: Flujo del Static Ads Generator (4 pestañas)

**Tab 1: Brand Setup**
- Formulario: nombre, descripción del producto, colores, fuentes
- Textarea para "Brand Intelligence" (pegar deep research)
- Guardar en tabla `brands`
- Selector de brand activo en la parte superior

**Tab 2: Assets & Templates**
- Sección "Brand Assets": subir imágenes de producto, categorizarlas
- Sección "Ad Templates": subir imágenes de anuncios ganadores como referencia visual
- Ambos se guardan en storage bucket `videos` (ya existe, público) y se registran en DB

**Tab 3: Customer Profiles**
- Botón "Generar 10 Perfiles" → llama edge function que usa Gemini para crear perfiles basados en el brand context
- Lista editable de perfiles generados
- Cada perfil incluye: nombre, rango de edad, pain points, deseos, ángulo de messaging

**Tab 4: Campaign Builder**
- Seleccionar template (anuncio de referencia)
- Seleccionar asset (imagen de producto)
- Seleccionar perfiles objetivo (checkboxes, "Select All")
- CTA opcional
- Volume: cuántos ads por perfil (1-3)
- Aspect ratio (1:1, 4:5, 9:16)
- "Preview Plan" → muestra mapeo perfil→ad
- "Generate Ads" → genera prompts con IA y luego imágenes con Nano Banana Pro
- Galería de resultados con descarga individual

---

### Cambio 4: Edge Functions nuevas

| Función | Propósito |
|---|---|
| `generate-profiles` | Recibe brand context → Gemini genera 10 customer profiles (tool calling para JSON estructurado) |
| `generate-static-ad` | Recibe template image + product image + profile + brand context → genera prompt con Gemini → genera imagen con Nano Banana Pro (gemini-2.5-flash-image) → devuelve image_url |

Ambas usan `LOVABLE_API_KEY` (ya configurado). No se necesitan keys adicionales (FAL ni GEMINI).

---

### Cambio 5: Archivos nuevos y modificados

| Archivo | Acción |
|---|---|
| `src/App.tsx` | Agregar rutas `/static-ads` |
| `src/components/Layout.tsx` | **Nuevo** — sidebar + contenido |
| `src/pages/Index.tsx` | Envolver en Layout (sin cambiar lógica) |
| `src/pages/StaticAds.tsx` | **Nuevo** — página principal del módulo |
| `src/components/static-ads/BrandSetup.tsx` | **Nuevo** — formulario de brand |
| `src/components/static-ads/AssetsManager.tsx` | **Nuevo** — upload de assets y templates |
| `src/components/static-ads/ProfilesPanel.tsx` | **Nuevo** — generación y gestión de perfiles |
| `src/components/static-ads/CampaignBuilder.tsx` | **Nuevo** — constructor de campañas |
| `src/components/static-ads/AdGallery.tsx` | **Nuevo** — galería de ads generados |
| `supabase/functions/generate-profiles/index.ts` | **Nuevo** |
| `supabase/functions/generate-static-ad/index.ts` | **Nuevo** |
| Migraciones SQL | Crear las 5 tablas nuevas |

---

### Orden de implementacion

1. Migración DB (6 tablas)
2. Layout + navegación
3. Brand Setup (Tab 1)
4. Assets & Templates (Tab 2) con upload a storage
5. Edge function `generate-profiles` + Tab 3
6. Edge function `generate-static-ad` + Campaign Builder (Tab 4)
7. Galería de resultados con descarga

