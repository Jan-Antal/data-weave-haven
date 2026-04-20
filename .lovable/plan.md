

## Diagnóza Z-2607-008

### Stav v DB
- `prodejni_cena` = **674 766 CZK**, `marze` = 0.15, `cost_production_pct` = 0.45, currency CZK
- TPV items: 33 položiek, súčet `cena × pocet` × 0.85 × 0.45 / 550:
  - **per-item floor súčet** = **490h** (každá položka osobitne zaokrúhlená dole)
  - **sum-then-floor** = **505h** (najprv súčet, potom raz floor)
- `project_hours` = floor(674 766 × 0.85 × 0.45 / 550) = **469h**
- Inbox súčet (33 pending rows): **586h** ✅
- `project_plan_hours` v DB: `hodiny_plan = 586`, `tpv_hours = 586`, `project_hours = 561`, `source = TPV`, `prodpct_used = 0.45`

### Kde je rozpor

**Inbox (586h)** = sedí so súčtom riadkov `production_inbox.estimated_hours` (33 položiek). Posledný recalc rozdistribuoval hodiny per-item.

**Detail projektu (561h)** = hodnota `project_hours` v `project_plan_hours`, ktorá je ale **uložená ZLE**. Podľa vzorca `floor(674766 × 0.85 × 0.45 / 550) = 469h`, nie 561h. 

Hodnota 561 v DB pravdepodobne pochádza zo staršieho recalc-u keď bol `cost_production_pct` iný (napr. 0.55), prípadne sa použila iná marža. Aktuálny recalc upsertuje len niektoré polia a `project_hours` mohol zostať z predchádzajúceho behu.

**Prečo `hodiny_plan = 586` a nie 469 ani 505?**
- Logika berie `MAX(tpv_hours_raw, project_hours)`.
- `tpv_hours_raw` (per-item floor) = 490, `project_hours` = 469 → MAX by malo byť 490, nie 586.
- 586 vychádza z **inboxu** (suma uložených `estimated_hours`), nie z čerstvého výpočtu z `tpv_items`. Recalc teda číta z inboxu späť do `project_plan_hours`, čo je cyklická chyba — každý ďalší recalc by mohol generovať trochu iné číslo.

### Skutočná príčina
1. **`computePlanHours`** vracia `tpv_hours_raw = 490h` (per-item floor zo `tpv_items`), `project_hours = 469h`, `hodiny_plan = MAX = 490h`.
2. **Distribučná slučka** v `recalculateProductionHours.ts` ale per-item priraďuje `estimated_hours` cez `tpvHoursById` — ktorá obsahuje **už škálované hodnoty** vrátane prípadných remainder add-onov. Tu sa hodnoty pravdepodobne navyšujú navyše v dôsledku:
   - **scale_ratio nesprávne aplikovaný** keď `project_hours < tpv_hours_raw` (žiadne škálovanie sa nemá konať, ale per-item suma mohla byť počítaná inak),
   - alebo **starý suffix v jednom item_code** ktorý padá do orphan vetvy a dostáva extra hodiny `(hodiny_plan − assigned) / orphanCount`.
3. Po distribúcii sa `project_plan_hours.tpv_hours` upsertne na **súčet uložených inbox hodín (586)** namiesto na čistý `tpv_hours_raw` z `computePlanHours` (490).

### Oprava

**A. `recalculateProductionHours.ts` — neprepisovať `tpv_hours` súčtom z inboxu**
- Polia `hodiny_plan`, `tpv_hours`, `project_hours` v `project_plan_hours` musia pochádzať **výhradne z `result` z `computePlanHours`**, nie zo súčtu uložených inbox/schedule hodín. Aktuálny upsert už toto robí správne — over že nikde nedochádza k druhému prepisu po distribučnej slučke.

**B. Distribučná slučka — používať `result.item_hours` priamo, bez orphan navýšenia ak existuje TPV match**
- Skontroluj či 33 inbox položiek skutočne všetky majú TPV match (po `normalizeItemCode`). Ak `AT.08`, `AT.16`, `TK.xx` v TPV chýba ale v inboxe sú, padajú do orphan vetvy a delia 469−assigned medzi seba → tým vzniká nadhodnotenie na 586h.
- Riešenie: **orphany (item bez TPV match) dostanú 0h** ak `hodiny_plan` je zo zdroja `TPV`. Iba ak je `source = "Project"` (project_hours > tpv_hours_raw), distribuovať zvyšok na orphany.

**C. Detail projektu — zobraziť `hodiny_plan`, nie `project_hours`**
- V Project Detail dialógu (a v tabuľkách) sa zobrazuje `project_hours = 561` čo je staré číslo z čistého `prodejni_cena` výpočtu. Správne pole na zobrazenie „plán hodín projektu" je `hodiny_plan` (= 490 po fixe), nie `project_hours`. Over v `ProjectDetailDialog.tsx` ktoré pole čerpá.

### Akčné kroky

1. **Audit `recalculateProductionHours.ts`**:
   - Verifikovať že `project_plan_hours` upsert používa **len** `result.hodiny_plan`, `result.tpv_hours_raw`, `result.project_hours` z `computePlanHours` — nie počítaný súčet inbox/schedule po distribúcii.
   - Orphan distribúciu vykonať len ak `result.source === "Project"`. Pri `source === "TPV"` orphany (inbox bez TPV match) dostanú `0h` (alebo flag „chýba v TPV").

2. **Audit `ProjectDetailDialog.tsx` / `ProjectInfoTable.tsx`**:
   - Zistiť ktoré pole z `project_plan_hours` sa zobrazuje ako „Hodiny plán" v detaile a tabuľkách. Zjednotiť na `hodiny_plan`.

3. **Migrácia jednorazovo**: po nasadení spustiť **„Přepočítat → Vše vč. historie"**. Očakávaný výsledok pre Z-2607-008:
   - `tpv_hours = 490` (per-item floor)
   - `project_hours = 469` (z 674766 × 0.85 × 0.45 / 550)
   - `hodiny_plan = 490` (TPV vyhráva)
   - Inbox súčet = 490h presne (sedí na `hodiny_plan`)
   - Detail projektu zobrazí 490h

### Dotknuté súbory
- `src/lib/recalculateProductionHours.ts` — opraviť source check pri orphan distribúcii, neprepisovať tpv_hours súčtom z inboxu.
- `src/components/ProjectDetailDialog.tsx` — overiť ktoré pole zobrazuje (`hodiny_plan` vs `project_hours`).
- Voliteľne `src/components/ProjectInfoTable.tsx`, `PMStatusTable.tsx` — to isté.

