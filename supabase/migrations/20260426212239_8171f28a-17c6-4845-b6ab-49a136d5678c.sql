-- Migrácia legacy daylog kľúčov na bundle-scoped formát.
-- Legacy formát: "${project_id}::${week}"
-- Nový formát:   "${project_id}::${week}::SG:${split_group_id}"
--             alebo "${project_id}::${week}::${stage_id|none}::${bundle_label|A}::${split_part|full}"
--
-- Stratégia:
--   * Pre každý legacy záznam vyhľadáme bundles z production_schedule v danom (project_id, scheduled_week).
--   * Pre každý takýto bundle vložíme KÓPIU legacy logu s novým bundle_id a pôvodným logged_at.
--   * ON CONFLICT DO NOTHING — neprepíšeme novšie záznamy ktoré už pod novým kľúčom existujú.
--   * Legacy záznamy NEMAŽEME (zostávajú ako záloha; UI ich prestane čítať).
--   * Idempotentné: opätovné spustenie nezmení nič.

WITH legacy AS (
  SELECT id, bundle_id, week_key, day_index, phase, percent, logged_by, logged_at, note_text,
    split_part(bundle_id, '::', 1) AS pid,
    split_part(bundle_id, '::', 2)::date AS wk_date
  FROM production_daily_logs
  WHERE bundle_id ~ '^[^:]+::[0-9]{4}-[0-9]{2}-[0-9]{2}$'
),
bundles AS (
  -- Reprezentanti per "bundle identity" v rámci (project, week).
  -- Identita = (split_group_id) ALEBO (stage_id, bundle_label, split_part).
  -- DISTINCT ON zaručí jeden riadok na identitu.
  SELECT DISTINCT ON (project_id, scheduled_week, COALESCE(split_group_id::text, ''),
                      COALESCE(stage_id::text, 'none'), COALESCE(bundle_label, 'A'),
                      COALESCE(split_part::text, 'full'))
    project_id, scheduled_week, split_group_id, stage_id, bundle_label, split_part
  FROM production_schedule
  WHERE status IN ('scheduled', 'in_progress', 'completed', 'paused', 'expedice')
),
expanded AS (
  SELECT
    l.bundle_id AS legacy_bundle_id,
    l.week_key,
    l.day_index,
    l.phase,
    l.percent,
    l.logged_by,
    l.logged_at,
    l.note_text,
    CASE
      WHEN b.split_group_id IS NOT NULL THEN
        l.pid || '::' || l.week_key || '::SG:' || b.split_group_id::text
      ELSE
        l.pid || '::' || l.week_key || '::' ||
        COALESCE(b.stage_id::text, 'none') || '::' ||
        COALESCE(b.bundle_label, 'A') || '::' ||
        COALESCE(b.split_part::text, 'full')
    END AS new_bundle_id
  FROM legacy l
  JOIN bundles b
    ON b.project_id = l.pid
   AND b.scheduled_week = l.wk_date
)
INSERT INTO production_daily_logs (bundle_id, week_key, day_index, phase, percent, logged_by, logged_at, note_text)
SELECT new_bundle_id, week_key, day_index, phase, percent, logged_by, logged_at, note_text
FROM expanded
ON CONFLICT (bundle_id, week_key, day_index) DO NOTHING;