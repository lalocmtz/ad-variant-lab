

## Plan: Integrate Sora2 Image-to-Video for "Sin Avatar" Mode

### Problem
The current animation flow always uses Kling motion-control (`kling-2.6/motion-control`), which requires a video reference for motion transfer. For "Sin Avatar" mode, this doesn't work well because:
- Kling motion-control transfers human motion from video to image -- irrelevant for product-only videos
- The Sora2 image-to-video API (`sora-2-image-to-video`) is the correct model: it takes an image + prompt and generates video directly

### Current Architecture
```text
InputStep (videoMode) → Index → analyze-video → generate-variant-image → ResultsView
                                                                            ↓
                                                            KlingAnimationPanel
                                                            (always uses kling-2.6/motion-control)
```

### Changes

**1. Update `supabase/functions/animate-kling/index.ts`**
- Accept a new `video_mode` parameter
- When `video_mode === "no_avatar"`, use model `sora-2-image-to-video` with the Sora2 API schema:
  - `model: "sora-2-image-to-video"`
  - `input.image_urls: [image_url]` (the generated variant image)
  - `input.prompt` (the variant's `hisfield_master_motion_prompt`)
  - `input.aspect_ratio: "portrait"` (9:16)
  - `input.n_frames: "10"`
  - `input.remove_watermark: true`
  - No `video_urls` or `character_orientation`
- When `video_mode === "avatar"` (default), keep existing Kling motion-control logic unchanged

**2. Update `src/components/KlingAnimationPanel.tsx`**
- Accept `videoMode` prop from parent
- Pass `video_mode` to the `animate-kling` edge function call
- When `no_avatar`: hide video trimmer (no video reference needed), simplify UI labels to "Generar Video (Sora)" instead of "Animar Variantes (Kling Motion)"
- Pass `motion_prompt` from variant data to the edge function for Sora prompt

**3. Update `src/components/ResultsView.tsx`**
- Pass `videoMode` from the parent `Index` page down to `KlingAnimationPanel`

**4. Update `src/pages/Index.tsx`**
- Pass `videoMode` from `downloadedData` to `ResultsView` and down to animation panel

### Technical Details

Sora2 payload (for no_avatar):
```json
{
  "model": "sora-2-image-to-video",
  "input": {
    "prompt": "<motion prompt from variant>",
    "image_urls": ["<generated variant image URL>"],
    "aspect_ratio": "portrait",
    "n_frames": "10",
    "remove_watermark": true
  }
}
```

Poll endpoint remains the same (`/api/v1/jobs/createTask` for creation, existing poll-kling for status).

The `hisfield_master_motion_prompt` field already exists on each variant and contains the motion description -- this becomes the Sora2 prompt.

For no_avatar mode, audio merge is skipped since Sora generates its own video without an original audio track to merge.

