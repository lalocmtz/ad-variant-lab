

## Plan: History Page — Recovery, Retry & Full Project Summary

### Problem
When a pipeline (BOF Videos, B-Roll Lab, Video Variants) fails mid-process, the history page shows the entry but provides no way to:
- See what stage it stopped at
- View/download images that were already generated and paid for
- Retry only the failed video animation step (without re-generating scripts/images)
- See a clear summary of inputs (URLs, product info, approved images)

### Changes

#### 1. BOF Batch: "Retry Animation" from History
The `bof_video_variants` table already stores `generated_image_url` and `script_text` for each variant. When a BOF batch is stuck at `awaiting_approval` or has variants with images but no video, add a **"Reintentar Videos"** button that:
- Loads the variant data from DB
- Calls `generate-bof-video` for each variant that has an image but no `final_video_url`
- Polls `get-video-task` until completion
- Updates the DB row on success

**Files:**
- `src/pages/HistoryPage.tsx` — Add retry logic + button inside `BofBatchExpandedCard`

#### 2. BOF Batch: Richer Expanded View
Show a clear project summary section with:
- Product image + name + price
- All scene images per variant (currently only shows final video or single image)
- Script text visible per variant
- Download buttons for individual scene images
- Status badge per scene (image ready / video pending / video done / failed)

**Files:**
- `src/pages/HistoryPage.tsx` — Enhance `BofBatchExpandedCard` to show `scene_images` from variant data

#### 3. BOF Batch: Resume to Approval
For batches stuck at `awaiting_approval`, add a **"Retomar Aprobación"** button that navigates to `/create/bof-videos?resume=<batchId>`, loading the saved state.

**Files:**
- `src/pages/HistoryPage.tsx` — Add resume button for `awaiting_approval` status
- `src/hooks/useBofPipeline.ts` — Add `loadFromHistory(batchId)` function that reads batch + variants from DB and restores the approval step
- `src/pages/BofVideosPage.tsx` — Read `?resume=` param and call `loadFromHistory`

#### 4. Video Variants: Show Input URL & Images
In the Analysis expanded card, show:
- The original TikTok URL as a clickable link
- All variant images in a gallery (downloadable)
- Clear status per variant (image ready / video generating / video done / failed)

**Files:**
- `src/pages/HistoryPage.tsx` — Enhance Analysis expanded section

#### 5. B-Roll Lab: Add Resume for Incomplete Projects (already partially done)
The "Retomar" button exists for B-Roll Lab. Just ensure scene images are downloadable from the expanded view.

**Files:**
- `src/pages/HistoryPage.tsx` — Add download buttons to scene images in `BrollLabExpandedCard`

---

### Summary of file changes

| File | Change |
|---|---|
| `src/pages/HistoryPage.tsx` | Major: retry animation logic for BOF, richer expanded views for all 3 types, download buttons for images, input summary |
| `src/hooks/useBofPipeline.ts` | Add `loadFromHistory(batchId)` to restore approval state from DB |
| `src/pages/BofVideosPage.tsx` | Read `?resume=` search param, call `loadFromHistory` |

### No database changes needed
All required data is already persisted in `bof_video_variants` (scene images, scripts, video URLs) and `bof_video_batches` (product info, status). The `analysis_history.results` JSONB already contains variant images and video states.

