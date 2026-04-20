

## Upresnenie

Carry-forward % z minulého týždňa sa aplikuje **iba pre splitnuté bundles** (časti rovnakého `item_code` / `split_group_id` chainu naprieč viacerými týždňami). Pre samostatné, nesplitnuté bundles žiadny fallback neexistuje — bez vlastného daily logu zostávajú na 0 % (resp. len `completionPct` z dokončených/expedovaných položiek).

## Logika

Pre bundle v týždni X bez vlastného daily logu:

1. **Ak bundle obsahuje split items** (aspoň jedna položka má `split_group_id != null`):
   - Nájdi najnovší non-MF daily log zo **skoršieho týždňa** patriaci k tomu istému `split_group_id` (cez `bundle_id` projektu, ale obmedzené na chainy zdieľané s aktuálnym bundlom).
   - Použi jeho `percent` ako fallback.
2. **Inak (nesplitnutý bundle)**:
   - Žiadny fallback. `latestLogPct = 0`.
   - Výsledok = `Math.max(0, completionPct)`.

MF logy (`bundle_id` obsahuje `::MF_`) sú vždy ignorované.

## Implementácia

### `src/pages/Vyroba.tsx`

**1. `allLatestLogs` query** — vracia `Map<projectId, DailyLog[]>`, sorted desc by `week_key, day_index, logged_at`, vyfiltrované MF logy. (bez zmeny oproti predošlému plánu)

**2. Nová pomocná query / map: `splitGroupsByBundle`**

Pre každý projekt v aktuálnom týždni zistiť, či bundle obsahuje split položky a aké `split_group_id` to sú. Zdroj: `production_schedule` rows pre daný `(project_id, scheduled_week)` → `split_group_ids = items.filter(i => i.split_group_id).map(i => i.split_group_id)`.

**3. `getLatestPercent(pid, weekKey)` — split-aware fallback**

```ts
function getLatestPercent(pid: string, weekKey: string): number {
  const logs = getLogsForProject(pid); // logs v aktuálnom týždni
  if (logs.length > 0) return Math.max(...logs.map(l => l.percent));

  // Fallback len pre split bundles
  const bundleSplitGroups = splitGroupsByBundle.get(`${pid}::${weekKey}`);
  if (!bundleSplitGroups || bundleSplitGroups.size === 0) return 0;

  // Nájdi prior non-MF log patriaci k niektorému z týchto split_group_id
  const all = allLatestLogs?.get(pid);
  if (!all) return 0;
  for (const log of all) {
    if (log.week_key >= weekKey) continue;
    // overiť, či log.bundle_id patrí k chainu (cez schedule lookup podľa week_key + project_id)
    const logWeekItems = scheduleByProjectWeek.get(`${pid}::${log.week_key}`);
    const logHasChainOverlap = logWeekItems?.some(i =>
      i.split_group_id && bundleSplitGroups.has(i.split_group_id)
    );
    if (logHasChainOverlap) return log.percent;
  }
  return 0;
}
```

To isté pre `getLatestPhase`.

**4. `getBundleProgress`** zostáva: `Math.max(latestLogPct, completionPct)`.

## Edge cases

- Split bundle bez prior loga v chaine → 0 %.
- Nesplitnutý bundle so spilled hodinami z T-1 (nie chain split, len `is_spilled`) → momentálne tiež 0 %, lebo nemá `split_group_id`. Ak treba aj toto pokrývať fallbackom, povedz a doplním samostatnú vetvu pre `is_spilled`.
- Projekt s viacerými paralelnými chainmi v jednom týždni → fallback berie prvý nájdený log, ktorý zdieľa **aspoň jeden** chain.

## Dotknuté súbory

- `src/pages/Vyroba.tsx` — `allLatestLogs` (filter MF + array per project), nová mapa `splitGroupsByBundle` + `scheduleByProjectWeek`, split-aware `getLatestPercent` / `getLatestPhase`.

## Výsledok

- Z-2504-019 T17 bez splitu, bez logu → **0 %** (predtým chybne 100 %).
- Splitnutý bundle TK.05 1/2 v T16 = 50 %, TK.05 2/2 v T17 bez logu → fallback **50 %** z T16 chainu.
- Nesplitnutý bundle s logom 30 % v T16 a žiadnym v T17 → T17 ukáže **0 %** (resp. completionPct).

