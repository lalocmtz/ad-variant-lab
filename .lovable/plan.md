

## Plan: Fix Video Variants image generation stuck on "Generando..."

### Root Cause
The `analyze-video` endpoint returns each variant with `status: "pending"`. In `Index.tsx` line 479, the code does:
```typescript
status: variant.status || "ready"
```
Since `"pending"` is truthy, the status stays `"pending"`. The `VariantCard` checks `isPending = variant.status === "pending"` and shows a spinner instead of the generated image.

The images ARE being generated successfully (all 3 returned 200 with base64 data), but the UI never shows them because the status is wrong.

### Fix
One line change in `src/pages/Index.tsx` line 479:
```typescript
// Before:
status: variant.status || "ready",

// After:
status: "ready",
```

When the image generates successfully, the status should always be `"ready"`. The API's `"pending"` status is only meaningful during generation, not after. Same fix needed on the `is_regeneration` path if it exists.

### Files
| File | Change |
|---|---|
| `src/pages/Index.tsx` | Line 479: force `status: "ready"` when image is generated successfully |

