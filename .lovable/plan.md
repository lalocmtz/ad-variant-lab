

## Plan: Fix Script Content, Actor Diversity, and Complete Video Pipeline

### Problem Analysis

Three distinct issues identified:

1. **Script contains stage directions instead of spoken dialogue**: The `analyze-video` prompt (line 98) says `script: {hook, body, cta} — describe visual actions`. Gemini writes things like "El actor se gira hacia la cámara" instead of actual spoken words like "¿Sabías que este producto...". The TTS then reads these stage directions aloud.

2. **Generated actors look too similar to the original**: The `base_image_prompt_9x16` prompt doesn't explicitly instruct diversity in actor appearance (ethnicity, age, features). Two of three variants end up looking like the source actor.

3. **No video was actually produced**: The animation pipeline runs but the user never sees a video player. Need to verify the polling logic works and the UI displays videos correctly.

### Changes

#### 1. Fix `analyze-video` prompt (the core fix)

**File**: `supabase/functions/analyze-video/index.ts`

Split the `script` field into two distinct concepts:
- `script` (renamed purpose): The actual **spoken dialogue** — what the person SAYS to camera. This is what TTS will read. Must be natural, conversational Spanish as if a real person is talking.
- `visual_directions`: Stage directions describing what happens visually (kept in shotlist descriptions).

Prompt changes:
- Replace `script: {hook, body, cta} — describe visual actions` with `script: {hook, body, cta} — the EXACT WORDS the person SAYS OUT LOUD to camera. This must be natural spoken dialogue in Spanish, as if a real person is talking in a TikTok ad. NOT stage directions. NOT descriptions of actions.`
- Add to system prompt: `CRITICAL: The script field contains SPOKEN DIALOGUE only. Example of WRONG: "El actor muestra el producto". Example of CORRECT: "¿Quieres una piel perfecta? Mira esto..."`
- Add explicit instruction: `Each variant must have a DIFFERENT script iteration — same message, different wording. The script is what will be converted to voice audio.`

#### 2. Force actor diversity in image prompts

**File**: `supabase/functions/analyze-video/index.ts`

Add to the system prompt for `base_image_prompt_9x16`:
- `CRITICAL DIVERSITY RULE: Each variant MUST feature a visually DISTINCT person. Vary ethnicity, age range, hair color, hair style, and facial features significantly between variants. Variant A, B, and C must look like three completely different people. NEVER make any variant resemble the original actor from the source video.`

#### 3. Clean up VariantCard UI

**File**: `src/components/VariantCard.tsx`

- Remove the "Prompt Kling Motion" collapsible section and the "Copiar Prompt" button — these are internal implementation details the user doesn't need to see
- Keep only: thumbnail, script (spoken dialogue), audio player, video player

#### 4. Verify animation pipeline completeness

**File**: `src/pages/Index.tsx`

No structural changes needed — the animate + poll logic exists. The issue is likely that the previous run failed silently or the script fix will make it work correctly now since the audio will be proper dialogue.

### Files to Modify

| File | Change |
|---|---|
| `supabase/functions/analyze-video/index.ts` | Fix script prompt to require spoken dialogue; add actor diversity rules |
| `src/components/VariantCard.tsx` | Remove prompt/copy sections; clean UI to show only script + media |

