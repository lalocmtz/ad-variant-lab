

## Plan: Persist video state to history & show prompts/videos in History page

### Root Cause
When a video finishes generating, the `video_url` is only updated in React state — it is never written back to the `analysis_history` JSONB row. The history was saved **before** video generation happened, so `video_url` is always empty in the DB.

### Changes

**1. Database: Add UPDATE policy on `analysis_history`**
Currently the table has no UPDATE policy, so the app can't write back video results. Add one:
```sql
CREATE POLICY "User update analysis_history"
ON public.analysis_history FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**2. `src/pages/Index.tsx`: Track history row ID & persist video state changes**
- After `saveToHistory` insert, capture the returned row `id` and store it in state (`historyEntryId`).
- In `handleUpdateVariantVideoState`, after updating local state, also UPDATE the `analysis_history` row's `results` JSONB with the new variant data (specifically `video_url`, `video_status`, `video_task_id`).

**3. `src/pages/HistoryPage.tsx`: Show prompts and videos**
- For each variant card in the expanded panel:
  - Show the animation prompt (`prompt_package.prompt_text`) in a collapsible/scrollable block with a "Copiar prompt" button.
  - If `video_url` exists, render an embedded `<video>` player + "Descargar video" link.
  - If no video, show "Sin video generado" label.
- Keep existing image display and download links.

### File Changes

| File | Action |
|------|--------|
| Migration | Add UPDATE RLS policy on `analysis_history` |
| `src/pages/Index.tsx` | Store `historyEntryId`, persist video state updates to DB |
| `src/pages/HistoryPage.tsx` | Show prompt text, video player, and download links per variant |

