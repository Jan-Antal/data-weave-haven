
Cieľ: zjednotiť logiku tak, aby sa projekt/bundle správal ako jeden naviazaný split naprieč rôznymi kódmi prvkov a aby prepočty v Recalculate aj Midflight korektne rešpektovali množstvo `pocet`.

1. Potvrdím a zavedem jednotnú definíciu splitu
- Split nebude viazaný na jeden `item_code`, ale na celý bundle projektu.
- Všetky súvisiace riadky budú zdieľať jedno `split_group_id`.
- `split_part/split_total` budú globálne poradie v celom bundle, nie lokálne 1/2 pre jednu položku.
- Pri ďalšom splitnutí sa celý chain prečísluje na `N+1`.

2. Opravím Midflight
- V `src/lib/midflightImportPlanVyroby.ts` ponechám projektový bundle split cez všetky pending inbox položky.
- Doplním, aby sa pri ďalších zásahoch držal jeden spoločný chain pre projekt.
- Skontrolujem, že výpočet podielu používa CZK vrátane `pocet` aj pre pending TPV.
- Zaokrúhľovanie ostane max na 1 desatinné miesto.

3. Opravím Recalculate
- V `src/lib/recalculateProductionHours.ts` upravím prepočet schedule/inbox tak, aby:
  - počítal hodnotu položiek konzistentne s `pocet`,
  - neprepisoval bundle split na per-item logiku,
  - vedel zachovať spoločný `split_group_id` a správne rozdeľovať hodiny v rámci celého chainu.
- Zrevidujem väzbu na `computePlanHours`, aby sa množstvo používalo rovnako vo všetkých vetvách.

4. Opravím samotné split operácie
- `src/components/production/SplitItemDialog.tsx`: namiesto resetu na `1/2` vložím novú časť do existujúceho chainu a následne prečíslujem všetky časti na `N+1`.
- `src/components/production/SplitBundleDialog.tsx`: split celého bundle bude robiť rovnaké percento na všetkých položkách, ale výsledok zapíše ako jeden naviazaný chain, nie sériu izolovaných 1/2 splitov.
- Prečíslovanie spravím cez spoločný helper, ktorý upraví všetky riadky v group.

5. Opravím všetky presuny, aby badge nezmizol
- V `src/hooks/useProductionDragDrop.ts`, `PlanVyrobyTableView.tsx`, prípadne return flow zachovám a prenesiem `split_group_id/split_part/split_total` pri:
  - Inbox → week silo
  - presunoch medzi týždňami
  - návrate späť do Inboxu
  - bundle move / merge / redo-undo
- Toto je hlavný dôvod, prečo badge v sile niekedy zmizne alebo ostane staré N/N.

6. Zjednotím vizuálnu prezentáciu
- Screenshot beriem ako referenciu správneho správania v Inboxe: header badge `5/10` a item badge `5/10 ... 10/10`.
- Weekly Silo už badge renderuje, takže opravím hlavne dáta; zároveň dorovnám zobrazenie, aby sa badge držal rovnako spoľahlivo aj po ďalšom splite.

7. Overenie po implementácii
- Otestujem scenár:
  - Midflight projekt s viacerými rôznymi `item_code`
  - presun Inbox → Silo
  - ďalší split jednej časti
  - kontrola, že všetky riadky majú spoločný chain a `split_total = N+1`
  - spustenie Recalculate
  - opätovná kontrola, že hodiny aj badge ostali konzistentné
- Špeciálne overím problémový projekt Z-2617-001.

Dotknuté súbory
- `src/lib/midflightImportPlanVyroby.ts`
- `src/lib/recalculateProductionHours.ts`
- `src/components/production/SplitItemDialog.tsx`
- `src/components/production/SplitBundleDialog.tsx`
- `src/hooks/useProductionDragDrop.ts`
- `src/components/production/PlanVyrobyTableView.tsx`

Výsledok po úprave
- Výpočet bude konzistentne brať do úvahy `pocet`.
- Split bude fungovať na celý bundle projektu, aj keď obsahuje rôzne kódy prvkov.
- Ďalší split navýši celý chain na `N+1`.
- Badge sa nestratí po presune do week sila a zostane správny aj po recalculate aj midflight.
