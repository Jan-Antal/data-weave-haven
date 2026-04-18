

## Plán: Rozšírené režijné kódy + utilizácia podľa výrobných ľudí

### 1) Doplniť 4 nové režijné projekty
INSERT do `overhead_projects`:
- `Z-2511-997` → "Režie - servis stroje"
- `Z-2511-995` → "Režie - školení"
- `Z-2511-996` → "Režie - čekání na zakázku"
- `Z-2511-993` → "Vzorky"

(spravia sa aj cez admin UI, ale seedneme rovno aby boli okamžite v Analytics)

### 2) Prepočítať utilizáciu — len výrobní ľudia

**Aktuálny problém:** `reziePct = totalRezieHours / (totalRezieHours + totalProjectHours)` zahŕňa hodiny *všetkých* zamestnancov (PM, ADMIN, Engineering, Kalkulace…). To skresľuje utilizáciu kapacity dílny.

**Nová logika v `useAnalytics.ts`:**
- Načítať `ami_employees` (id, meno, usek, aktivny, activated_at, deactivated_at)
- Vybudovať set výrobných mien — len kde `normalizeUsek(usek) !== null` (Dílna_1/2/3 + Sklad), `aktivny = true`, a v období logu `activated_at ≤ datum ≤ deactivated_at`
- Načítať `production_hours_log` priamo (nie cez agregátnu RPC) so stĺpcami `ami_project_id, hodiny, datum_sync, zamestnanec` — aby sme mohli filtrovať per-osoba
- Per riadok logu spočítať dvakrát:
  - **A) Pre tabuľku Analytics (zostáva ako doteraz):** všetky hodiny per projekt (RPC `get_hours_by_project` → existujúci `hoursMap`)
  - **B) Pre KPI utilizácie (nové):** iba hodiny od výrobných ľudí, agregované per projekt → `productionHoursMap`
- Z `productionHoursMap` spočítať:
  - `productionRezieHours` = súčet len z overhead kódov
  - `productionProjectHours` = súčet len zo známych projektov (kategoria `project`)
  - `reziePct = productionRezieHours / (productionRezieHours + productionProjectHours) * 100`

**Tabuľka projektov v Analytics zostáva nezmenená** — stĺpec "Odprac. h" naďalej ukazuje všetky hodiny (vrátane PM-ov, ktorí občas zapíšu na projekt). Mení sa len výpočet **KPI dlaždice "Režije %"**.

### 3) Tooltip rozšíriť
KPI tooltip "Režie %" zobrazí:
- Spôsob výpočtu: "Z hodín výrobních pracovníků (Dílna 1/2/3 + Sklad)"
- Rozpis per overhead kód s hodinami od výrobných ľudí (nie od všetkých)

### 4) Overhead admin dialog
Žiadna zmena UI — užívateľ môže nové kódy aj manuálne pridať/upraviť cez existujúci `OverheadProjectsSettings`. Seed je len rýchlejší štart.

### Súbory
**Upravené:**
- `src/hooks/useAnalytics.ts` — pridať fetch `ami_employees` + `production_hours_log` (raw), spočítať `productionHoursMap`, prepísať `reziePct` výpočet, doplniť do summary `productionRezieHours`/`productionProjectHours`
- `src/pages/Analytics.tsx` — `RezieCard` tooltip text + použitie `productionRezieHours` v rozpise

**DB insert (cez insert tool, nie migrácia):**
- 4× INSERT do `overhead_projects` (ON CONFLICT DO NOTHING podľa `project_code`)

### Otvorené
**Časové filtrovanie:** Aktuálne sa `reziePct` počíta z *celej histórie* logov. Z UI vidím že máš `timeRange` filter (week/month/3months/year/all) — má `reziePct` rešpektovať tento časový rozsah (presnejší obraz utilizácie za posledný mesiac/3 mesiace), alebo ostať „lifetime"? Odporúčam viazať na `timeRange` — utilizácia za "posledné 3 mesiace" má väčšiu výpovednú hodnotu než za celú históriu.

