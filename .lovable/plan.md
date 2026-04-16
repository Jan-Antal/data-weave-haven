

## Plan: Auto-calculate project completion % on item completion

**What you asked**: When marking items as "completed" (expedice) in production, automatically compute and save the project's completion percentage — no need to manually log it via the day log.

### How it works now
- The `production_daily_logs` table stores `percent` per project per week, but it's only set manually via the Výroba day log UI.
- Completion actions (CompletionDialog, drag-drop completeItems, context menu) update status to "expedice" but don't touch completion %.

### What changes

**1. Create a shared helper function** (`src/lib/autoProjectPercent.ts`)
- After items are completed, query all `production_schedule` rows for that project
- Calculate: `completed_hours / total_hours * 100` (where total = scheduled + in_progress + paused + completed/expedice hours)
- Save via `saveDailyLog()` with the current week's bundle_id, today's day index, phase = "auto", and the computed percent
- Only write if the new percent differs from the last logged percent (avoid spam)

**2. Call the helper from all completion paths**
- `CompletionDialog.tsx` — after successful completion, call `autoUpdateProjectPercent(projectId)`
- `useProductionDragDrop.ts` — in `completeItems()` callback, call the helper for each unique projectId
- `WeeklySilos.tsx` / `ExpedicePanel.tsx` — any context menu "complete" action that sets status to expedice

**3. Handle edge cases**
- Split items: use actual hours (not full item hours) for completed parts
- Undo: when completion is undone, recalculate and save updated percent
- Multiple projects in one batch: compute per-project

### Technical details
- Bundle ID format: `{project_id}::{week_monday}` (e.g. `Z-2617::2026-04-14`)
- Day index: 0=Mon through 4=Fri, derived from current day
- The helper queries `production_schedule` where project_id matches, groups by status, sums `scheduled_hours`
- Formula: `round(sum(hours where status='expedice') / sum(all hours) * 100)`

