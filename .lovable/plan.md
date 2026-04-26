## Problem

The **Analytics → Dílna** dashboard shows only bundles whose `scheduled_week === currentWeekKey`. Projects that were scheduled in the previous week (T-1) but were not completed and "přelily" (spilled over) into the current week are missing — only the `spilledProjects` flag is set on projects that *also* have a current-week schedule row.

The **Modul Výroba** (`src/pages/Vyroba.tsx`, lines 616–635) already implements the correct logic:
1. Load the previous Monday's silo (T-1).
2. For each bundle there, take items whose status is `scheduled` or `in_progress` and that are not `isItemDone`.
3. Add the project as a card with `isSpilled: true`.

Unmatched / off-plan logged hours (cards with `warning: "unmatched" | "off_plan"`) already work correctly and should stay as-is.

## Fix

Mirror the Výroba spillover logic inside `useDilnaData()` in `src/components/DilnaDashboard.tsx`.

### 1. Extend the schedule query
Change the per-week schedule fetch to also include rows from the immediately preceding week (T-1) that are still active:

- Currently: `.eq("scheduled_week", weekInfo.weekKey)`.
- New: also fetch rows where `scheduled_week === prevWeekKey` AND `status IN ("scheduled","in_progress","paused")` AND `expediced_at IS NULL` AND `completed_at IS NULL`.
- Compute `prevWeekKey` from `weekInfo.monday - 7 days` (using existing `toLocalDateStr` helper).

We can either issue a second query for the previous week (cleanest) or widen the existing one with `.in("scheduled_week", [prevWeekKey, weekInfo.weekKey])` and filter in JS. Recommend the second query approach for clarity, then merge.

### 2. Tag rows with `__isSpilled` when grouping bundles
When building `bundlesByProject`, attach an `isSpilled: boolean` flag on each bundle entry (true if `scheduled_week === prevWeekKey`). For spilled rows:
- Skip rows whose status is `completed` or whose item is otherwise "done" (mirror `isItemDone` semantics — `expediced_at != null` or `completed_at != null` or status `completed`).
- Skip the spilled bundle if the same project already has a current-week bundle for the same `stage_id + bundle_label + split_part` (avoid duplicates).

### 3. Add spilled-only project cards
In the card-building loop:
- If a project exists only via spilled bundles (no current-week scheduled hours), still create a `ProjectCard`:
  - `plannedHours = 0` (it's not in this week's plan)
  - `loggedHours = hoursByProject.get(pid) || 0`
  - `bundles = [spilled bundle rows…]` with their original scheduled hours preserved
  - Add a new field `isSpilled: true` on `ProjectCard` and a new `BundleRow.isSpilled` flag
  - `slipStatus`: keep existing `computeSlip()` but pass `isSpilled=true` so the relaxed thresholds apply
- If the project already exists in current-week cards, append spilled bundle rows to its `bundles` array (so user sees both current and spilled bundles together).

### 4. UI — visually distinguish spilled bundles
In the bundle table inside each project card, show a small amber chip on spilled rows (e.g., `Z T{prevWeekNum}` like in WeeklySilos `CollapsibleBundleCard`, lines 1846–1849). Use existing `getISOWeekForOffset(weekOffset - 1)` to get the previous week number.

For spilled-only project cards (no current-week plan), add a subtle amber border/badge `Přelité z T-1` on the card header to match the Výroba sidebar treatment.

### 5. Counters & summary cards
Spilled projects should not inflate `plannedHours` totals (they're already counted in their original week), but their **logged hours** for the current week are real and already included in `totalHoursWeek`. No changes needed for the summary cards — totals come from `production_hours_log` which is week-scoped.

Optionally add a small badge `+N přelité` next to the projects count card for transparency.

### 6. Visual QA after implementation
After saving, switch to **Analytics → Dílna**, set the week to one where you know there's an unfinished project from the prior week, and confirm:
- Spilled bundles appear (with amber `Z T{n-1}` chip)
- Spilled-only project cards appear with `Přelité z T-1` badge
- Tracked hours / value calculations still match
- No duplicate cards if a project is both planned this week AND spilled

## Files affected
- `src/components/DilnaDashboard.tsx` — the only file to edit. Update `useDilnaData()` query, the bundle-grouping loop, the card-building loop, and the bundle/card render JSX.

No DB migrations, no other components affected.
