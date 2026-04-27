# Oprava marže etap a Σ v náhľade projektu

## Problém

1. **Marža projektu = 0 %**, aj keď každá etapa má default 15 %.
   V `getProjectDisplayOverrides` sa vážený priemer marže ráta ako `Σ(price × margin) / Σ(price)`. Ak etapa nemá vyplnenú `prodejni_cena` (čo je prípad zo screenshotu — RD Skalice má prázdne polia), váha = 0 → vážený súčet = 0 → priemer = 0. Navyše ak `marže` v DB je null, dosadí sa `0` (nie default 15 %).

2. **„Σ" sa zobrazuje aj po vypnutí Auto-sumy v náhľade projektu (Project Info tabuľka)**, polia sú uzamknuté (read-only) — prepísať sa dá len v Detaile projektu.
   `ProjectInfoTable` rozhoduje o summary režime len podľa `stageCount > 1` a vždy aplikuje agregáciu z etáp. Ignoruje toggle `plan_use_project_price` (true = manuálna cena projektu, false = auto-sum).

## Plán úpravy

### 1. `src/lib/projectStageDisplay.ts` — vážený priemer marže s defaultom

V bloku, ktorý počíta `weightedMarze` (riadky 98–112):
- Pre každú etapu rozparzovať maržu; ak je `null`/prázdna/NaN, použiť **default 0.15** (15 %).
- Ak `Σ(price) > 0` → vážený priemer (ako doteraz, ale s default-om).
- Ak `Σ(price) = 0` (žiadna etapa nemá cenu) → fallback na **obyčajný priemer** marží etáp (aby projekt s 2 etapami × 15 % zobrazil 15 %, nie 0 %).

### 2. `src/components/ProjectInfoTable.tsx` — rešpektovať toggle Auto-sumy

V `ProjectRow` (cca riadok 446–482) a v `isSummary` (riadok 482):
- Ak `p.plan_use_project_price === true`, zaobchádzať s projektom ako so single-stage:
  - `displayProject = p` (žiadne overrides z etáp).
  - `isSummary = false` → odstráni „Σ" prefix v `CrossTabColumns` a polia (`prodejni_cena`, `marze`, `pm`, `status`, …) sa stanú editovateľnými cez `InlineEditableCell`.
- Pri `plan_use_project_price === false` (auto-sum) ostane existujúce správanie (Σ + read-only).

### 3. Bez DB migrácie

`plan_use_project_price` sa už ukladá pri prepnutí toggle v `ProjectDetailDialog`. Žiadna ďalšia zmena schémy nie je potrebná.

## Očakávaný výsledok

- RD Skalice (2 etapy × default 15 %, bez vyplnenej `prodejni_cena`) → projekt zobrazí maržu **15 %** namiesto 0 %.
- Po zapnutí toggle „Manuální cena projektu" v Detaile projektu sa v náhľade Project Info odstráni prefix „Σ" pri cene a marže, polia sa dajú editovať priamo z tabuľky (rovnako ako pri jednoetapovom projekte).
- Po opätovnom zapnutí Auto-sumy sa náhľad vráti do summary režimu.

## Súbory, ktoré sa zmenia

- `src/lib/projectStageDisplay.ts` (logika výpočtu váženej marže)
- `src/components/ProjectInfoTable.tsx` (rešpektovanie `plan_use_project_price` v `ProjectRow`)
