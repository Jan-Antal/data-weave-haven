
# Projekty a etapy — single-row / summary logika + Stage detail v Project Detail

## Kontext

Aktuálně projekt v tabulce **vždy** zobrazuje expand šipku a etapy pod sebou, bez ohledu na počet etap. Při 1 etapě je to zbytečný level — data se duplikují. Uživatel chce:

1. **1 etapa = 1 řádek** — projekt se chová jako single row, data etapy se zobrazují přímo na úrovni projektu
2. **2+ etap = projekt je summary** — projekt řádek ukazuje agregované info (počet statusů, součet cen), etapy jsou sub-rows
3. **Project Detail** — přidat sekci "Etapy" s cenou a rozpadem ceny per etapa (viditelné jen při 2+ etapách)

## Rozsah změn

### 1. Tabulky (ProjectInfoTable, PMStatusTable, TPVStatusTable)

**Single-stage projekty (stageCount ≤ 1):**
- Skrýt expand šipku (nebo ji zobrazit jen jako "+" pro přidání)
- Projekt řádek zobrazuje data z jediné etapy přímo (status etapy, datum_smluvni etapy, PM etapy atd.)
- Editace na řádku projektu zapisuje přímo do etapy (ne do projektu)

**Multi-stage projekty (stageCount ≥ 2):**
- Projekt řádek = summary:
  - Status: zobrazit počet různých statusů jako badge (např. "3 statusy") nebo nejnižší status
  - Cena: součet `prodejni_cena` ze všech etap
  - PM: pokud různí → zobrazit "Více PM" nebo počet
  - Datum smluvní: nejpozdější datum
- Sub-rows = jednotlivé etapy (stávající logika)

**Implementace:**
- Nový helper `useProjectDisplayData(project, stages)` — vrací "merged" data pro zobrazení v řádku
- V `ProjectRow` rozlišit `isSingleStage` → přímo renderovat stage data
- V `ExpandArrow` skrýt šipku pokud `stageCount <= 1`

### 2. Project Detail Dialog — sekce Etapy

**Viditelná jen při 2+ etapách** — pod sekci Finance přidat:

```text
📐 ETAPY (3)
┌─────────────────────────────────────────┐
│ Z-2512-001-A  │ 850 000 CZK │ Marže 25% │
│ [Rozpad ceny ▼]                         │
├─────────────────────────────────────────│
│ Z-2512-001-B  │ 420 000 CZK │ Marže 25% │
│ [Rozpad ceny ▼]                         │
├─────────────────────────────────────────│
│ Z-2512-001-C  │ 267 829 CZK │ Marže 25% │
│ [Rozpad ceny ▼]                         │
└─────────────────────────────────────────┘
Součet: 1 537 829 CZK
```

- Každá etapa: jméno, cena, měna, marže, collapsible `RozpadCeny`
- Etapa dědí cost breakdown preset z projektu pokud nemá vlastní
- Editace ceny/marže etapy se uloží do `project_stages` tabulky
- Součet cen etap se zobrazí pod seznamem

### 3. DB — rozšíření `project_stages` tabulky

Etapy už mají `prodejni_cena`, `currency`, `marze`. Chybí cost breakdown pole:

**Nová migrace** — přidat do `project_stages`:
- `cost_preset_id` (uuid, nullable)
- `cost_material_pct` (numeric, nullable)  
- `cost_production_pct` (numeric, nullable)
- `cost_subcontractors_pct` (numeric, nullable)
- `cost_overhead_pct` (numeric, nullable)
- `cost_doprava_pct` (numeric, nullable)
- `cost_montaz_pct` (numeric, nullable)
- `cost_is_custom` (boolean, default false)

### 4. Status summary logika

Pro multi-stage projekt:
- Pokud všechny etapy mají stejný status → zobrazit ten status
- Pokud různé → zobrazit badge s počtem unikátních statusů nebo nejnižší (nejméně pokročilý) status + "(+2)"

## Soubory

1. **Migrace** — přidat cost breakdown sloupce do `project_stages`
2. **`src/components/ProjectInfoTable.tsx`** — single-stage/multi-stage logika v `ProjectRow`, skrytí expand arrow
3. **`src/components/PMStatusTable.tsx`** — stejná logika
4. **`src/components/TPVStatusTable.tsx`** — stejná logika  
5. **`src/components/ProjectDetailDialog.tsx`** — nová sekce "Etapy" s `RozpadCeny` per stage
6. **`src/hooks/useProjectStages.ts`** — přidat mutaci pro update cost breakdown polí etapy
7. **Nový helper** `src/lib/projectStageDisplay.ts` — helper pro merge/summary logiku (aby nebyl duplikovaný kód ve 3 tabulkách)
