
Visual-only refactor of `src/components/analytics/VykazReport.tsx`. No changes to data, filters, grouping, export, or expand logic.

### 1. Summary cards row (above toolbar)
Add 4 stat cards using existing Card style (white bg, border, shadow-sm, rounded-lg, p-4). Label `text-[11px] uppercase tracking-wide text-muted-foreground`, value `text-2xl font-bold`.
- Celkem hodin: `formatHours(totalHours)` from existing `totalHours`
- Aktívní pracovníci: `new Set(logs.map(l => l.zamestnanec)).size`
- Spárované projekty: distinct `ami_project_id` where `projectsMap.has(id)`
- Nespárováno: distinct `ami_project_id` where `!projectsMap.has(id)`; value text `#854F0B` when >0, `text-muted-foreground` when 0
All derived via `useMemo` from existing `logs` + `projectsMap`.

### 2. Toolbar redesign
Replace current toolbar with single row, three slots:
- **Left**: existing `Select` (h-8) for date range; when `"custom"`, two `<Input type="date" className="h-8 w-[140px]">` inline (no wrap, `flex items-center gap-2`)
- **Center**: segmented control — outer `div` bg `bg-muted` rounded-lg p-0.5, three buttons each `h-7 px-3 text-xs rounded-md`. Active: `bg-background shadow-sm font-medium text-foreground`. Inactive: `text-muted-foreground hover:text-foreground`. Wires to existing `groupBy` state.
- **Right**: existing search `Input` (h-8 w-[200px]) + Export CSV `Button` (h-8 variant outline, Download icon)

### 3. Table visual
- `<thead>`: `bg-muted/50 sticky top-0 z-10`, header cells `text-[11px] uppercase tracking-wide text-muted-foreground font-medium h-9 border-b`
- `<tbody>` rows: `h-10 text-[13px] hover:bg-muted/50 border-b border-border/40`
- Project ID cell: `font-mono text-primary hover:underline cursor-pointer`
- Spárované count badge: green pill `bg-green-100 text-green-800 text-[11px] px-2 py-0.5 rounded-full`
- For unmatched indicator inside ProjektRow when no match: amber pill `bg-amber-100 text-amber-800`

### 4. Expanded sub-rows
Update `ProjektExpanded`, `OsobaRows` (sub), `CinnostRows` (sub), `SubByProject`:
- Wrapping cell: `bg-muted/30 border-l-2 border-border pl-10 py-2`
- Person row: `flex items-center gap-3` — name `w-40 text-[13px]`, činnosti chips `flex-1 flex flex-wrap gap-1` each `bg-secondary text-secondary-foreground text-[11px] px-2 py-0.5 rounded`, hours `w-20 text-right font-medium text-[13px]`, date range `w-[130px] text-right text-[11px] text-muted-foreground`

### 5. Nespárované separator
Replace current unmatched section header with full-width `<tr>` containing single `<td colSpan={...}>`:
- `bg-[#FEF3C7] border-l-[3px] border-l-[#F59E0B] px-4 py-2`
- Inner `flex items-center gap-2`: `<AlertTriangle className="h-4 w-4 text-[#F59E0B]" />` + label `font-semibold text-[12px] text-[#92400E]`

### 6. Celkem footer
Sticky bottom row in tfoot or just below table:
- `<tfoot>` with `sticky bottom-0 bg-muted/50 border-t border-border`
- Cells: "Celkem" label `font-semibold text-[13px]`, total hours `font-bold text-[14px] text-[#0a2e28]`

### Files touched
- `src/components/analytics/VykazReport.tsx` — only this file. Add `AlertTriangle`, `Download` imports from lucide-react. Add memos for the 4 summary stats. Reuse `Card`, `Select`, `Input`, `Button` from existing UI.

### Out of scope
- No data/query/filter/group/export/expand logic changes
- No changes to `Analytics.tsx` or any other file
- No DB or RLS changes
