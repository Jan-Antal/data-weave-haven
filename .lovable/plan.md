

# Filtrování spotřebičů + multi-select v extrakci

## 1. Filtrování spotřebičů z výsledků AI extrakce

### Problém
AI extrahuje i spotřebiče (vestavná chladnička, myčka, trouba…), které nejsou atypický nábytek.

### Řešení
Dvě vrstvy:

**A) Prompt update** — do `CN_SYSTEM_PROMPT` v obou edge funkcích (`extract-tpv/index.ts` i `extract-tpv-from-sharepoint/index.ts`) přidat pravidlo:
```
- PŘESKOČ spotřebiče (vestavná chladnička, myčka, trouba, varná deska, digestoř, 
  pračka, sušička, mikrovlnka, lednice apod.) — pokud název obsahuje pouze typ 
  spotřebiče bez atypické nábytkové výroby, položku vynech.
```

**B) Frontend post-filter** — v `TPVExtractor.tsx` po extrakci odfiltrovat položky jejichž `nazev` matchuje regex spotřebičů a nemají v `popis` žádné nábytkové specifikace. Slouží jako safety net pro případ, že AI je přesto propustí.

### Soubory
- `supabase/functions/extract-tpv/index.ts` — prompt
- `supabase/functions/extract-tpv-from-sharepoint/index.ts` — prompt
- `src/components/assistant/TPVExtractor.tsx` — post-filter

---

## 2. Multi-select s checkboxy + Shift-click v review tabulce

### Problém
Nelze hromadně vybrat/smazat položky v review tabulce extrakce.

### Řešení
Přidat do review tabulky (fáze "done"):

- **Checkbox sloupec** — nový `<TableHead>` s "select all" checkboxem, každý řádek má checkbox
- **State**: `selectedIndices: Set<number>`, `lastClickedIndex: number | null`
- **Shift-click**: klik na checkbox + Shift vybere rozsah od `lastClickedIndex` do aktuálního
- **Hromadná akce**: toolbar nad tabulkou — "Odebrat vybrané (X)" tlačítko, viditelné jen při výběru
- **handleSave**: ukládá jen položky které nejsou odebrané (výběr je pro mazání, ne pro "save only selected")

### Soubory
- `src/components/assistant/TPVExtractor.tsx` — checkbox column, selection state, shift-click logic, bulk remove button

