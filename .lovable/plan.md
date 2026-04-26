# Vyroba T18 nesedí s Dílňou — opravy

Po vizuálnom porovnaní vidím tri rozpory medzi modulom **Výroba** a **Dílňou** v T18:

| | Dílňa T18 (správne) | Výroba T18 (teraz) |
|---|---|---|
| Přelité | Insia A-4, Příluky A-5 | Insia A-4, Příluky A-5 ✅ |
| Plán | RD Cigánkovi A-13, Multisport A-3, Reklamace Bar terasa A, Allianz A-6 (4 karty) | RD Cigánkovi, Multisport, **Insia A-4 (duplikát)**, **Allianz 5.patro A-5 (CNC, 60%)**, Reklamace Bar terasa, Allianz A-6 (6 kariet) |
| Header | „PLÁN T18 (4)" | hovorí (4), zobrazuje 6 ❌ |

---

## Bug 1 — Duplikát Insia A-4 (v Prelitých aj v Pláne)

**Príčina:** `bundleKey` v dedup logike (`Vyroba.tsx` r. 649-650) zahŕňa `split_part`. Insia A-4 má v T17 jeden split_part a v T18 iný split_part (split chain pokračuje). `bundleKey` v T17 ≠ `bundleKey` v T18, takže `destBundleKeys.has(...)` (r. 657) vráti `false` → spilled entry sa pridá do T18 napriek tomu, že tam už **iný part toho istého split_group** existuje v pláne.

**Fix:** Dedup kľúč pre spillover má byť **per split_group_id** (ak existuje), nie per `split_part`. Ak `split_group_id` existuje, použiť ho; inak fallback na `stage_id + bundle_label`.

```ts
// nový bundleKey pre dedup (riadky 649-650 a obdobne 220-223)
const bundleKey = (b) => 
  b.split_group_id 
    ? `${b.project_id}::SPLIT::${b.split_group_id}` 
    : `${b.project_id}::${b.stage_id ?? "none"}::${b.bundle_label ?? "A"}`;
```

To zabezpečí, že akýkoľvek part split chainu v T+1 zablokuje spillover ostatných parts toho istého chainu z T.

## Bug 2 — Allianz 5.patro A-5 (60% CNC) v pláne T18

V Dílni nie je. To znamená, že buď v `production_schedule` reálne existuje riadok pre Allianz Z-2617-001 v T18 s bundle_label A-5 (a Dílňa ho z nejakého dôvodu odfiltruje), alebo v T18 nie je a Vyroba ho falošne pridáva.

**Akcia pred fixom:** Spustiť `supabase--read_query`:
```sql
SELECT id, item_code, item_name, scheduled_week, bundle_label, split_part, split_group_id, status, scheduled_hours, is_midflight
FROM production_schedule 
WHERE project_id = 'Z-2617-001' 
ORDER BY scheduled_week, bundle_label;
```

Hypotéza A: existuje midflight legacy riadok v T18 → fix: vylúčiť `is_midflight=true` aj z **current-week silo** loop (r. 611-634), nielen zo spillover loopu. Aktuálne current-week silo neignoruje midflight riadky.

Hypotéza B: existuje reálny scheduled riadok v T18 ale je `cancelled`/`completed`/`expedice` → fix: filter v r. 612-621 už pokrýva `scheduled`/`in_progress`/`paused`/`isItemDone`. Ak Allianz 5.patro je `completed`, mal by sa zobraziť ako done (nie ako 60% Pozadu). Treba over.

Hypotéza C: Vyrobu pridáva projekt 2× pretože A-5 má dva bundle_labels rovnakého stage_id (napr. CNC pre dve etapy). Vtedy current-week loop emituje dva entries pre rovnaký project_id (jeden správny A-6, jeden „starý" A-5).

Po dotaze na DB sa rozhodneme medzi A/B/C — riešenie je jeden riadkový filter v `silo.bundles` loope.

## Bug 3 — Header count „(4)" ale 6 kariet v sekcii Plán

`spilledProjects` (r. 1832) = `isSpilled === true`. `normalProjects` = `isSpilled === false`. Project s mergeovaným spilled bundle (Insia A-4) má `isSpilled=false, hasSpilledItems=true` → padne do `normalProjects` → zobrazí sa v sekcii Plán **navyše** k Prelitým.

**Fix:** Project s `hasSpilledItems === true` a **bez vlastných current-week items** (čo môže nastať len ak je čisto spillover-only — to ale potom má `isSpilled=true`) … Vlastne Insia A-4 má v T18 aj vlastné current-week items (pôvodný plán A-4 split chain pokračovanie), preto je v `silo.bundles` zaradený ako normal. To vlastne potvrdzuje **Bug 1**: ide o split chain pokračovanie, ktoré sa správne objaví v Pláne, a spillover ho nemá ešte raz pridávať. Po fixe Bug 1 zmizne aj duplikát z Plánu? Nie — v Pláne je legitímne (chain pokračuje), v Prelitých zmizne. To by výsledne dalo Plán = 5 kariet (RD, Multisport, **Insia A-4 = legit chain pokračovanie**, Reklamace, Allianz A-6) a Přelité = 1 (len Příluky).

**Ale Dílňa hovorí Prelité = 2 (Insia A-4, Příluky), Plán = 4 (bez Insia A-4).** To znamená že Dílňa Insia A-4 v T18 **nepovažuje za nový plán**, len za pokračovanie spilled chainu z T17. Vyroba s tým nesúhlasí, lebo pre ňu je každý scheduled row v T18 = T18 plan.

**Rozhodnutie potrebné od usera (otázka v pláne):** ktorá interpretácia je správna pre Insia A-4?
- (a) **Dílňa má pravdu** → ak split chain pokračuje a predchádzajúci part nie je dokončený, celý chain sa „spája" do Prelitých (t.j. T18 part Insia A-4 prejde do sekcie Přelité spolu s T17 časťou). Vtedy v Pláne T18 = 4 karty, v Prelitých sa Insia A-4 ukáže ako jeden bundle so súčtom hodín T17+T18.
- (b) **Vyroba má pravdu** → T18 part Insia A-4 je legit Plán T18 (chain pokračuje podľa plánu), T17 part sa nepreleje (lebo je súčasťou plánovaného chainu). Vtedy Dílňa zobrazuje zle.

Z predošlých interakcií („Insia A-4 ma byť v Prelitých v T18") je správny variant **(a)**.

**Fix pre variant (a):**
1. Spillover loop musí pridávať do Přelité aj split chain parts, ktoré v T+1 majú vlastný plánovaný riadok — ale **odstrániť ich z current-week silo zoznamu** (zmergovať T17 hodiny + T18 hodiny do jednej spilled karty).
2. Dedup logikou per `split_group_id` (Bug 1) odfiltrovať T18 plánovanú časť z `result` ak existuje T17 spilled časť toho istého chainu.

## Bug 4 — Goal-aware filter v Vyrobe (kontrola)

WeeklySilos a Dílňa už majú: skip spillover ak `realWeekLatestPct >= bundleTarget`. Vyroba (r. 656-664) **nie**. Ak Insia A-4 daylog T17 = 98% a chain window T17 končí napr. 95%, mal by sa nepreliať. Predošlé fixy v Dílne pridali tento filter, vo Vyrobe chýba.

**Fix:** Načítať daylog pre real T (už je dostupný cez `pagerWk0…wk4`, alebo `allLatestLogs`) a doplniť rovnakú podmienku. Pre full bundle target=100, pre split bundle = `chainWindowBySplitGroup.end`.

Logicky to ale Insia A-4 nezachráni (98% ≥ 95%? áno → nepreleje sa) — to by však bolo v rozpore s Dílňou (kde Insia A-4 v Prelitých JE). Možno chain window pre Insia A-4 v T17 končí na 100% (lebo to je posledný/predposledný kus chainu cez celý projekt) → 98 < 100 → preleje. Treba spočítať konkrétne `chainWindow` pre Insia split_group_id pri T17.

---

## Plán implementácie

1. **Diagnostika dát** (read_query):
   - Allianz Z-2617-001 schedule rows naprieč týždňami (Bug 2, hypotézy A/B/C).
   - Insia Z-2605-001 schedule rows + split_group_ids + statuses (overiť Bug 1 a chain window).
   - Daylog T17 pre Insia + Allianz (overiť goal-aware výpočet).

2. **`src/pages/Vyroba.tsx`** opravy:
   - Riadok 649-650 (a duplikát ~220): zmeniť `bundleKey` dedup na **per split_group_id** ak existuje (Bug 1).
   - Riadok 656-664: pridať goal-aware filter (Bug 4) — porovnať `latestPct(realWeek, project)` s `bundleTarget` (full=100, split=chain window end pre konkrétny split_group_id).
   - Riadok 611-634: vylúčiť T+1 plánovaný riadok zo `silo.bundles` zoznamu, ak ten istý `split_group_id` ide do Prelitých (Bug 3, variant a). Reálne: po vybudovaní spilled-result kolekcie urobiť druhý prechod a zo `result` odstrániť normal entries, ktorých split_group_id je už pokrytý spilled entry — alebo už pri current-week loope skip ak `splitGroupExistsInSpilled`.
   - Riadok 611 (current-week silo loop): vylúčiť `is_midflight=true` items aj tu (Bug 2, hypotéza A).

3. **Vizuálne over po fixe** (browser): Vyroba T18 musí zobraziť presne to, čo Dílňa T18 — Přelité (2: Insia A-4, Příluky), Plán (4: RD Cigánkovi, Multisport, Reklamace, Allianz A-6).

---

## Otvorená otázka pre teba

Pre **Bug 3 / Insia A-4 split chain pokračovanie** — Dílňa Insia A-4 zobrazuje len v Prelitých (jedna karta, sumárne hodiny). Vyroba má robiť rovnako (variant a)? Alebo má každý split part v každom týždni zostať samostatnou kartou (variant b)? Z toho čo si písal predtým = **variant a**, idem s tým, ak nepovieš inak.
