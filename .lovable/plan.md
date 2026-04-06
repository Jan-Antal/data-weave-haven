

# Etapy — vizuální a funkční vylepšení

## Přehled změn

1. **Σ znak v tabulkách** — u multi-stage projektů přidat "Σ" prefix před cenu
2. **Project Detail — auto-suma + přepínač** — finance sekce u multi-stage projektů zobrazí automatický součet cen etap (read-only), s možností přepnout na manuální cenu; stejně tak marže = vážený průměr z etap
3. **Architekt + Klient** — vždy na úrovni projektu, nepřenáší se do etap (zůstává jak je, jen ověřit)
4. **Celková marže = vážený průměr** z etap (na 1 desetinné místo)
5. **Smazání etapy** — přidat delete tlačítko do `StagesCostSection` (v rozbalené etapě)
6. **Vizuální odlišení summary řádku** — multi-stage projekt v tabulce dostane jemný vizuální styl (např. subtle left border nebo background tint) a read-only pole budou mít jasnou vizuální indikaci

## Soubory a detaily

### `src/components/CrossTabColumns.tsx`
- V `case "prodejni_cena"`: detekovat, že projekt má multi-stage (přidat prop `isMultiStage` nebo kontrolovat přítomnost "(+" v status stringu jako proxy) — jednodušší: přidat `isSummaryRow` boolean do `CellProps`
- Alternativně: v `projectStageDisplay.ts` přidat prefix "Σ " do `totalPrice` renderingu — ale lepší je v CrossTabColumns přidat Σ prefix v renderingu ceny, protože formátování patří do UI
- Řešení: rozšířit `CellProps` interface o `isSummaryRow?: boolean`, a v renderCell u `prodejni_cena` pokud `isSummaryRow` → zobrazit "Σ " prefix

### `src/components/ProjectInfoTable.tsx` + `PMStatusTable.tsx` + `TPVStatusTable.tsx`
- V `renderColumnCell` volání předat `isSummaryRow: stageCount > 1`
- Multi-stage řádek projektu: přidat jemný vizuální odlišení — `className` s `border-l-2 border-primary/20` nebo `bg-muted/30`

### `src/components/StagesCostSection.tsx`
- **Auto-suma**: zobrazit celkovou cenu jako auto-sumu (Σ) z etap + toggle na manuální zadání (pomocí `plan_use_project_price` pole na projektu)
- **Vážený průměr marže**: spočítat z etap — `Σ(cena_i × marže_i) / Σ(cena_i)` — zobrazit jako read-only info
- **Delete etapy**: v rozbalené `StageCostRow` přidat Trash ikonu s confirm dialogem, volat `useDeleteStage`
- Props rozšířit o `project` objekt (potřeba pro `plan_use_project_price` a pro uložení celkové ceny)

### `src/components/ProjectDetailDialog.tsx`
- Finance sekce: pokud multi-stage → prodejní cena a marže zobrazit jako **read-only computed** (suma / vážený průměr), s indikací "Σ dopočítáno z etap"
- Pokud `plan_use_project_price` = true → editovatelná manuální cena (stávající chování)
- Toggle přepínač (Switch) vedle ceny: "Auto Σ" / "Manuální"
- Předat `project` do `StagesCostSection`

### `src/lib/projectStageDisplay.ts`
- Přidat `weightedMarze: number | null` — vážený průměr marže z etap (zaokrouhlený na 1 des. místo)
- Přidat do `ProjectDisplayOverrides` interface

### `src/hooks/useProjectStages.ts`
- `useDeleteStage` už existuje — jen ho importovat v `StagesCostSection`

## Vizuální odlišení summary řádku

Multi-stage projekt řádek v tabulce:
- Jemný `bg-blue-50/50 dark:bg-blue-950/20` background
- Cena a marže: italic + `text-muted-foreground` protože jsou computed
- Status badge s "(+N)" suffix

Read-only pole (computed z etap) v Project Detail:
- Disabled input s textem "Σ z etap" nebo malý label pod inputem

