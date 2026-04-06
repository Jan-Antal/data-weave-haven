

# Opravy etap — 4 body

## 1. Poznámka (pm_poznamka) nejde zapsat u multi-stage projektu

**Root cause**: `isFieldReadOnly` pro multi-stage vrací `true` pro vše kromě `architekt` a `klient`.

**Fix**: Přidat `pm_poznamka` a `tpv_poznamka` do výjimek v `ProjectInfoTable.tsx`, `PMStatusTable.tsx`, `TPVStatusTable.tsx`:
```
(field) => field !== "architekt" && field !== "klient" && field !== "pm_poznamka" && field !== "tpv_poznamka"
```

## 2. Po změně etapy se nepřerenderuje řádek projektu

**Root cause**: `useUpdateStage` invaliduje jen `["project_stages", projectId]`, ale `ProjectRow` závisí na `stagesRaw` (z `useAllProjectStages`), kde query key je jiný.

**Fix**: V `useUpdateStage` onSuccess přidat invalidaci `["all-project-stages"]` (nebo jakýkoli key používá `useAllProjectStages`). Ověřit přesný key a přidat.

## 3. Architekt v etapách se má automaticky brát z projektu

**Root cause**: `architekt` je v `EDITABLE_INHERITED` — kopíruje se při vytvoření, ale pak se edituje nezávisle.

**Fix**: Přesunout `architekt` z `EDITABLE_INHERITED` do `READ_ONLY_INHERITED` v `stageInheritance.ts`. V stage renderingu zobrazit vždy `project.architekt` (read-only). V `buildInheritedStageData` se architekt stále zkopíruje, ale stage row ho zobrazí z projektu.

## 4. Status "(+1)" text je příliš malý

**Root cause**: V `CrossTabColumns.tsx` suffix badge má `text-[10px]`.

**Fix**: Změnit na `text-xs` (12px), aby odpovídal velikosti textu `StatusBadge`.

## Soubory ke změně

| Soubor | Změny |
|--------|-------|
| `src/components/ProjectInfoTable.tsx` | pm_poznamka výjimka z read-only |
| `src/components/PMStatusTable.tsx` | Stejné |
| `src/components/TPVStatusTable.tsx` | Stejné |
| `src/hooks/useProjectStages.ts` | Invalidovat all-project-stages po uložení etapy |
| `src/lib/stageInheritance.ts` | Přesunout `architekt` do READ_ONLY_INHERITED |
| `src/components/CrossTabColumns.tsx` | Status suffix velikost text-xs |

