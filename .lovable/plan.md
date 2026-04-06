

# Zjednodušení tlačítek v TPV List

## Současný stav

V TPV List header je 3 relevantních tlačítek:
1. **"Import z Excelu"** — wizard pro manuální import z libovolného XLSX/TSV
2. **"Nahrát cenovou nabídku"** — AI extrakce z CN dokumentu (SharePoint/upload)
3. **"Kontrola CN"** — manuální spuštění porovnání CN vs. aktuální TPV

Problém: "Kontrola CN" je zbytečný manuální button — porovnání má běžet automaticky na pozadí. A název "Nahrát cenovou nabídku" neodpovídá přesně tomu, co tlačítko dělá.

## Plán změn

### 1. Přejmenovat "Nahrát cenovou nabídku" → "Načíst z CN"
Kratší, výstižnější — tlačítko extrahuje položky z cenové nabídky do TPV seznamu.

### 2. Odstranit tlačítko "Kontrola CN"
Nahradit automatickým porovnáním na pozadí:
- Přidat `useEffect` v `TPVList.tsx`, který zavolá `checkCN()` automaticky při otevření TPV Listu (po načtení items)
- Pokud jsou nalezeny rozdíly, zobrazí se **warning badge** (ikona `AlertTriangle` s počtem) vedle názvu projektu v headeru — bez tlačítka
- Klik na badge otevře stávající `CNDiffDialog`

### 3. Warning badge místo tlačítka
Když `hasDifferences === true`:
- Zobrazit malý `AlertTriangle` badge s číslem (např. "3") vedle project name v headeru
- Tooltip: "CN byla změněna — kliknutím zobrazíte rozdíly"
- Klik → otevře `CNDiffDialog`

Když probíhá kontrola (`isChecking`): malý spinner vedle názvu (nenápadný).

Když žádné rozdíly: nic se nezobrazuje.

## Soubory k úpravě

1. **`src/components/TPVList.tsx`**
   - Přejmenovat button text "Nahrát cenovou nabídku" → "Načíst z CN"
   - Odstranit celý block "Kontrola CN" buttonu (řádky 748-775)
   - Přidat `useEffect` pro auto-`checkCN()` po načtení items
   - Přidat warning badge vedle project name v headeru

2. **`src/hooks/useCNDiff.ts`** — beze změn (logika zůstává)

3. **`src/components/CNDiffDialog.tsx`** — beze změn

## Výsledek

Místo 3 tlačítek budou **2 tlačítka** + **automatický warning**:
- "Import z Excelu" (zachováno)
- "Načíst z CN" (přejmenováno)
- Warning badge se zobrazí automaticky pokud CN nesedí s TPV

