## Zistenie

Porovnaním reportu s UI **Reporta Dílna** (`DilnaDashboard.tsx`) som našiel dva rozdiely:

### 1. Plán bez logu v reporte navyše
Náš report momentálne vracia **každý balík plánovaný na tento týždeň**, aj ak na ňom nikto nepracoval ani nelogoval (AEC Byt Enenkel, Byt Klamovka, Byt Osadní, Chata Modra, Doplnky Řezníček, Prvky Giraffe, PTS Pícha, RD Cigánkovi, Scott Webber, Štepánska, Vodafone).

UI ich síce v dátach má, ale stojí ich karty na konci so `slipStatus = "none"` — užívateľ ich na screenshote nevidí. Pre **výrobný report** chceme len projekty s **reálnou aktivitou**:
- má log v `production_daily_logs` v aktuálnom týždni (akýkoľvek deň), **alebo**
- má vykázané hodiny v `production_hours_log` (Alveno) v aktuálnom týždni, **alebo**
- je spillover (nedokončené z minulého týždňa), **alebo**
- je unplanned (log mimo plánu).

### 2. Příluky Valovi Dům chýba
Příluky má **včerajší** log (27.04, pondelok, 95 % Kompletace) — UI ho zobrazuje ako "posledný známy stav". Náš report ho však spracúva len ako **plánovaný spillover bez log riadku**, lebo filter `raw_logs` berie iba logy s `(week_key + day_index) == report_date`.

Pre dennú zmenu robotníkov chceme vidieť **najnovší log v rámci týždňa** pre baliky, ktoré dnes ešte nemajú záznam, aby vedúci dílny videl posledný stav (tak ako v UI).

## Plán

Migrácia ktorá v `public.get_daily_report(date)`:

1. **Pridá CTE `week_alveno_hours`** — projekty s vykázanými hodinami z `production_hours_log` v aktuálnom týždni (mimo TPV/ENG/PRO kódov, mimo overhead projektov).

2. **Pridá CTE `week_dlog_projects`** — projekty s logom v `production_daily_logs` v aktuálnom týždni.

3. **Filter v `bundles_in_week` (len pre `is_spillover=false` a `is_unplanned=false`)**: ponechá riadok len ak projekt patrí aspoň do jedného z:
   - `week_alveno_hours`
   - `week_dlog_projects`

   Spillover a unplanned ostávajú vždy.

4. **Rozšíri `raw_logs`** o tzv. fallback log: pre projekty z aktuálneho týždňa, ktoré nemajú log presne pre `report_date`, vytiahne **najnovší log v týždni** (max `logged_at`). Tento riadok sa pridá ako `row_kind = 'log'` a `log_day_date` bude skutočný deň záznamu (nie report_date), aby sa to zobrazilo ako "posledný známy stav".

   Takto sa Příluky vráti so 95 % zo včera.

## Validácia po nasadení

`SELECT … FROM get_daily_report('2026-04-28')` má obsahovať práve týchto 9 projektov (bez tých 11 prázdnych plánov):

- Allianz - 5.patro (A-6, B, D-1)
- Příluky Valovi Dům (A) — log 95 % zo včera, plus spillover info
- Insia (A-4, B)
- Reklamace Bar terasa (A) — unplanned
- RD Skalice (A-3)
- Multisport (A-3)
- Allianz - 6.patro — ak má hodiny v ALVENO tento týždeň
- RD Cigánkovi Zlín — ak má hodiny v ALVENO tento týždeň
- Gradus Kampa — ak má hodiny v ALVENO tento týždeň

## Súbory

- Nová migrácia `supabase/migrations/<timestamp>_report_filter_active_projects.sql` — `CREATE OR REPLACE FUNCTION public.get_daily_report` s vyššie popísanými zmenami. Štruktúra návratovej tabuľky sa nemení, takže nie je potrebné `DROP FUNCTION`.

Pošli `ok` a nasadím.
