
## Plán: Spojený výber obdobia — preset + kalendár v jednom popoveri

### A. Jeden trigger (bunka) namiesto dvoch
V `src/components/analytics/VykazReport.tsx`:
- Odstrániť pôvodný `<Select>` aj samostatný "Vlastní" Popover.
- Jeden `Popover` trigger button (`variant="outline" size="sm" h-8 text-xs`) s `CalendarIcon` medzi šípkami ◀ ▶.
- **Label vždy zobrazuje konkrétny dátumový rozsah** spočítaný z `getRangeBounds(dateRange, customFrom, customTo, rangeOffset)`:
  - Format: `"5. 3. – 12. 4. 2026"` (cez `parseAppDate` + `formatAppDate`); ak rovnaký rok, rok len raz na konci.
  - Nikdy "Tento týden" — vždy reálne dátumy, aby sa po kliku ◀ ▶ label aktualizoval.

### B. Obsah popoveru (jedna plocha, žiadne taby)
- **Ľavá kolóna** (~180px) — preset list (vertikálne buttony, `variant="ghost"`, aktívny preset má `bg-accent`):
  - Tento týden (`week`)
  - Tento měsíc (`month`)
  - Minulý týden (`prev_week`) — **nový**
  - Minulý měsíc (`prev_month`) — **nový**
  - Posledné 3 měsíce (`3months`)
- **Pravá kolóna** — `Calendar` `mode="range"`, `numberOfMonths={2}`, `weekStartsOn={1}`:
  - `selected={{ from, to }}` — vždy odráža **aktuálne aktívny rozsah** (preset alebo custom). Klik na preset → vyznačí rozsah v kalendári.
  - `onSelect={(range) => { setDateRange("custom"); setCustomFrom(...); setCustomTo(...); setRangeOffset(0); }}` — akýkoľvek klik v kalendári automaticky prepne na custom.
- **Footer**: `Smazat` (Trash2, vyčistí custom + vráti na `week`) vľavo, `Hotovo` (zatvorí) vpravo.

### C. Rozšírenie typov a `getRangeBounds`
- `type DateRange = "week" | "month" | "prev_week" | "prev_month" | "3months" | "custom"`
- `getRangeBounds`:
  - `prev_week` → pondelok–nedeľa minulého týždňa, posun `offset * 7` dní
  - `prev_month` → 1.–posledný deň minulého mesiaca, posun `offset` mesiacov
- Šípky ◀ ▶ ostávajú; pre nové presety fungujú rovnako (posun o 1 jednotku periody).

### D. Synchronizácia šípok ↔ label
- Label triggeru je odvodený **z `currentBounds`** (memoizované `getRangeBounds(...)`), takže kliknutie ◀ ▶ ho automaticky prepíše.
- Kalendár vnútri popoveru tiež zobrazuje `selected={currentBounds}` → pri opätovnom otvorení vidno presne, čo je vybrané (vrátane offsetu).

### Súbor
- `src/components/analytics/VykazReport.tsx` — jediný súbor.

### Bez zmien
- `ui/calendar.tsx` ostáva bez úprav (vizuál range selekcie ladiť až keď user potvrdí).
- Žiadne zmeny v dátach, grafe, sekciách tabuľky, exporte, RLS.
