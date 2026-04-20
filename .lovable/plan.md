

## Problém

V `src/pages/Vyroba.tsx` % logika ukazuje nesprávne hodnoty v týchto scenároch:

1. **„Týdenní cíl: 100%" nesprávne** — `getWeeklyGoal` má fallback `return 100` keď `planHoursMap` ešte nie je načítané (React Query loading) alebo keď `hPlan` chýba. Z-2607-008 v T17 zobrazí 100% namiesto reálneho ~9%.

2. **Chain bundle ukazuje progress prevzatý z completed predošlého týždňa** — v split chain projektoch (Z-2607-008: T16 midflight Expedice 100% + T17 nové splity), `getLatestPercent` cez `findPriorChainLog` vráti 100% (z T16 Expedice logu), aj keď T17 je nový kus chainu (chain window 6→20%). Bundle progress potom ukazuje 100% miesto reálneho stavu T17 (ktorý buď nemá log = 0% v rámci okna, alebo má vlastný log 6%).

3. **Týdenní cíl ignoruje chain window** — pre split chain projekt by „týždenný cieľ" mal byť koniec chain okna pre tento týždeň (`chainWindow.end`), nie projekt-globálne %. Aktuálne `getWeeklyGoal` používa `expectedHours / hodiny_plan`, čo pre chain bundle dáva nezmyslné nízke číslo (lebo súčet T17 je len 83h zo 586h).

## Zmena 1 — `getWeeklyGoal` opravená sémantika

V `src/pages/Vyroba.tsx` funkcia `getWeeklyGoal(pid)`:

```ts
function getWeeklyGoal(pid: string): number {
  const projectForGoal = enrichedProjects.find(p => p.projectId === pid);
  if (projectForGoal?.isSpilled) return 100;
  if (!scheduleData) return 0;            // bolo: 100  (nesprávne)

  // Ak je bundle súčasťou split chainu → cieľ = koniec chain okna
  const cw = getChainWindow(pid);
  if (cw) return Math.round(cw.end);

  const hPlan = planHoursMap?.get(pid);
  if (planHoursMap === undefined) return 0;  // loading — neposielať 100
  if (!hPlan || hPlan <= 0) return 100;      // projekt bez plánu — pôvodný fallback

  // … existujúci výpočet completedWeeksHours + currentWeekHours * dayFraction
}
```

**Efekt**: Z-2607-008 T17 teraz zobrazí „Týdenní cíl: 20%" (= chain window end), čo zodpovedá realitě (do konca T17 by malo byť hotových 20% celého chainu).

## Zmena 2 — `getBundleProgress` chain-aware

`getLatestPercent` aktuálne v split chain berie posledný non-MF log z prior týždňa (cez `findPriorChainLog`). Ak ten log je 100% (Expedice), bundle T17 zobrazí 100% napriek tomu, že T17 je nový kus chainu, ktorý sa ešte nezačal.

Oprava: prior chain log použiť **iba ak** je menší alebo rovný `chainWindow.start` (= bundle ešte nezačal) **alebo** ak nepatrí do dokončeného chunku. Ak prior log = 100% ale chain pokračuje (existuje neskorší týždeň v chaine), bundle T17 začína na `chainWindow.start` (~6%), nie 100%.

```ts
function getLatestPercent(pid: string): number {
  const logs = getLogsForProject(pid);
  if (logs.length > 0) { /* … existujúce sortovanie … */ }

  const prior = findPriorChainLog(pid, weekKey);
  if (!prior) return 0;

  // Chain-safe: ak je prior log ≥ chain window end (t.j. predchádzajúci kus chainu
  // bol dokončený / posunutý k expedíciám), nepokračujeme s ním do nového kusu.
  // Štartujeme od začiatku okna pre tento týždeň.
  const cw = getChainWindow(pid);
  if (cw && prior.percent >= Math.round(cw.start) && prior.percent >= 95) {
    return Math.round(cw.start);
  }
  return prior.percent;
}
```

**Efekt**: Z-2607-008 T17 bez vlastného logu zobrazí ~6% (chain window start), nie 100%.

## Zmena 3 — `getExpectedPct` — žiadna zmena potrebná

Už správne počíta: `cw.start + (cw.end - cw.start) * fraction` pre chain bundle. Ostane.

## Overenie (vzorka)

| Projekt | Týždeň | Stav v DB | Očakávaný „Týdenní cíl" | Očakávaný „Bundle progress" |
|---|---|---|---|---|
| Z-2607-008 (Multisport) | T17 | chain 6→20%, bez T17 logu | **20%** (chain end) | **6%** (chain start) |
| Z-2607-008 | T17 | chain 6→20%, T17 log = 15% | **20%** | **15%** |
| Z-2607-008 | T18 | chain 20→52%, bez logu | **52%** | **20%** |
| Projekt bez chainu | T17 | hPlan=200, T16=50h hotové, T17=50h, dnes Po | round(50+50*0.2)/200 = **30%** | podľa logov |
| Projekt bez chainu, planHoursMap loading | — | — | **0%** (skeleton-friendly) | progress podľa logov |
| Spilled projekt | — | — | **100%** | latest pct |

Manuálne otestovať:
1. `/vyroba` → T17 → vybrať Multisport → header musí zobraziť „Týdenní cíl: 20%" (nie 100%) a bundle %, ktoré odpovedá chain oknu (≤20%).
2. Posunúť na T18 → cieľ ~52%, štart ~20%.
3. Iný projekt bez chainu → cieľ vypočítaný podľa `expectedHours / hodiny_plan` × dayFraction.
4. Spilled projekt T-1 → cieľ 100%, status „behind".
5. Reload stránky → počas načítavania `planHoursMap` sa nezobrazí blesková 100%.

## Dotknuté súbory

- `src/pages/Vyroba.tsx` — funkcie `getWeeklyGoal`, `getLatestPercent`.

