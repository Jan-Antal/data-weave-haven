## Audit: čo už funguje a čo nie

Po prejdení `src/pages/Vyroba.tsx`:

### ✅ Per-bundle (funguje správne)
- **Výber karty** (`cardKey`) — Allianz A/B/C/D, Insia A-4 vs B sa vyberajú samostatne.
- **Zoznam prvkov v detaile** (`getItemsForBundle`) — filtrované cez `scheduleItems[*].id` vybraného bundlu.
- **Daylog úložisko** (`bundleStorageIdForProject`) — nový kľúč `${pid}::${weekKey}::SG:<group>` alebo `${pid}::${weekKey}::<stage>::<label>::<part>`. Insia B už nezasahuje do A-4.
- **Čítanie daylogu** s legacy fallbackom (`getLogsForProject`).
- **Undo zachová `logged_at`** — oranžový "po termíne" zmizne.

### ⚠️ Stále project-wide (treba opraviť)

1. **`getWeeklyGoal(pid)`** (riadok 1048) — pre non-split bundle sčítava **všetky bundle projektu** v aktuálnom + minulých týždňoch (riadky 1069–1078, filter iba `bundle.project_id === pid`, žiadny stage/label). Allianz D (malý bundle) tak dostane cieľ odvodený zo súčtu hodín A+B+C+D.

2. **`getBundleProgress(pid)`** (riadok 1012) volá **`getAllItemsForProject(pid)`** (riadky 979–999) — iteruje všetky bundle projektu naprieč všetkými týždňami. `totalHours`, `completedHours` aj fallback `bundleProgress = completedHours/totalHours` sú project-wide. Ovplyvňuje progress bar, „completed hours“ badge, aj `getProjectStatus`.

3. **Volania v UI** (riadky 2129, 2157, 2321, 2349, 2474, 2582) odovzdávajú `weeklyGoal={getWeeklyGoal(p.projectId)}` — čisto cez `projectId`, takže dve karty toho istého projektu majú identický cieľ.

4. **`isWeeklyGoalMet(pid)`** (riadok 1085) — to isté: berie celý `silo.bundles.find((b) => b.project_id === pid)` a porovnáva, ale projekt môže mať v silo viac bundlov; vyberie iba prvý nájdený.

## Riešenie

Prerobiť tieto helpery tak, aby prijímali **`VyrobaProject`** (ktorý už nesie identitu cez `scheduleItems` a `cardKey`) namiesto holého `pid`. Filtrovať loopy v `scheduleData` podľa rovnakej identity, akú používa `cardKey` a `bundleStorageIdForProject` (`stage_id` + `bundle_label` + voliteľne `split_group_id`/`split_part`).

### 1) Nový helper `bundleMatchesProject(bundle, items, project)`
Pomocná funkcia, ktorá rozhodne či daný `silo.bundles[i]` (s jeho `items`) patrí k tej istej "identite" ako `project`:
- ak `project` má `split_group_id` v `scheduleItems[0]` → matchuj cez `item.split_group_id ∈ {projectSplitGroups}`,
- inak matchuj cez `bundle.stage_id === project.scheduleItems[0].stage_id && bundle.bundle_label === project.scheduleItems[0].bundle_label`.

### 2) `getWeeklyGoal(project: VyrobaProject)` — bundle-scoped
- `currentWeekHours`/`completedWeeksHours` zbierať len z bundlov, ktoré matchujú identitu (cez nový helper).
- `hPlan` denominator: namiesto `planHoursMap.get(pid)` (ktorý je celoprojektový) použiť **súčet hodín všetkých týždňov pre tento bundle** (chain). Tým sa goal počíta voči vlastnému plánu bundlu, nie voči celému projektu.
- Split-chain vetva (`getChainWindow`) je už správne filtrovaná cez `splitGroupIds` — nemení sa.

### 3) `getAllItemsForProject` → rozdvojiť
- Ponechať existujúce (používa sa v `areAllPartsCompleted`, `getIncompletePartsInfo` — tam je správne, lebo riešia "naprieč všetkými týždňami pre item_code", čo je item-level operácia, nie bundle-level).
- Pridať `getAllItemsForBundle(project: VyrobaProject)`: rovnaká logika, ale filter `bundleMatchesProject` + dedup.

### 4) `getBundleProgress(project: VyrobaProject)`
- Použiť `getAllItemsForBundle(project)` namiesto `getAllItemsForProject(pid)`.
- Volania na `findPriorChainLog`/`findPriorAnyLog` ostávajú (sú už v poriadku — chain-aware).

### 5) `isWeeklyGoalMet(project: VyrobaProject)`
- Iterovať `silo.bundles` a brať len ten, ktorý matchuje identitu (môže ich byť viac s rovnakým `project_id`).

### 6) Upraviť UI volania
- Riadky 2129, 2157, 2321, 2349, 2474, 2582 a všetky ďalšie miesta, ktoré odovzdávajú `weeklyGoal`/`bundleProgress`: zmeniť z `getWeeklyGoal(p.projectId)` → `getWeeklyGoal(p)`, podobne `getBundleProgress(p)`.
- `getProjectStatus(pid)` → `getProjectStatus(project)` a vnútri použiť bundle-scoped helpery.
- `getLatestPercent(pid)` zostáva keyed cez `pid` (číta z `dailyLogsMap` cez `bundleStorageIdForProject(project)` — to už je bundle-aware vďaka `enrichedProjects.find` v `bundleId`). Aby to bolo robustné aj keď `project` nie je v `enrichedProjects`, prepnúť signatúry na voliteľne prijať `VyrobaProject`.

### 7) Header / "Mojich projektov" počítadlo (riadok 1220)
`activeProjects.filter((p) => getLogsForProject(p.projectId).some(...))` — ostáva korektné, lebo `getLogsForProject` je už bundle-aware.

## Dotknuté súbory
- `src/pages/Vyroba.tsx` — len tento súbor.

## Výsledok
- Allianz D ukáže **vlastný weekly goal** odvodený z hodín D, nie z A+B+C+D.
- Progress bar Allianz D ukáže **vlastný % completion** (na základe items D, nie celého projektu).
- Insia A-4 a Insia B (tá istá Insia, ten istý týždeň) ukážu nezávislé ciele aj progress bary.
- Dialog daylogu, undo, item list — všetko ostáva v poriadku (už opravené).
- Žiadna DB migrácia, žiadne zmeny v ďalších moduloch.
