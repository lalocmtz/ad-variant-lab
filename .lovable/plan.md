

## Problem

Veo 3.1 tasks are created successfully at `/api/v1/veo/generate`, but the polling function (`get-video-task`) tries to check status at `/api/v1/jobs/recordInfo` — which is for legacy engines (Kling, Hailuo, Wan, Sora). Veo has its own dedicated polling endpoint: **`/api/v1/veo/record-info`**, with different status codes (0=generating, 1=success, 2=failed, 3=generation failed).

Result: `"recordInfo is null"` — the legacy endpoint doesn't know about Veo tasks.

## Fix

### 1. `get-video-task/index.ts` — Route to correct polling endpoint

Accept an `engine` parameter from the frontend. If engine starts with `veo3`, poll at:
```
GET https://api.kie.ai/api/v1/veo/record-info?taskId=...
```
Otherwise use the existing legacy endpoint:
```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
```

Handle Veo's different response shape:
- Status codes: `0` = generating, `1` = success, `2`/`3` = failed
- Video URL in `data.resultUrls` or `data.info.resultUrls`

### 2. `VariantCard.tsx` — Pass engine to polling

When calling `get-video-task`, include `{ taskId, engine: activeEngine }` so the backend knows which endpoint to use.

### Files to modify
| File | Change |
|---|---|
| `supabase/functions/get-video-task/index.ts` | Add Veo-specific polling endpoint and response parsing |
| `src/components/VariantCard.tsx` | Pass `engine` parameter in poll requests |

