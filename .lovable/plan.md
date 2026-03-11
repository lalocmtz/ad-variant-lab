

## Plan: B-Roll Lab History with Re-generation

### What we're building
Save completed B-Roll Lab runs to a dedicated history table. Each entry shows the product image as thumbnail. Users can expand entries to see scenes, videos, and variants. A "Generar nuevas variantes" button re-uses the existing analysis + master video to create fresh, different voice variants without re-running the full pipeline.

---

### Database

New table `broll_lab_history`:

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | Auth user |
| created_at | timestamptz | |
| product_image_url | text | Thumbnail for identification |
| product_url | text | |
| tiktok_urls | jsonb | Original reference URLs |
| analysis | jsonb | Full BrollLabAnalysis |
| scenes | jsonb | SceneResult[] with image/video URLs |
| master_video_urls | jsonb | string[] of animated clips |
| voice_variants | jsonb | VoiceVariant[] with audio/video URLs |
| variant_count | int | Number of variants generated |
| inputs | jsonb | Original BrollLabInputs for re-generation |

RLS: authenticated users CRUD own rows only.

---

### Changes

#### 1. `src/pages/BrollLabPage.tsx`
- After pipeline completes (step `done`), auto-save to `broll_lab_history`
- Store all state: analysis, scenes, masterVideoUrls, voiceVariants, inputs

#### 2. `src/pages/HistoryPage.tsx` — Add B-Roll Lab section
- Query both `analysis_history` AND `broll_lab_history`
- B-Roll entries show `product_image_url` as thumbnail
- Expand shows: 4 scene images, master video player, voice variant cards with download
- "Generar nuevas variantes" button:
  - Loads saved `analysis`, `masterVideoUrls`, and `inputs`
  - Calls voice generation (Phase 2 voices-only) with instruction to produce DIFFERENT scripts
  - Appends new variants to the existing entry (updates `voice_variants` in DB)
  - Key: passes `existing_scripts` to `analyze-broll-lab` so AI generates non-duplicate scripts

#### 3. `supabase/functions/analyze-broll-lab/index.ts`
- Accept optional `existing_scripts` param
- When present, add to prompt: "Do NOT repeat these scripts. Generate completely different hooks, angles, and CTAs: [existing scripts]"

#### 4. `src/components/broll-lab/BrollLabResults.tsx`
- No changes needed — already renders voice variants with download

---

### Files to modify

| File | Change |
|---|---|
| DB migration | Create `broll_lab_history` table + RLS |
| `src/pages/BrollLabPage.tsx` | Save to DB on completion |
| `src/pages/HistoryPage.tsx` | Fetch + render broll lab entries, "Generar nuevas variantes" button |
| `supabase/functions/analyze-broll-lab/index.ts` | Accept `existing_scripts` to avoid duplicates |

