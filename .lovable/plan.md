
Cieľ: opravím dve konkrétne chyby v Pláne Výroby:
1. v sile bude vždy existovať reálny spodný drop priestor aspoň na výšku jedného bundlu, aby sa dala položka vytiahnuť z existujúceho bundlu a pustiť „mimo“ na vytvorenie nového bundlu v tom istom týždni,
2. pôjde vložiť aj jednu celú položku priamo do existujúceho bundlu (nie len celý bundle), vrátane scenára Z-2617-001 → T.23-A → bundle D v T19.

Čo je teraz zle
- V `WeeklySilos.tsx` dnes na konci zoznamu bundlov chýba trvalý spacer/drop slot, takže keď je týždeň plný, scroll už nedovolí dostať sa na „voľné miesto“ pre nový bundle.
- Bundle drop target dnes reaguje iba na `activeDrag.type === "silo-bundle"`. Jednotlivá položka (`silo-item`) sa preto nedá zvýrazniť ani vložiť do existujúceho bundlu.
- V `PlanVyroby.tsx` je logika pre `silo-bundle-drop-*` iba pre celý bundle. Jednotlivá položka tam nemá vlastnú vetvu.
- Pri `silo-item` je navyše same-week drop prakticky zablokovaný podmienkou `if (dragData.type === "silo-item" && dragData.weekDate === weekDate) return;`, takže položku nemožno v tom istom týždni ani vyňať do nového bundlu.

Implementácia

1. Spodný „nový bundle“ priestor v sile
- Do `src/components/production/WeeklySilos.tsx` doplním na koniec obsahu každého týždňa samostatný spacer/drop slot.
- Tento slot bude:
  - súčasť layoutu stále, nie len pri hoveri,
  - mať minimálnu výšku približne jedného bundlu,
  - byť započítaný do scroll výšky,
  - pri dragovaní sa jemne zvýrazní textom typu „Nový bundle“.
- Tým vznikne reálny priestor na drop aj keď je týždeň vizuálne úplne plný.

2. Povoliť drop celej položky do existujúceho bundlu
- V `src/components/production/WeeklySilos.tsx` rozšírim bundle target validáciu tak, aby vedela pracovať aj s `silo-item`, nie iba `silo-bundle`.
- `DraggableSiloItem` doplním o bundle metadata v drag dátach:
  - `bundleKey`
  - `bundleLabel`
  - `bundleType`
  - prípadne informáciu, či ide o full/split kontext
- Bundle karta potom správne zvýrazní cieľ aj pri ťahaní jednej položky.

3. Rozlíšiť 3 typy dropu pre jednu položku
V `src/pages/PlanVyroby.tsx` upravím `handleDragEnd`, aby pre `silo-item` rozlišoval:
- drop na existujúci bundle:
  - položka sa vloží do cieľového bundlu,
  - prevezme jeho `bundle_label`,
  - pri cross-week sa zároveň zmení `scheduled_week`,
- drop na spodný week spacer:
  - ak je to ten istý týždeň, položka sa vyjme z pôvodného bundlu a vytvorí nový full bundle s novým labelom,
  - ak je to iný týždeň, presunie sa ako nový bundle do cieľového týždňa,
- drop späť na obyčajný week target bez konkrétneho bundlu:
  - zachová sa existujúce správanie pre klasický presun.

4. Doplniť item-level mutácie v drag/drop hooku
V `src/hooks/useProductionDragDrop.ts` doplním samostatné operácie pre jednu položku:
- `moveScheduleItemIntoBundle(itemId, targetBundleItemIds)`
- `moveScheduleItemAsNewBundle(itemId, targetWeekDate)`
Tieto mutácie:
- nastavia správny `scheduled_week`,
- prepíšu `bundle_label` na cieľový alebo nový label,
- ponechajú `bundle_type = full`,
- vyčistia split meta pri full presune,
- zavolajú normalizáciu pre zdrojový aj cieľový týždeň,
- zachovajú undo/redo.

5. Zachovať ochrany
Nezmením existujúce pravidlá:
- split položka sa nesmie vložiť do full bundlu,
- full položka sa nesmie vložiť do split bundlu,
- iný projekt alebo iná etapa sa nesmie spojiť,
- locked/past týždne a legacy/dokončené karty ostanú chránené.

6. Drobné stabilizačné opravy pri dnd
- Popri tom opravím ref warningy z konzoly v `WeeklySilos.tsx` a `DragOverlayContent.tsx`, aby drag targety a overlay fungovali čistejšie bez React warningov.
- Toto nie je hlavná funkčná chyba, ale je to dobré spraviť spolu, lebo sa to týka rovnakého dnd render stromu.

Technické detaily
- `src/components/production/WeeklySilos.tsx`
  - pridať permanentný end spacer do scroll oblasti,
  - rozšíriť `canDropActiveBundle` aj pre `silo-item`,
  - posielať bundle kontext z `DraggableSiloItem`.
- `src/pages/PlanVyroby.tsx`
  - pridať vetvu pre `dragData.type === "silo-item"` + `targetId.startsWith("silo-bundle-drop-")`,
  - odstrániť slepý early return pre same-week item drop tam, kde má vzniknúť nový bundle.
- `src/hooks/useProductionDragDrop.ts`
  - pridať item-level bundle assignment mutácie,
  - normalizovať source/target týždne po presune.
- `src/lib/productionBundles.ts`
  - ak bude treba, doplním helper pre validáciu item→bundle dropu, aby sa používala rovnaká full/split/stage/project logika ako pri bundle→bundle.

Overenie po implementácii
1. V plnom týždni bude možné doscrollovať na spodný drop priestor.
2. Pretiahnutie jednej položky mimo existujúci bundle v tom istom týždni vytvorí nový bundle.
3. Pretiahnutie jednej full položky do existujúceho full bundlu ju reálne vloží do jeho označenia.
4. Otestujem konkrétne:
   - projekt `Z-2617-001`
   - položka `T.23-A`
   - drop do bundlu `D` v `T19`
   - cieľový bundle sa zvýrazní a položka sa po dropnutí zaradí do `D`.
5. Split/full ochrany ostanú zachované.
6. Build prejde bez TypeScript chýb a bez aktuálnych ref warningov pre dotknuté dnd komponenty.
