

## Plán: Sjednocená "Správa osob"

### Název
**"Správa osob"** v menu i v hlavičce dialogu (zachovává existující terminologii).

### A. DB změny (migrace)

**1. `ami_employees`** — přidat:
- `stredisko text`, `usek_nazov text`, `pozicia text`
- `deactivated_date date` — datum ukončení (zachová historii)

**2. Nová `position_catalogue`**: `id, stredisko, usek, pozicia, project_dropdown_role (pm|kalkulant|konstrukter|null), is_active, sort_order` + RLS read=auth, write=admin/owner. Seed celé hierarchie.

**3. `people`** — přidat `is_external bool default false`, `firma text`.

**RLS:** Existující anon insert/update/select na `ami_employees` a `ami_absences` zůstává netknuté (n8n/Alveno funguje dál). Restrikce pouze v UI.

### B. Komponenta `SpravaOsob.tsx` (5 záložek)

**1. Zaměstnanci** — `ami_employees` seskupené `stredisko → usek_nazov`. Sloupce: Jméno | Úsek | Pozice | Úvazek | Absence | Stav (Aktivní / "Ukončen k DD.MM.YYYY") | Alveno úsek (readonly) | ⋯ menu (Ukončit pracovní poměr → date picker → `deactivated_date` + `aktivny=false`; Obnovit; Smazat trvale s ConfirmDialog).

**2. Externisti** — `people WHERE is_external=true`. Sloupce: Jméno | Firma | Role (PM/Konstruktér/Kalkulant/Architekt) | Aktivní | Smazat. "+ Přidat externistu".

**3. Uživatelé** — stávající `UserManagement` přesunutý beze změn.

**4. Pozice & číselníky** — tree editor `position_catalogue`. Stredisko → Úsek (s flag `project_dropdown_role`) → Pozice.

**5. Kapacita** — dvě sub-záložky:
- **Kapacita** (default) — graf + složení útvarů, jako dnes.
- **Zaměstnanci** — seznam zaměstnanců aktivních **v aktuálně vybraném týdnu** (z grafu/picker). Při otevření = current week + future. Klik na týden v grafu změní vybraný týden → seznam přefiltruje podle:
  - `aktivny=true` v daném týdnu (`activated_at <= weekEnd` AND (`deactivated_date` IS NULL OR `deactivated_date >= weekStart`))
  - + composition snapshot (`production_capacity_employees` pro historické týdny)
  - Možnost include/exclude per zaměstnanec pro daný týden (existující `toggleEmployeeForWeekRange` logika).

### C. Logika sjednocení

- `useActiveMembersForRole(role)` UNION:
  - `ami_employees` JOIN `position_catalogue` kde `project_dropdown_role` matchuje AND `aktivny=true`
  - `people` kde role matchuje AND `is_active=true`
- `usePeople(role)` → tenký wrapper. Projektové dropdowny fungují bez změny.
- `useVyrobniEmployees` přijme i `stredisko='Výroba Direct'` (fallback na Alveno `usek`).

### D. Wiring

- `ProductionHeader` settings menu: jediná položka **"Správa osob"** místo tří (odstranit "Správa uživatelů", "Kapacita výroby" → vše uvnitř).
- `PeopleManagementContext.openPeopleManagement()` → otevře Správu osob na Tab 2 (Externisti).
- Staré soubory (`UserManagement.tsx`, `PeopleManagement.tsx`, `EmployeeManagement.tsx`, `CapacitySettings.tsx`) zůstanou nepoužité na disku (cleanup později).

### Soubory

**Migrace** (1): sloupce + `position_catalogue` + seed + RLS.
**Nové**: `SpravaOsob.tsx`, `osoby/OsobyZamestnanci.tsx`, `OsobyExternisti.tsx`, `OsobyUzivatele.tsx`, `OsobyKatalog.tsx`, `OsobyKapacita.tsx` (s 2 sub-taby), `UkoncitPracovniPomerDialog.tsx`.
**Nový hook**: `useOsoby.ts` (katalog + active-members-for-role + active-employees-for-week).
**Upravené**: `usePeople.ts`, `useCapacityCalc.ts`, `PeopleManagementContext.tsx`, `ProductionHeader.tsx`.

