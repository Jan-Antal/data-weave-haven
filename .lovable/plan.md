
## Plán: Sjednotenie "Vlastní" výberu + šípky pre posun obdobia

### A. Vlastní výber datumu — unifikovaný kalendár (nahradiť natívne `<input type="date">`)

V `src/components/analytics/VykazReport.tsx`:

- Odstrániť dvojicu `<Input type="date">` pre `customFrom`/`customTo`.
- Pridať jeden **Popover trigger button** (`variant="outline" size="sm" h-8 text-xs`) s `CalendarIcon`:
  - Label: ak `customFrom && customTo` → `"5. 3. 2026 – 12. 4. 2026"` (cez `formatAppDate`), inak `"Vyberte rozsah"`.
  - Klik na trigger automaticky `setDateRange("custom")` a otvorí popover.
- **PopoverContent** (`w-auto p-0 z-[99999]`, `align="start"`):
  - `Calendar` z `@/components/ui/calendar` v `mode="range"`, `numberOfMonths={2}`, `weekStartsOn={1}`, `defaultMonth={parseAppDate(customFrom) || new Date()}`, `className="p-3 pointer-events-auto"`.
  - `selected={{ from: parseAppDate(customFrom), to: parseAppDate(customTo) }}`.
  - `onSelect={(range) => { setCustomFrom(range?.from ? toLocalDateStr(range.from) : ""); setCustomTo(range?.to ? toLocalDateStr(range.to) : ""); setRangeOffset(0); }}`.
  - Footer: `"Smazat"` (Trash2) — vyčistí from/to.
- Vizuálne identické s `PlanDateEditDialog` / `StageDateEditDialog`.

### B. Šípky pre posun o jednu periodu (◀ ▶)

- Nový state: `const [rangeOffset, setRangeOffset] = useState(0)` — počet posunov v jednotkách aktuálnej periody.
- Reset `rangeOffset` na 0 pri zmene `dateRange` (cez wrapper setter alebo `useEffect`).
- Rozšíriť `getRangeBounds(range, customFrom, customTo, offset)`:
  - `week` → posun o `offset * 7` dní (lokálne `Date`, žiadne `toISOString`).
  - `month` → posun o `offset` mesiacov (`setMonth`).
  - `3months` → posun o `offset * 3` mesiace.
  - `custom` → posun oboch dátumov o `offset * spanDays` dní (kde `spanDays = (to - from) / 86400000 + 1`).
- V toolbare flankovať range select dvoma icon buttonmi:
  ```
  [◀] [Range select ▾] [▶]   [Custom calendar trigger]   …
  ```
  - `Button variant="ghost" size="sm" h-8 w-8` s `ChevronLeft` / `ChevronRight`.
  - `onClick={() => setRangeOffset(o => o ∓ 1)}`.
- Voliteľný kompaktný label `text-[11px] text-muted-foreground` zobrazujúci aktuálny rozsah `"d. M. – d. M. yyyy"` keď `rangeOffset !== 0` (orientačná pomôcka).

### Súbory
- `src/components/analytics/VykazReport.tsx` — jediný súbor.
- Importy navyše: `ChevronLeft`, `ChevronRight`, `CalendarIcon`, `Trash2` (lucide-react), `Calendar`, `Popover/PopoverContent/PopoverTrigger`, `parseAppDate`, `formatAppDate`.

### Bez zmien
- Žiadne zmeny v data fetchingu, summary, grafe, sekciách tabuľky (Projekty/Režije/Nespárované), CSV exporte, RLS ani v iných súboroch.
- Žiadne nové závislosti.
