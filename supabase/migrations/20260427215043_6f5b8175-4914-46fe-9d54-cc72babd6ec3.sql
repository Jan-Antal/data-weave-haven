CREATE OR REPLACE FUNCTION public.get_daily_report(report_date date)
 RETURNS TABLE(row_kind text, bundle_id text, project_id text, project_name text, stage_id uuid, bundle_label text, bundle_display_label text, scheduled_week date, scheduled_hours numeric, phase text, percent integer, weekly_goal_pct integer, is_on_track boolean, note_text text, total_plan_hours numeric, logged_at timestamp with time zone, log_day_date date, bundle_split_part text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  today_info AS (
    SELECT
      report_date AS rdate,
      date_trunc('week', report_date)::date AS current_week_monday,
      EXTRACT(ISODOW FROM report_date)::integer AS isodow_today
  ),
  -- Real working days for the displayed week (defaults to 5 when no capacity row).
  -- Clamped to 1..5 to keep the math sane in case of bad data.
  week_capacity AS (
    SELECT
      GREATEST(
        1,
        LEAST(
          5,
          COALESCE(
            (SELECT working_days
               FROM production_capacity pc, today_info ti
              WHERE pc.week_start = ti.current_week_monday
              LIMIT 1),
            5
          )
        )
      ) AS week_working_days
  ),
  -- How many working days have already finished by the report date.
  -- Mid-day counts the in-progress day as already started → use isodow_today (Mon=1 → 1 completed, Tue=2 → 2, …)
  -- but never exceed week_working_days (covers shortened weeks where holiday is on Friday).
  -- Saturday/Sunday → all working days completed.
  day_progress AS (
    SELECT
      LEAST(ti.isodow_today, wc.week_working_days)::numeric AS completed_workdays,
      wc.week_working_days::numeric AS week_working_days
    FROM today_info ti, week_capacity wc
  ),
  active_schedule AS (
    SELECT *
    FROM production_schedule
    WHERE status IN ('scheduled', 'in_progress', 'completed', 'expedice')
      AND bundle_label IS NOT NULL
  ),
  bundles_in_week AS (
    SELECT
      ps.project_id,
      ps.stage_id,
      ps.scheduled_week,
      ps.bundle_label,
      ps.split_part,
      MAX(ps.split_total) AS split_total,
      MAX(ps.split_group_id::text) AS split_group_id_text,
      SUM(ps.scheduled_hours) AS scheduled_hours
    FROM active_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
    GROUP BY ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label, ps.split_part
  ),
  bundle_keys AS (
    SELECT DISTINCT
      ps.project_id,
      ps.stage_id,
      ps.bundle_label,
      ps.split_group_id
    FROM active_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
  ),
  bundle_chain_hours AS (
    SELECT
      bk.project_id, bk.stage_id, bk.bundle_label, bk.split_group_id,
      COALESCE((
        SELECT SUM(ps.scheduled_hours)
        FROM active_schedule ps, today_info ti
        WHERE
          (
            (bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
            OR
            (bk.split_group_id IS NULL
              AND ps.project_id = bk.project_id
              AND ps.bundle_label = bk.bundle_label
              AND ps.stage_id IS NOT DISTINCT FROM bk.stage_id
              AND ps.scheduled_week = ti.current_week_monday)
          )
      ), 0) AS chain_total_hours,
      COALESCE((
        SELECT SUM(ps.scheduled_hours)
        FROM active_schedule ps, today_info ti
        WHERE
          ps.scheduled_week < ti.current_week_monday
          AND (
            (bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
          )
      ), 0) AS chain_prior_hours,
      COALESCE((
        SELECT SUM(ps.scheduled_hours)
        FROM active_schedule ps, today_info ti
        WHERE
          ps.scheduled_week = ti.current_week_monday
          AND (
            (bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
            OR
            (bk.split_group_id IS NULL
              AND ps.project_id = bk.project_id
              AND ps.bundle_label = bk.bundle_label
              AND ps.stage_id IS NOT DISTINCT FROM bk.stage_id)
          )
      ), 0) AS this_week_hours
    FROM bundle_keys bk
  ),
  bundle_goal AS (
    SELECT
      bch.project_id, bch.stage_id, bch.bundle_label, bch.split_group_id,
      LEAST(
        ROUND(
          CASE
            WHEN bch.chain_total_hours > 0 THEN
              (bch.chain_prior_hours + bch.this_week_hours * dp.completed_workdays / dp.week_working_days)
              / bch.chain_total_hours * 100
            ELSE 0
          END
        )::integer,
        100
      ) AS goal_pct
    FROM bundle_chain_hours bch, day_progress dp
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
    COALESCE(bg.goal_pct, 0) AS weekly_goal_pct,
    false AS is_on_track,
    NULL::text AS note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    NULL::timestamp with time zone AS logged_at,
    report_date AS log_day_date,
    CASE WHEN b.split_part IS NOT NULL THEN b.split_part::text ELSE NULL END AS bundle_split_part
  FROM bundles_in_week b
  LEFT JOIN projects p ON p.project_id = b.project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = b.project_id
  LEFT JOIN bundle_goal bg
    ON bg.project_id = b.project_id
   AND bg.bundle_label = b.bundle_label
   AND bg.stage_id IS NOT DISTINCT FROM b.stage_id

  UNION ALL

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
    COALESCE(bg.goal_pct, 0) AS weekly_goal_pct,
    tl.percent >= COALESCE(bg.goal_pct, 0) AS is_on_track,
    tl.note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    tl.logged_at,
    tl.p_log_day_date AS log_day_date,
    NULLIF(NULLIF(tl.p_split_part_text, ''), 'full') AS bundle_split_part
  FROM todays_logs tl
  LEFT JOIN projects p ON p.project_id = tl.p_project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = tl.p_project_id
  LEFT JOIN LATERAL (
    SELECT goal_pct
    FROM bundle_goal bg2
    WHERE bg2.project_id = tl.p_project_id
      AND bg2.bundle_label = NULLIF(tl.p_bundle_label, '')
    LIMIT 1
  ) bg ON true

  ORDER BY 4 NULLS LAST, 1, 7 NULLS LAST, 11 DESC NULLS LAST;
$function$;