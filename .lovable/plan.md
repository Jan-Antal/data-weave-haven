
## Plan: Výkaz tab (Toggl-style report) in Analytics

### 1. New tab in `PageTabsShell`
Add `{ key: "vykaz", label: "Výkaz" }` to `tabs` array in `Analytics.tsx`. Render `<VykazReport />` when `activeTab === "vykaz"`. Hide existing toolbar/summary cards/table for that mode (mirror `dilnaMode` pattern).

### 2. New component `src/components/analytics/VykazReport.tsx`
Self-contained — fetches its own data, owns its toolbar.

**State:**
- `dateRange: "week" | "month" | "3months" | "custom"` (default `month`)
- `customFrom`, `customTo` (used when `custom`)
- `groupBy: "projekt" | "osoba" | "cinnost"` (default `projekt`)
- `search: string`
- `expanded: Set<string>` (group keys)

**Data fetch (React Query):**
- Query key: `["vykaz-log", from, to]`
- Single `supabase.from("production_hours_log").select("ami_project_id,zamestnanec,cinnost_kod,cinnost_nazov,hodiny,datum_sync").gte("datum_sync", from).lte("datum_sync", to).range(0, 99999)`
- Side fetch (cached): `supabase.from("projects").select("project_id, project_name").is("deleted_at", null)` to resolve matched/unmatched + names.
- Filter out `cinnost_kod ∈ {TPV, ENG, PRO}` (consistent with rest of analytics — note in memory).

**Aggregation in `useMemo`:** build three group structures keyed by `projekt | osoba | cinnost`, each with totals + nested sub-rows. For "projekt" group, attach `matched: boolean` from projects map.

### 3. Toolbar layout (top of Výkaz panel, same `border-b bg-card px-4 py-2` pattern)

```text
[Range select]  [From][To if custom]   [Projekt|Osoba|Činnosť toggle]   [search]      [Export CSV]
```

- Range: `Select` with the four options.
- Custom: two `<input type="date">` shown only when `custom`.
- Group toggle: 3-button pill group (same pattern as existing chips).
- Search: `TableSearchBar`.
- Export CSV: builds CSV from currently filtered+grouped rows (no download lib — use `Blob` + anchor click). Filename: `vykaz_{from}_{to}_{groupBy}.csv`.

### 4. Table (Projekt view, default)

Columns: `Projekt` | `Stav` (chip) | `Hodiny` | `Záznamů` | `Posledný záznam` | `›`

- Matched rows: project name (clickable → `setDetailProjectId`), green "Spárováno" badge.
- Unmatched rows: rendered after a separator row `Nespárované záznamy z Alvena · X projektů` with `bg-amber-500/10` header. Each unmatched row has `border-l-[3px] border-amber-500` and `text-muted-foreground`.
- Click row → toggle expand. Expanded panel = sub-table grouped by `zamestnanec` with chips listing distinct `cinnost_nazov` values, total hours, date range. Use the same `bg-muted/30` indent pattern as `AnalyticsBreakdownRow`.

### 5. Osoba view
Columns: `Jméno` | `Počet projektů` | `Hodiny celkem` | `›`. Expanded: per-project hours sub-rows.

### 6. Činnosť view
Columns: `Název činnosti` | `Kód` | `Hodiny` | `›`. Expanded: per-project hours sub-rows.

### 7. Footer row
Bold `tfoot` row showing sum of all currently visible hours.

### 8. Visual style
Reuse `Table/TableHeader/TableRow/TableCell` from `@/components/ui/table` and `Badge`/`Card` tokens — matches existing Projekty tab. No new dependencies.

### 9. Files touched
- `src/pages/Analytics.tsx` — add tab key, add `vykazMode` branch that renders `<VykazReport />` and hides existing toolbar/table.
- `src/components/analytics/VykazReport.tsx` — **new**, full component.

### 10. Out of scope
- No DB schema changes; `production_hours_log` already provides everything needed.
- No edits to existing Projekty / Režije / Dílna tabs.
- CSV export is client-side only (no edge function).
