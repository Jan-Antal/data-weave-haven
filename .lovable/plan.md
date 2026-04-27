# Quick-edit popover pre etapy zo Σ bunky

## Problém

PM v náhľade Project Info vidí súhrnnú maržu/cenu (Σ) z etáp, ale nie je zrejmé, že na ich úpravu musí otvoriť Detail projektu → Finance → Etapy. Treba intuitívnejší skratený workflow priamo z tabuľky.

## Riešenie

Pri **multi-stage projekte v Σ režime** (`stageCount > 1` a `plan_use_project_price=false`) sa bunky **Marže** a **Prodejní cena** stanú klikateľnými. Klik otvorí `Popover` s kompaktným zoznamom etáp — pre každú etapu inputy **Prodejní cena** a **Marže (%)**, ukladá sa rovnakou logikou ako v `StagesCostSection` (cez `useUpdateStage`). V hlavičke popoveru **Σ Súčet** a **Ø Vážená marže** (živé prepočty). Bez krokov navyše — ulož a zatvor.

```text
┌─ Etapy projektu Z-2604-002 ────── ✕ ─┐
│ Σ Cena: 678 396 Kč   Ø Marže: 15 %   │
├──────────────────────────────────────┤
│ A — RD Skalice                       │
│   Cena [______] CZK   Marže [15] %   │
│ B — RD Skalice                       │
│   Cena [______] CZK   Marže [15] %   │
├──────────────────────────────────────┤
│  [Otvoriť detail projektu →]         │
└──────────────────────────────────────┘
```

## Implementácia

### Nový súbor `src/components/StageQuickEditPopover.tsx`
- Props: `projectId`, `trigger` (children = klikateľná bunka), `onOpenFullDetail?`.
- Pomocou `useProjectStages(projectId)` načíta etapy, `useUpdateStage` ukladá zmeny on-blur.
- Hlavička: `Σ Σuma cien` a `Ø Vážená marže` (rovnaký výpočet s default 15% ako v `projectStageDisplay.ts`).
- Pre každú etapu jeden riadok s názvom + 2 input poliami (Cena, Marže).
- Voliteľný footer button "Otvoriť detail projektu →" (ak je `onOpenFullDetail` zadané).

### Úprava `src/components/CrossTabColumns.tsx`
- Do `CellProps` pridať voliteľné: `onOpenStageEditor?: (projectId: string) => void` a renderovať `case "marze"` / `case "prodejni_cena"` v `isSummaryRow` ako klikateľný `<button>` s hover podčiarknutím; vlastný popover stage-quick-edit sa montuje jednorazovo na úrovni `ProjectInfoTable`.
- Lepšie: `case "marze"` a `case "prodejni_cena"` v summary režime obalia obsah do `<button onClick={() => onOpenStageEditor?.(p.project_id)}>` so štýlom `cursor-pointer hover:underline decoration-dotted`.

### Úprava `src/components/ProjectInfoTable.tsx`
- Lokálny state `quickEditProjectId: string | null`.
- Render jedného `<StageQuickEditPopover open={!!quickEditProjectId} projectId={quickEditProjectId} onOpenChange={...} onOpenFullDetail={() => onEditProject(p)} />` na úrovni tabuľky (cez Dialog modal s anchor-less popoverom — použijem **Dialog** namiesto Popoveru, aby bolo predvídateľné triggrovanie z bunky).
- `ProjectRow` dostane callback `onOpenStageEditor` a posunie ho do `renderColumnCell`.

### Bez DB zmien
Ukladá sa do `project_stages` cez existujúci `useUpdateStage` hook — invalidácia queries spôsobí auto-refresh celej tabuľky vrátane Σ buniek.

## UX detaily
- Rovnaké formátovanie čísel ako v Detaile projektu (lokalizácia `cs-CZ`, suffixy `%` / `CZK`/`€`).
- Po zatvorení popoveru sa Σ riadok v tabuľke automaticky aktualizuje (React Query invalidation).
- Žiadny toast (per Toast Policy — ide o rýchlu inline úpravu).
- Tlačidlo "Otvoriť detail projektu →" v päte pre prípad, že PM chce ísť do plnej Finance sekcie (rozpad nákladov, atď.).

## Súbory
- **nové**: `src/components/StageQuickEditPopover.tsx`
- **upravené**: `src/components/CrossTabColumns.tsx`, `src/components/ProjectInfoTable.tsx`
