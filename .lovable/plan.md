

## Root Cause Analysis

The logs show the exact failure sequence:
1. Task `87cde78dec2ba012200d7d04e660171c` is created with model `sora-2-image-to-video`
2. Provider stays in `waiting` state for ~30 seconds
3. Provider transitions directly to `fail` — never enters `generating`
4. The `failMsg` field from the provider is not being surfaced to the UI

The most likely cause: **the prompt sent to Sora 2 is too long/complex** (the raw response shows a massive escaped prompt string), and Kie AI silently rejects it. The `failMsg` in the `taskData` is either empty or contains the generic "internal error" message, which gets passed through without enrichment.

There are also **no fallback models** — when Sora 2 fails, the entire flow fails.

## Plan

### 1. Harden `animate-kling/index.ts` — Add fallback model chain for no_avatar mode

**Current**: Sends to `sora-2-image-to-video` only. If it fails, game over.

**Change**:
- Add input validation (reject blob URLs, validate URL format, validate prompt)
- Implement a model fallback chain: try `sora-2-image-to-video` first, if task creation fails try `kling-2.6/motion-control` with image-only mode (no video_urls)
- Shorten the no_avatar prompt drastically (current default is fine but the prompt from `generate-video-sora` is ~10K chars)
- Add structured logging for each attempt
- Add 30-second fetch timeout with AbortController
- Return `{ taskId, model }` so the UI knows which model was used

### 2. Harden `generate-video-sora/index.ts` — Add fallback + better prompt truncation

**Current**: Sends to one model only. Prompt can reach 10K chars which triggers provider rejection.

**Change**:
- Cap prompt at 2000 characters max (Sora 2 doesn't need verbose prompts for image-to-video)
- Add model fallback: if `sora-2-image-to-video` fails at task creation, retry with `sora-2-pro-image-to-video` (or vice versa)
- Add 30-second fetch timeout
- Return which model was actually used
- Log the full error chain

### 3. Harden `get-video-task/index.ts` — Better failMsg extraction + unknown states

**Current**: Extracts `failMsg` from `taskData` but doesn't handle all edge cases.

**Change**:
- Extract `failMsg` more aggressively: check `taskData.failMsg`, `taskData.errorMessage`, `taskData.error`, `data.msg`, and inside `resultJson`
- Handle `error` and `unknown` provider states explicitly
- Add 15-second fetch timeout
- Log extracted failMsg explicitly

### 4. Frontend — Show model fallback status + better error messages

**Files**: `VariantCard.tsx`, `KlingAnimationPanel.tsx`

**Change**:
- When `generate-video-sora` or `animate-kling` returns a `fallbackUsed` flag, show a toast: "Reintentando con modelo alternativo..."
- Surface the specific `failMsg` from polling instead of generic errors
- No structural changes to the UI

### Files to modify

| File | Change |
|---|---|
| `supabase/functions/animate-kling/index.ts` | Add validation, fallback model chain, fetch timeout, structured logging |
| `supabase/functions/generate-video-sora/index.ts` | Cap prompt at 2000 chars, add fallback model, fetch timeout |
| `supabase/functions/get-video-task/index.ts` | Better failMsg extraction, handle unknown states, fetch timeout |
| `src/components/VariantCard.tsx` | Show fallback toast, surface specific provider error |
| `src/components/KlingAnimationPanel.tsx` | Show fallback toast, surface specific provider error |

### What stays untouched
- Avatar/Kling motion-control flow (only adding a fallback path for no_avatar)
- All other edge functions
- All other UI components
- Database, storage, auth

