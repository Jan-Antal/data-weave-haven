## Cíl

Vytvořit jednotnou search utilitu, která ignoruje diakritiku a toleruje drobné překlepy (1–2 znaky), a aplikovat ji na všechny search bary v aplikaci.

Příklady, které musí fungovat:
- `santovka` → najde „Šantovka"
- `alianz` → najde „Allianz"
- `pycha` → najde „pícha"
- `picha` → najde „pícha"

## Návrh

### 1. Nová utilita `src/lib/fuzzySearch.ts`

Centralizovaná knihovna se třemi funkcemi:

- `normalize(text)` — `toLowerCase` + NFD strip diakritiky (sjednocuje 13+ duplikovaných implementací v kódu).
- `fuzzyMatch(haystack, needle)` — vrací `boolean`:
  1. **Substring match na normalizovaném textu** (rychlý, kryje diakritiku: santovka↔šantovka, picha↔pícha).
  2. **Fallback na Damerau-Levenshtein vzdálenost** přes všechna slova/tokeny v haystack:
     - needle ≤ 4 znaky → tolerance 1 (alianz↔allianz: vzdálenost 1 ✓)
     - needle 5–7 znaků → tolerance 1
     - needle 8+ znaků → tolerance 2
  3. Pro multi-token dotazy (např. „šan zak") — všechny tokeny musí matchnout (AND logika), každý zvlášť.
- `fuzzyMatchAny(fields[], needle)` — convenience helper pro pole více polí (jméno, ID, PM…).

Damerau-Levenshtein zvládá: substituci (pycha→pícha po normalizaci = picha↔picha ✓), inserci (alianz→allianz), deleci, transpozici (al**ai**nz→al**ia**nz).

Pro fonetické ekvivalence (y↔i, š↔s) se normalizace + Levenshtein 1 postará automaticky:
- `pycha` → norm `pycha`, `pícha` → norm `picha`, vzdálenost = 1 → match ✓.

### 2. Refaktor existujících search bar

Nahradit ručně psané `toLowerCase().includes()` voláním `fuzzyMatch()` v těchto souborech:

**Plně refaktorovat (search bary nad seznamy):**
- `src/components/TableFilters.tsx` (globální search projektů)
- `src/components/DataLogPanel.tsx`
- `src/components/production/InboxPanel.tsx`
- `src/components/production/WeeklySilos.tsx`
- `src/components/production/ExpedicePanel.tsx`
- `src/components/production/PlanVyrobyTableView.tsx`
- `src/components/production/CompletionDialog.tsx`
- `src/components/production/EmployeeManagement.tsx`
- `src/components/PeopleManagement.tsx`
- `src/components/PeopleSelect.tsx`, `PeopleSelectDropdown.tsx`
- `src/components/osoby/OsobyZamestnanci.tsx`, `OsobyExternisti.tsx`, `OsobyOpravneni.tsx`
- `src/components/mobile/MobileCardList.tsx`
- `src/hooks/useSearchNavigation.ts` (nahradit lokální `normalize` importem)
- `src/pages/Vyroba.tsx` (3 výskyty search filtrů)
- `src/components/ProjectDetailDialog.tsx` (search v dokumentech)
- `src/components/mobile/MobileDetailProjektSheet.tsx`

**Nepřepisovat** (nejde o uživatelské vyhledávání):
- `AmiAssistant.tsx` — trigger detection (přesné fráze)
- `ExcelImportWizard.tsx` — header matching (potřebuje přesnost)
- `FormulaBuilder.tsx` — autocomplete proměnných (krátké, přesné)
- `statusFilter.ts` — interní mapping
- `MobileDetailProjektSheet.tsx` řádek 331 — generování username

### 3. Zachování existujících pravidel

- Ponechat existující omezení **min. 3 znaky** v `Plán Výroby` (per memory `production-planning/search-logic`).
- Ponechat highlightování — protože substring match na normalizovaném textu nevrátí přesný offset v originálu, highlight bude pracovat přes případnou normalizovanou pozici (mapování index → originál) nebo zůstane stávající logika kde už je.

### 4. Performance

- Damerau-Levenshtein běží **jen jako fallback**, když substring match selže.
- Maximální délka porovnávaného slova omezena (např. 30 znaků) pro ochranu O(n·m).
- Žádný memoization layer není potřeba (typické seznamy < 1000 položek).

### 5. Test

Přidat `src/test/fuzzySearch.test.ts` s případy:
- `santovka` ↔ `Šantovka` ✓
- `alianz` ↔ `Allianz` ✓
- `pycha` ↔ `pícha` ✓
- `picha` ↔ `pícha` ✓
- `xyz` ↔ `Šantovka` ✗
- multi-token: `šan z-25` najde `Z-2501 Šantovka`

## Technické detaily

```ts
// src/lib/fuzzySearch.ts
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function damerauLevenshtein(a: string, b: string, max: number): number { /* ... */ }

function tolerance(len: number): number {
  if (len <= 4) return 1;
  if (len <= 7) return 1;
  return 2;
}

export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = normalize(haystack);
  const tokens = normalize(needle).split(/\s+/).filter(Boolean);
  return tokens.every(token => {
    if (h.includes(token)) return true;
    const tol = tolerance(token.length);
    // try each word in haystack as candidate
    return h.split(/[\s\-_/]+/).some(word =>
      Math.abs(word.length - token.length) <= tol &&
      damerauLevenshtein(word, token, tol) <= tol
    );
  });
}

export function fuzzyMatchAny(fields: (string | null | undefined)[], needle: string): boolean {
  if (!needle) return true;
  return fields.some(f => f && fuzzyMatch(f, needle));
}
```

## Soubory

**Nové:** `src/lib/fuzzySearch.ts`, `src/test/fuzzySearch.test.ts`

**Upravené:** ~16 komponent/hooků se search logikou (viz výše).
