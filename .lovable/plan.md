
## Problém

V „Multisport (Z-2607-008)" si manuálne upravil rozdelenie hodín po týždňoch. Plán Výroby (silos) ukazuje hodiny správne, ale keď znovu otvoríš pravým klikom „Upravit rozdělení po týdnech", dialog zobrazí **31% / 32% / 31%** (rovnomerné rozloženie), namiesto skutočného aktuálneho pomeru hodín v DB.

## Root cause

V `EditBundleSplitDialog.tsx` bežia dva mechanizmy, ktoré spolu prepisujú správne iniciálne hodnoty:

1. **`useEffect` reinicializuje `percentages`** vždy, keď sa zmení referencia `rows` (parent rerender vytvorí nové pole pri každom volaní `.filter().map()` v context-menu / `scheduleData`). Tým aj korektne načítané iniciálne percentá môžu byť prepísané, alebo opakovane prepočítavané z neúplných údajov.
2. **`grandTotal` sa počíta zo všetkých rows vrátane zamknutých (T16 midflight ~33.9h)**, ale pri Save sa hodnoty alokujú **iba per `item_code`** medzi editovateľnými týždňami pomerom `pct/editablePctSum`. Lock týždeň (T16) neobsahuje rovnaké `item_code` ako AT.* položky → percento za T16 (~6%) sa pri uložení nepretaví späť do `scheduled_hours`, čo posúva pomery a po reopen sa znova nezhoduje s tým, čo používateľ videl.
3. Vyber `lastEditableKey = posledný v poli` znamená že T19 sa vždy automaticky prepočíta. Pri reopen môže `effectivePct` zatlačiť T19 na 31, kým originál v DB je iný (napr. 48).

Net efekt: iniciálne sa zobrazí distribúcia, ktorá nie je skutočné `scheduled_hours / SUM(scheduled_hours)` per týždeň, ale derivovaná hodnota ovplyvnená lock-week kalkulom a `lastEditable` prepisovačom.

## Fix

### 1) `src/components/production/EditBundleSplitDialog.tsx`

- **Iniciálne percentá počítaj len z editovateľných týždňov** (vyhoď zamknuté zo súčtu) tak, aby Σ editovateľných = 100 − percento_zamknutých, a percento zamknutých sa počíta separátne ako `lockedHours / grandTotal × 100` a je read-only.
- **Stabilizuj `useEffect` aby bežal len raz pri otvorení**, nie pri každom rerender parenta:
  - `useEffect(() => { ... }, [open, splitGroupId])` namiesto `[open, weekBuckets, grandTotal]`. `weekBuckets` referenciu nahradíme prečítaním cez `useRef` alebo deserialization JSON kľúča (`rows.map(r => r.id+r.scheduled_hours).join("|")`) ako dep.
- **`lastEditableKey` zostáva**, ale `effectivePct` sa použije iba pre validáciu/Save — **neprepisuje to čo užívateľ vidí pri otvorení**, iba pri jeho manipulácii so slidermi. Pri reopen ukáž skutočné percentá z DB exact (vrátane T19).
- **Pri Save použiť globálny pomer cez všetky weeks**, nie per-`item_code` `editablePctSum`. Konkrétne: pre každý editable row vypočítať `newH = totalCodeHours × (effectivePct[r.scheduled_week] / 100)` (proporčne k celku) a zaokrúhliť posledný row v každom code-group na zachovanie `totalCodeHours`. Tak sa `pct` reálne pretaví do hodín a po reopen sa zobrazí rovnako.
- **`Auto-rozložit rovnomerně` zostáva jediný spôsob ako prepísať distribúciu na rovnomernú** — bez automatických prepisov pri otvorení.

### 2) Drobnosti

- Pre lock týždeň (T16 midflight) sa percento len **vypočíta a zobrazí** (read-only), nezúčastňuje sa save logiky.
- Tooltip / label „auto — zbytek" pre `lastEditableKey` ostáva, ale jeho hodnota sa **inicializuje z DB** (nie z dopočtu), aby sa nerozhodili percentá hneď pri otvorení.

## Test scenár (Multisport Z-2607-008 po fixe)

- Otvorenie dialogu zobrazí: T16=6% (zamknuté), T17=14%, T18=32%, T19=48%.
- Posun T17 na 20% → T19 (auto) sa prepočíta na 42%, T18 ostáva 32%, T16 ostáva 6%, Σ=100.
- Save uloží proporčne `scheduled_hours` per AT.* code. Reopen ukáže 6/20/32/42 (zhodne so stavom).
- Auto-rozložit prerozdelí editovateľnú časť (94%) rovnomerne: T17=31, T18=31, T19=32.

## Files

- `src/components/production/EditBundleSplitDialog.tsx`
