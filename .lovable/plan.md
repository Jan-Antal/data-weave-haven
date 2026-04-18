

## Plán: Doladenie utilizácie + breakdown s time range

### 1) Breakdown rešpektuje `timeRange`
V novom `AnalyticsBreakdownRow.tsx` query kľúč rozšíriť o `timeRange`. Filter `production_hours_log.datum_sync >= rangeStart` (rovnaká logika ako v tabuľke). Pre `timeRange = "all"` bez filtra.

### 2) Utilizácia — oddeliť od `timeRange` filtra projektov

**Problém:** `timeRange` filter v Analytics filtruje **projekty** podľa ich poslednej aktivity (overlap intervalu). Utilizácia je ale **agregát všetkých výrobných hodín za obdobie**, nezávisle na tom, ktoré projekty „spadnú" do filtra.

**Riešenie:** Utilizácia má vlastný fixný časový rámec, **nezávislý od `timeRange` chip-ov**:

**KPI dlaždica „Utilizace výroby"** zobrazí 2 hodnoty:
- **Hlavná hodnota: Posledných 30 dní** — `productionProjectHours_30d / (productionProjectHours_30d + productionRezieHours_30d) * 100`
- **Sub-text: Medián za posledné 3 mesiace** (rolling 90 dní rozdelený na 3× 30-dňové okná, vziať medián týchto 3 percent) — slúži ako trend baseline
- **Trend indikátor:** šípka ↑/↓/→ porovnanie 30d vs medián 3m
  - 30d > medián +2pp → ↑ zelená („utilizace stúpa")
  - 30d < medián −2pp → ↓ amber („utilizace klesá")
  - inak → → neutrálne

**Príklad zobrazenia:**
```text
Utilizace výroby
   82 %        ↑
30 dní · medián 3m: 79 % · cíl ≥ 83 %
```

### 3) Výpočet v `useAnalytics.ts`

V `queryFn` po načítaní `production_hours_log`:
- Spočítať `now = new Date()`
- Tri okná:
  - `window30d` = posledných 30 dní
  - `window60to30d` = 60–30 dní pred dneškom
  - `window90to60d` = 90–60 dní pred dneškom
- Pre každé okno spočítať `(prodProjectHours, prodRezieHours)` len z výrobných ľudí (existujúca `isProductionStaff` logika)
- `pct(window) = prodProjectHours / (prodProjectHours + prodRezieHours) * 100`
- `utilization30d = pct(window30d)`
- `utilizationMedian3m = median([pct(window30d), pct(window60to30d), pct(window90to60d)])`
- Pridať do `summary`: `utilization30d`, `utilizationMedian3m`, `utilizationTrend: "up" | "down" | "flat"`
- Ponechať existujúce `productionRezieHours` / `productionProjectHours` (lifetime) pre tooltip rozpis

### 4) Tooltip rozšíriť
- „Posledných 30 dní: X h projekty / Y h režie"
- „Medián 3 mesiacov: Z %"
- „Trend: stúpa / klesá / stabilný"
- Rozpis per overhead kód (lifetime, ako doteraz)

### 5) Súbory
**Upravené:**
- `src/hooks/useAnalytics.ts` — pridať okenné výpočty + median + trend do summary
- `src/pages/Analytics.tsx` — `UtilizationCard` zobrazí 30d hodnotu + sub-text s mediánom + trend šípku
- `src/components/AnalyticsBreakdownRow.tsx` — pridať `timeRange` do query key + filter

