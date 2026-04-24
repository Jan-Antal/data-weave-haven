## Plán: Multisport Z-2607-008 + Split editor + Context menu fix

### Diagnostika — prečo je Multisport rozliaty na 4 časti

Aktuálny stav v DB pre `Z-2607-008` (status != cancelled):

```text
T16 (2026-04-13) · split_part 1/4 · 33.9h   (1 položka, midflight history)
T17 (2026-04-20) · split_part 2/4 · 181.4h  (29 položiek)
T18 (2026-04-27) · split_part 3/4 · 185.0h  (33 položiek)
T19 (2026-05-04) · split_part 4/4 · 185.0h  (33 položiek)
```

Príčina prepočtu na „tretiny" (resp. teraz štvrtiny):

1. Pôvodne bol bundle rozdelený na 2 časti (T16 midflight = 1/2, zvyšok 2/2 v jednom týždni).
2. Niekto rozdelil aktívnu časť ďalej cez `SplitBundleDialog` na T17 / T18 / T19 — vznikol reťazec 1/4 .. 4/4 zdieľajúci `split_group_id = a5804482-…`.
3. `Přepočítat` (`recalculateProductionHours.ts`, riadok 282–294 + 343–346) potom rozráta každú TPV položku rovnomerne podľa počtu **aktívnych častí v reťazci na tej istej TPV položke**:

```text
correctHours = (tpvFullHours * remainingScale) / partsCount
partsCount   = počet aktívnych ne-midflight rows s rovnakým item_code
```

Pre AT.* položky je `partsCount = 3` (T17 + T18 + T19), takže každá položka v každom týždni dostane presne tretinu plánovaných hodín. To je **správanie podľa návrhu** — recalculate len obnoví proporcie podľa toho, ako je bundle aktuálne rozsplitovaný.

Preto „nič sa nepokazilo prepočtom" — prepočet len presne dorovnal hodiny podľa existujúceho rozdelenia 1/4 + 2/4 + 3/4 + 4/4. Pôvodné nerovnomerné rozliatie pred prepočtom znamenalo, že niektoré splity boli vytvorené ručne s inými hodinami a recalculate ich sjednotil.

**Nápravná akcia pre konkrétny projekt:** používateľ si v novom Split editore (krok 2) nastaví požadované percentá pre T17/T18/T19 a uloží — recalculate to už ďalej nezmení, pretože nové uložené hodiny budú znova autoritatívne pre rozpočet (split_group ratios sa zachovávajú).

---

### 1. Nový dialóg „Upraviť rozdelení po týždnoch"

**Nový súbor:** `src/components/production/EditBundleSplitDialog.tsx`

Otvára sa cez pravý klik na bundle, ktorý má `split_group_id` rozložený do 2+ týždňov (alebo zo `SplitBundleDialog` cez tlačidlo „Pokročilá úprava").

UI:

```text
┌ Upravit rozdělení po týdnech ─────────┐
│ Multisport — bundle A                  │
│ Celkem: 551.4h · 4 týdny               │
├────────────────────────────────────────┤
│ T16 · 13.4. (historie, zamknuto)  6%   │
│ T17 · 20.4.    [====slider====] 33%    │
│ T18 · 27.4.    [====slider====] 33%    │
│ T19 · 4.5.     [====slider====] 34%    │
├────────────────────────────────────────┤
│ Σ = 100% ✓        [Zrušit] [Uložit]   │
└────────────────────────────────────────┘
```

Pravidlá:

- Každý budúci týždeň reťazca (rovnaký `split_group_id`) má slider 0–100 % so step 1 %.
- Týždne so statusom `completed`, `expedice` alebo s `is_midflight = true` sa zobrazujú ako read-only riadok s aktuálnym percentom (ich podiel je zafixovaný).
- Súčet všetkých percent (vrátane zamknutých) musí byť **presne 100 %**, inak je tlačidlo „Uložit" disabled a pod sliderom svieti červený text `Součet musí být 100 % (aktuálně: 97 %)`.
- Tlačidlo „Auto-rozložit rovnoměrně" doplní zostávajúce percentá rovnomerne medzi editovateľné týždne.

Persistencia (`handleSave`):

1. Načíta všetky aktívne rows reťazca (`split_group_id = X`, status not in completed/expedice/cancelled, is_midflight = false), zoskupí podľa `item_code`.
2. Pre každý `item_code` vypočíta `totalCodeHours = sum(scheduled_hours)` a `totalCodeCzk = sum(scheduled_czk)`.
3. Pre každý budúci editovateľný týždeň prepíše `scheduled_hours = round(totalCodeHours * pct/100, 1)` a `scheduled_czk = floor(totalCodeCzk * pct/100)`. Zaokrúhlený zvyšok pridá do posledného týždňa.
4. UPDATE `production_schedule` jedným multi-row payloadom + push undo entry (`update`, queryKeys ako v `useProductionDragDrop`).
5. Invaliduje `production-schedule`, `production-progress`, `production-statuses`, `production-expedice`.

Toast: `↻ Rozdělení uloženo: 33 % / 33 % / 34 %`.

---

### 2. Context menu — pridať „⚙ Upravit rozdělení po týdnech"

**Súbor:** `src/components/production/WeeklySilos.tsx` (riadky ~668–685)
**Súbor:** `src/components/production/PlanVyrobyTableView.tsx` (riadky ~1030–1040)

Akcia sa pridá hneď za „Rozdělit bundle":

```text
✂ Rozdělit bundle (N)
⚙ Upravit rozdělení po týdnech     ← NOVÉ
🔗 Spojit části (N skupin)         ← podmienka opravená (viď bod 3)
```

Akcia je viditeľná iba ak bundle obsahuje aspoň jednu položku so `split_group_id` a tento `split_group_id` má v projekte **viac ako 1 týždeň** (zistí sa cez existujúci `scheduleData` — spočíta unikátne `scheduled_week` pre daný `split_group_id` naprieč všetkými týždňami).

Klik otvorí `EditBundleSplitDialog` s naloadovanými týždňami zo všetkých rows daného reťazca.

---

### 3. Oprava „Spojit části (N skupin)"

**Súbor:** `src/components/production/WeeklySilos.tsx` (riadok 674–685)
**Súbor:** `src/components/production/PlanVyrobyTableView.tsx` (riadok 1036–1039)

Aktuálna podmienka (zjednodušene):

```ts
mergeableSplitGroups = splitGroupIds.filter(sgId =>
  bundle.items.filter(i => i.split_group_id === sgId && active).length >= 2
);
```

Problém: počíta súrodencov v rámci **jedného týždňa**. Ak v týždni je pre split_group iba 1 row (zvyšok je v iných týždňoch), filter správne vráti 0 a akcia sa nezobrazí — to je OK. Ale pri „celý bundle dokončený v jednom týždni" sa zobrazuje aj keď nie je čo spájať s iným týždňom.

Nová podmienka — porovnať s celým projektovým reťazcom:

```ts
mergeableSplitGroups = Array.from(splitGroupIds).filter(sgId => {
  // Spočítať VŠETKY aktívne riadky v projekte s rovnakým split_group_id,
  // nie len v aktuálnom týždni.
  const totalActiveInChain = scheduleData /* všetky weeks */
    .flatMap(w => w.bundles)
    .flatMap(b => b.items)
    .filter(i => i.split_group_id === sgId
      && i.status !== "expedice"
      && i.status !== "completed"
      && i.status !== "cancelled").length;
  return totalActiveInChain >= 2;
});
if (mergeableSplitGroups.length > 0) actions.push({ … });
```

Tým sa akcia „Spojit části" objaví **iba** ak existujú aspoň 2 aktívne časti reťazca na spojenie. Ak je v projekte len 1 bundle bez splitu, alebo všetky ostatné časti sú dokončené/expedované, akcia sa nezobrazí.

To isté platí pre tabuľkový pohľad v `PlanVyrobyTableView.tsx`.

---

### 4. Prepojenie zo `SplitBundleDialog`

**Súbor:** `src/components/production/SplitBundleDialog.tsx` (sekcia tlačidiel)

Pod tlačidlo „Rozdělit bundle" pridať odkaz `Pokročilá úprava (po týdnech) →` — ak má bundle už `split_group_id` s 2+ týždňami, klik zatvorí tento dialóg a otvorí `EditBundleSplitDialog`. Inak je odkaz skrytý.

---

### 5. Undo / Redo

`EditBundleSplitDialog.handleSave` použije rovnaký `pushUndo` payload ako iné schedule updates v `useProductionDragDrop` (`updatePayload("production_schedule", records)` s pôvodnými hodnotami pre revert).

Step back vráti všetky `scheduled_hours` / `scheduled_czk` na pôvodné hodnoty pred uložením, redo ich znova nastaví.

---

### 6. Overenie

1. Multisport Z-2607-008 → pravý klik na T17 bundle → vidieť „⚙ Upravit rozdělení po týdnech".
2. Dialog ukáže T16 (read-only 6 %), T17 33 %, T18 33 %, T19 34 %.
3. Zmeniť na T17 60 % / T18 30 % / T19 4 % (T16 ostáva 6 %) → tlačidlo Uložit aktívne (Σ = 100 %).
4. Zmeniť na 70 / 30 / 4 (Σ = 110 %) → Uložit disabled, červené upozornenie.
5. Po uložení sa hodiny v T17/T18/T19 prepočítajú a celkový súčet zostane 551.4h.
6. Spustiť Přepočítat → hodiny sa nezmenia (proporcie sú už uložené v `scheduled_hours`).
7. Bundle s 1 nedokončenou časťou v reťazci → „Spojit části" sa nezobrazí.
8. Bundle s 2+ aktívnymi časťami v rôznych týždňoch → „Spojit části (1 skupin)" sa zobrazí.
9. Step back vráti rozdelenie na pôvodné hodnoty.
10. Build prejde bez TS chýb.

---

### Súbory na úpravu

```text
src/components/production/EditBundleSplitDialog.tsx     (NOVÝ)
src/components/production/WeeklySilos.tsx               (context menu + import dialógu)
src/components/production/PlanVyrobyTableView.tsx       (context menu + import dialógu)
src/components/production/SplitBundleDialog.tsx         (link „Pokročilá úprava")
```
