

## Cieľ

Pre **split bundle** (časť chainu, napr. `2/3`) musí týždenný cieľ a očakávaný progress rešpektovať pozíciu v chaine:

- **Štart okna** = súčet % hodín z **predošlých splitov** v chaine (napr. split 1/3 mal 50 % celkového plánu chainu → štart = 50 %).
- **Koniec okna** = štart + % hodín **aktuálneho splitu** (napr. 2/3 = 30 % → koniec = 80 %).
- **Day-by-day expected** sa lineárne pohybuje v rámci `[štart, koniec]` podľa dňa v týždni (Po=1/5 … Pia=5/5).

Pre nesplitnuté bundles ostáva logika nezmenená (`weeklyGoal` vs. `hodiny_plan`, štart 0 → koniec = goal).

## Logika

### Definícia chainu

Chain = všetky položky v `production_schedule` zdieľajúce rovnaký `split_group_id` (naprieč týždňami, vrátane completed/expediced). Bundle v aktuálnom týždni má jeden alebo viac `split_group_id`.

### Výpočet okna pre split bundle

```text
chainTotalHours = SUM(hours všetkých položiek v chaine)
priorPartsHours = SUM(hours položiek z chainu so scheduled_week < weekKey)
currentPartHours = SUM(hours položiek z chainu so scheduled_week === weekKey)

windowStart = (priorPartsHours / chainTotalHours) * 100
windowEnd   = ((priorPartsHours + currentPartHours) / chainTotalHours) * 100
```

Ak má bundle **viac chainov** (paralelné splits v jednom týždni), `windowStart` a `windowEnd` sa počítajú **vážene** cez sumu hodín všetkých chainov:

```text
windowStart = SUM(priorPartsHours_i) / SUM(chainTotalHours_i) * 100
windowEnd   = SUM((priorPartsHours_i + currentPartHours_i)) / SUM(chainTotalHours_i) * 100
```

Položky v bundli **bez `split_group_id`** sa v týchto sumách ignorujú (nie sú súčasťou chainu) — pre čistotu, hybridné bundles (split + nesplit) budú držať len chain logiku, lebo split-aware cieľ má zmysel len pre chained časť.

Ak bundle **neobsahuje žiadny split** → `windowStart = 0`, `windowEnd = weeklyGoal` (existujúce správanie).

### Day-by-day expected

```ts
expectedPct(dayIndex) = windowStart + (windowEnd - windowStart) * (workingDaysElapsed / 5)
```

`weeklyGoal` (zobrazené ako „Týdenní cíl: X %" v hlavičke) = `windowEnd`.

### Status (on-track / at-risk / behind)

Nezmenené prahy, len voči novému `expected`:

- `bundleProgress >= expected - 10` → on-track
- `bundleProgress >= expected - 25` → at-risk
- inak → behind

## Implementácia

### `src/pages/Vyroba.tsx`

**1. Nová helper funkcia `getChainWindow(pid, weekKey): { start: number; end: number } | null`**

- Pre projekt `pid` a aktuálny `weekKey` zozbieraj zo `scheduleData` všetky `split_group_id` prítomné v bundli daného týždňa.
- Pre každý `split_group_id` prejdi všetky týždne v `scheduleData` a sčítaj `scheduled_hours` (ignoruj `cancelled`):
  - `chainTotalHours += active.hours`
  - ak `wk < weekKey` → `priorPartsHours += active.hours`
  - ak `wk === weekKey` → `currentPartHours += active.hours`
- Ak žiadny chain → vráť `null`.
- Inak vráť `{ start: prior/total*100, end: (prior+current)/total*100 }`.

**2. Úprava `getWeeklyGoal(pid)` (riadok 842)**

```ts
const chainWindow = getChainWindow(pid, weekKey);
if (chainWindow) {
  return Math.min(100, Math.round(chainWindow.end));
}
// existujúca hodiny_plan logika ostáva pre nesplit bundle
```

**3. Úprava `getExpectedPct` na split-aware verziu**

Premenovať podpis aby prijala aj `pid`:

```ts
function getExpectedPct(_dayIndex: number, pid: string): number {
  const today = new Date();
  const dow = today.getDay();
  const wde = dow === 0 || dow === 6 ? 5 : dow;
  const fraction = wde / 5;

  const chainWindow = getChainWindow(pid, weekKey);
  if (chainWindow) {
    return Math.round(chainWindow.start + (chainWindow.end - chainWindow.start) * fraction);
  }
  const goal = getWeeklyGoal(pid);
  return Math.round(goal * fraction);
}
```

Zmeniť volania v `getProjectStatus` (riadok 949) a v `BundleDetail` (`getExpectedPct={getExpectedPct}` props na riadkoch 2190, 2297) — interne sa odovzdá `pid` z parent scope.

**4. UI hint v hlavičke bundle (riadky 3441–3498)**

- Zobraziť okno: pod „Týdenní cíl: X %" pridať drobný riadok pre split bundle: „Okno: 50 % → 80 %" (len ak `chainWindow != null` a `start > 0`).
- Progress bar: pridať druhý subtílny marker na pozícii `windowStart` (svetlosivá čiarka, opacity 0.3) — vizuálne ukazuje „štartovú čiaru" aktuálneho splitu.
- Tooltip pri „Očekávaný stav k …" prepísať na novú hodnotu z `getExpectedPct(dayIndex, pid)`.

**5. Aktualizovať `BundleDetailProps`**

Zmeniť signature `getExpectedPct: (dayIndex: number) => number` (pid sa pridá pri uzavretí v parent komponente, alebo ako druhý parameter). V `BundleDetail` na riadku 3332 nahradiť volaním nového variantu.

## Edge cases

- **Bundle bez splitu** → `getChainWindow` vráti `null`, nemení sa nič.
- **Hybridný bundle** (chain + nesplit položky v rovnakom týždni) → použije sa chainové okno (vážený priemer položiek v chaine), nesplit položky sa ignorujú v štart/end výpočte.
- **Split 1/3** → `priorPartsHours = 0`, takže `windowStart = 0`, `windowEnd = 50`. Day-by-day od 0 do 50 %.
- **Split 3/3** → `priorPartsHours = 80 %`, `windowEnd = 100 %`. Day-by-day 80 → 100 %.
- **Spilled projekt** → `getWeeklyGoal` vracia 100 ako doteraz (spilled má prednosť pred chain windowom).
- **Bundle progress < windowStart** (chain bol nesprávne preskočený) → status pôjde do `behind`, čo je korektné.

## Dotknuté súbory

- `src/pages/Vyroba.tsx` — nová `getChainWindow`, úprava `getWeeklyGoal`, úprava `getExpectedPct`, úprava props `BundleDetail` + UI hint a štart-marker na progress bare.

## Výsledok

- Split bundle 2/3 (po prvom 50 %, aktuálny 30 %) → cieľ pre tento týždeň = **80 %**, štart = **50 %**, day-by-day v stredu = `50 + 30 * 3/5 = 68 %`.
- Split bundle 3/3 (predošlé 70 %, aktuálny 30 %) → cieľ = **100 %**, štart = **70 %**, day-by-day v utorok = `70 + 30 * 2/5 = 82 %`.
- Nesplit bundle → bez zmeny správania.

