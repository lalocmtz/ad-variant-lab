

## Diagnosis

The logs confirm the root cause definitively: **Sora 2 tasks are created successfully** (HTTP 200, taskId returned) but then **fail during generation** with the generic `"internal error, please try again later"`. This is a provider-side issue — the prompt and image reach KIE AI correctly, but Sora 2's backend rejects the job after accepting it. The current fallback (`sora-2-pro-image-to-video`) is just another Sora 2 variant with the same underlying issue.

The fix: add **truly different video engines** from KIE AI as selectable options. Based on the KIE AI dashboard screenshot you shared, the platform offers: Hailuo, Wan, Kling, Bytedance, Runway — all accessible through the same `api.kie.ai` API with the same `KIE_API_KEY`.

## Plan

### 1. Update `generate-video-sora/index.ts` — Accept a `model` parameter and support multiple engines

Rename the model chain concept to a **provider registry**. Accept a `model` field from the frontend request body. Map user-friendly names to KIE model IDs:

| UI Label | KIE Model ID | Type |
|---|---|---|
| Sora 2 | `sora-2-image-to-video` | image-to-video |
| Hailuo | `hailuo-image-to-video` | image-to-video |
| Wan | `wan-image-to-video` | image-to-video |
| Kling | `kling-2-master-image-to-video` | image-to-video |

- If the user selects a specific model, try only that model (no fallback — they chose it)
- If no model is specified (default), use the existing fallback chain: Sora 2 → Hailuo → Wan
- Each model may need slightly different `input` fields (e.g., `n_frames` as string vs number, different aspect ratio values). The registry will store per-model config.
- Return `{ taskId, model, provider }` so the UI knows which engine was used

### 2. Update `VariantCard.tsx` — Add model selector dropdown on the generate button

Replace the single "Generar Video (15s)" button with a **split button** or **dropdown menu**:

```
[▶ Generar Video ▾]
  → Sora 2
  → Hailuo  
  → Wan
  → Kling
```

- Default selection: "Auto" (uses the fallback chain)
- When a specific model is chosen, pass `model: "hailuo"` etc. to the edge function
- Show which model was used in the status display during generation
- Keep all existing polling/retry logic unchanged (all models use the same KIE taskId/polling system)

### 3. Keep `get-video-task/index.ts` unchanged

All KIE models use the same `recordInfo` polling endpoint and return the same response shape, so no changes needed.

### Files to modify

| File | Change |
|---|---|
| `supabase/functions/generate-video-sora/index.ts` | Add model registry with Hailuo/Wan/Kling, accept `model` param, per-model input config |
| `src/components/VariantCard.tsx` | Add dropdown model selector on generate button, pass selected model to edge function, show active model name |

