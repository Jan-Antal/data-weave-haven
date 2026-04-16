

## Plán: Persistovat výběr zaměstnanců v kapacitě + week-aware složení

### Problém
1. **Toggle zaměstnanců/úseků se neukládá** → po refreshi jsou všichni opět zaškrtnutí. `disabledUseky` / `disabledEmployees` jsou jen `useState`, nikam se nezapisují.
2. **Když dnes (po/v týdnu) admin někoho odškrtne**, nevíme jak se to projeví ve **starých** vs **budoucích** týdnech a jak se to **uloží jako záznam pro daný týden** (auditní stopa složení týmu v čase).
3. **"Složení kapacity výroby"** zobrazuje vždy aktuální stav — neumí ukázat "kdo byl aktivní v T10".

### Řešení — princip
- **Editovat lze jen current week (T) a vpřed.** Změna výběru v T se aplikuje na **T až 52** (přepočet `production_capacity` jen pro tyto týdny).
- **Minulé týdny jsou read-only** a zobrazí historický snapshot složení (kdo byl tehdy aktivní v týmu).
- **Persistence**: per-week snapshot aktivních zaměstnanců → nová tabulka `production_capacity_employees` (week_year, week_number, employee_id) → slouží zároveň jako audit i jako zdroj pro re-render minulých týdnů.
- Při kliknutí na **minulý týden** → "Složení" vykreslí seznam z DB (read-only badge "historický snapshot").
- Při kliknutí na **T nebo budoucí** → "Složení" je editovatelné, změna se uloží do DB pro tento týden a všechny následující (overwrite snapshotu pro T..52).

### Část 1: DB schema (migrace)
Nová tabulka:
```
production_capacity_employees (
  id uuid pk,
  week_year int, week_number int,
  employee_id uuid → ami_employees.id,
  is_included bool default true,   -- false = admin odškrtl
  created_at timestamptz,
  unique(week_year, week_number, employee_id)
)
```
RLS: read pro authenticated, write pro admin/owner (stejně jako `production_capacity`).

**Backfill**: pro všechny existující týdny (kde existuje řádek v `production_capacity`) vložit aktuální seznam `ami_employees` s `aktivny=true` a `deactivated_at` respektovaným pro daný `week_start` → `is_included=true`.

### Část 2: Hook na composition per week
Nový `useWeekEmployees(weekYear, weekNumber)`:
- Vrátí `{ employees: EmployeeRow[]; isHistorical: boolean; isEditable: boolean }`
- Pro minulé týdny: JOIN `production_capacity_employees` ↔ `ami_employees` filtrované `is_included=true`
- Pro T+: stejný join, ale fallback na `ami_employees` s `aktivny=true` pokud snapshot ještě neexistuje
- `isEditable = weekNumber >= currentWeek` (a current year)

### Část 3: CapacitySettings.tsx
- Místo `useState<Set>` pro `disabledUseky`/`disabledEmployees` → odvodit z `useWeekEmployees(selectedYear, selectedWeekForComposition)`.
- Přidat **state `compositionWeekNumber`** (default = currentWeek, mění se při kliknutí na bar v grafu).
- "Složení kapacity výroby" header doplnit o:  
  `Týden T{N}` + badge `[historický snapshot — read-only]` pro minulé.
- Toggle (checkbox v řádku zaměstnance) zavolá `toggleEmployeeForCurrentAndForward(employeeId, isIncluded)`:
  - Loop pro `wn = currentWeek..52` → upsert do `production_capacity_employees`
  - Spustí `triggerAutoRecalc()` pro přepočet `production_capacity.capacity_hours` pro T..52
- Stejně pro úsek toggle (batch všech zaměstnanců daného úseku).
- Auto-recalc (`triggerAutoRecalc`) místo `filteredEmployees` (současný session-state) použije pro každý týden **per-week snapshot** z nového hooku.

### Část 4: useCapacityCalc.ts úprava
- `computeWeekCapacity` dostane navíc filter step: pro daný `weekStart` použít jen zaměstnance, kde `production_capacity_employees.is_included=true` (resp. fallback pokud snapshot neexistuje pro starší týdny → použít `aktivny + deactivated_at` heuristiku).
- Nebo elegantněji — volající (CapacitySettings) předá už pre-filtered list per week.

### Část 5: Read-only chování pro minulé týdny
- Checkboxy v tabulce zaměstnanců disabled, opacity-60, tooltip „Minulý týden — historický snapshot, nelze upravit".
- WeekEditor (manual override capacity) zůstává jak je (už má `isPast` flag).

### Soubory k úpravě
1. **Nová migrace** — tabulka `production_capacity_employees` + RLS + backfill ze současných `ami_employees`.
2. **`src/hooks/useCapacityCalc.ts`** — nový hook `useWeekEmployees(year, week)`, helper `toggleEmployeeForWeekRange`.
3. **`src/components/production/CapacitySettings.tsx`** — nahradit session toggles persistentním stavem, přidat `compositionWeekNumber` state, week-aware "Složení" sekci s read-only pro minulost, propojit toggle → DB upsert + recalc T..52.
4. **(Ověřit)** `useWeeklyCapacity` nepotřebuje změnu — zůstává čistě o `production_capacity`.

### Co se NEMĚNÍ
- `production_capacity` schema (jen capacity_hours, working_days, …).
- Logika jak Plán/Výroba čte `capacity_hours` (jediný zdroj pravdy pro kapacitu zůstává).
- `ami_employees.aktivny` flag — slouží i nadále jako globální on/off (vypnutí mimo systém).

### Cíl chování (UX shrnutí)
- V pondělí PM otevře kapacitu, vybere T (current), odškrtne 2 lidi z Dílna_2 → uloží se snapshot pro T až do konce roku, kapacita T..52 se přepočítá; T-1 a starší zůstávají netknuté se svým historickým týmem.
- Po refreshi: výběr přetrvává.
- Kliknutí na T-3 v grafu → "Složení" ukáže team, který byl aktivní v T-3 (read-only).

