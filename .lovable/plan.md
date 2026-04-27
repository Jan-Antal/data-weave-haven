## Problém
Pre full bundle (napr. Reklamace Bar terasa Z-2604-003, etapa A) sa goal % nehýbe — drží 100% celý týždeň. Tento týždeň (27.4.–1.5.) má len 4 pracovné dni (1.5. = Svátek práce). Pondelok prešiel, takže by goal mal byť **25%** (1/4), nie 100%.

Príčiny:
1. **`DilnaDashboard.tsx`**: full bundles vracajú fixne 100% (`bundleExpectedPctScaled` a `expectedForBundle` skipujú ramping pre non-split bundles).
2. **`DilnaDashboard.tsx`**: `dayFraction = workdayIdx / 5` — fixné delenie 5, ignoruje `working_days` z `production_capacity`.
3. **SQL `get_daily_report`**: tiež delí fixne `(day_idx + 1) / 5` a používa `LEAST(ISODOW - 1, 4)` — nepozná sviatky.

## Riešenie

### 1. `src/components/DilnaDashboard.tsx`
- Načítať `working_days` z už-fetchnutého `capacityRes` (default 5, clamp 1–5).
- Prepočítať `dayFraction` na **`completedWorkdays / weekWorkingDays`**:
  - Ak je dnes pracovný deň → `dayFraction = (workdayIdx - 1) / weekWorkingDays` (deň ešte beží = "počas dňa už ráta", ako si schválil).
  - Cez víkend / po skončení skráteného týždňa → 1.
  - Past week → 1, future week → 0.
- **Ramp aj pre full bundles** (okrem prelitých zo spillu):
  - `bundleExpectedPctScaled(splitGroupId, isSpilled)`: ak `isSpilled === true` (bundle prišiel z T-1) → drží 100%. Inak full → ramp `0 → 100` podľa `dayFraction`. Split → existujúci chain-window ramp.
  - Update všetkých 3 call sites (riadky 681, 770, `expectedForBundle`).

### 2. `supabase/migrations/*` — update SQL funkcie `get_daily_report`
- Pridať CTE `week_capacity` ktorá vyberie `working_days` z `production_capacity` pre `current_week_monday` (default 5).
- Prepočítať `day_idx`:
  - Skipovať dni mimo `working_days` (napr. v skrátenom týždni s 1.5.=sviatok piatok = 1, ráta sa Po=0..Št=3).
  - Definovať `completed_workdays` ako počet pracovných dní pred dnešným dátumom v aktuálnom týždni.
- Goal vzorec: `chain_prior_hours + this_week_hours * completed_workdays / week_working_days`.
- Pre full bundles (non-split) nepridávať special case v SQL — funkcia už počíta `chain_total_hours = this_week_hours` pre full bundle, takže ramp 0→100 príde automaticky. Spillover handling pre full bundles necháme len v UI (SQL nemá info o spille).

## Test
1. Reklamace Bar terasa (Z-2604-003) etapa A v utorok 28.4. → očakávaný goal **25%** (1 dokončený deň / 4 pracovné dni).
2. Allianz A-6 (split) → 68% (chain-window slice ramp ostáva korektný).
3. Allianz B (spilled full bundle) → 100% (špeciálny prípad v UI).
4. Edge funkcia `daily-report?date=2026-04-28` vráti pre Z-2604-003 etapu A `weekly_goal_pct = 25`.

## Súbory
- `src/components/DilnaDashboard.tsx` — ramp full bundles, `weekWorkingDays`-aware dayFraction, signature update.
- `supabase/migrations/<new>_get_daily_report_working_days.sql` — `CREATE OR REPLACE FUNCTION public.get_daily_report` s rešpektovaním `production_capacity.working_days`.