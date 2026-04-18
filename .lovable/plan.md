

## Plán: Doladiť Režie view + expandable breakdown

### 1) Skryť irelevantné stĺpce pre režijné riadky
V `AnalyticsTableRow` (`Analytics.tsx`) keď `r.category === "rezie"`, zobraziť `—` (zošedlo) namiesto obsahu pre:
- **PM** — vždy `—`
- **Status** — vždy `—` (žiadny StatusBadge)
- **Balík** — vždy `—` (žiadny "Výroba" badge — režie nie sú "vo výrobe")
- **Preset** — vždy `—` (odstrániť "Režie" tag — je to redundantné, kategória je jasná z kontextu)
- **Plán h** — vždy `—`
- **% čerpání** — vždy `—`
- **Zostatok h** — vždy `—`

Zostávajú zmysluplné: ID, Název, Odprac. h, Tracking + nový chevron.

### 2) Expandable breakdown pre VŠETKY riadky (projekty + režie + unmatched)

**State v `Analytics`**:
```ts
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
const toggleExpand = (id: string) => setExpandedRows(prev => { ... });
```

**UI v `AnalyticsTableRow`**:
- Pridať chevron tlačidlo (`ChevronRight`/`ChevronDown` z lucide) **vľavo od ID** v prvej bunke (`project_id`). Klik prepína expand stav.
- Po hlavnom `<TableRow>` podmienečne renderovať `<AnalyticsBreakdownRow projectId={r.project_id} colSpan={visibleCols.length + 1} timeRange={timeRange} />` (už hotový komponent — rešpektuje `timeRange`).

Aby sub-riadok mohol byť `Fragment` susedom, prepíšem mapping v rodičovi:
```tsx
{rows.map((r) => (
  <Fragment key={r.project_id}>
    <AnalyticsTableRow row={r} expanded={expandedRows.has(r.project_id)} onToggleExpand={toggleExpand} ... />
    {expandedRows.has(r.project_id) && (
      <AnalyticsBreakdownRow projectId={r.project_id} colSpan={visibleCols.length + 1} timeRange={timeRange} />
    )}
  </Fragment>
))}
```

### 3) Summary karty pri filtri "Režije"
Keď `statusFilters.has("rezie") && statusFilters.size === 1`:
- Karta **Plán hodin** → zobraziť `—` (režie nemajú plán)
- Karta **Průměrné čerpání** → zobraziť `—`
- **Projekty** → premenovať label na "Režijní položky"
- **Odpracováno** → ostáva (sumarizuje vybrané)
- **Utilizace výroby** → ostáva (vždy globálna)

### 4) Overiť utilizáciu vizuálne
Po build-e otvoriť `/analytics` cez browser screenshot a skontrolovať že KPI dlaždica "Utilizace výroby" zobrazuje hodnotu (~88 %) a nie "—". Dáta v DB sú v poriadku (~2880 h projekty + ~390 h režie za 30d od pracovníkov Dílna_1/2). Ak by stále chýbala, doplniť `console.log` v `useAnalytics` pre debug.

### Súbory
**Upravené:**
- `src/pages/Analytics.tsx`:
  - `AnalyticsTableRow` — pridať `expanded`/`onToggleExpand` props, chevron v ID bunke, conditional rendering pre `category === "rezie"`
  - Rodičovský mapping — `Fragment` + `AnalyticsBreakdownRow` po expand
  - Summary cards — conditional `—` keď filter rezie
  - Import `Fragment`, `ChevronRight`, `ChevronDown`, `AnalyticsBreakdownRow`

**Bez zmeny:**
- `src/components/AnalyticsBreakdownRow.tsx` (už hotový, rešpektuje timeRange)
- `src/hooks/useAnalytics.ts` (windowed utilization OK)

