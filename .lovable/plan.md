
## Tri bugy, jeden koreň: pracujeme na úrovni projektu, máme pracovať na úrovni **bundle**

Súčasná logika všade agreguje na `project_id` (sidebar karta, target, spillover, items v paneli). Ale Allianz/Insia majú v jednom týždni dva bundles (split A-4 + full B), Multisport má len full A. Každý bundle má vlastný plán a vlastné prvky a má sa hodnotiť samostatne.

---

### Bug 1 — Spillover nesmie obsahovať bundles, ktoré splnili svoj týždenný cieľ

Multisport T17: cieľ 20 %, daylog 25 % → splnené → nesmie sa preliať.
Allianz bundle A T17: cieľ 60 %, daylog 60 % → splnené → nesmie sa preliať.

Aktuálne (`Vyroba.tsx` riadok 658, `WeeklySilos.tsx` riadok 457, `DilnaDashboard.tsx` riadok 306) sa pýtame iba: má bundle aspoň jednu položku v statuse `scheduled`/`in_progress`? Ak áno, prelej. Status sa pri daylog-u nemení (status sa mení len pri completion/expedice), takže projekt s 25 % daylogom má stále `scheduled` status → falošne sa prelieva.

**Fix:** doplniť kontrolu „bundle splnil svoj weekly target podľa daylogu z reálneho T týždňa". Bundle sa **nepreleje** ak `latestDaylogPct(project, T) >= bundleWeeklyTarget`.

`bundleWeeklyTarget` per bundle:
- **full bundle** (bundle_type = "full" alebo žiadne split_group_id) → `100`
- **split bundle** → koniec chain window (`chainWindowBySplitGroup.end` resp. v `Vyroba.tsx` `getChainWindow` per split_group_id, nie per project)

Pre `Vyroba.tsx` a `WeeklySilos.tsx`: načítať najnovšie `production_daily_logs` pre realny T týždeň (`bundle_id = projectId::weekKey`, max `day_index`) a skontrolovať per bundle. Pre `DilnaDashboard.tsx`: pridať `prevDailyLogsRes` query (analogicky `prevSchedRes`, gated `weekOffset === 1`) a počítať per bundle.

---

### Bug 2 — `getWeeklyGoal` musí byť per bundle (split aj full samostatne)

Allianz T17 obsahuje:
- bundle A-4 (split, len časť hodín v T17) → cieľ napr. 20 %
- bundle B (full, dva prvky, oba v T17) → cieľ **100 %**

Aktuálny `getChainWindow(pid)` (`Vyroba.tsx` r. 1075) berie všetky split_group_ids projektu a počíta okno proti **všetkým hodinám projektu naprieč všetkými týždňami** → bundle B dostáva to isté okno ako A-4 (úplne nesprávne). To isté `chainWindowByProject` v `DilnaDashboard.tsx` (r. 432).

**Fix:**
- `Vyroba.tsx`: prepísať `getChainWindow` / `getWeeklyGoal` / `getBundleProgress` / `getProjectStatus` / `isWeeklyGoalMet` tak, aby brali **bundle key** (`stage_id + bundle_label + split_part`) namiesto len `pid`. Karta v sidebari, ktorá reprezentuje bundle, si pýta target podľa svojho bundleKey.
  - full bundle → `target = 100`, okno = `{ start: 0, end: 100 }`
  - split bundle → použiť `splitGroupsByBundle` (už existuje, r. 597) a počítať okno cez **chain rovnakého `split_group_id`** (cez všetky týždne), nie cez projekt.
- `DilnaDashboard.tsx`: `expectedForBundle` (r. 436) už berie `splitGroupId` — len treba zaistiť, že full bundle (žiadne `split_group_id`) dostáva `{ start: 0, end: 100 }` (target 100 %), nie projektové chainWindow. Aj „weekly target" v karte (`expectedPctVal` r. 470) sa musí počítať per bundle, nie per project.

---

### Bug 3 — Karta bundlu zobrazuje prvky len svojho bundlu

Aktuálne `selectedProject` (r. 755) reprezentuje celý projekt; `DetailPanel` dostáva `allItems = getAllItemsForProject(selectedProject.projectId)` (r. 2403) → vidí všetky prvky všetkých bundlov projektu naprieč všetkými týždňami.

**Fix v dvoch krokoch:**

**A) Sidebar zobrazuje jeden riadok per bundle (nie per projekt).** V `projects` memo (r. 603) namiesto skladania jedného `VyrobaProject` per `project_id` zo všetkých bundles vytvoriť **jeden `VyrobaProject` per bundle** (`projectId + stageId + bundleLabel + splitPart` ako unikátny `bundleKey`). Spillover loop (r. 656) tiež produkuje per-bundle entries (už beží per-bundle, len sa merguje do existujúceho project entry — toto mergovanie zrušiť).
  - `VyrobaProject` rozšíriť o: `bundleKey: string`, `bundleLabel: string` (display, napr. „A-4" / „B"), `stageId: string | null`, `splitGroupId: string | null`, `splitPart: number | null`, `splitTotal: number | null`, `bundleType: "full" | "split"`.
  - `selectedProjectId` premenovať na `selectedBundleKey` (alebo držať dvojicu) a `selectedProject` lookup robiť cez `bundleKey`.
  - Triedenie a header sekcie „Přelité / Plán" funguje rovnako, len granularita je bundle.

**B) Per-bundle items / progress / target pre `DetailPanel`.**
  - Nový helper `getAllItemsForBundle(bundleKey)`: vráti len `scheduleItems` daného bundlu (z `selectedProject.scheduleItems` + ak je split, ostatné parts naprieč týždňami matchované cez `split_group_id`). Použiť namiesto `getAllItemsForProject`.
  - `getBundleProgress`, `getWeeklyGoal`, `getChainWindow`, `getProjectStatus`, `isWeeklyGoalMet`, `getExpectedPct`, `getCumulativeForDay`, `getLatestPercent` — všetky volania v r. 2393–2417 prepojiť na `selectedProject` (bundle), nie len `pid`. Per-bundle daylog momentálne neexistuje (daylog je per project+week), takže `getLatestPercent` zostáva per project — to si necháme, ale `weeklyGoal` a `chainWindow` budú per bundle (čo opraví Bug 2).
  - V `DetailPanel` (r. 3607) zoskupenie do `currentItems / futureItems / completedItems` zostáva, ale ide len cez `allItems` daného bundlu.

**C) DilnaDashboard karta projektu.** Tu user nepýtal zmenu granularity karty; karta zostáva per projekt, len **bundle riadky** (`bundleRows`) majú správny `expectedPct` (Bug 2) a `isSpilled` riadky majú správny goal-aware filter (Bug 1).

---

### Konkrétne zmeny po súboroch

**`src/pages/Vyroba.tsx`**
- Typ `VyrobaProject` (r. 290) → pridať `bundleKey`, `bundleLabel`, `stageId`, `splitGroupId`, `splitPart`, `splitTotal`, `bundleType`.
- `projects` memo (r. 603) a slide builder (r. 200–260) → emitovať jeden entry per bundle, nie per projekt; v sortingu dať completed úplne dole.
- Spillover loop (r. 645–684) → použije nové bundle-level entries; doplniť kontrolu `latestDaylog(realT, project) >= bundleTarget` (target per bundle, full=100, split=window.end). Daylogy načítať novým hookom alebo rozšíriť `useDailyLogs`/použiť existujúce `allLatestLogs` (r. ~890) pre realny T week.
- `getChainWindow` (r. 1075), `getWeeklyGoal` (r. 990), `getBundleProgress` (r. 954), `getProjectStatus` (r. 1123), `isWeeklyGoalMet` (r. 1027), `getExpectedPct` (r. 1110) → akceptujú `bundleKey`/`splitGroupId|null` namiesto len `pid`. Pre full bundle vrátiť `target=100`, `chainWindow={start:0,end:100}`.
- `selectedProjectId` → `selectedBundleKey`; všetky lookupy v `DetailPanel` props (r. 2383–2420 a mobil 2491–2528) prepnúť na bundle granularity.
- Nový `getAllItemsForBundle(bundleKey)` (filtruje split chain pre split bundles, alebo len bundle items pre full).
- Stats (r. 1151) a iné agregácie nech iterujú nad bundles, alebo sa prepoja jasne.

**`src/components/production/WeeklySilos.tsx`**
- `spilledBundlesForCurrent` (r. 436–479) → načítať `production_daily_logs` pre `currentWeekKey` (per project, max day_index), per bundle skip ak `latestPct >= bundleTarget` (full=100, split=`chainWindowBySplitGroup.end` — pridať helper podobný DilnaDashboard).

**`src/components/DilnaDashboard.tsx`**
- Pridať `prevDailyLogsRes` query (gated `weekOffset === 1`, `week_key = prevWeekInfo.weekKey`).
- Druhý pass spilled (r. 306–329) → per bundle skip ak `prevLatestPct(project) >= prevBundleTarget` (full=100, split=window.end z `chainWindowBySplitGroup` rátaného aj pre prevWeek slice).
  - `chainWindowBySplitGroup` momentálne počíta slice pre aktuálny `weekInfo.weekKey`. Pre spillover potrebujeme aj slice pre `prevWeekInfo.weekKey` → buď spočítať druhú mapu, alebo refaktorovať helper aby brala week key.
- `expectedForBundle` (r. 436) → ak `splitGroupId == null` (full bundle) → vrátiť `100` (alebo `100*dayFraction`?), nie projektové chainWindow. To bude treba pre obe vetvy (current bundles aj spilled-only).
- `expectedPctVal` (r. 470, karta-level) → má zostať „project level" pre header karty, alebo ho odvodiť z najťažšieho bundlu — radšej **ponechať project-level** (header je sumár), ale **per-bundle riadky** v karte musia mať vlastný `bExpected` (Bug 2 fix).

---

### Edge cases a explicit decisions

1. **„Splnené" pre full bundle s logom < 100 ale všetky items completed**: ak `bundle.items.every(isItemDone)` → tiež nie spill (už dnes funguje cez status, zachovať OR).
2. **Bundle bez daylogu**: ak nie je žiaden log v T → spravať sa ako predtým (spilluje sa, ak nie sú statusovo done).
3. **Daily-log granularita**: log je per `${projectId}::${weekKey}`, nie per bundle → všetky bundles toho istého projektu v jednom týždni zdielajú ten istý % completion. To je **akceptovaný kompromis** (target sa rozlíši, completion je zdieľaný). Ak Allianz A-4 má cieľ 20 % a B má cieľ 100 %, a daylog je 25 %, tak A-4 je „on track" (25≥20) a B je „behind" (25<100). To je správne z pohľadu projektu — nemáme presnejšie dáta.
4. **Sidebar v Vyroba — koľko kariet?** Predtým: 1 karta = 1 projekt. Teraz: 1 karta = 1 bundle. Ak Allianz má v T17 dva bundles, bude tam ako dva riadky („Allianz - 5.patro · A-4" a „Allianz - 5.patro · B"). Header sekcie a triedenie ostávajú.
5. **Mobile**: rovnaká granularita — riadky sú per bundle.

---

### Žiadne DB zmeny

Iba aplikačná logika a query rozšírenie (v Dílne pribudne jedna `production_daily_logs` query pre prev týždeň, gated na `weekOffset === 1`).

---

### Plán overenia

- **/plan-vyroby T18 spillover sila**: Multisport (cieľ 20 %, daylog 25 %) **NIE je**; Allianz A (cieľ 60 %, daylog 60 %) **NIE je**; Allianz B (full, cieľ 100 %, daylog 60 %) **JE**; Insia (split, splnený svoj target) → zmizne ak splnené, ostane ak nie. Iba bundle, čo nesplnil svoj target, sa prelieva.
- **/vyroba T17 sidebar**: Allianz - 5.patro je dva riadky (A-4 a B), každý so svojim bundleProgress, weeklyGoal, statusom; po kliknutí na B detail panel ukazuje **iba dve položky bundle B**, nie všetky položky Allianz.
- **/analytics?tab=dilna T17**: karta Allianz - 5.patro ukazuje dva bundle riadky s rôznymi `expected %` (A-4 ~20 %, B 100 %); karta Multisport sa neoznačuje ako spilled v T18.
