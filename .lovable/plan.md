# Nová karta "Absence" v module Analytics

Pridáme do `PageTabsShell` v `src/pages/Analytics.tsx` novú záložku **"Absence"** hneď za **"Výkaz"**. Bude mať podobnú štruktúru ako Výkaz: dashboard karty hore + tabuľka s detailmi po jednotlivých ľuďoch.

## 1. Dátový zdroj
Tabuľka `ami_absences` (1 riadok = 1 deň absencie) napojená na `ami_employees`:
- **Kódy v DB:** `DOV` (dovolenka), `DOV/2` (½ deň dovolenky), `NEM` (nemoc), `RD` (rodičovská)
- **Zdroje:** `manual` (dlhodobé plánované) vs `alveno_xlsx` (krátkodobé / neplánované nemoci z dochádzky)
- 1 deň = `uvazok_hodiny` zamestnanca (typicky 8 h), `DOV/2` = polovica

## 2. Nový komponent `src/components/analytics/AbsenceReport.tsx`
Štruktúra zhodná s `VykazReport`:

### Filter bar (hore)
- **Date range picker** — Týden / Měsíc / Předchozí měsíc / 3 měsíce / Rok / Vlastní (rovnaký pattern ako Výkaz)
- **Multi-select** typ absencie (DOV, RD, NEM, …)
- **Multi-select** stredisko / úsek
- **Search** podľa mena zamestnanca

### Dashboard karty (5 kariet, grid)
Sumáre v hodinách za zvolený rozsah:
1. **Celkom absencie** (h)
2. **🏖️ Dovolená** (DOV + DOV/2)
3. **👶 Rodičovská** (RD)
4. **🤒 Nemoc** (NEM)
5. **📊 Plánované vs neplánované** — `manual` h vs `alveno_xlsx` h (s percentom)

### Bar chart (časová os)
- Stacked bar po týždňoch / dňoch (podľa zvoleného rozsahu) farebne podľa typu absencie
- Rovnaký renderer ako vo `VykazReport` (Recharts)

### Tabuľka (rozkliknuteľná po zamestnancoch)
Hlavičky: **Zaměstnanec | Středisko | Úsek | Dovolená (h) | Rodič. (h) | Nemoc (h) | Celkem (h) | Posledná absencia**

Po rozkliknutí riadku → zoznam jednotlivých absenčných období (group consecutive days, použijeme rovnakú logiku ako `groupPeriods` v `useEmployeeAbsences.ts`):
- Typ | Od | Do | Počet dní | Hodiny | Zdroj (manuál / Alveno)

### Export CSV
Tlačidlo **Stáhnout CSV** rovnako ako vo Výkaze.

## 3. Registrácia tabu v `src/pages/Analytics.tsx`
- Pridať do `tabs` array hneď za `vykaz`:
  ```ts
  { key: "absence", label: "Absence", visible: canAccessAnalyticsVykaz }
  ```
  (znovupoužijeme existujúcu permission `canAccessAnalyticsVykaz` — kto vidí Výkaz, vidí aj Absence; ak budete chcieť oddelený permission, vieme ho pridať neskôr)
- Pridať `const absenceMode = activeTab === "absence";`
- Skryť toolbar pre absence mode rovnako ako pre vykaz
- Render: `{absenceMode ? <AbsenceReport /> : vykazMode ? ... }`

## 4. Query (React Query)
```ts
useQuery({
  queryKey: ["absence-report", from, to],
  queryFn: () => supabase
    .from("ami_absences")
    .select("id, employee_id, datum, absencia_kod, source")
    .gte("datum", from).lte("datum", to)
    .order("datum")
})
```
+ paralelne `ami_employees` (meno, stredisko, usek_nazov, uvazok_hodiny, deactivated_date) cez existujúci `useVyrobniEmployees` alebo nový `useAllEmployeesForAbsence`.

Hodiny počítame klientsky: `DOV/2 → uvazok/2`, ostatné `→ uvazok` (default 8 ak null).

## Súbory ktoré sa zmenia
- **Nový:** `src/components/analytics/AbsenceReport.tsx`
- **Upravený:** `src/pages/Analytics.tsx` (tab + render switch)

Žiadne DB migrácie nie sú potrebné — všetky dáta už existujú.
