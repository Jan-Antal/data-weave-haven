

# Etapy: "+" tlačítko, data migrace, multi-status/sum zobrazení

## Přehled

3 věci k implementaci:
1. **ExpandArrow → "+" tlačítko** pro přidání etapy (single-stage i multi-stage)
2. **Migrace dat**: u projektů které mají etapy → zkopírovat project-level data do nové "nulté" etapy
3. **Summary zobrazení**: multi-stage projekty zobrazují agregovaná data v řádku

---

## 1. ExpandArrow — vždy zobrazit "+" místo prázdného slotu

Všechny 3 tabulky (`ProjectInfoTable`, `PMStatusTable`, `TPVStatusTable`):

- **Single-stage (≤1)**: zobrazit `+` ikonu → klik vytvoří novou etapu (pomocí `handleInlineAdd` logiky) a rozbalí řádek
- **Multi-stage (≥2)**: zobrazit chevron jako dosud, ale přidat malé `+` tlačítko vedle (nebo v rozbalené `StagesSection`)

Technicky: `ExpandArrow` dostane nový prop `onAddStage`, místo `<span className="w-5 h-5" />` renderuje `<Plus>` ikonu.

## 2. Data migrace — zkopírovat project data do nulté etapy

SQL migrace která:
1. Najde projekty s existujícími etapami (`project_stages`)
2. Pro každý takový projekt vytvoří novou etapu s `stage_order = -1` (nebo přečísluje)
3. Do nové etapy zkopíruje: `status`, `datum_smluvni`, `pm`, `konstrukter`, `kalkulant`, `prodejni_cena`, `currency`, `marze`, `cost_*` pole
4. Stage name = `{project_id}-0` nebo `{project_id}-BASE`

```sql
INSERT INTO project_stages (id, project_id, stage_name, stage_order, status, datum_smluvni, pm, konstrukter, prodejni_cena, currency, marze, ...)
SELECT gen_random_uuid(), p.project_id, p.project_id || '-A', 0, p.status, p.datum_smluvni, p.pm, ...
FROM projects p
WHERE EXISTS (SELECT 1 FROM project_stages ps WHERE ps.project_id = p.project_id AND ps.deleted_at IS NULL)
AND NOT EXISTS (... already has stage_order 0 ...)
```

Existující etapy dostanou `stage_order += 1`.

## 3. Summary zobrazení v řádku projektu

V renderovací smyčce (`visible.map(...)`) v každé tabulce:
- Načíst stages z `stagesByProject`
- Zavolat `getProjectDisplayOverrides(stages)` z `projectStageDisplay.ts`
- Vytvořit "merged" project objekt kde multi-stage projekt zobrazuje:
  - **Status**: summary badge (všechny stejné → ten status; různé → "Status (+N)")
  - **Cena**: součet `prodejni_cena` ze stages
  - **Datum smluvní**: nejpozdější datum
  - **PM**: summary ("3 PM" nebo jméno pokud jeden)
- Single-stage: zobrazit data z jediné etapy

Pro `CrossTabColumns.tsx`: rozpoznat summary status string (obsahuje "(+") a renderovat jako badge.

## 4. StagesCostSection — přidat "Přidat etapu" tlačítko

V `StagesCostSection.tsx` přidat tlačítko pod seznam etap pro přidání nové etapy přímo z Project Detail.

---

## Soubory

| Soubor | Změna |
|--------|-------|
| **Migrace SQL** | Zkopírovat project data do nulté etapy pro projekty s existujícími etapami |
| `src/components/ProjectInfoTable.tsx` | ExpandArrow: "+" pro single-stage; merged project data v renderovací smyčce |
| `src/components/PMStatusTable.tsx` | Stejné změny jako ProjectInfoTable |
| `src/components/TPVStatusTable.tsx` | Stejné změny jako ProjectInfoTable |
| `src/components/CrossTabColumns.tsx` | Status summary badge rendering |
| `src/components/StagesCostSection.tsx` | Tlačítko přidat etapu |
| `src/lib/projectStageDisplay.ts` | Případné doplnění helper funkcí |

