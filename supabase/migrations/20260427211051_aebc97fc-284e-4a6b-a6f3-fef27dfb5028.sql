DROP FUNCTION IF EXISTS public.get_daily_report(date);

CREATE FUNCTION public.get_daily_report(report_date date)
 RETURNS TABLE(
   row_kind text,
   bundle_id text,
   project_id text,
   project_name text,
   stage_id uuid,
   bundle_label text,
   bundle_display_label text,
   scheduled_week date,
   scheduled_hours numeric,
   phase text,
   percent integer,
   weekly_goal_pct integer,
   is_on_track boolean,
   note_text text,
   total_plan_hours numeric,
   logged_at timestamp with time zone,
   log_day_date date,
   bundle_split_part text
 )
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  today_info AS (
    SELECT
      report_date AS rdate,
      date_trunc('week', report_date)::date AS current_week_monday,
      LEAST(EXTRACT(ISODOW FROM report_date)::integer - 1, 4) AS day_idx
  ),
  bundles_in_week AS (
    SELECT
      ps.project_id,
      ps.stage_id,
      ps.scheduled_week,
      ps.bundle_label,
      ps.split_part,
      MAX(ps.split_total) AS split_total,
      SUM(ps.scheduled_hours) AS scheduled_hours
    FROM production_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
      AND ps.bundle_label IS NOT NULL
    GROUP BY ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label, ps.split_part
  ),
  this_week_hours AS (
    SELECT ps.project_id, SUM(ps.scheduled_hours) AS week_hours
    FROM production_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
    GROUP BY ps.project_id
  ),
  past_weeks_hours AS (
    SELECT ps.project_id, SUM(ps.scheduled_hours) AS past_hours
    FROM production_schedule ps, today_info ti
    WHERE ps.scheduled_week < ti.current_week_monday
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
    GROUP BY ps.project_id
  ),
  split_prior_hours AS (
    SELECT ps.project_id, SUM(ps.scheduled_hours) AS prior_hours
    FROM production_schedule ps, today_info ti
    WHERE ps.split_group_id IS NOT NULL
      AND ps.scheduled_week < ti.current_week_monday
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
    GROUP BY ps.project_id
  ),
  split_total_hours AS (
    SELECT ps.project_id, SUM(ps.scheduled_hours) AS chain_hours
    FROM production_schedule ps
    WHERE ps.split_group_id IS NOT NULL
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
    GROUP BY ps.project_id
  ),
  has_split AS (
    SELECT DISTINCT ps.project_id
    FROM production_schedule ps, today_info ti
    WHERE ps.split_group_id IS NOT NULL
      AND ps.scheduled_week = ti.current_week_monday
      AND ps.status IN ('scheduled', 'in_progress', 'completed', 'expedice')
  ),
  cumulative_goal AS (
    SELECT
      tw.project_id,
      CASE
        WHEN hs.project_id IS NOT NULL AND st.chain_hours > 0 THEN
          (COALESCE(sp.prior_hours, 0) + tw.week_hours * (ti.day_idx + 1)::numeric / 5)
          / st.chain_hours * 100
        ELSE
          (COALESCE(pw.past_hours, 0) + COALESCE(tw.week_hours, 0) * (ti.day_idx + 1)::numeric / 5)
          / NULLIF(pph.hodiny_plan, 0) * 100
      END AS goal_pct
    FROM today_info ti
    JOIN this_week_hours tw ON true
    LEFT JOIN past_weeks_hours pw ON pw.project_id = tw.project_id
    LEFT JOIN has_split hs ON hs.project_id = tw.project_id
    LEFT JOIN split_prior_hours sp ON sp.project_id = tw.project_id
    LEFT JOIN split_total_hours st ON st.project_id = tw.project_id
    LEFT JOIN project_plan_hours pph ON pph.project_id = tw.project_id
  ),
  todays_logs AS (
    SELECT
      pdl.bundle_id,
      pdl.phase,
      pdl.percent,
      pdl.note_text,
      pdl.logged_at,
      pdl.day_index,
      split_part(pdl.bundle_id, '::', 1) AS p_project_id,
      split_part(pdl.bundle_id, '::', 4) AS p_bundle_label,
      split_part(pdl.bundle_id, '::', 5) AS p_split_part_text,
      (split_part(pdl.bundle_id, '::', 2)::date + pdl.day_index) AS p_log_day_date
    FROM production_daily_logs pdl
    WHERE pdl.bundle_id LIKE '%::%'
      AND split_part(pdl.bundle_id, '::', 2) ~ '^\d{4}-\d{2}-\d{2}$'
      AND array_length(string_to_array(pdl.bundle_id, '::'), 1) >= 3
      AND (split_part(pdl.bundle_id, '::', 2)::date + pdl.day_index) = report_date
  )
  -- PLAN rows: every bundle scheduled for this week
  SELECT
    'plan'::text AS row_kind,
    to_char(b.scheduled_week, 'YYYY-MM-DD')
      || '::' || b.project_id
      || '::' || COALESCE(b.stage_id::text, 'none')
      || '::' || COALESCE(b.bundle_label, 'none')
      || '::' || COALESCE(b.split_part::text, 'full') AS bundle_id,
    b.project_id,
    p.project_name,
    b.stage_id,
    b.bundle_label,
    CASE
      WHEN COALESCE(b.split_total, 0) > 1 AND b.split_part IS NOT NULL
        THEN b.bundle_label || '-' || b.split_part::text
      ELSE b.bundle_label
    END AS bundle_display_label,
    b.scheduled_week,
    COALESCE(b.scheduled_hours, 0) AS scheduled_hours,
    NULL::text AS phase,
    0 AS percent,
    LEAST(ROUND(COALESCE(cg.goal_pct, 0))::integer, 100) AS weekly_goal_pct,
    false AS is_on_track,
    NULL::text AS note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    NULL::timestamp with time zone AS logged_at,
    report_date AS log_day_date,
    CASE WHEN b.split_part IS NOT NULL THEN b.split_part::text ELSE NULL END AS bundle_split_part
  FROM bundles_in_week b
  LEFT JOIN projects p ON p.project_id = b.project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = b.project_id
  LEFT JOIN cumulative_goal cg ON cg.project_id = b.project_id

  UNION ALL

  -- LOG rows: every log for the day (kept as-is, even if structure doesn't match a bundle)
  SELECT
    'log'::text AS row_kind,
    tl.bundle_id,
    tl.p_project_id AS project_id,
    p.project_name,
    NULL::uuid AS stage_id,
    NULLIF(tl.p_bundle_label, '') AS bundle_label,
    CASE
      WHEN tl.p_bundle_label IS NOT NULL AND tl.p_bundle_label <> '' THEN
        CASE
          WHEN tl.p_split_part_text IS NOT NULL
               AND tl.p_split_part_text <> ''
               AND tl.p_split_part_text <> 'full'
            THEN tl.p_bundle_label || '-' || tl.p_split_part_text
          ELSE tl.p_bundle_label
        END
      ELSE NULL
    END AS bundle_display_label,
    NULL::date AS scheduled_week,
    0::numeric AS scheduled_hours,
    tl.phase,
    tl.percent,
    LEAST(ROUND(COALESCE(cg.goal_pct, 0))::integer, 100) AS weekly_goal_pct,
    tl.percent >= LEAST(ROUND(COALESCE(cg.goal_pct, 0))::integer, 100) AS is_on_track,
    tl.note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    tl.logged_at,
    tl.p_log_day_date AS log_day_date,
    NULLIF(NULLIF(tl.p_split_part_text, ''), 'full') AS bundle_split_part
  FROM todays_logs tl
  LEFT JOIN projects p ON p.project_id = tl.p_project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = tl.p_project_id
  LEFT JOIN cumulative_goal cg ON cg.project_id = tl.p_project_id

  ORDER BY 4 NULLS LAST, 1, 7 NULLS LAST, 11 DESC NULLS LAST;
$function$;