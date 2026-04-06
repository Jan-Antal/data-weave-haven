

# Opravy etap — 7 bodů

## Problémy a řešení

### 1. Vážená marže je 100× větší
**Root cause**: `projectStageDisplay.ts` normalizuje marži (0.25 → 25), ale výsledek (`weightedMarze = 25`) se pak v `ProjectRow` uloží jako `String(25)` do `displayProject.marze`. Funkce `formatMarze` pak znovu násobí ×100 → zobrazí 2500%.

**Fix**: V `projectStageDisplay.ts` výsledek `weightedMarze` ponechat v **decimal** formátu (0.25), ne v procentech. Změnit normalizaci: vždy pracovat s decimal hodnotami, výsledek nezaokrouhlovat na procenta ale na decimal (1 des. místo v %). Konkrétně: `weightedMarze` vracet jako decimal (např. 0.25), ne 25.

Alternativně a jednodušeji: v `ProjectRow` kde se staví `marze: String(overrides.weightedMarze)` — přeměnit na decimal: `String(overrides.weightedMarze / 100)`. Stejná oprava v `StagesCostSection.tsx`.

**Soubory**: `src/lib/projectStageDisplay.ts`, `src/components/StagesCostSection.tsx`

### 2. Vizuální odlišení — border-l nahradit podsvícením
Smazat `border-l-2 border-primary/20`. Místo toho přidat `bg-muted/40` na summary řádky (obdobný styl jako hover). Odstranit `italic` class z `summaryClass` v `CrossTabColumns.tsx` — ponechat jen normální text, případně jen `text-muted-foreground` pro computed pole.

**Soubory**: `src/components/ProjectInfoTable.tsx`, `src/components/PMStatusTable.tsx`, `src/components/TPVStatusTable.tsx`, `src/components/CrossTabColumns.tsx`

### 3. StagesCostSection do ostatních detailů
`StagesCostSection` se renderuje v `ProjectDetailDialog.tsx`. Potřeba ověřit, že se zobrazuje správně s auto-sum togglem a přidáváním etap.

**Soubor**: `src/components/ProjectDetailDialog.tsx`

### 4. Multi-status — barva prvního statusu
`StatusBadge` hledá přesný match na label. "Výroba (+2)" nenajde shodu → žádná barva.

**Fix**: V `CrossTabColumns.tsx` case `"status"` — pokud `isSummaryRow` a status obsahuje "(+", parsovat base status (před " (+") a renderovat jako `StatusBadge` s base statusem + suffix badge s počtem.

**Soubor**: `src/components/CrossTabColumns.tsx`

### 5. Architekt + Klient — vždy z projektu, ne z etapy
V `displayProject` merge logice (single-stage): neměnit `architekt` ani `klient` — ty zůstávají vždy z projektu. V `CrossTabColumns.tsx` `case "architekt"` a `case "klient"` — pokud `isSummaryRow`, nemají být read-only, zůstávají editovatelné na úrovni projektu.

Aktuálně `isFieldReadOnly: stageCount > 1 ? () => true : isFieldReadOnly` → to dělá ALL fields read-only pro multi-stage. Potřeba výjimku pro `architekt`, `klient`.

**Fix**: V `ProjectRow` renderKeys mapping: `isFieldReadOnly` pro multi-stage → `(field) => field !== "architekt" && field !== "klient"`.

**Soubory**: `src/components/ProjectInfoTable.tsx`, `src/components/PMStatusTable.tsx`, `src/components/TPVStatusTable.tsx`

### 6. PM a Kalkulant — zobrazit jména (Adam / Jakub)
Místo "3 PM" zobrazit `"Adam / Jakub"` (spojit jména lomítkem). Přidat to samé pro `kalkulant`.

**Fix**: V `projectStageDisplay.ts`:
- `pmSummary`: místo `"${pms.size} PM"` → `[...pms].join(" / ")`
- Přidat `kalkulantSummary` do `ProjectDisplayOverrides` se stejnou logikou
- V `ProjectRow` merge: `kalkulant: overrides.kalkulantSummary ?? p.kalkulant`

**Soubory**: `src/lib/projectStageDisplay.ts`, `src/components/ProjectInfoTable.tsx`, `src/components/PMStatusTable.tsx`, `src/components/TPVStatusTable.tsx`

### 7. Konstruktér summary
Přidat stejnou logiku pro `konstrukter` — zobrazit jména spojená " / ".

**Soubor**: `src/lib/projectStageDisplay.ts` + všechny 3 tabulky

## Soubory ke změně

| Soubor | Změny |
|--------|-------|
| `src/lib/projectStageDisplay.ts` | Fix weighted marže (decimal), PM/kalkulant/konstruktér jako jména, přidat `kalkulantSummary` + `konstrukterSummary` |
| `src/components/CrossTabColumns.tsx` | Odstranit italic, fix status badge barvy pro summary, architekt/klient editovatelné |
| `src/components/ProjectInfoTable.tsx` | bg-muted/40 místo border-l, architekt/klient výjimka z read-only, kalkulant/konstruktér summary |
| `src/components/PMStatusTable.tsx` | Stejné jako ProjectInfoTable |
| `src/components/TPVStatusTable.tsx` | Stejné jako ProjectInfoTable |
| `src/components/StagesCostSection.tsx` | Fix weighted marže display |

