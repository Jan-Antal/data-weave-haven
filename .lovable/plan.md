## Problem

Pri porovnaní T17 / T18 / T19 v module **Dílna**:

- **T17 – Multisport A-2** → 25 % (správne, log je v `production_daily_logs` `Z-2607-008::2026-04-20` = 25 %).
- **T18 – Multisport A-3** → bar prázdny, hoci na bundle už bolo odpracovaných 25 %.
- **T19 – Multisport A-4** → 20 % (pre tento týždeň existuje vlastný log `Z-2607-008::2026-05-04` = 20 %, takže sa zobrazí).

Bar je teda správny iba v týždni, v ktorom bol pridaný daily log. Akonáhle nie je log v zobrazovanom týždni, `latestPctByProject` ostane `null` a bar sa **neukáže vôbec** — namiesto toho aby pokračoval z naposledy známej úrovne (25 %).

Príčina (`src/components/DilnaDashboard.tsx`):
- `dailyLogsRes` načíta iba `production_daily_logs` pre `weekInfo.weekKey`.
- `latestPctByProject` sa staví iba z týchto rows. Žiadny fallback na predošlý týždeň → `completionPct = null` → `b.completionPct` v UI je `null` → bar sa nerenderuje (`{b.completionPct != null && (...)}` na riadku 1027).

Tá istá medzera platí aj pre `prevLatestPctByProject` (používa sa len pri `weekOffset === 1` ako spillover guard) — pre weeky `offset !== 1` (napr. T18 keď je „dnes" T19) by sme rovnako chceli najnovší známy stav.

## Cieľ

Bar v karte projektu/bundlu v Dílne má reflektovať **kumulatívny posledný známy `percent`** pre daný bundle k danému týždňu, nie iba log v zobrazovanom týždni:

- Ak existuje log pre `weekInfo.weekKey` → použiť ho (najvyšší `day_index`).
- Inak fallback na **najnovší log s `week_key <= weekInfo.weekKey`** pre rovnaký `bundle_id`-prefix (project_id, lebo dnes sú logy uložené per `projectId::weekKey`).
- Logy zo **week_key > weekInfo.weekKey** (budúce týždne) sa pri prezeraní minulosti **ignorujú**, aby T18 neukazoval 20 % iba preto, že T19 už má vlastný log s 20 %.

Rovnaký posun znamená:
- Tyrkysová ryska (`expectedForBundle`) zostáva ako doteraz (per-week target).
- `completionPct` = posledný známy stav bundle k danému týždňu.
- Status pillu (`computeSlip`) zostáva — len dostane konzistentný `completionPct`.

## Implementačný plán

Súbor: **`src/components/DilnaDashboard.tsx`**

1. **Rozšíriť query** `dailyLogsRes` (riadky 156–161) tak, aby namiesto jediného týždňa načítala všetky logy s `week_key <= weekInfo.weekKey`, zoradené `week_key ASC, day_index ASC`. (Limitovať na rozumný horizont nie je nutné — tabuľka je malá, weekKey je indexovaný.)

   ```ts
   supabase
     .from("production_daily_logs" as any)
     .select("bundle_id, week_key, day_index, percent, logged_at")
     .lte("week_key", weekInfo.weekKey)
     .order("week_key", { ascending: true })
     .order("day_index", { ascending: true }),
   ```

2. **Prebudovať `latestPctByProject`** (riadky 316–324):
   - Iterovať všetky logy v poradí (week_key ASC, day_index ASC).
   - Pre každý `pid = bundle_id.split("::")[0]` vždy prepísať mapu poslednou nenulovou hodnotou → výsledok = posledný známy `percent` k zobrazovanému týždňu.

   ```ts
   const latestPctByProject = new Map<string, number>();
   for (const log of dailyLogs) {
     const pid = log.bundle_id.split("::")[0];
     if (!pid) continue;
     if (log.percent != null) latestPctByProject.set(pid, Number(log.percent));
   }
   ```

3. **Ponechať `prevLatestPctByProject`** ako je (spillover guard pre `weekOffset === 1`). Spillover guard chce konkrétne hodnotu z **predošlého týždňa**, nie kumulatívne, takže žiadna zmena.

4. **TypeScript typing** pre nový tvar logu doplniť `week_key: string` do casted typu `dailyLogs`.

5. **Žiadna zmena v UI** (`b.completionPct != null && (...)`) — len teraz nebude `null` v T18 pre Multisport, lebo dostane 25 % z T17.

## Validácia

Po nasadení v Dílne:

- **T17 – Multisport** → 25 % (z logu `2026-04-20`). ✔︎
- **T18 – Multisport** → 25 % (fallback na T17, žiadny vlastný log). ✔︎ (bar bude červený, lebo target T18 je vyšší než 25 %.)
- **T19 – Multisport** → 20 % (vlastný log `2026-05-04`). ✔︎ (Pozn.: log T19 má 20 %, hoci T17 mal 25 % — to je vstupné dáta a UI ich rešpektuje.)
- **T17 – Insia A-4** = 98 %, **T18 – Insia A-4** ostáva spillnuté → bar 98 %. ✔︎
- **T17 – Allianz A-5** = 60 %, **T18 – Allianz A-6** dostane 60 % (kým niekto nezaloguje T18). ✔︎

## Mimo rámca

- Nemenia sa žiadne RLS, schémy ani logika `expectedForBundle`/`computeSlip`.
- Nemenia sa moduly **Plán Výroby** a **Výroba**, kde sa `realWeekLatestPct` číta z konkrétneho týždňa zámerne (kvôli per-week spillover guardu).
- Migrácia DB ani nový stĺpec sa neriešia — `bundle_id` vo formáte `projectId::weekKey` zostáva.

## Súbory

- `src/components/DilnaDashboard.tsx` — query + budovanie `latestPctByProject`.
