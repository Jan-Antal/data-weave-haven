

## Plán: Správa zaměstnanců výroby — revize

### Změny oproti původnímu návrhu
- **`usek` zůstává beze změny** (sync z Alvena)
- **Nový sloupec `pracovni_skupina`** v `ami_employees` — manuální přiřazení (Lakovna, Kompletace, atd.)
- **Žádná nová tabulka pro absence** — používáme existující `ami_absences` s `absencia_kod` (DOV, NEM, RD, …)

### DB změny

**1) `ami_employees` — nový sloupec**
```sql
ALTER TABLE ami_employees ADD COLUMN pracovni_skupina text;
```
- Volný text + autocomplete z existujících hodnot
- Default NULL → fallback na `usek` v capacity logice

**2) `ami_absences` — povolit ruční zápis**
- Přidat RLS policies (admin/owner insert/update/delete)
- UI bude zapisovat dlouhodobé záznamy s `source='manual'`, `absencia_kod` (DOV/NEM/RD/…), a opakovat denní řádky pro celý rozsah od–do

### UI: nová sekce v `CapacitySettings` → tab „Zaměstnanci"

```text
[Search…]                                    [+ Přidat absenci hromadně]
─────────────────────────────────────────────────────────────────────
Meno          Úsek      Prac. skupina  Úvazek  Absence (akt.)  Akce
Jan Novák     Dílna_1   [Lakovna ▼]    [40h ▼] —              [⋯]
Petr Svoboda  Dílna_2   [Kompletace▼]  [20h ▼] 🟡 RD do 6/26  [⋯]
```

- **Pracovní skupina**: dropdown s existujícími hodnotami + „+ Nová skupina"
- **Úvazek**: 20/30/40h týdně (uloží jako 4/6/8 denně do `uvazok_hodiny`)
- **Absence (akt.)**: zobrazí aktivní záznam z `ami_absences` pro dnešek/budoucnost; klik otevře dialog s historií
- **Dialog absence**: kód (DOV/NEM/RD/PN/jiné), datum od (povinné), datum do (volitelné — „otevřeno" → vygeneruje denní řádky 6 měsíců dopředu, prodloužitelné), poznámka

### Capacity logika (`useCapacityCalc.ts`)

- `getActiveWorkingDays()` — kromě `deactivated_at` odečíst i dny překrývající se s `ami_absences` pro daného zaměstnance v daném týdnu
- `useAbsencesForYear()` už čte `ami_absences` — funguje out-of-the-box pro nové ruční záznamy
- `pracovni_skupina` se zatím nepoužívá v kapacitním výpočtu (jen evidenční), pokud nechceš jinak

### Soubory

**Nové:**
- `supabase/migrations/...` — `pracovni_skupina` column + RLS policies pro `ami_absences`
- `src/components/production/EmployeeManagement.tsx` — tab obsah
- `src/components/production/EmployeeAbsenceDialog.tsx` — přidat/upravit absenci
- `src/hooks/useEmployeeAbsences.ts` — CRUD nad `ami_absences` (filtr `source='manual'`)

**Upravené:**
- `src/components/production/CapacitySettings.tsx` — přidat tab „Zaměstnanci"
- `src/hooks/useCapacityCalc.ts` — proporcionální odečet dnů s absencí v `getActiveWorkingDays`

### Otevřené (potvrď):
1. **Otevřená absence (bez data do)** — vygenerujeme denní řádky 6 měsíců dopředu a noční job/manuální „prodloužit" prodlouží? Nebo jiný mechanismus?
2. **Pracovní skupina** se má i promítnout do kapacitního forecastu (samostatné kbelíky vedle Dílna_1/2/3), nebo je to jen evidenční sloupec?

