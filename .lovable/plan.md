

## Cieľ
Splity sú **per-item, ale synchronizované cez celý bundle**. Keď splitnem bundle na 2 časti, KAŽDÁ položka má `1/2` a `2/2` (nie globálne `1/6...6/6`). Historické midflight záznamy sa môžu počítať ako aktívne časti chainu, ale **nesmú sa zobrazovať v Inboxe**.

## Diagnóza súčasného stavu
1. `splitChainHelpers.renumberChain()` číta všetky riadky chainu naprieč item_codes a prečísluje ich globálne `1..N` → preto `5/10` namiesto `1/2`.
2. `SplitBundleDialog` priraďuje **jeden zdieľaný `split_group_id`** všetkým položkám bundle → zlieva TK.05+TK.07+TK.08 do jedného chainu.
3. Inbox panel filtruje len `status='pending'`, ale historické midflight inbox riadky (ak existujú) sa stále môžu objavovať.

## Správna definícia (per screenshot a popis)
- **Split chain = jeden item_code v rámci jedného projektu**, naprieč inbox + schedule (+ historické midflight).
- `split_part/split_total` = poradie a počet častí TEJ JEDNEJ položky.
- Bundle split = paralelne splitne každý item_code zvlášť, ale s rovnakým percentom a cieľovým týždňom.
- Inbox UI filtruje `status='pending' AND is_midflight IS NOT TRUE`.

## Plán zmien

### 1. `src/lib/splitChainHelpers.ts` — per-item chain
- `fetchChainRows(splitGroupId)` zostáva, ale výstup grupne podľa `item_code` (alebo `item_name` ak je `item_code` null).
- `renumberChain(splitGroupId)` prečísluje **každú item_code skupinu samostatne**: pre každý item_code spočíta riadky a nastaví `split_part=1..K, split_total=K`.
- Ak skupina pre daný item_code má len 1 riadok → vyčistí split metadata len pre tento item_code, ostatné nechá.
- Historické (`is_midflight=true` v `production_schedule`) sa **započítavajú** do `split_total`, aby badge ukazoval skutočný počet častí.

### 2. `src/components/production/SplitBundleDialog.tsx` — per-item group_id
- Namiesto jedného `sharedGroupId` pre všetky položky vygenerovať/zachovať **`split_group_id` per item_code** (každá položka má svoj chain).
- Po inserte volať `renumberChain(groupId)` pre každý item_code samostatne.
- Výsledok: TK.05 dostane `1/2, 2/2`, TK.07 dostane `1/2, 2/2`, TK.08 dostane `1/2, 2/2` — nezávisle.

### 3. `src/components/production/InboxPanel.tsx` — skryť historické
- V dotaze / filtri `production_inbox` pridať podmienku, ktorá vylúči midflight historické záznamy. (V aktuálnej schéme `production_inbox` nemá `is_midflight`, takže historické patria len do `production_schedule` — overím že Inbox číta výhradne `production_inbox` a žiadne `is_midflight` sa do panelu nedostane. Ak áno, filter doplním.)

### 4. `src/lib/midflightImportPlanVyroby.ts`
- Pri reconciliation a renumberovaní volať `renumberChain` per item_code (helper to už bude robiť automaticky).
- Žiadne zlievanie naprieč item_codes.

### 5. `src/lib/recalculateProductionHours.ts`
- Po prepočte volať `renumberAllChainsForProject` (ktorý interne použije nový per-item helper).

### 6. `src/components/production/SplitItemDialog.tsx` a `AutoSplitPopover.tsx`
- Už pracujú s jedným item_code → stačí, že `renumberChain` sa správa per-item. Žiadna zmena logiky.

### 7. `src/hooks/useProductionDragDrop.ts`
- Zachovanie `split_group_id` pri presunoch ostáva. Renumber po presune ostáva (per-item logika vyrieši zvyšok).

## Očakávaný výsledok pre Z-2617-001
- TK.01 ... TK.06 každá položka sama: `1/1` (žiadny split badge), prípadne `1/2, 2/2` keď ju užívateľ rozdelí.
- Pri bundle splite na 50%: TK.01 `1/2 + 2/2`, TK.02 `1/2 + 2/2`, ..., TK.06 `1/2 + 2/2`.
- Historické 4 midflight týždne ostanú vo Weekly Silos viditeľné, ale **nezobrazia sa v Inboxe**.
- Ak historické patria k tomu istému item_code ako aktívna inbox položka, započítajú sa do `split_total` (napr. `3/3` keď sú 2 historické + 1 aktívna).

## Dotknuté súbory
- `src/lib/splitChainHelpers.ts` (kľúčová zmena)
- `src/components/production/SplitBundleDialog.tsx`
- `src/components/production/InboxPanel.tsx` (filter ak treba)

## Overenie
Po nasadení: midflight import → split bundle 50% → kontrola, že každý item_code má `1/2, 2/2` nezávisle a Inbox neobsahuje historické záznamy.

