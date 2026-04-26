## Hotovo: progress per bundle (Dílna)

`src/components/DilnaDashboard.tsx` teraz mapuje daily logy na konkrétny bundle, nie iba na projekt:

1. Daily logy načítané s `lte("week_key", weekInfo.weekKey)` → mapa `pctByProjectWeek` (`pid::wk` → percent).
2. Z `production_schedule` (všetky neukončené weeky) sa staví `identitiesByProjectWeek` — pre každú dvojicu `(pid, wk)` set bundle identít `${stage_id}::${bundle_label}::${split_part|"full"}`.
3. `resolveBundlePct(pid, identity)`:
   - displayed week má log → použiť ten,
   - inak walk prior weeks (newest first), použije log z najbližšieho týždňa, kde **rovnaká identita** existovala (aby sa percent nezalial do nového bundlu).
4. Bundle target je per-week (full → 100 %, split → chain-end pre tento týždeň cez `bundleTargetForWeek`).
5. UI zobrazenie ostáva `stav % / target %` — napr. `60 % / 60 %` (A-6 split) a `60 % / 100 %` (B full preliaty z T17).
6. Spilled-only loop tiež používa `resolveBundlePct` so `stage_id` z `prevSchedule`.
