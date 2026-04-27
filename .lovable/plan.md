## Problém

V SQL funkcii `public.get_daily_report(report_date)` sa `weekly_goal_pct` počíta cez CTE `cumulative_goal` na úrovni **celého projektu** (sumárne hodiny všetkých bundles ÷ `project_plan_hours.hodiny_plan`). Výsledok: každý bundle toho istého projektu dostane rovnaký cieľ (napr. Allianz A-6 / B / D-1 = všetky 60 %), namiesto vlastného kumulatívneho cieľa.

## Cieľ

`weekly_goal_pct` musí byť **per-bundle kumulatívny cieľ pre dnešný deň** spočítaný z `production_schedule` riadkov toho konkrétneho bundlu (nie zo súčtu projektu, nie z `project_plan_hours`).

## Definícia per-bundle cieľa

Bundle = unikátna kombinácia `(project_id, stage_id, bundle_label)`. Split chain = ten istý `split_group_id`.

Pre každý bundle v aktuálnom týždni:

```text
chain_total_hours   = SUM(scheduled_hours) všetkých riadkov toho bundlu naprieč všetkými týždňami
                      (pre split: cez split_group_id; pre non-split: len v aktuálnom týždni)
chain_prior_hours   = SUM(scheduled_hours) v týždňoch < current_week_monday
this_week_hours     = SUM(scheduled_hours) v current_week_monday
day_progress_ratio  = (day_idx + 1) / 5      -- už v existujúcom today_info

weekly_goal_pct     = (chain_prior_hours + this_week_hours * day_progress_ratio)
                      / NULLIF(chain_total_hours, 0) * 100
                      → zaokrúhlené, capped na 100
```

Pre non-split bundle (`split_group_id IS NULL`) chain = aktuálny týždeň, takže vzorec sa zjednoduší na `day_progress_ratio * 100` (napr. pondelok 20 %, piatok 100 %).

## Implementácia (SQL)

Nahradiť CTE `bundles_in_week`, odstrániť projektové CTE `this_week_hours`, `past_weeks_hours`, `split_prior_hours`, `split_total_hours`, `has_split`, `cumulative_goal` a doplniť per-bundle CTE:

1. **`bundle_keys`** — z `production_schedule` v aktuálnom týždni: distinct `(project_id, stage_id, bundle_label, split_group_id)`.
2. **`bundle_chain_hours`** — pre každý kľúč:
   - ak `split_group_id IS NOT NULL` → SUM hodín všetkých riadkov s tým `split_group_id` (status v aktívnych)
   - inak → SUM hodín riadkov s tým istým `(project_id, stage_id, bundle_label)` v `current_week_monday`
3. **`bundle_prior_hours`** — to isté, ale len pre týždne `< current_week_monday`.
4. **`bundle_week_hours`** — SUM v `current_week_monday` pre daný kľúč (toto nahradí súčasné agregované `bundles_in_week.scheduled_hours`).
5. **`bundle_goal`** — JOIN týchto CTE a vypočítať `goal_pct` podľa vzorca vyššie.

Plan-row SELECT zachová identifikáciu bundle (label + split_part). `weekly_goal_pct` sa bude joinovať z `bundle_goal` cez `(project_id, stage_id, bundle_label)`. Pre stĺpec `total_plan_hours` v plan a log riadkoch ponechať existujúci `project_plan_hours.hodiny_plan` (to je iný stĺpec, používaný UI na celkový plán projektu).

Log-rowy: pripojiť `bundle_goal` cez `(p_project_id, p_bundle_label)` (stage_id v 5-časťovom bundle_id nemusí byť deterministicky odvoditeľný — ak zlyhá join, fallback na NULL → 0; UI už dnes robí matching label-only).

Jediný uvedený migration súbor pridá `CREATE OR REPLACE FUNCTION public.get_daily_report(...)` s novou implementáciou. Žiadne zmeny v aplikačnom kóde ani v `types.ts` (signatúra zostáva rovnaká).

## Overenie

Po nasadení spustiť pre `2026-04-27`:

- Allianz A (split, chain 161.8h, prior ≈ 122.7h, week ≈ 39.1h): pondelok cieľ ≈ (122.7 + 39.1·0.2)/161.8 ≈ 80 %, postupne rastie.
- Allianz B (non-split, len v 2026-04-20): v týždni 2026-04-27 sa nezobrazí.
- Allianz D (split, chain 60.1h, prior 0h, week 54.1h): pondelok ≈ 18 %, piatok 90 %.
- Insia A-4 v expedici, RD Skalice, Multisport: každý bundle má vlastný cieľ podľa svojho chainu.

## Súbory

- nový `supabase/migrations/<timestamp>_get_daily_report_per_bundle_goal.sql`
