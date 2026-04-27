## Cieľ

Prepísať existujúcu DB funkciu `get_daily_report(report_date date)` tak, aby vracala **jeden riadok per bundle** s rozšírenými poľami pre denný report v Analytics. Zdroj pravdy pre `bundle_display_label` bude `production_schedule` (nie odvodené zo `bundle_id` stringu), a do výstupu zaradíme aj naplánované balíky bez logu (percent = 0).

## Tvar výstupu (jeden riadok per balík)

| Pole | Zdroj |
|---|---|
| `bundle_id` | `production_daily_logs.bundle_id` (alebo syntetický pre 0% riadky) |
| `project_id` | `production_schedule.project_id` |
| `project_name` | `projects.project_name` |
| `stage_id` | `production_schedule.stage_id` |
| `bundle_label` | `production_schedule.bundle_label` |
| `bundle_display_label` | `bundle_label` + `-{split_part}` ak `split_total > 1`, inak len `bundle_label` |
| `scheduled_week` | `production_schedule.scheduled_week` (Monday) |
| `scheduled_hours` | SUM zo všetkých riadkov schedule daného balíka v týždni |
| `phase` | `production_daily_logs.phase` (NULL pre bundles bez logu) |
| `percent` | `production_daily_logs.percent` (0 pre bundles bez logu) |
| `weekly_goal_pct` | kumulatívny cieľ (viď nižšie) |
| `is_on_track` | `percent >= weekly_goal_pct` |
| `note_text` | `production_daily_logs.note_text` |
| `total_plan_hours` | `project_plan_hours.hodiny_plan` |
| `logged_at` | `production_daily_logs.logged_at` |
| `log_day_date` | `week_key::date + day_index` (= `report_date`) |

## Filter dňa

Riadok patrí do reportu pre `report_date` ak:
- **má log**: `(week_key::date + day_index) = report_date`
- **nemá log**: bundle je v `production_schedule` so `scheduled_week = date_trunc('week', report_date)` a status v `('scheduled','in_progress','completed','expedice')` a pre `(project_id, stage_id, bundle_label, split_part)` neexistuje log na dnes (=> dorovnáme s `percent=0`).

## Identifikácia balíka

Bundle je definovaný štvoricou `(project_id, scheduled_week, stage_id, bundle_label, split_part)`. Pri bundles bez splitu `split_part` = NULL (resp. v bundle_id formáte `'full'`).

`bundle_id` z `production_daily_logs` má 5 častí oddelených `::`. Join na `production_schedule`:
- časť 1 → `project_id`
- časť 2 → `scheduled_week` (week_key)
- časť 3 → `stage_id` (alebo `'none'`)
- časť 4 → `bundle_label`
- časť 5 → `split_part` (alebo `'full'`)

`bundle_display_label` sa berie zo schedule riadku (jeden reprezentatívny — všetky riadky toho istého balíka v týždni majú rovnaký `bundle_label`/`split_part`/`split_total`).

## Logika `weekly_goal_pct`

```text
day_idx        = LEAST(EXTRACT(ISODOW FROM report_date) - 1, 4)   -- 0=Po..4=Pi (víkend = piatok)
current_monday = date_trunc('week', report_date)::date

-- per project (rovnaké ako v existujúcej funkcii):
this_week_hours   = SUM(scheduled_hours) WHERE scheduled_week = current_monday
past_weeks_hours  = SUM(scheduled_hours) WHERE scheduled_week < current_monday
                       AND status IN ('scheduled','in_progress','completed','expedice')

-- ak projekt má split chain v aktuálnom týždni:
split_prior_hours = SUM(scheduled_hours) WHERE split_group_id NOT NULL AND scheduled_week < current_monday
chain_total_hours = SUM(scheduled_hours) WHERE split_group_id NOT NULL  (celá chain bez ohľadu na týždeň)

goal_pct = CASE
  WHEN má_split_v_tomto_týždni AND chain_total_hours > 0 THEN
    (split_prior_hours + this_week_hours * (day_idx+1)/5.0) / chain_total_hours * 100
  ELSE
    (past_weeks_hours + this_week_hours * (day_idx+1)/5.0) / NULLIF(hodiny_plan, 0) * 100
END

weekly_goal_pct = LEAST(ROUND(goal_pct)::int, 100)
```

`weekly_goal_pct` je **per projekt** (rovnaký pre všetky balíky toho istého projektu v daný deň) — zachovávame existujúcu sémantiku.

## SQL štruktúra (CTE pipeline)

```text
WITH
  today_info        AS ( report_date, current_monday, day_idx )
  week_schedule     AS ( všetky schedule riadky pre current_monday, status IN aktívnych )
  bundles_in_week   AS ( DISTINCT (project_id, stage_id, bundle_label, split_part)
                          + agregácia scheduled_hours, prvý split_total/bundle_type )
  this_week_hours   AS ( per project SUM )
  past_weeks_hours  AS ( per project SUM )
  split_prior_hours AS ( per project SUM, len split chains )
  split_total_hours AS ( per project SUM, len split chains )
  has_split         AS ( DISTINCT project_id ktoré majú split v tomto týždni )
  cumulative_goal   AS ( per project goal_pct )
  todays_logs       AS ( production_daily_logs WHERE log_day_date = report_date AND bundle_id valid )
SELECT
  ... LEFT JOIN bundles_in_week ↔ todays_logs ON
        (project_id, stage_id, bundle_label, COALESCE(split_part::text,'full'))
  -- FULL OUTER aby sme dostali aj logy bez schedule (edge case) aj bundles bez logu
```

Pre `bundles_in_week` bez logu: `percent=0`, `phase=NULL`, `note_text=NULL`, `logged_at=NULL`, `bundle_id` syntetizujeme cez `buildBundleKey` (rovnaký formát ako frontend).

## Migrácia

`CREATE OR REPLACE FUNCTION public.get_daily_report(report_date date) RETURNS TABLE(...) LANGUAGE sql STABLE` — nahradí súčasnú implementáciu. Návratový tvar sa rozšíri o nové stĺpce (`scheduled_hours`, `bundle_display_label`, `stage_id`, `scheduled_week`); existujúce stĺpce zostanú s rovnakými názvami pre spätnú kompatibilitu konzumentov.

## Po migrácii — frontend

Skontrolujem volajúce miesto (pravdepodobne `useAnalytics.ts` / `Analytics.tsx`) a:
- ak konzument číta `bundle_label` + `bundle_split_part` zvlášť → ponechám pre kompatibilitu, ale UI prepnem na nové `bundle_display_label`.
- pridám zobrazenie nových polí (scheduled_hours per balík) ak sú v UI potrebné.

## Otvorené detaily, ktoré neriešim (zachovávam existujúce správanie)

- `weekly_goal_pct` ostáva per-projekt (nie per-bundle).
- Logy s neplatným `bundle_id` (menej než 3 časti, alebo časť 2 nie je dátum) sa preskakujú — rovnako ako teraz.
- `total_plan_hours` z `project_plan_hours.hodiny_plan` (nie zo schedule) — rovnako ako teraz.
