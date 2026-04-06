

# Multi-stage percent_tpv: průměr z etap

## Problém
U multi-stage projektu bez TPV položek se `percent_tpv` nezobrazuje — `computedPct` je `null` (žádné TPV items) a multi-stage override nepřenáší `percent_tpv` z etap.

## Řešení
Přidat `percentTpvAvg` do `getProjectDisplayOverrides()` — průměr `percent_tpv` všech etap. V `displayProject` merge ho použít jako fallback, pokud není `computedPct` z TPV položek.

## Změny

### 1. `src/lib/projectStageDisplay.ts`
- Přidat `percentTpvAvg: number | null` do `ProjectDisplayOverrides`
- V multi-stage větvi: spočítat `round(sum(stage.percent_tpv) / count)` pro etapy s nenulovou hodnotou
- Single-stage: `null` (řeší se přímo kopií z etapy)

### 2. `src/components/ProjectInfoTable.tsx`, `PMStatusTable.tsx`, `TPVStatusTable.tsx`
- V multi-stage větvi `displayProject`: přidat `percent_tpv: overrides.percentTpvAvg ?? p.percent_tpv`
- Pořadí priority zůstává: `computedPct` (z TPV items) > `percentTpvAvg` (z etap) > `p.percent_tpv` (manuální)

## Soubory

| Soubor | Změna |
|--------|-------|
| `src/lib/projectStageDisplay.ts` | Přidat `percentTpvAvg` výpočet |
| `src/components/ProjectInfoTable.tsx` | Merge `percentTpvAvg` do multi-stage base |
| `src/components/PMStatusTable.tsx` | Stejné |
| `src/components/TPVStatusTable.tsx` | Stejné |

