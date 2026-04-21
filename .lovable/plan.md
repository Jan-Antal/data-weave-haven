

## Oprava label „Dnešní cíl" vo Výrobe

### Príčina nezhody

V `src/pages/Vyroba.tsx` (riadok **3517-3519**) sa pod hlavnou percentuálnou hodnotou v hlavičke rozkliknutého projektu zobrazuje:

```tsx
<div>Dnešní cíl: {weeklyGoal}%</div>
```

Tu sa však používa premenná **`weeklyGoal`** z `getWeeklyGoal(pid)` (riadky 866-900), ktorá počíta **kumulatívny TÝŽDENNÝ cieľ konca týždňa** (`expectedHours / hPlan`, kde `dayFraction` ide do plnej hodnoty Pi=5/5). Pre projekt s týždenným plánom blízko 100 % to vracia 100 %, hoci je len utorok.

Dnešný **denný** progress sa už správne počíta funkciou **`getExpectedPct(todayDayIndex, weeklyGoal, pid)`** (riadky 986-996), ktorá aplikuje `workingDaysElapsed / 5` na `weeklyGoal` alebo na chain-window. Hodnota je už dostupná v premennej **`expectedPct`** na riadku **3405** v komponente `ProjectExpandedView`, ale **nikde sa v hlavičke nezobrazuje** — namiesto nej label ukazuje surový `weeklyGoal`.

Chyba je teda len v tom, **ktorá premenná sa renderuje** v label „Dnešní cíl".

### Oprava

**Súbor:** `src/pages/Vyroba.tsx`

1. **Hlavička rozkliknutého projektu (riadok ~3517-3519):**
   - Zmeniť `Dnešní cíl: {weeklyGoal}%` → `Dnešní cíl: {expectedPct}%`
   - Premenná `expectedPct` je už spočítaná na riadku 3405 a presne reflektuje očakávaný dnešný progress (utorok = 2/5 z týždenného cieľa, alebo chain-window aware fraction).
   - Príklad pre projekt s chain window 50→100 v utorok: `start + (end-start) * 2/5 = 50 + 50 * 0.4 = 70 %` ✅

2. **Podmienka farby `isWeeklyGoalMet` (riadok 3517) ponechať** — zelená zostáva iba ak je celý týždenný cieľ splnený (to je ortogonálna info, nie cieľ pre dnes).

3. **Optional clarity — premenovanie tooltip „Týdenní cíl"** pri značke pod progress barom (riadky 3540-3553):
   - Tento marker (zelená vertikálna ryska) ukazuje pozíciu **týždenného cieľa** (`weeklyGoal`) — nie dnešného. To je správne a label „Cíl pro tento týden" je presný. **Nemení sa.**

### Kontrola ostatných výskytov (všetko sedí, nemení sa)

- **Riadok 1019** (`getProjectStatus`): používa `getExpectedPct(...)` na semafor — správne.
- **Riadok 3405** (`expectedPct` v expanded view): správne počíta dnešný progress.
- **Riadok 5425** (DayCell, badge „🎉 DNES"): porovnáva s `weeklyGoal` (= týždenný cieľ) — správne, bunka sa farbí keď je dosiahnutý plný týždenný cieľ.
- **Riadok 2468-2500** (Day-log dialog, „Celková hotovost"): porovnáva `logPercent` s týždenným `logWeeklyGoal` — správne, slider meria celkovú hotovosť, label v dialógu hovorí „Týdenní cíl".
- **Collapsed `ProjectRow`** (riadky 3166-3260): nezobrazuje žiaden „Dnešní cíl" label, len `pct` a status farbu — netreba meniť.
- **DilnaDashboard** (`expectedPct`): už používa rovnaký vzorec (`workingDaysElapsed / 5` cez `getDayFraction`) — sedí s Výrobou.

### Validácia po implementácii

- Utorok, projekt s `weeklyGoal = 100 %` → label ukáže **„Dnešní cíl: 40 %"** (2/5 týždňa).
- Utorok, projekt s chain window 50→100 → label ukáže **„Dnešní cíl: 70 %"** ✅ (presne podľa požiadavky).
- Pondelok, weeklyGoal 100 % → **20 %**.
- Piatok / víkend → **100 %** (alebo `weeklyGoal` ak < 100).

### Mimo scope

- Logika `getExpectedPct`, `getWeeklyGoal`, `getChainWindow` — nemení sa.
- Týždenný cieľ marker pod progress barom — nemení sa.
- DilnaDashboard farby/logika — nemení sa.

