

## Problém

`recalculateProductionHours("all", undefined, true)` trvá dlho. Pri pohľade na kód (`src/lib/recalculateProductionHours.ts`) vidím tieto bottlenecky:

### Bottleneck 1: N+1 queries v hlavnej slučke
Pre každý projekt (môže ich byť 100+):
- `SELECT tpv_items` (1 query/projekt)
- `SELECT production_schedule` (1 query/projekt)
- `SELECT production_inbox` (1 query/projekt)

→ **3× N queries** (pri 200 projektoch = 600 queries sériovo)

### Bottleneck 2: Per-row UPDATEs
- `UPDATE production_schedule` per riadok (sériovo, await v cykle)
- `UPDATE production_inbox` per riadok (sériovo)
- `UPDATE tpv_items` per riadok (sériovo, batch=100 ale stále await v cykle)

Pri tisíckach riadkov → tisíce sériových roundtripov.

### Bottleneck 3: Over-plan check
- `SELECT production_schedule` pre všetky over-plan projekty (1 query, OK)
- `createNotification` per projekt (sériovo)

## Návrh optimalizácie

### 1. Bulk fetch namiesto N+1 (najväčší zisk)

Načítať **všetky** `tpv_items`, `production_schedule`, `production_inbox` pre dotknuté projekty **jedným queryom**, potom group-by-project v JS:

```ts
const { data: allTpv } = await supabase
  .from("tpv_items")
  .select("...")
  .in("project_id", projectIds)
  .is("deleted_at", null);

const tpvByProject = groupBy(allTpv, "project_id");
```

→ z **3N queries → 3 queries** (pre 200 projektov: 600 → 3)

### 2. Bulk UPDATE cez upsert

Namiesto per-row `UPDATE`:
```ts
// Zozbierať všetky zmeny do array
const scheduleUpdates: Array<{id, scheduled_hours, scheduled_czk}> = [];
// Po výpočte všetkého:
await supabase.from("production_schedule").upsert(scheduleUpdates);
```

PostgREST podporuje bulk upsert (1 HTTP call pre stovky riadkov). Rovnako pre `production_inbox` a `tpv_items`.

→ z **tisíce roundtripov → ~3-6 bulk callov** (po batchoch ~500)

### 3. Iba zmenené riadky
Aj dnes sa kontroluje `if (correctCzk !== ...)`, ale stále sa robí await per riadok. Po prechode na bulk upsert toto zostane (pridať do bulk array len ak sa hodnota mení).

### 4. Paralelizácia top-level fetchov
Už existuje `Promise.all` pre projects/settings/presets/rates ✅. Pridať tam aj bulk tpv/schedule/inbox fetch.

### 5. Kratší progress feedback
Aktuálne user nevidí progress. Pridať `onProgress?: (pct: number) => void` callback a v `RecalculateDialog` zobrazovať progress bar (per-projekt tick). Nezrýchli to výpočet, ale UX bude znesiteľnejší.

## Očakávaný zisk

| Krok | Pred | Po |
|---|---|---|
| Fetch (200 projektov) | ~600 queries sériovo | 3 queries paralelne |
| Update schedule (~2000 zmien) | ~2000 await roundtripov | ~4 bulk calls |
| Update inbox (~500 zmien) | ~500 roundtripov | ~1 bulk call |
| Update tpv_items (~3000) | ~3000 roundtripov | ~6 bulk calls |
| **Celkový čas (odhad)** | **60-120 s** | **5-15 s** |

## Súbory na úpravu

- **`src/lib/recalculateProductionHours.ts`** — refactor na bulk fetch + bulk upsert + optional `onProgress` callback
- **`src/components/RecalculateDialog.tsx`** — pridať progress bar (0–100 %), pripojiť cez nový callback
- **`supabase/functions/forecast-schedule/index.ts`** — *NEMENIŤ* (forecast má vlastnú logiku, mimo scope)

## Edge cases

- **Bulk upsert vyžaduje `id` v payloade** — máme ho ✅
- **PostgREST limit ~1000 riadkov per request** — chunkujeme po 500
- **`onConflict`** pre upsert: použiť `id` (PK) → bezpečné, žiadne náhodné insert-y
- **Konzistencia split groups**: výpočet ratiá zostáva per-group v JS (no-op zmena, len sa neposiela do DB sériovo)
- **Notifikácie over-plan**: ponecháme sériovo (max ~10-20 projektov, zanedbateľné)

## Mimo scope

- Background job/queue (overkill pre projekt tejto veľkosti — bulk operations stačia)
- Edge function offload (recalculate beží už cez supabase client v browseri / RecalculateDialog; bulk fix vyrieši performance bez infraštruktúrnej zmeny)

