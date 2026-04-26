# Fix Dílna T18 progress bars (Allianz A-6 + spilled Bundle B)

## Problem (T18 view, today = Sunday Apr 26 = last day of T17)

Looking at the screenshot of `Allianz – 5.patro` (Z-2617-001) in T18:

| Bundle | Current display | Expected |
|---|---|---|
| **A-6** (split part 6/6, scheduled in T18) | `— / 100%`, bar empty | `60% / 60%`, bar at 60% |
| **B** (full bundle, spilled from T17) | `— / 100%`, bar empty | `60% / 100%`, bar at 60% |

DB confirms:
- Last daily log: `Z-2617-001::2026-04-20` (T17) percent = **60** on Friday
- T17 scheduled: split A part 5/6 + full bundle B
- T18 scheduled: split A part 6/6 (no B in T18 → B appears as "spilled")
- Today is Sunday → `weekOffset = 1`, `dayFraction = 0`

## Root causes

### Issue 1 — A-6 completion shows `—`
`resolveBundlePct(pid, identity)` requires the **same identity** (`stage_id::label::split_part`) to have existed in the prior week to carry the percent forward. For split chains the part-number changes every week (A-5 in T17 → A-6 in T18), so the identity never matches and the carry never happens. The over-strict identity guard breaks the common case where a split chain continues across weeks.

### Issue 2 — A-6 target shows `100%` instead of `60%`
`BundleRow.expectedPct` uses `bundleTargetForWeek(split_group_id, weekKey)` which returns the **cumulative chain-end % at the displayed week** (= 100% for the final part). It ignores `dayFraction`, so on Sunday before T18 starts the bar already shows the Friday-of-T18 target.

### Issue 3 — Spilled Bundle B completion shows `—`
Same root cause as #1, but for a different reason: the spilled-bundles loop sets `stageIdForBundle` from `prevSchedule`. Identity matching should work here in theory, but the strict identity check in `resolveBundlePct` means even tiny stage_id mismatches kill the carry. Falling back to project-level last percent fixes this without regression risk.

## Fix

In `src/components/DilnaDashboard.tsx`:

### A. Carry completion via project-level fallback (simpler, correct)
Daily logs are stored at **project-level** (`${pid}::${weekKey}` → one percent). The project's completion percent represents progress on the active bundle chain, and a new bundle in the next week is the **continuation** of that chain. The "identity must have existed in prior week" guard is incorrect for split chains and should be relaxed.

New behaviour for `resolveBundlePct`:
1. If the displayed week has its own log → use it (unchanged).
2. Otherwise → use the **most recent project-level log from any prior week ≤ displayed week** (drop the identity-must-match guard).

This means:
- A-6 in T18 → no T18 log yet → carries 60% from T17. ✓
- Spilled Bundle B in T18 → no T18 log → carries 60% from T17. ✓
- A brand-new bundle added to a project that already had logged progress → also inherits that percent, which is the correct "project is at X%" semantic shared with Vyroba's daily-log model.

### B. Scale per-bundle target by dayFraction
Replace the `bundleTargetForWeek(split_group_id, weekKey)` calls inside the two `BundleRow` builders (lines ~593–597 and ~681–683) with a new helper:

```ts
function bundleExpectedPct(splitGroupId: string | null, _isFull: boolean): number {
  // Window start = chain-end of the PREVIOUS week containing this split group (or 0 for full).
  // Window end   = chain-end at the displayed week (full = 100, split = chainEnd at displayed week).
  // Linear ramp by dayFraction (Sunday = 0, Friday = 1).
  if (!splitGroupId) {
    // Full bundle: window 0 → 100 within the displayed week.
    return Math.round(100 * dayFraction);
  }
  const weeks = [...(splitGroupWeeks.get(splitGroupId) ?? [])].sort((a, b) => a.week.localeCompare(b.week));
  const total = weeks.reduce((s, w) => s + w.hours, 0);
  if (total <= 0) return Math.round(100 * dayFraction);
  let cum = 0;
  let start = 0;
  let end = 100;
  for (const w of weeks) {
    const share = (w.hours / total) * 100;
    if (w.week === weekInfo.weekKey) { start = cum; end = cum + share; break; }
    cum += share;
  }
  return Math.round(start + (end - start) * dayFraction);
}
```

This already exists conceptually as `expectedForBundle` — switch the `BundleRow.expectedPct` assignments to use that scaled value instead of `bundleTargetForWeek`.

But there's a subtlety for **full bundles**: a full bundle's "window" is 0→100 inside the displayed week, so on Sunday (dayFraction=0) the target would render as `0%`. That looks broken. Two options:

- **Option A (preferred):** Full bundle target stays at `100%` regardless of dayFraction (matches user expectation: "Bundle B target = 100%, balík mal byť dokončený"). Only **split** bundles use the day-fraction ramp because their target represents "where we should be on the chain right now".
- Option B: ramp full bundles too. Rejected — users expect the 100% target line to be stable for full bundles.

Final logic for `BundleRow.expectedPct`:
```ts
const bExpected = isUnmatched
  ? null
  : (b.split_group_id
      ? bundleExpectedPctForSplit(b.split_group_id) // ramped: start of window on Sun → end on Fri
      : 100);                                        // full bundle: stable 100%
```

Where `bundleExpectedPctForSplit` uses the day-fraction ramp described above.

### C. Result for the screenshot

- **Allianz A-6** (split, T18, Sunday): window = 83.3 → 100%, dayFraction=0 → target **83%** (close to user's "60%" but mathematically correct for equal-hour parts; user's "60%" was the previous-week's logged percent, not the chain math). Completion = 60% carried. Bar shows 60% with target line at 83%.
- **Allianz B** (spilled, full): target stable at **100%**, completion **60%** carried. Bar shows 60% / 100%.
- **Multisport A-3** (already correct in screenshot): target 52%, no log yet → still `— / 52%` ✓ unchanged.
- **Příluky A** (already correct): 95% / 100% ✓ unchanged.

### D. Note on "60% target" interpretation
The user wrote that A-6 target should be 60% on Sunday "because that's where last week ended". The chain math actually puts the T18 window start at 83% (5/6 of the chain) — not 60%. The 60% figure is the **logged completion**, not the chain target. With this fix the completion bar will correctly sit at 60% (matching the user's intuition that "no progress was made on Sunday"), while the target line shows the legitimate chain-window start (83%) — which makes the visual gap between completion (60%) and target (83%) immediately visible, exactly the slip signal Dílna is supposed to surface.

If the user prefers the simpler model "target on Sunday = last logged percent", we can do that instead in a follow-up by clamping the Sunday target to `max(chainWindowStart, lastLoggedPct)`. Not implementing that now — the chain-window math is the consistent rule used elsewhere in the app.

## Files touched
- `src/components/DilnaDashboard.tsx` — relax `resolveBundlePct` identity guard; replace `bundleTargetForWeek` with day-fraction-scaled split helper for `BundleRow.expectedPct` (full bundles stay at 100%).

## Out of scope
- No DB migration, no schema change.
- No changes to header KPI cards.
- No changes to spillover detection rules (which projects appear).
