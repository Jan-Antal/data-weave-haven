

## Oprava dvojitého škálovania „Dnešní cíl" a markeru „Očekávaný stav"

### Príčina chyby

Premenná **`weeklyGoal`** (z `getWeeklyGoal()`, riadky 866-900) **už interne aplikuje `dayFraction`** — vracia kumulatívne % `hodiny_plan` zodpovedajúce dnešnej pozícii v týždni:

```
expectedHours = completedWeeksHours + currentWeekHours * dayFraction
weeklyGoal    = expectedHours / hPlan
```

Tzn. pre projekt s plánom 100h/týždeň, kde sa už spravilo 0h v predošlých týždňoch, v utorok (2/5):  
`weeklyGoal = (0 + 100 * 0.4) / 100 = 40%` ← **toto je už dnešný cieľ**.

Funkcia **`getExpectedPct(_, weeklyGoal, pid)`** (riadky 986-996) ale `weeklyGoal` znova škáluje dayFraction:  
`return Math.round(weeklyGoal * fraction)` → `40 * 0.4 = 16%` ← **dvojité škálovanie, bug**.

Rovnaký bug je v inline výpočte vertikálneho markeru „Očekávaný stav" (riadky 3568-3593): `Math.round(weeklyGoal * fraction)`.

**Chain-window vetva je naopak správna** — `getWeeklyGoal` pre split chain vracia surové `cw.end` (bez dayFraction), a `getExpectedPct` aplikuje `cw.start + (cw.end - cw.start) * fraction`. Tým pádom utorok pre okno 50→100 dáva 70% ✅.

### Oprava

**Súbor:** `src/pages/Vyroba.tsx`

**1. `getExpectedPct` (riadky 986-996):** odstrániť dvojité škálovanie pre non-chain vetvu — `weeklyGoal` je už dnešný cieľ, vrátiť ho priamo:

```ts
function getExpectedPct(_dayIndex: number, weeklyGoal: number = 100, pid?: string): number {
  if (pid) {
    const today = new Date();
    const dow = today.getDay();
    const wde = (dow === 0 || dow === 6) ? 5 : dow;
    const fraction = wde / 5;
    const cw = getChainWindow(pid);
    if (cw) return Math.round(cw.start + (cw.end - cw.start) * fraction);
  }
  return Math.round(weeklyGoal); // už zahrňuje dayFraction
}
```

**2. Inline marker „Očekávaný stav k dnes" (riadky 3568-3593):** zarovnať s opraveným `getExpectedPct`:

```ts
const exp = chainWindow
  ? Math.round(chainWindow.start + (chainWindow.end - chainWindow.start) * fraction)
  : Math.round(weeklyGoal); // bez * fraction
```

**3. Marker „Cíl pro tento týden" (riadky 3540-3553):** **ponechať bezo zmeny** — sémanticky je to ten istý bod ako „Očekávaný stav" pre non-chain projekty (lebo `weeklyGoal` je dnešná pozícia). V praxi obidva markery splynú — to je správne. Pre split chain projekty má marker stále zmysel (ukazuje koniec okna `cw.end` cez `weeklyGoal`).

### Validácia

Utorok (dayFraction = 0.4):

| Scenár | Pred | Po |
|---|---|---|
| Plán 100h/týždeň, žiadne minulé týždne | weeklyGoal=40, expectedPct=**16%** ❌ | weeklyGoal=40, expectedPct=**40%** ✅ |
| Chain window 50→100 | expectedPct=**70%** ✅ | expectedPct=**70%** ✅ (nezmenené) |
| Plán s 50h v minulých týždňoch + 50h tento týždeň, projekt 100h | weeklyGoal=70 (50+50*0.4), expected=**28%** ❌ | weeklyGoal=70, expected=**70%** ✅ |
| Pondelok (0.2) | weeklyGoal=20, exp=**4%** ❌ | weeklyGoal=20, exp=**20%** ✅ |
| Piatok/víkend (1.0) | weeklyGoal=100, exp=**100%** ✅ | weeklyGoal=100, exp=**100%** ✅ (nezmenené) |

### Vplyv na semafor (`getProjectStatus`, riadok 998-1023)

`bundleProgress >= expected − 10/25` — po oprave je `expected` 2-3× vyšší, takže projekty s nízkym daylogom správne padnú do **at-risk/behind** namiesto falošne **on-track**. To je presne to čo užívateľ chcel pri unifikácii s Dílnou.

### Mimo scope

- `getWeeklyGoal` — **nemení sa** (jeho hodnota „dnešný kumulatívny cieľ" je správna sémantika).
- `getChainWindow` — nemení sa.
- DayCell `weeklyGoal` prop pre badge „🎉" — porovnáva s `cumulative` v rámci dňa, neovplyvnené.
- DilnaDashboard — nemení sa (už používa správnu logiku cez vlastný `dayFraction`).

