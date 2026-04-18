

## Diagnóza

### Kde sa zapisujú týždenné hodiny?
**Tabuľka `production_capacity`** — jeden riadok na (`week_year`, `week_number`). Stĺpce: `capacity_hours`, `working_days`, `holiday_name`, `company_holiday_name`, `is_manual_override`, `dilna1_hodiny`…`sklad_hodiny`, `total_employees`, `utilization_pct`.

V DB je to **správne** — overené:
- T1 = 717h (Nový rok), T14 = 717h (Velký pátek), T15 = 717h (Velikonoční pondělí), T18/T19 = 717h (1.5./8.5.) atď.
- Štandardný týždeň = 896h, sviatkový = 717h.

### Prečo graf vyzerá rovno?
Vykresľovanie funguje cez `liveWeekMap`, ktorá ide cez všetkých 52 týždňov a:
- ak `is_manual_override = true` → použije DB hodnotu,
- inak **prepočíta lokálne** z `selectedEmployees` × `working_days` × util%.

Lokálny výpočet **odpočítava sviatky správne** (`workingDays = 5 - holidayCount`), ALE výsledok pre 30 zamestnancov × 8h × (4 vs 5) dní × 83% dáva **rozdiel ~199h** (896 vs 717). Na 140px-vysokom grafe to je rozdiel ~22px → mal by byť viditeľný.

Na screenshote sú **všetky stĺpce identické** (vrátane T1, T14, T15) → znamená to, že buď:
1. **`autoApplyHolidays` je vypnuté** v lokálnom UI state (toggle „Automaticky aplikovat svátky") → potom sa pre všetky týždne použije `workingDays = 5` a graf zploští,
2. alebo `holidays` query (`useCzechHolidays(2026)`) ešte nedobehlo / cache vrátila prázdne pole.

Tooltip v screenshote ukazuje „Velký pátek" — to znamená, že `holiday_name` je v `liveWeekMap` (lebo sa preberá z `dbWeek?.holiday_name`), ale **`workingDays` sa neredukuje** → potvrdená hypotéza č. 1: `autoApplyHolidays = false`.

## Plán opravy

### 1) Default `autoApplyHolidays = true` + sync z DB
V `CapacitySettings.tsx` skontrolovať `useState(autoApplyHolidays)` — uistiť sa, že defaultná hodnota je `true` a nie je niekde resetovaná pri prepnutí roku.

### 2) Fallback: ak je `autoApplyHolidays = false`, použiť DB hodnotu
Aktuálne keď je toggle vypnutý, `liveWeekMap` aj tak prepočíta a ignoruje `dbWeek.capacity_hours`. Lepšie: ak `autoApplyHolidays = false` a existuje `dbWeek` (auto-recalc už uložil správne hodnoty so sviatkami), **použiť DB hodnotu** namiesto lokálneho prepočtu bez sviatkov. To zaručí, že graf vždy odzrkadľuje DB realitu.

### 3) Vizuálny kontrast
Pri standard 896h vs sviatok 717h je rozdiel len ~20% výšky stĺpca a farby (`BELOW_STOPS` interpolácia od standard k min) sú veľmi blízke šedej, lebo `visibleRange.min` ≈ 717 a `standard` ≈ 896. Pridáme:
- **dolný padding pre `visibleRange.min`** — odpočítať ďalších ~15% z `visMin`, aby sviatkové týždne boli zreteľne oranžovo/jantárové, nie šedé.

### Súbory
- `src/components/production/CapacitySettings.tsx` — fix default + fallback v `liveWeekMap` + úprava `visibleRange.min` pre lepší kontrast.

### Bez zmeny
DB schéma, migrácie, dáta, ostatná logika.

