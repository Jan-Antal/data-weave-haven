
## Cieľ

1. **Oprava dát** — vrátiť `TK.01 Kuchyňka u recepce` (Insia Z-2605-001) zo `2026-04-27` (T18) späť do `2026-04-20` (T17), aby celá split-časť A-4 bola v jednom týždni.
2. **Prevencia** — zabrániť tomu, aby sa split-`part` v rámci jednej `split_group_id` rozpadol cez viac týždňov.

---

## Časť 1 — Data fix (jeden migration UPDATE)

Položka:
- `id = 8f9e1b0f-8b5d-431e-9e86-6c6d0426a70e`
- `project_id = Z-2605-001`, `item_code = TK.01`
- aktuálne `scheduled_week = 2026-04-27`, `split_part = 4`, `split_total = 4`, `status = completed`
- súrodenci v split_part=4 (split_group `2e7ac40e-449a-4b72-a5b4-9a03990bfb64`) sú v `2026-04-20`

Urobím **migration** s jediným príkazom:

```sql
UPDATE production_schedule
SET scheduled_week = '2026-04-20'
WHERE id = '8f9e1b0f-8b5d-431e-9e86-6c6d0426a70e'
  AND scheduled_week = '2026-04-27';
```

Po update sa vďaka tomu, že T17 už `split_part=4` má, čísla zostanú konzistentné (4/4 cez celú skupinu A-4 v T17, A-1..A-3 v T14..T16). Žiadny `renumberBundleChain` nie je potrebný — čísla sú už správne.

(Žiadny dopad na `production_daily_logs`, `production_expedice` ani `production_quality_checks` — tie sa neviažu na `scheduled_week`.)

## Časť 2 — Prevencia (kód)

### Príčina

Update `scheduled_week` jednotlivej položky cez `production_schedule.update({ scheduled_week })` (drag&drop, spill, completion-related rebuilds, atď.) **nesynchronizuje súrodencov v rámci toho istého `split_group_id + split_part`**. Stačí, aby sa pri "spill nedokončenej práce do ďalšieho týždňa" presunula iba jedna z N položiek splitu — a UI vykreslí 2 bundles s rovnakým labelom v 2 týždňoch.

### Riešenie — DB-side guard (najspoľahlivejšie)

Pridám trigger `enforce_split_part_week_consistency` na `production_schedule`:

```sql
-- Pseudocode logiky
AFTER UPDATE OF scheduled_week ON production_schedule
WHEN NEW.split_group_id IS NOT NULL AND NEW.split_part IS NOT NULL
  AND OLD.scheduled_week IS DISTINCT FROM NEW.scheduled_week
DO:
  -- propaguj nový týždeň na všetkých súrodencov v rovnakom (split_group_id, split_part)
  UPDATE production_schedule
  SET scheduled_week = NEW.scheduled_week
  WHERE split_group_id = NEW.split_group_id
    AND split_part   = NEW.split_part
    AND id <> NEW.id
    AND scheduled_week IS DISTINCT FROM NEW.scheduled_week;
```

Ochrana proti nekonečnej rekurzii: trigger používa `pg_trigger_depth() = 0` guard, takže kaskádový update sa nespustí znova.

**Prečo trigger a nie len úprava JS volaní**: `scheduled_week` sa updatuje na ≥10 miestach v `useProductionDragDrop.ts`, v `SpillSuggestionPanel`, `CompletionDialog` a v edge funkcii `forecast-schedule`. Oprava na DB úrovni pokryje všetky cesty (vrátane budúcich) a je atomická.

### Doplnková ochrana — UI sanity check

V `useProductionSchedule.ts` pri zostavovaní `bundleKey`: ak rovnaký `(split_group_id, split_part)` existuje vo viacerých týždňoch, vypíšem `console.warn` s detailmi (project_id, group, part, weeks). To pomôže zachytiť budúce regresie počas vývoja bez zmeny správania UI.

## Technická realizácia

1. **Migration #1** — data fix UPDATE pre `TK.01`.
2. **Migration #2** — funkcia + trigger:
   - `CREATE FUNCTION public.sync_split_part_scheduled_week() RETURNS trigger ...`
   - `CREATE TRIGGER trg_sync_split_part_week AFTER UPDATE OF scheduled_week ON production_schedule FOR EACH ROW WHEN (...) EXECUTE FUNCTION public.sync_split_part_scheduled_week();`
   - `SECURITY DEFINER`, `SET search_path = public`.
3. **Code change** — pridať `console.warn` v `useProductionSchedule.ts` (po vybudovaní `byWeek` mapy spraviť per-bundle audit).

## Riziká a poznámky

- Trigger zmení každý budúci jednotlivý week-update položky splitu na **kaskádový** update všetkých súrodencov v rovnakom `split_part`. To je presne to, čo chceme. Drag&drop UI updaty sa nemenia (DB to vyrieši automaticky), ale invalidácia cache `production-schedule` v hookoch je už spustená pri každom takomto presune.
- Trigger sa **netýka** zmeny `split_part` ani `split_group_id` — len `scheduled_week`. Takže explicitné re-splity (`renumberBundleChain`) fungujú ďalej bez zmeny.
- `cancelled` riadky tiež dostanú propagáciu (zachovávame konzistenciu chronológie). Ak chceš, vieme ich vylúčiť doplnkovým `AND status <> 'cancelled'` filtrom.
