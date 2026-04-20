

## Rozšírenie — tretia metrika "Očakávaný progress dnes"

Doplniť k existujúcim dvom kumulatívnym metrikám (`Hodiny %` a `Dokončeno %`) tretiu — **`Očakávaný progress dnes`** — rovnakú, akú už počíta `Vyroba.tsx` cez `getExpectedPct`. Vizualizovať ako **vertikálnu tyrkysovú rysku** na horizontálnom progress bare karty (rovnako ako vo Výrobe).

## Cieľ

Pre každú kartu projektu v `DilnaDashboard`:

- **`expectedPct`** = očakávaný % postup k aktuálnemu dňu v zobrazenom týždni
  - Pre **aktuálny týždeň**: lineárna interpolácia medzi začiatkom a koncom týždňa podľa `dayFraction` (Po=0.2, Út=0.4, … Pá=1.0).
  - Pre **minulé týždne** (weekOffset &lt; 0): `expectedPct = 100%` voči koncu daného týždňa (mal byť hotový).
  - Pre **budúce týždne** (weekOffset &gt; 0): `expectedPct = 0%` (ešte sa nezačal).
  - Pre **split chain** projekty: `cw.start + (cw.end − cw.start) × dayFraction` (chain-window-aware, presne ako `getExpectedPct` vo `Vyroba.tsx`).
  - Pre **off-plan / unmatched / bez plánu**: `null` (rysku nezobraziť).

## Zmena 1 — výpočet `expectedPct` v `useDilnaData`

V `src/components/DilnaDashboard.tsx` v `useDilnaData(weekOffset)`:

1. Doplniť `dayFraction`:
   ```ts
   const today = new Date();
   const isCurrentWeek = weekOffset === 0;
   const isPastWeek = weekOffset < 0;
   const dayOfWeek = today.getDay(); // 0=Ne … 6=So
   const workdayIdx = dayOfWeek === 0 ? 5 : Math.min(dayOfWeek, 5); // Po=1 … Pá=5
   const dayFraction = isPastWeek ? 1 : isCurrentWeek ? workdayIdx / 5 : 0;
   ```

2. Načítať **chain windows** pre projekty so splitmi (rovnaká logika ako `getChainWindow` vo `Vyroba.tsx`):
   - Query `production_schedule` (všetky týždne, `status != 'cancelled'`) zoskupené per `project_id` → určiť poradie `weekKey` a podiel `scheduled_hours` / `Σ scheduled_hours` → `chainWindowByProject: Map<string, {start, end}>`.
   - Pre projekty bez splitov (jeden týždeň alebo bez schedule) → window = `{ start: 0, end: 100 }`.

3. Per-projekt:
   ```ts
   const cw = chainWindowByProject.get(pid) ?? { start: 0, end: 100 };
   const expectedPct = planTotal > 0
     ? Math.round(cw.start + (cw.end - cw.start) * dayFraction)
     : null;
   ```

## Zmena 2 — `ProjectCard` typ + slip logika

```ts
interface ProjectCard {
  // … existujúce
  expectedPct: number | null;
}
```

`computeSlip` ostáva podľa porovnania `trackedPct` ↔ `completionPct` (kumulatívne). `expectedPct` slúži **len na vizualizáciu** rysky — neovplyvňuje farbu karty.

## Zmena 3 — UI: vertikálna ryska na progress bare

V renderovacej časti karty, kde sa zobrazuje `barWidthPct` progress bar:

```tsx
<div className="relative h-2 rounded-full bg-muted overflow-visible">
  {/* existujúca farebná výplň trackedPct / completionPct */}
  <div className="h-full rounded-full" style={{ width: `${barWidthPct}%`, background: barColor }} />

  {/* NOVÉ: vertikálna ryska expectedPct */}
  {expectedPct !== null && (
    <div
      className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-teal-500"
      style={{ left: `${Math.min(100, Math.max(0, expectedPct))}%` }}
      title={`Očakávaný postup dnes: ${expectedPct}%`}
    />
  )}
</div>
```

Tooltip baru rozšíriť: `Hodiny {trackedPct}% · Dokončeno {completionPct}% · Očakávané {expectedPct}%`.

Stat row pridať jemnú info: `Očekáváno dnes: {expectedPct}%` (len ak nie je `null`).

## Overenie

| Týždeň | Projekt | Deň | cw | dayFraction | Očakávané | Ryska na |
|---|---|---|---|---:|---:|---|
| T17 (current) | Multisport | Streda | 6→20% | 0.6 | 14% | 14% |
| T17 (current) | bez splitu | Pondelok | 0→100% | 0.2 | 20% | 20% |
| T17 (current) | bez splitu | Piatok | 0→100% | 1.0 | 100% | 100% |
| T16 (past) | ľubovoľný | — | — | 1.0 | 100% (alebo `cw.end`) | 100% |
| T18 (future) | ľubovoľný | — | — | 0 | `cw.start` | start |
| Off-plan | — | — | — | — | null | bez rysky |

Manuálne otestovať na `/analytics?tab=dilna`:
1. Aktuálny týždeň, streda → ryska na ~60% u projektov bez splitu, na ~14% u Multisport.
2. Posun na minulý týždeň → ryska úplne vpravo (100% / `cw.end`).
3. Posun na budúci týždeň → ryska na začiatku (0% / `cw.start`).
4. Off-plan dlaždica → ryska sa nezobrazí.
5. Tooltip baru ukazuje všetky tri metriky.

## Dotknuté súbory

- `src/components/DilnaDashboard.tsx` — `useDilnaData` (chain window query + `dayFraction` + `expectedPct` agregácia), `ProjectCard` interface, render karty (vertikálna ryska + tooltip + stat row).

