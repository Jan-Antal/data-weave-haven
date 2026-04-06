

# Oprava CN kontroly — trigger jen po uploadu + lepší warning banner

## Problémy

1. **Auto-check běží vždy** — `useEffect` spouští `checkCN()` při každém otevření TPV Listu. Má běžet **jen po nahrání souboru do složky "Cenová nabídka"**.
2. **Warning badge je malý** — jen číslo vedle názvu projektu. Má být větší banner s popisem, umístěný vlevo vedle tlačítek (Import/Načíst z CN).
3. **Warning zmizí po zavření dialogu** — `onClose` volá `clearCNDiff()`, takže po zavření bez aplikování změn se warning smaže. Má zůstat dokud uživatel nepotvrdí změny nebo neklikne "Ignorovat".

## Změny

### 1. `src/components/TPVList.tsx`

**Odstranit auto-check `useEffect`** (řádky 125-131) — žádné automatické spuštění na mount.

**Trigger CN check jen po uploadu do "cenová nabídka"**:
- Po úspěšné extrakci přes TPVExtractor (řádek 1274) — zachovat stávající `setTimeout(() => checkCN(), 1500)`
- Přidat nový trigger: poslouchat custom event `cn-file-uploaded` (dispatch z ProjectDetailDialog po uploadu do `cenova_nabidka`)
- `useEffect` s event listener na `cn-file-uploaded` → zavolá `checkCN()`

**Warning banner místo malého badge** (řádky 725-741):
- Nahradit malý `button` za plný řádek warning banner pod toolbarem
- Žluto-oranžový pruh s ikonou `AlertTriangle`, textem "Cenová nabídka byla změněna — nalezeno X rozdílů oproti TPV seznamu", a dvěma tlačítky: "Zobrazit změny" (otevře dialog) + "Ignorovat" (clearCNDiff)
- Banner se zobrazuje jen když `cnHasDiff === true`

**Fix zavření dialogu** (řádky 1283-1285):
- `onClose` pouze zavře dialog (`setCnDiffOpen(false)`) — **nemazat** diff data
- Diff data se smažou jen po:
  - Úspěšném aplikování změn (v `CNDiffDialog` po apply)
  - Kliknutí na "Ignorovat" v warning banneru

### 2. `src/components/ProjectDetailDialog.tsx`

**Dispatch event po uploadu do cenová nabídka**:
- Po úspěšném `uploadFile` kde `categoryKey === "cenova_nabidka"`:
  ```typescript
  window.dispatchEvent(new CustomEvent("cn-file-uploaded", { detail: { projectId } }));
  ```
- Přidat na oba upload paths (normal + chunked, řádky ~464 a ~474)

### 3. `src/components/mobile/MobileDetailProjektSheet.tsx`

**Stejný dispatch** pro upload do `cenova_nabidka` v mobilním detail sheetu (řádek ~559).

### 4. `src/components/CNDiffDialog.tsx`

**Přidat `onApplied` callback**:
- Po úspěšném apply (řádek ~95 po `onClose()`), zavolat nový prop `onApplied?.()` který vyčistí diff data v rodiči

## Výsledný UX

- Otevřu TPV List → žádná automatická kontrola, žádný spinner
- Nahraju CN soubor v detailu projektu → na pozadí se spustí porovnání
- Pokud jsou rozdíly → pod toolbarem se zobrazí oranžový banner: "⚠ Cenová nabídka byla změněna — nalezeno 5 rozdílů | [Zobrazit změny] [Ignorovat]"
- Kliknu "Zobrazit změny" → otevře se CNDiffDialog
- Zavřu dialog bez akce → banner zůstává
- Aplikuji změny → banner zmizí
- Kliknu "Ignorovat" → banner zmizí

