## Problem (root cause confirmed in DB)

I queried `production_schedule` for Allianz / Insia / Příluky / Valovi in T-1 (week `2026-04-13`) vs T (`2026-04-20`). All the rows the user expects to see as **přelité** share two characteristics:

| project | T-1 row | flags |
|--|--|--|
| Allianz – 5.patro (split A 4/5) | scheduled, hours 13.6 | `is_midflight=true`, `completed_at=2026-04-20 00:46` |
| Insia (split A 3) | scheduled, hours 212.3 | `is_midflight=true`, `completed_at=2026-04-20 00:46` |
| Příluky Valovi (split A 5) | scheduled, hours 179.6 | `is_midflight=true`, `completed_at=2026-04-20 00:46` |

All three:
- `status = "scheduled"` (NOT completed)
- `expediced_at = NULL` (not shipped)
- `is_midflight = true` (legacy carry-over from Midflight import)
- `completed_at` was filled by the midflight reset script (junk data — it does not mean "done")

### Why both modules hide them today

1. **Modul Výroba** (`src/pages/Vyroba.tsx:515`) — `isItemDone(item)` returns `true` whenever `item.is_midflight` is true. Spillover loop (line 624) filters on `!isItemDone(i)`, so all midflight rows get dropped → no Příluky/Insia/Allianz appears.
2. **Analytics → Dílna** (`src/components/DilnaDashboard.tsx:257`) — `isRowDone(r)` returns `true` whenever `!!r.completed_at`. Same midflight rows have a non-null `completed_at`, so they're filtered out → same symptom.

The "iné projekty/bundles" the user sees are unrelated T-1 rows that happen to NOT have midflight flag (legacy schedule rows that should arguably be cleaned up, but that's a separate cleanup).

## Required semantic fix

`is_midflight = true` + `status = "scheduled"` + `expediced_at = NULL` means **"pending work carried over from the legacy/Excel era — still needs to be produced"**. It is the canonical spillover signal. It MUST count as "still active / přelité", not as "done".

The only thing that should mean "done" for spillover purposes:
- `status IN ("completed","expedice","cancelled")`, OR
- a row exists in `production_expedice` for this `schedule_id`.

`completed_at` alone is **not reliable** — midflight reset wrote `2026-04-20 00:46` into many rows that are still scheduled. We must stop treating it as a "done" indicator.

## Fix — two files

### 1. `src/pages/Vyroba.tsx` — `isItemDone` (line 515)
Change:
```ts
const isItemDone = (item) => {
  if (item.is_midflight) return true;                       // ❌ remove this
  return item.status === "completed" || item.status === "expedice" || expedicedScheduleIds.has(item.id);
};
```
to:
```ts
const isItemDone = (item) => {
  return item.status === "completed" || item.status === "expedice" || expedicedScheduleIds.has(item.id);
};
```
Also remove the equivalent `is_midflight` short-circuits in the two `isItemDoneLocal` callbacks (lines 3510, 4064) — search for `if (item.is_midflight) return true;` and delete those three occurrences.

Similarly in the inline `itemDone` helper used by the slide-projects spillover loop (around line 220–221) — verify it does NOT short-circuit on `is_midflight`. If it does, remove that branch.

### 2. `src/components/DilnaDashboard.tsx` — `isRowDone` (line 257)
Change:
```ts
const isRowDone = (r) =>
  r.status === "completed" || !!r.expediced_at || !!r.completed_at;   // ❌ completed_at is unreliable
```
to:
```ts
const isRowDone = (r) =>
  r.status === "completed" || r.status === "expedice" || !!r.expediced_at;
```
Drop `completed_at` from the SELECT for the prev-week query (lines 129, 135) — no longer needed for this check (keep it on the current-week query if other code uses it; quick grep shows it isn't critical to spillover).

### 3. T-1 query: include midflight rows that still have `status="scheduled"`
The current prev-week query (line 137) already uses `.in("status", ["scheduled","in_progress","paused"])` — that's correct and already includes the midflight rows since their status is `scheduled`. **No query change needed once `isRowDone` stops false-positiving on `completed_at`.**

### 4. Visual verification after the fix
With the prev-week being `2026-04-13`:

**Modul Výroba (T = `2026-04-20`):**
- Sidebar "Přelité" section should show: **Allianz – 5.patro**, **Insia**, **Příluky Valovi Dům**, plus any other projects with active T-1 rows.

**Analytics → Dílna (week `2026-04-20`):**
- These same projects should appear with the amber "Přelité z T16" badge on the card header (and amber chip on bundle rows).
- Already-current-week projects (Allianz 5.p has T row too) should show their T bundle PLUS the spilled bundle row from T-1 (different `split_part` so they're distinct keys).

I will run a screenshot pass on `/vyroba` and `/analytics` (Dílna tab, week navigated to `2026-04-20`) and confirm the three target projects appear in both modules' přelité sections.

## Risk / scope
- Removing `is_midflight` from `isItemDone` will also affect: completion detection in completion dialogs, weekly goal calculation (line 942), status-progression logic (line 1076). I need to grep all call sites of `isItemDone` / `isItemDoneLocal` and confirm none of them relied on midflight rows being treated as "completed". If any does (e.g., weeklyGoal denominator), I'll handle it explicitly — most likely the correct fix everywhere is "midflight = pending", and any place that wants to exclude midflight from a "to-do count" should check `is_midflight` directly.
- Removing `completed_at` from `isRowDone` is safe — `completed_at` is only reliable when paired with `status="completed"`, and that's already covered.
- No DB migration. No schema change. No data backfill.

## Files affected
- `src/pages/Vyroba.tsx` (3 small edits: remove midflight short-circuit from `isItemDone` and 2x `isItemDoneLocal`; verify inline `itemDone`)
- `src/components/DilnaDashboard.tsx` (1 edit: rewrite `isRowDone`)

I'll also do a `rg "is_midflight" src/` sweep before committing to confirm no other place in production code falsely equates midflight with "done".
