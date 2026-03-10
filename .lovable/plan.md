

## Plan: Remove Dashboard & Make History Actionable

### Changes Overview

**1. Remove Dashboard, default to Video Variants**
- `src/App.tsx`: Remove Dashboard import/route. Change `/` and `/dashboard` redirects to `/create/video`.
- `src/components/Layout.tsx`: Remove the Dashboard sidebar item. Update "New Project" button to navigate to `/create/video`.
- `src/pages/Dashboard.tsx`: Delete (no longer used).

**2. Rework History Page with "Ver variantes" expansion**

Replace the current non-functional Complete badge + Download button with a single "Ver variantes" button per entry. Clicking it expands an inline detail panel showing:
- All variant images (from `results.variants[].generated_image_url`)
- All generated videos (from `results.variants[].video_url`) as embedded `<video>` players
- Download links for each asset

The data is already stored in the `results` JSONB column of `analysis_history`, so no database changes are needed.

### File Changes

| File | Action |
|------|--------|
| `src/App.tsx` | Remove Dashboard route, redirect `/` and `/dashboard` → `/create/video` |
| `src/components/Layout.tsx` | Remove Dashboard sidebar item, update "New Project" button target |
| `src/pages/Dashboard.tsx` | Delete file |
| `src/pages/HistoryPage.tsx` | Replace Complete/Download with expandable "Ver variantes" showing images & videos |

