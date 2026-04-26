# Oprava bundle-isolated daylogu (Insia A-4 vs Insia B)

## Diagnóza

DB schéma a migrácia sú v poriadku — v `production_daily_logs` reálne existujú **tri samostatné sady** záznamov pre Z-2605-001 / týždeň 2026-04-20:

- `Z-2605-001::2026-04-20` (legacy)
- `Z-2605-001::2026-04-20::none::B::full` (Insia B)
- `Z-2605-001::2026-04-20::SG:2e7ac40e-…` (Insia A-4)

Helper `bundleStorageIdForProject(p)` vyrobí správny kľúč, **ale dostáva nesprávny `VyrobaProject`**. Všetky volajúce miesta (`getLogsForProject`, `getLatestPercent`, `getLatestPhase`, `bundleId`, `handleSaveLog`) prijímajú iba `projectId: string` a dohľadávajú projekt cez:

```ts
enrichedProjects.find(p => p.projectId === pid)
```

Pre projekt s viacerými bundlami v rovnakom týždni (Insia A-4 + Insia B majú zhodné `projectId = Z-2605-001`) `find` vždy vráti **prvý** bundle, takže oba ProjectRow uložia/načítajú rovnaký kľúč → druhý bundle prepíše prvý.

Identita bundle je dostupná cez `VyrobaProject.cardKey` (resp. `selectedProject` má vždy správny bundle, lebo sa hľadá podľa `cardKey`). Stačí helpery prepísať tak, aby pracovali priamo s `VyrobaProject` namiesto s `projectId` stringom.

## Zmeny v `src/pages/Vyroba.tsx`

### 1. Helpery prijímajú `VyrobaProject`

Refaktor signatúr, aby používali plný objekt (a fallback na `enrichedProjects.find` len ako last-resort pre legacy call-sites):

```ts
function bundleId(project: VyrobaProject): string {
  return bundleStorageIdForProject(project);
}

function getLogsForProject(project: VyrobaProject): DailyLog[] {
  const key = bundleStorageIdForProject(project);
  return dailyLogsMap?.get(key) || [];
}

function getLatestPercent(project: VyrobaProject): number { … }
function getLatestPhase(project: VyrobaProject): string | null { … }
```

Odstrániť variant `(pid: string)` všade tam, kde volajúci má `VyrobaProject` po ruke (čo je 95 % miest — `selectedProject`, `ProjectRow.project`, mapovanie cez `enrichedProjects.map(p => …)`).

### 2. Aktualizovať call-sites

Prejsť všetky výskyty `getLogsForProject(`, `getLatestPercent(`, `getLatestPhase(`, `bundleId(` (riadky 893–1001, 1085, 1312, 1327, 1346, 1358, 1360–1362, 1428, 1451, 1473, 2556, 2664 atď.) a posielať `VyrobaProject` namiesto `projectId`. Konkrétne:

- `selectedProject` má `cardKey` → posielať `selectedProject`.
- V `ProjectRow` posielať `project` (ten už drží správnu bundle identitu).
- V agregačných miestach iterujúcich `enrichedProjects.filter(...).some(p => …)` posielať priamo `p`.

### 3. `handleSaveLog` — uložiť pod správny kľúč

Riadok 1362: `const bId = bundleId(selectedProject.projectId)` → `const bId = bundleId(selectedProject)`. Tým `saveDailyLog(bId, …)` zapíše Insia B pod `…::none::B::full`, nie do kľúča Insia A-4. Undo/redo používajú zachytený `bId`, takže sa automaticky správajú per-bundle.

### 4. Stats / dashboard

V agregátoch ako `activeProjects.filter(p => getLogsForProject(p.projectId)…)` (riadok 1312) prejsť na `getLogsForProject(p)` — počty dnešných „logged“ bundlov budú správne (každý bundle sa počíta zvlášť).

### 5. Bez DB migrácie

Existujúce kľúče v DB sú už korektné (bundle-scoped). Žiadny ďalší backfill netreba; len čisté front-end smerovanie čítania/zápisu.

## Overovacia matica (po zmene)

| Akcia | Očakávaný kľúč zápisu/čítania |
| --- | --- |
| Otvorím **Insia A-4** → uložím log T20 / piatok | `Z-2605-001::2026-04-20::SG:2e7ac40e…` |
| Otvorím **Insia B** → uložím log T20 / piatok | `Z-2605-001::2026-04-20::none::B::full` |
| Editácia v jednom bundle | Druhý bundle ostáva nedotknutý |
| Ctrl+Z | Vráti len bundle, ktorý bol upravovaný (lebo `bId` je zachytený do closure) |

## Čo NEROBÍM

- Nemením `useProductionDailyLogs.ts` (kontrakt zostáva — kľúč je `bundle_id` string).
- Nemením DB schému ani RPC `get_daily_report` (tá pracuje na úrovni `split_part(bundle_id, '::', 1)` = projektu, čo je v poriadku pre denný report).
- Nepridávam fallback na legacy kľúč `pid::week` — bol odstránený zámerne, aby sa bundles nedelili o zápisy.