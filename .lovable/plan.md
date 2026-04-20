

## Diagnóza

V projekte Allianz vznikli tri samostatné, ale prepojené chyby v split chaine:

1. **Nový split na už splitnutom bundli začína od 1/2 namiesto pokračovania chainu**  
   `SplitBundleDialog.handleSplitBundle` (riadok 103) pri voľbe `groupIdFor` síce zachová existujúci `split_group_id`, ALE `renumberChain` v `splitChainHelpers.ts` **zoskupuje per `item_code`** (`chainKey`). Keď bundle obsahuje viacero rôznych `item_code` a každý má vlastnú dvojicu (1/2, 2/2), nový split ich opäť rozdelí len na 1/2 + 2/2 lokálne, namiesto toho aby sa nadviazalo na predošlý bundle chain (mal by byť 6/6, lebo predtým bolo 5/5). Bundle ako celok teda nemá spoločné číslovanie.

2. **Merge bundlu rozpadáva položky po prvkoch**  
   `mergeBundleSplitGroups` iteruje per `split_group_id` (ktorý je per item_code), takže merge sa vykoná zvlášť pre každý code. Ak má bundle 5 rôznych codeov, merge spraví 5 nezávislých zlúčení a UI zobrazí mess (rôzne /N na každom riadku).

3. **Drag-to-merge funguje len po jednotlivých položkách**  
   V `PlanVyroby.handleDragEnd` (riadok 650) sa pre `silo-bundle` drag detekuje merge len keď bundle obsahuje aspoň jednu položku so split siblingom v cieľovom týždni — ALE merge dialog následne zavolá `mergeBundleSplitGroups([sgId1, sgId2, ...])` s per-code groupami, takže výsledok je zase rozpadnutý po prvkoch. Vizuálne sa tak pre user-a javí, že drag merge "nefunguje" pre celý bundle a musí ťahať položku po položke.

Koreň všetkých troch problémov: **chain je definovaný per `item_code`, nie per bundle**. Užívateľ chce **bundle-level chain** — všetky položky bundlu zdieľajú jeden spoločný chain s jedným číslovaním (napr. celý bundle Multisport má 5/5 → po splite 6/6).

## Cieľ

Zaviesť **bundle-level chain** ako prvotriednu jednotku:

- Split bundlu pokračuje v existujúcom bundle chaine → ak bol bundle časť 5/5, nový split spraví 6/6 (a prečísluje predošlé na 1/6 … 5/6).
- Merge bundlu zlúči celý bundle ako jednu operáciu — všetky položky sa spoja s ich pármi v cieľovom týždni v jednom kroku.
- Drag celého bundlu na iný bundle (rovnaký projekt) ponúkne merge celého bundlu, nie po položkách.
- Per-item chain ostáva ako fallback len keď bundle obsahuje **iba jednu** položku v split chaine (legacy prípady).

## Implementácia

### 1. `src/lib/splitChainHelpers.ts` — bundle-aware chain

- Pridať novú funkciu `renumberBundleChain(splitGroupId)`:
  - Načíta všetky riadky chainu (rovnaká logika ako `fetchChainRows`).
  - **Zoskupí per `(project_id, scheduled_week)` namiesto per `item_code`** — každý unikátny týždeň = jedna „časť bundlu".
  - Zoradí týždne ASC podľa `scheduled_week`.
  - Pre každú položku v týždni nastaví rovnaké `split_part = idx + 1` a `split_total = počet_týždňov`. Všetky položky bundlu v jednom týždni tak zdieľajú rovnaké `N/M`.
- `renumberChain` zostáva pre legacy single-item chainy. `SplitBundleDialog` bude volať novú `renumberBundleChain`.

### 2. `src/components/production/SplitBundleDialog.tsx` — pokračovanie chainu

- Zmena `groupIdFor`: namiesto per-item `item.split_group_id || item.id` použiť **jeden zdieľaný `bundleGroupId`** pre celý bundle:
  - Ak ktorákoľvek položka už má `split_group_id` → použiť ho ako spoločný `bundleGroupId` (zachová sa väzba na predošlý bundle split).
  - Inak vygenerovať `crypto.randomUUID()` raz pre celý bundle.
- Po inserte všetkých nových rowov zavolať `renumberBundleChain(bundleGroupId)` jediný raz.
- Výsledok: bundle 5/5 → split → 1/6, 2/6, …, 5/6 (pôvodné týždne) + 6/6 (nový týždeň).

### 3. `src/hooks/useProductionDragDrop.ts` — bundle merge

- Nová funkcia `mergeBundleAcrossWeeks(bundleGroupId, sourceWeek, targetWeek)`:
  - Načíta všetky položky chainu v `sourceWeek` a v `targetWeek`.
  - Pre každý `item_code` zo source: nájdi pár v targete s rovnakým `item_code` → zlúč hodiny + CZK do target rowu, zmaž source row. Položky bez páru → presuň `scheduled_week` na target.
  - Po zlúčení zavolaj `renumberBundleChain(bundleGroupId)` → chain sa skráti o 1 týždeň.
- Existujúca `mergeBundleSplitGroups` sa nahradí volaním `mergeBundleAcrossWeeks`. Per-code `mergeSplitItems` zostáva pre legacy single-item merge.

### 4. `src/pages/PlanVyroby.tsx` — drag merge celého bundlu

- V `handleDragEnd` vetva `silo-bundle` (riadok 650):
  - Detekciu merge urobiť na úrovni **bundle chainu**: ak source bundle a target week obsahujú položky s rovnakým `split_group_id` (ktorýkoľvek bundle chain), ponúknuť merge celého bundlu.
  - `MergePopover.onMerge` zavolá nové `mergeBundleAcrossWeeks(bundleGroupId, sourceWeek, targetWeek)` namiesto `mergeBundleSplitGroups`.
  - `onKeepSeparate` zostáva `moveBundleToWeek(..., 'separate')`.
- Texty `MergePopover` upraviť: „Spojit celý bundle ({n} položek) do T{X}".

### 5. Edge cases

- **Bundle bez splitu (chain neexistuje)**: drag bundlu na week s rovnakým projektom → fallback na existujúce `moveBundleToWeek` s duplicate-key konfliktom (sloučit/oddělit).
- **Bundle s mixom split + nesplit položiek**: split-aware merge zlúči len chain položky, nesplit položky sa presunú/zlúčia bežne podľa item_code.
- **Cancelled / completed / paused riadky**: `renumberBundleChain` ich preskočí (rovnako ako súčasná logika).
- **Per-item dialog `SplitItemDialog`** ostáva nezmenený — single-item splity budú stále per-code chain (legacy správanie pre individuálne položky).

## Dotknuté súbory

- `src/lib/splitChainHelpers.ts` — pridať `renumberBundleChain`.
- `src/components/production/SplitBundleDialog.tsx` — zdieľaný `bundleGroupId` + nový renumber.
- `src/hooks/useProductionDragDrop.ts` — pridať `mergeBundleAcrossWeeks`, exportovať z hooku, upraviť `mergeBundleSplitGroups` aby delegovala (alebo nahradiť volania).
- `src/pages/PlanVyroby.tsx` — drag-end vetva `silo-bundle` použije bundle merge namiesto per-group merge.

## Výsledok

- **Multisport**: nový split splitnutého bundlu (5 týždňov) vytvorí 6/6, predošlé sa prečíslujú na 1/6…5/6 — všetky položky v každom týždni zdieľajú rovnaký badge.
- **Allianz merge mess**: merge celého bundlu sa vykoná ako jedna atómová operácia, nie 5 nezávislých per-code merges.
- **Drag-to-merge**: ťahanie celého bundlu ponúkne merge dialóg pre celý bundle; nie je potrebné ťahať po jednej položke.

