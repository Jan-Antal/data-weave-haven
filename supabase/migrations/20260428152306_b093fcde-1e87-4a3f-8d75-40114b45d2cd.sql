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
  week_capacity AS (
    SELECT
      GREATEST(1, LEAST(5,
        COALESCE(
          (SELECT working_days FROM production_capacity pc, today_info ti
            WHERE pc.week_start = ti.current_week_monday LIMIT 1),
          5
        )
      )) AS week_working_days
  ),
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
      ps.project_id, ps.stage_id, ps.bundle_label, ps.split_group_id
    FROM active_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
  ),
  bundle_chain_hours AS (
    SELECT
      bk.project_id, bk.stage_id, bk.bundle_label, bk.split_group_id,
      COALESCE((
        SELECT SUM(ps.scheduled_hours) FROM active_schedule ps, today_info ti
        WHERE ((bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
            OR (bk.split_group_id IS NULL
              AND ps.project_id = bk.project_id AND ps.bundle_label = bk.bundle_label
              AND ps.stage_id IS NOT DISTINCT FROM bk.stage_id
              AND ps.scheduled_week = ti.current_week_monday))
      ), 0) AS chain_total_hours,
      COALESCE((
        SELECT SUM(ps.scheduled_hours) FROM active_schedule ps, today_info ti
        WHERE ps.scheduled_week < ti.current_week_monday
          AND (bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
      ), 0) AS chain_prior_hours,
      COALESCE((
        SELECT SUM(ps.scheduled_hours) FROM active_schedule ps, today_info ti
        WHERE ps.scheduled_week = ti.current_week_monday
          AND ((bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
            OR (bk.split_group_id IS NULL
              AND ps.project_id = bk.project_id AND ps.bundle_label = bk.bundle_label
              AND ps.stage_id IS NOT DISTINCT FROM bk.stage_id))
      ), 0) AS this_week_hours
    FROM bundle_keys bk
  ),
  bundle_goal AS (
    SELECT
      bch.project_id, bch.stage_id, bch.bundle_label, bch.split_group_id,
      LEAST(
        ROUND(
          CASE WHEN bch.chain_total_hours > 0 THEN
            (bch.chain_prior_hours + bch.this_week_hours * dp.completed_workdays / dp.week_working_days)
            / bch.chain_total_hours * 100
          ELSE 0 END
        )::integer,
        100
      ) AS goal_pct
    FROM bundle_chain_hours bch, day_progress dp
  ),
  raw_logs AS (
    SELECT
      pdl.bundle_id AS raw_bundle_id,
      pdl.phase, pdl.percent, pdl.note_text, pdl.logged_at, pdl.day_index,
      string_to_array(pdl.bundle_id, '::') AS parts
    FROM production_daily_logs pdl
    WHERE pdl.bundle_id LIKE '%::%'
      AND split_part(pdl.bundle_id, '::', 2) ~ '^\d{4}-\d{2}-\d{2}$'
      AND array_length(string_to_array(pdl.bundle_id, '::'), 1) >= 3
      AND (split_part(pdl.bundle_id, '::', 2)::date + pdl.day_index) = report_date
  ),
  logs_parsed AS (
    SELECT
      rl.raw_bundle_id AS bundle_id,
      rl.phase, rl.percent, rl.note_text, rl.logged_at, rl.day_index,
      rl.parts[1] AS p_project_id,
      NULLIF(rl.parts[4], '') AS raw_bundle_label,
      NULLIF(NULLIF(rl.parts[5], ''), 'full') AS raw_split_part,
      NULL::uuid AS raw_split_group_id,
      (rl.parts[2]::date + rl.day_index) AS p_log_day_date
    FROM raw_logs rl
    WHERE array_length(rl.parts, 1) >= 5
      AND rl.parts[3] NOT LIKE 'SG:%'
    UNION ALL
    SELECT
      rl.raw_bundle_id AS bundle_id,
      rl.phase, rl.percent, rl.note_text, rl.logged_at, rl.day_index,
      rl.parts[1] AS p_project_id,
      sg.bundle_label AS raw_bundle_label,
      CASE WHEN sg.split_part IS NOT NULL THEN sg.split_part::text ELSE NULL END AS raw_split_part,
      substring(rl.parts[3] FROM 4)::uuid AS raw_split_group_id,
      (rl.parts[2]::date + rl.day_index) AS p_log_day_date
    FROM raw_logs rl
    LEFT JOIN LATERAL (
      SELECT ps.bundle_label, ps.split_part
      FROM production_schedule ps
      WHERE ps.split_group_id::text = substring(rl.parts[3] FROM 4)
      LIMIT 1
    ) sg ON true
    WHERE rl.parts[3] LIKE 'SG:%'
  ),
  logs_resolved AS (
    SELECT
      lp.bundle_id, lp.phase, lp.percent, lp.note_text, lp.logged_at, lp.day_index,
      lp.p_project_id, lp.p_log_day_date,
      COALESCE(cw.bundle_label, lp.raw_bundle_label) AS p_bundle_label,
      COALESCE(
        CASE WHEN cw.split_part IS NOT NULL THEN cw.split_part::text ELSE NULL END,
        lp.raw_split_part
      ) AS p_bundle_split_part,
      lp.raw_split_group_id AS p_split_group_id
    FROM logs_parsed lp
    LEFT JOIN LATERAL (
      SELECT ps.bundle_label, ps.split_part
      FROM active_schedule ps, today_info ti
      WHERE ps.scheduled_week = ti.current_week_monday
        AND lp.raw_split_group_id IS NOT NULL
        AND ps.split_group_id = lp.raw_split_group_id
      ORDER BY ps.split_part DESC NULLS LAST
      LIMIT 1
    ) cw ON true
  ),
  log_goal AS (
    SELECT
      lr.bundle_id,
      COALESCE(
        (SELECT bg.goal_pct FROM bundle_goal bg
          WHERE bg.project_id = lr.p_project_id
            AND bg.bundle_label = lr.p_bundle_label
          LIMIT 1),
        (
          WITH chain AS (
            SELECT
              SUM(ps.scheduled_hours) AS total,
              SUM(ps.scheduled_hours) FILTER (WHERE ps.scheduled_week < (SELECT current_week_monday FROM today_info)) AS prior,
              SUM(ps.scheduled_hours) FILTER (WHERE ps.scheduled_week = (SELECT current_week_monday FROM today_info)) AS this_week
            FROM active_schedule ps
            WHERE ps.project_id = lr.p_project_id
              AND ps.bundle_label = lr.p_bundle_label
              AND (lr.p_bundle_split_part IS NULL OR ps.split_part::text = lr.p_bundle_split_part)
          )
          SELECT LEAST(
            ROUND(
              CASE WHEN COALESCE(c.total, 0) > 0
                THEN (COALESCE(c.prior, 0) + COALESCE(c.this_week, 0) * dp.completed_workdays / dp.week_working_days) / c.total * 100
                ELSE 0 END
            )::integer, 100
          )
          FROM chain c, day_progress dp
          WHERE COALESCE(c.total, 0) > 0
        )
      ) AS goal_pct
    FROM logs_resolved lr
    WHERE lr.p_bundle_label IS NOT NULL
  )
  SELECT
    'plan'::text AS row_kind,
    to_char(b.scheduled_week, 'YYYY-MM-DD')
      || '::' || b.project_id
      || '::' || COALESCE(b.stage_id::text, 'none')
      || '::' || COALESCE(b.bundle_label, 'none')
      || '::' || COALESCE(b.split_part::text, 'full') AS bundle_id,
    b.project_id, p.project_name, b.stage_id, b.bundle_label,
    CASE
      WHEN COALESCE(b.split_total, 0) > 1 AND b.split_part IS NOT NULL
        THEN b.bundle_label || '-' || b.split_part::text
      ELSE b.bundle_label
    END AS bundle_display_label,
    b.scheduled_week,
    COALESCE(b.scheduled_hours, 0) AS scheduled_hours,
    NULL::text AS phase, 0 AS percent,
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
    lr.bundle_id,
    lr.p_project_id, p.project_name,
    NULL::uuid AS stage_id,
    lr.p_bundle_label AS bundle_label,
    CASE
      WHEN lr.p_bundle_label IS NOT NULL THEN
        CASE WHEN lr.p_bundle_split_part IS NOT NULL
          THEN lr.p_bundle_label || '-' || lr.p_bundle_split_part
          ELSE lr.p_bundle_label END
      ELSE NULL
    END AS bundle_display_label,
    NULL::date AS scheduled_week,
    0::numeric AS scheduled_hours,
    lr.phase, lr.percent,
    lg.goal_pct AS weekly_goal_pct,
    CASE WHEN lg.goal_pct IS NOT NULL THEN lr.percent >= lg.goal_pct ELSE NULL END AS is_on_track,
    lr.note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    lr.logged_at,
    lr.p_log_day_date AS log_day_date,
    lr.p_bundle_split_part AS bundle_split_part
  FROM logs_resolved lr
  LEFT JOIN projects p ON p.project_id = lr.p_project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = lr.p_project_id
  LEFT JOIN log_goal lg ON lg.bundle_id = lr.bundle_id

  ORDER BY 4 NULLS LAST, 1, 7 NULLS LAST, 11 DESC NULLS LAST;
$function$;