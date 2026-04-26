## Vizuálne overenie T18 — výsledky

Skontroloval som `/plan-vyroby` v T18:

**✅ Plán T18 (správne):** Reklamace Bar teras A, RD Cigánkovi Zlín A-13, Multisport A-3, Allianz A-6.

**Přelité z předchozích T (T17 → T18):**
- ✅ Insia A-4 (Z-2605-001) — 80h
- ✅ Příluky Valovi A-5 (Z-2504-019) — 235h
- ✅ Insia B (Z-2605-001) — 82h
- ❌ **Allianz B (Z-2617-001) chýba** — má v T17 bundle B (2 položky T.23-A, T.23-B, status `scheduled`, nie midflight, nie v expedice, completed_at = null) → mal by byť spilled

**T17, T19:** vyzerajú správne (T19 nemá sekciu Přelité).

## Root cause

V `src/pages/Vyroba.tsx` (riadok 636 a riadok 221) a `src/components/production/WeeklySilos.tsx` (riadok 451) sa pri budovaní spilled zoznamu robí dedup na úrovni **projectId**:

```ts
if (result.some((r) => r.projectId === b.project_id)) continue;        // Vyroba.tsx
if (destProjectIds.has(b.project_id)) continue;                         // WeeklySilos.tsx
```

Allianz - 5.patro (Z-2617-001) má v T18 už plánovaný bundle **A-6**, takže keď sa následne kontroluje T17 spilled bundle **B** toho istého projektu, je vyhodený. Insia (Z-2605-001) tento problém nemá, lebo v T18 nemá žiadny plánovaný bundle.

DilnaDashboard.tsx je v poriadku — dedup robí na úrovni `stage+label+split_part`, takže obidva bundles (A-6 plánovaný + B spilled) by sa mali zobraziť ako dve riadky v karte projektu.

## Plán opravy

### 1. `src/pages/Vyroba.tsx`

**a) Hlavná `projects` memo (riadok ~631–654):**
- Odstrániť projectId-level skip.
- Ak spilled bundle pre projekt patrí k projektu, ktorý už v `result` je (z aktuálneho týždňa), zlúčiť spilled položky do toho istého `VyrobaProject` (pridať položky do `scheduleItems`, navýšiť `totalHours`). Označiť projekt vlajkou `hasSpilledItems = true`, ale ponechať `isSpilled = false` (lebo má aj plánované veci).
- Inak vytvoriť nový spilled-only projekt s `isSpilled = true`.
- Pri zlučovaní deduplikovať bundles na úrovni `stage_id + bundle_label + split_part`, aby sme nezdvojili bundle, ktorý už v T týždni existuje (priorita má current-week bundle).

**b) Slide builder (riadok ~216–238):**
- Aplikovať identický fix.

**c) Typ `VyrobaProject`:** pridať voliteľné `hasSpilledItems?: boolean`.

**d) UI (riadky ~2200, ~1979, ~3359, ~3665):** sekcia „Přelité z minulého týdne" naďalej zoskupuje len projekty s `isSpilled = true`. Karta projektu, ktorá má aj plán aj spilled položky (`hasSpilledItems = true`), zostáva v normálnej sekcii a per-item zobrazí amber chip „Z T{n-1}" len pre tie položky, ktoré pochádzajú zo spilled bundle. Označenie spilled položiek urobíme cez `is` flag priamo na items, alebo cez Set spilled scheduleItem IDs uložený na projekte.

### 2. `src/components/production/WeeklySilos.tsx`

V `spilledBundlesForCurrent` (riadok 436–476):
- Zmeniť `destProjectIds` set na `destBundleKeys` set s formátom `${project_id}::${stage_id ?? "none"}::${bundle_label ?? "A"}::${split_part ?? "full"}`.
- Skipovať len ak presne ten istý bundle key existuje v dest týždni — nie celý projekt.

Tým sa Allianz B objaví v spilled sekcii T18 nezávisle od toho, že Allianz A-6 je v plán T18.

### 3. `src/components/DilnaDashboard.tsx`

Bez zmeny — dedup robí už správne na bundle úrovni.

## Overenie po implementácii

1. `/plan-vyroby` T18 → sekcia „Přelité z předchozích T" obsahuje: Insia A-4, Příluky Valovi A-5, Insia B, **Allianz B** (4 bundles).
2. Plán T18 stále obsahuje len: Reklamace Bar teras A, RD Cigánkovi Zlín A-13, Multisport A-3, Allianz A-6.
3. `/vyroba` (modul) T18 → karta Allianz - 5.patro obsahuje aj A-6 (current) aj B (spilled, s amber chip „Z T17").
4. `/analytics?tab=dilna` T18 → karta Allianz má dva bundle riadky: A-6 (normal) a B (s amber `T17` chip).
5. T17 a T19 zostávajú bez „Přelité" sekcie.

## Bez DB zmien
Iba aplikačná logika.