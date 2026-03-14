

## Plan: Fix approval flow + Add resumability from history

### Bug: "Continuar" button stays disabled despite 4/4 approved

**Root cause**: The AI returns `scene_index` starting at 1 (not 0). When the user approves scene with `scene_index: 1`, it sets `approvedScenes[1] = true`, but `approvedScenes[0]` stays `false`. The badge counts `filter(Boolean)` correctly (4/4), but `every(Boolean)` fails because index 0 is untouched.

**Fix**: In `ImageApprovalPanel`, compute `allApproved` by checking only against scenes that have images, not via `array.every()`. Also normalize scene indices in the pipeline to always use 0-based indexing.

### Resumability: Save progress at every step + load from history

Currently the project only saves to `broll_lab_history` when `step === "done"`. If the page closes mid-pipeline, everything is lost.

**Changes**:

1. **Save early, update often** — Insert to `broll_lab_history` as soon as Phase 1 starts (with `step: "downloading"`). Update the same row at each step transition. This way incomplete projects are always persisted.

2. **History shows incomplete projects** — In `HistoryPage`, incomplete entries show a "Retomar" button instead of "Ver proyecto". Badge indicates the step where it stopped.

3. **Resume from history** — Add a query param route: `/create/broll-lab?resume=<id>`. When `BrollLabPage` mounts with this param, it loads the saved state from DB and resumes from wherever it stopped:
   - `awaiting_approval` → Show images for approval
   - `animating`/`stitching`/`generating_voices` → Re-run Phase 2
   - `done` → Show results

---

### Files to modify

| File | Change |
|---|---|
| `src/components/broll-lab/ImageApprovalPanel.tsx` | Fix `allApproved` to check only scenes with images, not array indices |
| `src/pages/BrollLabPage.tsx` | Save to DB at phase transitions (insert early, update often). Add `?resume=id` loading on mount. Normalize scene indices to 0-based. |
| `src/pages/HistoryPage.tsx` | Show incomplete entries with "Retomar" button linking to `/create/broll-lab?resume=<id>` |
| `src/lib/broll_lab_types.ts` | Add optional `historyId` to state for tracking the DB row |

