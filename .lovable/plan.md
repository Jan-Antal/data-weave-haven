

# Midflight opakovateľnosť bez extra DB stĺpca

## Prístup
Namiesto `original_estimated_hours` stĺpca využijeme existujúci `adhoc_reason` field na inbox items ako marker + po resete zavoláme `recalculateProductionHours` na prepočet hodin z cien/vzorcov.

## Zmeny v `src/lib/midflightImportPlanVyroby.ts`

### Reset fáza — pridať obnovu inbox items
Pred existujúcim resetom:
1. Nájsť inbox items kde `adhoc_reason = 'recon_scheduled'` → update `status: "pending"`, `adhoc_reason: null`
2. Nájsť inbox items kde `adhoc_reason LIKE 'recon_reduced%'` → update `status: "pending"`, `adhoc_reason: null`
3. Po obnove zavolať `recalculateProductionHours(supabaseClient, "all", undefined, true)` — toto prepočíta `estimated_hours` a `estimated_czk` na všetkých inbox items z TPV cien/vzorcov (existujúca logika v riadkoch 172-225 recalculateProductionHours.ts)

### Reconciliation fáza — označiť zmenené items
Pri redukcii inbox items:
- Plne pokryté (status → "scheduled"): nastaviť `adhoc_reason: "recon_scheduled"`
- Čiastočne pokryté (redukované hodiny): nastaviť `adhoc_reason: "recon_reduced"`

## Tok pri opakovanom spustení

```text
1. RESET
   - Vráť "recon_scheduled" items → pending, clear adhoc_reason
   - Vráť "recon_reduced" items → pending, clear adhoc_reason  
   - Zavolaj recalculateProductionHours("all") → prepočíta hodiny z cien
   - Zmaž HIST_, HIST_RECON_, midflight schedule/inbox/expedice

2. IMPORT (beze zmeny)
   - Vytvor HIST_ bundles

3. RECONCILIATION
   - Vytvor HIST_RECON_ bundles  
   - Redukuj inbox s adhoc_reason markermi
```

## Súbory

| Súbor | Zmena |
|-------|-------|
| `src/lib/midflightImportPlanVyroby.ts` | Reset: revert recon items + recalculate; Reconciliation: adhoc_reason markers |

Žiadna DB migrácia nie je potrebná.

