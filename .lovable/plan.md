
## Problém

Vo Výrobe sa daylog ukladá pod kľúč `bundleId = ${projectId}::${weekKey}` — teda **na úrovni projektu/týždňa**, nie bundlu. Preto úprava % na **Insia bundle B** zmení daylog aj pre **Insia A-4** (ten istý projekt + týždeň).

Druhý bug: po `Ctrl+Z` (undo) na zmenu fázy/% sa síce % vráti, ale riadok zostane oranžový ("úprava po termíne"). Príčiny:

1. `phase_change` undo cesta v `useVyrobaUndo.ts` rieši len vetvu s `action.logId` (zmaže log). Ale undo definované v `Vyroba.tsx` (riadok 1251–1278) je iný typ — používa `pushUndo` z `useUndoRedo` (nie `useVyrobaUndo`) a v undo callbacku volá `saveDailyLog(...)` znova s pôvodnými hodnotami → tým nastaví `logged_at = now()`, čo `isRetroactive` znovu vyhodnotí ako úpravu po termíne.

## Riešenie

### 1. Per-bundle `bundleId` kľúč

Zmeniť `bundleId` v `src/pages/Vyroba.tsx` (riadok 872), aby zahŕňal identitu bundlu (split-chain alebo stage+label):

```ts
function makeBundleStorageId(project: VyrobaProject, weekKey: string): string {
  const sample = project.scheduleItems[0];
  const sg = sample?.split_group_id ?? null;
  const stage = sample?.stage_id ?? "none";
  const label = sample?.bundle_label ?? "A";
  const ident = sg ? `SG:${sg}` : `${stage}::${label}`;
  return `${project.projectId}::${weekKey}::${ident}`;
}
```

Všetky callsity (`saveDailyLog`, delete podľa `bundle_id`, `dailyLogsMap.get(...)`) prepnúť na nový kľúč. Aktualizovať aj parsing v `byProject` mape (riadok 585–594) a `getLogsForProject` (riadok 875), aby vracal len logy pre konkrétny bundle (porovnať identitu, nielen `pid`).

### 2. Backward-kompatibilita pre staré logy

Existujúce daylogy v DB sú uložené pod starým kľúčom `pid::weekKey`. Pri čítaní:

- Pri zostavovaní `byProject` rozlišovať: staré (2 segmenty) → priradiť všetkým bundlom projektu vo fallbacku; nové (3+ segmenty) → priradiť len konkrétnemu bundlu.
- `getLogsForProject(project)` najprv hľadá nové logy (per-bundle); ak žiadne, fallback na staré (per-project) — len pre čítanie. Nové zápisy idú vždy do nového kľúča.
- Žiadna DB migrácia nie je potrebná — postupne sa nahradia samé.

### 3. Undo phase_change zachová `logged_at`

V `src/pages/Vyroba.tsx` v `pushUndo` callbacku (riadok 1255–1273) namiesto `saveDailyLog` (ktorý nastaví `logged_at = now()`) urobiť priame Supabase update so zachovaným `logged_at` z `existingLog.logged_at`:

```ts
if (existingLog) {
  await (supabase.from("production_daily_logs") as any)
    .update({
      phase: existingLog.phase,
      percent: existingLog.percent,
      note_text: existingLog.note_text,
      logged_at: existingLog.logged_at, // ← zachovať pôvodný timestamp
    })
    .eq("bundle_id", bId)
    .eq("week_key", weekKey)
    .eq("day_index", capturedDay);
} else {
  // delete (už v poriadku)
}
```

Tým `isRetroactive` ostane vyhodnotený podľa pôvodného timestampu a riadok prestane svietiť oranžovo po undo.

### 4. Voliteľne: rozšíriť `saveDailyLog`

Pridať do `src/hooks/useProductionDailyLogs.ts` voliteľný parameter `loggedAt?: string`, aby `saveDailyLog` vedel zapisovať aj s konkrétnym timestampom (čistejšie ako duplikovať raw Supabase volanie).

## Dotknuté súbory

- `src/pages/Vyroba.tsx` — nový `makeBundleStorageId`, prepojenie callsitov (~6 miest), úprava `byProject` parsingu, `getLogsForProject`, undo callbacku phase_change.
- `src/hooks/useProductionDailyLogs.ts` — voliteľne rozšíriť `saveDailyLog` o `loggedAt`.

## Výsledok

- Zmena daylogu na Insia B sa prejaví **len na Insia B**, A-4 ostane nedotknutý.
- Po `Ctrl+Z` na zmenu fázy/% sa nielen vráti hodnota, ale aj farba bunky (zmizne oranžový "po termíne" indikátor).
- Staré daylogy zostanú viditeľné cez fallback čítanie; nové sa ukladajú per-bundle.
