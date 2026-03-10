

## Diagnosis

### Issue 1: Image generation hanging
The `generate-variant-image` edge function calls `google/gemini-2.5-flash-image` via the Lovable AI gateway. The logs show the function boots and converts images to base64 successfully, but there are no completion or error logs — meaning the AI gateway call itself is hanging (likely due to rate limits or slow response times for image generation with large base64 payloads). The function generates images **sequentially** in `Index.tsx` (line 460-488: a `for` loop awaiting each variant one at a time), so if one hangs, all subsequent ones are blocked.

### Issue 2: "Generar Video" button missing
The button code is still intact in `VariantCard.tsx` (lines 374-392). It renders conditionally:
```
{variant.generated_image_url && promptText && !isPending && ...}
```
So the button only appears **after** the image has been generated. Since images are hanging, variants stay in `pending` status and the button never shows. This is expected behavior — the button isn't "missing," it's waiting for images that never finish.

## Plan

### 1. Add timeout to image generation call
In `generate-variant-image/index.ts`, wrap the `callImageGeneration` fetch with an `AbortController` timeout (90 seconds). If it times out, return a clear error instead of hanging indefinitely.

### 2. Add error resilience in the avatar pipeline loop
In `Index.tsx` (the `runAvatarPipeline` function, lines 457-488), the current `catch` block already handles failures gracefully by pushing a `needs_regeneration` variant. But the `try` block doesn't have a timeout — the `await supabase.functions.invoke()` can hang forever. Add a race with a 120-second timeout per variant so the UI doesn't freeze.

### 3. Show the "Generar Video" button for completed variants even during batch
Currently the UI waits for ALL variants before showing results (`setStep("results")` at line 502). This is correct — the button already shows for any variant that has `generated_image_url`. No change needed here.

### 4. Fix the `Detail` component ref warning
The console warning about `Detail` getting refs is cosmetic but worth fixing. The `Detail` component (line 512) is a plain function component being used in a context that passes refs. This is a minor React warning — not blocking.

## Files to modify

| File | Change |
|---|---|
| `supabase/functions/generate-variant-image/index.ts` | Add 90s AbortController timeout to the AI gateway fetch call in `callImageGeneration` |
| `src/pages/Index.tsx` | Add per-variant timeout (120s) in the avatar pipeline loop to prevent infinite hangs |

## What stays untouched
- VariantCard.tsx — the video button logic is correct, no changes needed
- All other edge functions, pipelines, and UI components
- BOF, B-roll, static ads flows

