
## Plán opravy drag/drop full bundle v Pláne Výroby

### Cieľ
Upravím správanie pri pretiahnutí celej položky alebo full bundlu medzi týždňami tak, aby bolo jasné a funkčné:

1. Keď pretiahneš full položku/bundle z T17 do T19 na rovnaký projekt a rovnakú etapu, kde už existuje full bundle, systém ponúkne voľbu:
   - vložiť do existujúceho bundlu a prevziať jeho označenie,
   - alebo presunúť ako nový samostatný bundle.
2. Drop priamo na existujúci full bundle bude skutočne fungovať aj medzi rôznymi týždňami.
3. Pri dragovaní sa bude zvýrazňovať konkrétny bundle, do ktorého je možné položku/bundle vložiť, nielen celý týždeň.
4. Keď vraciaš položku späť z T19 do pôvodného bundlu v T17, cieľový bundle sa vizuálne otvorí/zvýrazní ako platný drop target.

### Čo je teraz zle
Aktuálne je drop na konkrétny bundle povolený len pre full → full v tom istom týždni. Preto:

- pri presune T17 → T19 sa zvýrazní iba týždeň, nie konkrétny bundle,
- drop na bundle v inom týždni je zakázaný na úrovni UI,
- existujúca logika `mergeFullBundleIntoBundle` odmietne merge, ak zdroj a cieľ nie sú v rovnakom týždni,
- pri dropnutí na týždeň sa položka presunie bez toho, aby sa používateľ vedome rozhodol, či ju chce pridať do existujúceho bundlu alebo ponechať ako nový bundle.

### Implementácia

#### 1. Rozšíriť validáciu drop targetov
V `src/lib/productionBundles.ts` upravím `canAcceptBundleDrop`, aby podporovala aj cross-week full → full drop:

- rovnaký `project_id`,
- rovnaká `stage_id`,
- zdroj aj cieľ musia byť `bundle_type = full`,
- cieľ nesmie byť rovnaký bundle,
- split → full a full → split zostane zakázané.

Doplním parameter/variant, aby UI vedelo rozlíšiť:
- interné preskupenie v rovnakom týždni,
- vloženie do existujúceho bundlu v inom týždni.

#### 2. Povoliť drop na full bundle v inom týždni
V `src/components/production/WeeklySilos.tsx` upravím droppable logiku v `CollapsibleBundleCard`:

- full bundle bude droppable aj keď je v inom týždni,
- validné cieľové bundly dostanú jasný hover/highlight stav,
- pri `isBundleOver` sa karta vizuálne odlíši od obyčajného zvýraznenia týždňa,
- zvýraznenie sa nebude zobrazovať pre iný projekt, inú etapu, split bundle, dokončený/legacy/locked bundle.

Pridám jemný vizuálny signál typu:
- zeleno-oranžový outline,
- krátky text/indikátor „vložit do bundle A“ alebo podobný nenápadný hint,
- iba počas dragovania nad platným bundlom.

#### 3. Upraviť drop handling v `PlanVyroby`
V `src/pages/PlanVyroby.tsx` upravím `handleDragEnd` pre `targetId.startsWith("silo-bundle-drop-")`:

- nebude vyžadovať rovnaký týždeň,
- načíta cieľové dáta z `over.data.current`,
- pri full → full rovnaký projekt/etapa otvorí rozhodovací popover:
  - „Vložit do existujícího bundle A“
  - „Přesunout jako nový bundle“
- pri potvrdení merge zavolá presun + zmenu `bundle_label` na cieľový label,
- pri keep separate presunie položku/bundle do týždňa a pridelí/normalizuje samostatný full bundle label.

Tým sa vyrieši T17 → T19 aj T19 → T17 návrat do pôvodného bundlu.

#### 4. Rozšíriť `MergePopover`
V `src/components/production/MergePopover.tsx` doplním variant pre full bundle voľbu, aby texty nehovorili o split konflikte.

Nové texty budú napríklad:

- Nadpis: `Vložit do existujícího bundle A?`
- Primárna akcia: `Vložit do bundle A`
- Popis: `Položky převezmou označení tohoto bundlu`
- Sekundárna akcia: `Přesunout jako nový bundle`
- Popis: `Ponechá vlastní označení v cílovém týdnu`

Split merge popover zostane nezmenený.

#### 5. Upraviť backend mutácie v hooku
V `src/hooks/useProductionDragDrop.ts` upravím/pridám funkciu pre cross-week vloženie full bundlu:

- zdrojové `sourceIds` sa najprv presunú na cieľový týždeň,
- následne sa im nastaví `bundle_label` cieľového bundlu,
- `bundle_type` zostane `full`,
- `split_group_id`, `split_part`, `split_total` sa vyčistia,
- po zmene sa normalizujú full bundly v zdrojovom aj cieľovom týždni,
- undo/redo vráti pôvodný týždeň aj pôvodné bundle labely.

Pri voľbe „nový bundle“ sa použije samostatný label, nie label existujúceho cieľového bundlu.

#### 6. Zachovať existujúce pravidlá
Nezmením tieto ochrany:

- split položky sa nedajú vložiť do full bundlu,
- full položky sa nedajú vložiť do split bundlu,
- iný projekt sa nedá vložiť do bundlu,
- iná etapa sa nedá vložiť do bundlu,
- locked/past týždne a legacy/dokončené bundly ostanú chránené podľa súčasnej logiky,
- automatické zlučovanie full položiek v rovnakom týždni zostane zachované.

### Testovací scenár po úprave

Overím tieto prípady:

1. T17 full bundle → T19 existujúci full bundle rovnakého projektu:
   - cieľový bundle sa zvýrazní,
   - zobrazí sa popover,
   - „vložiť do existujúceho“ preberie label cieľa.
2. T17 full bundle → T19 rovnaký týždeň/projekt, ale voľba „nový bundle“:
   - položka sa presunie,
   - zostane samostatný full bundle label.
3. T19 full položka → pôvodný full bundle v T17:
   - pôvodný bundle sa zvýrazní ako drop target,
   - po potvrdení sa položka zaradí späť do neho.
4. full → split:
   - ostane zakázané.
5. split → full:
   - ostane zakázané.
6. iný projekt alebo iná etapa:
   - cieľový bundle sa nezvýrazní a drop sa nevykoná.
7. Build prejde bez TypeScript chýb.
