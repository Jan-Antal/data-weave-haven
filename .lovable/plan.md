
## Plán: Sjednocení osob přes ami_employees + people (cache)

### Stav DB (zjištěno)
- `people`: 19 řádků (15 employee, 4 external), booly `is_pm/is_kalkulant/is_konstrukter` existují a částečně vyplněné. **`employee_id` je všude NULL** → interní nejsou linkované.
- `ami_employees`: **chybí** `is_pm/is_kalkulant/is_konstrukter`.
- `is_external` v `people` je nekonzistentní (ignorovat, autoritativní je `source`).

### Krok 1 — DB schema migrace
```sql
ALTER TABLE ami_employees
  ADD COLUMN is_pm BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_kalkulant BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_konstrukter BOOLEAN NOT NULL DEFAULT false;

-- partial unique index na linkage
CREATE UNIQUE INDEX IF NOT EXISTS people_employee_id_unique
  ON people(employee_id) WHERE employee_id IS NOT NULL;
```
(`source`, `employee_id`, `is_pm/is_kalkulant/is_konstrukter` v `people` už existují.)

### Krok 2 — Data backfill (insert tool)
1. **Sjednotit `is_external` s `source`**: `UPDATE people SET is_external = (source='external')`.
2. **Auto-populate flagů na `ami_employees`** podle úseku (jen kde flag ještě není nastaven):
   - `usek_nazov='Project Management'` → `is_pm=true`
   - `usek_nazov IN ('Konstrukce/TPV')` → `is_konstrukter=true`
   - `usek_nazov IN ('Obchod/Kalkulace')` → `is_kalkulant=true`
3. **Linkovat existující `people(source='employee')` → `ami_employees`** přes match podle jména (case/diakritika tolerant). Sync flagů z `people` do `ami_employees` (pokud má řádek v people flag, má ho i ami_employees).
4. **Doplnit chybějící cache řádky**: pro každého `ami_employees` který má aspoň jeden flag a nemá řádek v `people`, vytvořit (`source='employee'`, `employee_id`, `name=meno`, příslušné flagy, `is_active=aktivny`).

### Krok 3 — UI změny

**3a. `src/components/osoby/OsobyZamestnanci.tsx`**
- Přidat sloupec **„Role na projektu"** se 3 inline checkboxy (PM / Kalkulant / Konštruktér).
- Toggle: update `ami_employees` flagu + upsert `people` (klíč `employee_id`):
  - Aspoň 1 flag true → `is_active=true`, sync flagů, `name=meno`, `source='employee'`.
  - Všechny false → `is_active=false` (řádek zachovat).

**3b. `src/components/osoby/OsobyExternisti.tsx`**
- Stávající `Select` role nahradit **multi-select popoverem** s checkboxy: PM / Kalkulant / Konštruktér / Architekt.
- PM/Kalk/Konst → booly. Architekt → uložit `'Architekt'` do existujícího `role` sloupce.
- Display: čip s aktivními rolemi (např. „PM, Architekt").

**3c. `src/hooks/usePeople.ts`**
- Přepsat `usePeople(role)` aby filtroval podle bool sloupců místo `role` stringu:
  - `"PM"` → `is_pm=true`, `"Konstruktér"` → `is_konstrukter=true`, `"Kalkulant"` → `is_kalkulant=true`
- Číst pouze z `people` kde `is_active=true`. Odstranit merge logiku přes `position_catalogue` + `ami_employees` (cache už drží sync).
- `useAllPeople`/`useAllPeopleIncludingInactive` beze změny.

**3d. `UserManagement.tsx` (Uživatelé)**
- Žádná změna — už čte `people` kde `is_active=true`.

### Co NEMĚNIT
`user_roles`, auth, ostatní stránky, legacy `PeopleManagement` modal, `position_catalogue`, `role` string sloupec v `people` (zůstává pro Architekta).

### Soubory
- 1× schema migrace
- 1× data backfill (insert tool, 4 SQL bloky)
- `src/components/osoby/OsobyZamestnanci.tsx`
- `src/components/osoby/OsobyExternisti.tsx`
- `src/hooks/usePeople.ts`
