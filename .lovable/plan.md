

## Plan: TikTok Shop Compliance Toggle + Additional Product Reference Images

### What this solves
1. **TikTok Shop Compliance Filter** — An optional toggle on all 3 input forms (BOF Videos, B-Roll Lab, Video Variants) that injects strict anti-ban rules into script generation prompts. Off by default for Meta/other platforms; on for TikTok.
2. **Additional Reference Images** — Optional extra product images on all 3 forms to give the AI more context about product size, texture, details, and real appearance.

---

### 1. TikTok Compliance Toggle (UI)

Add a Switch component to each input form with label "Filtro TikTok Shop Anti-Ban" and a short description. When enabled, a `tiktok_compliance: true` flag is passed through to the edge functions.

**Files to modify:**
- `src/components/bof/BofInputForm.tsx` — Add Switch + state, pass in `BofFormData`
- `src/components/broll-lab/BrollLabInput.tsx` — Add Switch + state, pass in `BrollLabInputs`
- `src/components/InputStep.tsx` — Add Switch + state, pass in submit data
- `src/lib/bof_types.ts` — Add `tiktok_compliance?: boolean` to `BofFormData` and `BofPayload`
- `src/lib/broll_lab_types.ts` — Add `tiktok_compliance?: boolean` to `BrollLabInputs`

### 2. TikTok Compliance Filter (Backend)

Define a shared compliance prompt block that gets injected into system prompts when the flag is true:

```text
FILTRO ANTI-BAN TIKTOK SHOP (OBLIGATORIO):
- NO promesas médicas, curas ni garantías de resultados absolutos
- NO comparativas de "antes y después" con resultados garantizados  
- NO claims de salud regulados (FDA, COFEPRIS, etc.)
- NO lenguaje de "garantía", "100% efectivo", "cura", "elimina"
- SÍ experiencia personal: "a mí me funcionó", "noté cambios"
- SÍ prueba social: "miles de personas lo usan"
- SÍ urgencia comercial: escasez, descuentos, tiempo limitado
- SÍ beneficios demostrables sin claims médicos
- Usa disclaimers implícitos: "resultados pueden variar"
```

**Files to modify:**
- `supabase/functions/generate-bof-scripts/index.ts` — Inject compliance block into system prompt when `tiktok_compliance` is true
- `supabase/functions/generate-broll-scripts/index.ts` — Same injection
- `supabase/functions/analyze-video/index.ts` — Same injection

### 3. Additional Reference Images (UI)

Add an optional "Imágenes adicionales del producto" section on each form allowing up to 3 extra images. These get converted to base64 or uploaded and passed alongside the main product image.

**Files to modify:**
- `src/components/bof/BofInputForm.tsx` — Multi-image upload section, pass `additional_images: File[]`
- `src/components/broll-lab/BrollLabInput.tsx` — Same
- `src/components/InputStep.tsx` — Same
- `src/lib/bof_types.ts` — Add `additional_images?: File[]` to `BofFormData`, `additional_image_urls?: string[]` to `BofPayload`
- `src/lib/broll_lab_types.ts` — Add `additionalImageUrls?: string[]`

### 4. Additional Reference Images (Backend)

When additional images are provided, append them to the AI request content array with context like "Additional product reference images showing real product details, size, and appearance."

**Files to modify:**
- `supabase/functions/generate-bof-scripts/index.ts` — Accept `additional_image_urls`, add to prompt context
- `supabase/functions/generate-broll-scripts/index.ts` — Same
- `supabase/functions/analyze-video/index.ts` — Same  
- `supabase/functions/generate-variant-image/index.ts` — Pass additional images for visual fidelity

### 5. Pipeline plumbing

- `src/hooks/useBofPipeline.ts` — Pass new fields through to edge function calls
- `src/pages/Index.tsx` — Pass `tiktok_compliance` and `additional_images` through the pipeline

---

### Summary of changes

| Area | Files | Change |
|---|---|---|
| Types | `bof_types.ts`, `broll_lab_types.ts` | Add `tiktok_compliance`, `additional_images` fields |
| UI Forms | 3 input forms | Switch toggle + multi-image upload (up to 3) |
| Edge Functions | 4 functions | Conditional compliance prompt + additional image handling |
| Pipelines | `useBofPipeline.ts`, `Index.tsx` | Pass new fields through |

