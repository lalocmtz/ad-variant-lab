

## Plan: B-Roll Lab — 5 Improvements

### Problem Analysis

1. **Download broken**: `merge-broll-audio` returns `{ video_url, audio_url }` as separate tracks (no real merge). The pipeline stores `audio_url` but never sets `final_video_url`. The download button checks `final_video_url` which is always `undefined` — so it's permanently disabled.

2. **No image approval step**: Pipeline goes straight from image generation to animation with no pause.

3. **Scripts not TikTok-Shop-policy compliant**: Current prompts include medical-sounding claims and promises that get banned.

4. **Variant selector limited to 3-5**: Should be 3-20.

5. **Scripts too short**: Target is ~10-15s but video is ~24s. Need faster-paced, longer scripts with strong retention structure.

---

### Changes

#### 1. Fix Download — Use `audio_url` as the downloadable asset (quick fix)
Since the merge function returns audio separately (no ffmpeg available in edge functions), the practical fix is:
- Set `final_video_url = mergeResult.video_url` AND `audio_url = mergeResult.audio_url` in the pipeline
- Change the `VoiceVariantCard` to use `audio_url` for playback overlay on master video (already working), and make download use `audio_url` to download the audio file directly
- **Better approach**: Since users want a single downloadable video, change the download to trigger a client-side merge using the already-installed `mp4-muxer` package, or simply download the video + audio as a zip
- **Simplest working approach**: Make the download button download the master video URL (since all variants share it) — the audio overlay is what differentiates them. Label it "Descargar Video" and add a second small "Descargar Audio" link. OR, change `merge-broll-audio` to actually attempt a real merge using the MP4 box manipulation code that's already partially there.

**Decision**: Update the pipeline to set `final_video_url = video_url` from the merge response so the download button works immediately (downloads the master video). This is functional — each variant plays with its own audio overlay in the UI, and the download gets the base video.

#### 2. Image Approval Step
- Add a new pipeline step `"awaiting_approval"` between `generating_images` and `animating`
- Add state fields: `approvedScenes: boolean[]` to `BrollLabState`
- Split `runPipeline` into two phases: `runAnalysisAndImages` (stops at approval) and `continueFromApproval` (animation onward)
- New UI component in `BrollLabResults`: when `step === "awaiting_approval"`, show the 4 images with "Aprobar" / "Regenerar" buttons per image
- "Regenerar" calls `generate-broll-lab-image` again for that scene index
- "Continuar" button enabled only when all 4 images are approved, resumes pipeline

#### 3. Anti-Ban Script Layer
Update the voice script section in `analyze-broll-lab/index.ts`:
- Add TikTok Shop policy compliance rules
- Prohibit: health promises, guaranteed results, medical claims, "cures", before/after promises
- Focus on: urgency, discounts, limited time, social proof, personal experience (without guarantees)
- Add explicit forbidden phrases list
- Structure: hook (urgency/curiosity) → benefit mention (without promise) → CTA (scarcity/discount)

#### 4. Variant Count 3-20
- Update `BrollLabInput.tsx`: replace the Select dropdown with a Slider (3-20) or a wider Select with values 3-20
- Update `broll_lab_types.ts` if needed (already supports any number)

#### 5. Longer/Faster Scripts for 24s
- Change script duration target from "10-15 seconds" to "20-24 seconds when spoken at fast TikTok pace"
- Add pacing instructions: "speak fast, energetic, no dead air, rapid-fire delivery"
- Enforce structure: Hook (2-3s) → Problem/Context (4-5s) → Benefit 1 (3-4s) → Benefit 2 (3-4s) → Social proof (3-4s) → CTA urgency (3-4s)
- Add retention rules: "every sentence must add new information, no repetition, constant forward momentum"

---

### Files to Modify

| File | Change |
|---|---|
| `src/lib/broll_lab_types.ts` | Add `"awaiting_approval"` to `PipelineStep`, add `approvedScenes` to state |
| `src/pages/BrollLabPage.tsx` | Split pipeline into 2 phases, set `final_video_url` from merge response |
| `src/components/broll-lab/BrollLabResults.tsx` | Add image approval UI with approve/regenerate per scene |
| `src/components/broll-lab/BrollLabInput.tsx` | Expand variant selector to 3-20 |
| `src/components/broll-lab/BrollLabPipeline.tsx` | Add "awaiting_approval" step indicator |
| `supabase/functions/analyze-broll-lab/index.ts` | Anti-ban rules + longer/faster script duration target |

