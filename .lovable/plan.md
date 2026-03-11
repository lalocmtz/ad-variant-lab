

# Fix: Polling freeze in B-Roll Lab when provider fails

## Root Cause

`pollVideoTask` uses `invokeFn` which throws on `data.error` BEFORE the polling logic can check `data.shouldStopPolling` or `data.status`. The catch block then only stops for errors containing "falló" or "failed", but the provider returns "internal error, please try again later." which doesn't match either string. Result: infinite polling of a dead task.

## Fix

### 1. `src/pages/BrollLabPage.tsx` — Rewrite `pollVideoTask`

Stop using `invokeFn` for polling. Instead call `supabase.functions.invoke` directly and inspect the full response object:

```typescript
async function pollVideoTask(taskId: string, maxAttempts = 90, intervalMs = 5000): Promise<string> {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const { data, error } = await supabase.functions.invoke("get-video-task", {
        body: { taskId, engine: "sora2" },
      });

      // Network/invoke-level error
      if (error) {
        consecutiveErrors++;
        console.warn(`Poll attempt ${i+1} network error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Polling falló después de ${MAX_CONSECUTIVE_ERRORS} errores consecutivos: ${error.message}`);
        }
        continue;
      }

      consecutiveErrors = 0; // reset on successful call

      // Check response fields
      const videoUrl = data?.videoUrl || data?.video_url;

      if (data?.status === "completed" && videoUrl) return videoUrl;

      if (data?.status === "failed" || data?.shouldStopPolling) {
        throw new Error(data?.error || "La animación falló en el proveedor.");
      }

      // Still processing — continue
    } catch (e: any) {
      // Any thrown error from inside (including the explicit throws above) should stop
      if (e.message) throw e;
    }
  }
  throw new Error("Timeout: la animación tardó demasiado. Intenta de nuevo.");
}
```

Key changes:
- Uses `supabase.functions.invoke` directly instead of `invokeFn`
- Checks `shouldStopPolling` and `status === "failed"` from response data (not from thrown errors)
- Adds consecutive error counter (5 max) for network failures before giving up
- Any provider failure immediately stops polling and surfaces the error message

### 2. No other files need changes

- `get-video-task` edge function is working correctly (confirmed via logs)
- `animate-bof-scene` is working correctly (tasks are being created)
- The provider failure ("internal error") is a separate issue from the polling freeze
- `BrollLabPipeline.tsx` and `BrollLabResults.tsx` already handle the `error` step correctly

## Files modified
- `src/pages/BrollLabPage.tsx` — rewrite `pollVideoTask` function (~lines 53-80)

