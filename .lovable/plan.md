

## Plan: Vykaz hours-per-period chart + toolbar repositioning

### 1. New chart "Hodiny v čase" (visual import sanity check)

Add a chart card directly under the **Vykaz** tab heading (above the toolbar/summary cards). Uses existing `recharts` (already used in `DashboardStats.tsx`).

**Auto-bucketing logic** (computed via `useMemo` from `logs` + `from`/`to`):
- Span ≤ **31 days** → bucket = **day** (label: `15.4.`)
- Span > **31 days** → bucket = **week** (label: `T16` — ISO week, monday-anchored, using existing `toLocalDateStr` helper)

Each bucket sums `hodiny` across all logs in range. Empty buckets are filled with 0 so gaps are visible (a missing day jumps out as a hole = clear import-failure signal).

**Visual:**
- BarChart, height `h-[180px]`, full-width inside a `Card` (white bg, border, shadow-sm, rounded-lg, p-4)
- Title row: left = `"Hodiny v čase"` (text-sm font-semibold) + small muted subtitle showing bucket mode (`"per den"` / `"per týden"`); right = mini segmented toggle **Auto | Den | Týden** (default "Auto", lets user override). Same segmented style as existing groupBy control.
- Bars: brand primary color (`hsl(var(--primary))`), rounded top corners, hover tooltip showing bucket label + `formatHours(value)`
- X-axis: 11px muted ticks, no gridlines on X
- Y-axis: 11px muted ticks, light dashed gridlines (`strokeDasharray="3 3"`, `stroke-border/40`)
- Empty state (no logs): show muted centered text `"Žádné záznamy v období"`

**State:**
- Add `bucketMode: "auto" | "day" | "week"` (default `"auto"`)
- Memo `chartData: { label: string; hodiny: number }[]` — resolves effective bucket from mode + span

### 2. Layout reorder

Current order: Summary cards → Toolbar → Table  
New order:
1. **Toolbar** (date range + groupBy segmented + search + export) — moved to **top**, immediately under tab header
2. **Chart "Hodiny v čase"**
3. **Summary cards** (4 stat cards)
4. **Table**

This gives the user filters first (control), then visual (chart), then numbers (cards), then detail (table) — top-down information hierarchy.

The toolbar keeps its current visual styling (border-b, h-12-ish, bg-card, px-4 py-2). Summary-cards section padding adjusts (`pt-2` instead of `pt-4`) since they're no longer the topmost element.

### 3. Files touched

- `src/components/analytics/VykazReport.tsx` only
  - Add imports: `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer` from `recharts`
  - Add `bucketMode` state
  - Add `chartData` + `effectiveBucket` memos (ISO-week helper inline)
  - Reorder JSX: Toolbar → Chart card → Summary cards → Table
  - No changes to data fetching, grouping, filtering, export, RLS

### Out of scope
- No DB / RLS changes
- No changes to summary stats math, table rendering, expand/collapse, or CSV export
- No new dependencies

