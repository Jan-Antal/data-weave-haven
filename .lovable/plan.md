# Výroba — bundle karty v sidebare (pragmaticky)

`production_daily_logs.bundle_id` = `${projectId}::${weekKey}` (projekt-level per týždeň). Daily log NIE JE per-bundle. Detail panel + slider + log akcie musia ostať projekt-level (inak by sme rozbili DB model).

## Scope (len `src/pages/Vyroba.tsx`)

1. **Sidebar = bundle karty** (1 karta = 1 bundle, label „Allianz A-4", „Allianz B").
2. **Klik na kartu** → vyberie projekt karty; ak má projekt viac bundles v týždni, všetky karty toho projektu sú „selected" (rovnaký projectId), detail panel ukáže projekt ako celok (rovnako ako dnes).
3. **Spillover**: zrušiť merge spilled bundles do projekt-karty. Spilled bundle = vlastná karta. Dedup `bundleKey` per `splitGroupId` (ak existuje), inak per `stage_id+bundle_label` (zhodne s Dílňou).
4. **Header count** = počet bundle-kariet, nie projektov.
5. **Sort**: completed last, paused last, spilled first, potom podľa `projectId` aby bundles toho istého projektu boli vedľa seba.

## Karta (vizuálne)

Použiť `formatBundleDisplayLabel` z `productionBundles` na vyrobenie suffixu („A-4", „B"). Pridať za názov projektu.

## Validácia (T18)

- Přelité (4): Insia A-4, Insia B, Příluky A-5, Allianz B
- Plán (4): RD A-13, Multisport A-3, Reklamace, Allianz A-6
- Header „Plán T18 (4)" sedí
