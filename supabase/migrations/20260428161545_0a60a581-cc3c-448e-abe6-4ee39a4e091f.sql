CREATE OR REPLACE FUNCTION public.get_daily_report(report_date date)
 RETURNS TABLE(row_kind text, bundle_id text, project_id text, project_name text, stage_id uuid, bundle_label text, bundle_display_label text, scheduled_week date, scheduled_hours numeric, phase text, percent integer, weekly_goal_pct integer, is_on_track boolean, note_text text, total_plan_hours numeric, logged_at timestamp with time zone, log_day_date date, bundle_split_part text, is_unplanned boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  today_info AS (
    SELECT
      report_date AS rdate,
      date_trunc('week', report_date)::date AS current_week_monday,
      (date_trunc('week', report_date)::date - interval '7 days')::date AS prev_week_monday,
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
  week_alveno_projects AS (
    SELECT DISTINCT phl.ami_project_id AS project_id
    FROM production_hours_log phl, today_info ti
    WHERE phl.datum_sync >= ti.current_week_monday
      AND phl.datum_sync < ti.current_week_monday + interval '7 days'
      AND COALESCE(phl.cinnost_kod, '') NOT IN ('TPV','ENG','PRO')
      AND phl.ami_project_id NOT IN (
        SELECT project_code FROM overhead_projects WHERE is_active
      )
  ),
  week_dlog_projects AS (
    SELECT DISTINCT split_part(pdl.bundle_id, '::', 1) AS project_id
    FROM production_daily_logs pdl, today_info ti
    WHERE pdl.bundle_id LIKE '%::%'
      AND split_part(pdl.bundle_id, '::', 2) ~ '^\d{4}-\d{2}-\d{2}$'
      AND split_part(pdl.bundle_id, '::', 2)::date = ti.current_week_monday
  ),
  active_projects AS (
    SELECT project_id FROM week_alveno_projects
    UNION
    SELECT project_id FROM week_dlog_projects
  ),
  active_schedule AS (
    SELECT *
    FROM production_schedule
    WHERE status IN ('scheduled', 'in_progress', 'completed', 'expedice')
      AND bundle_label IS NOT NULL
  ),
  week_log_bundles AS (
    SELECT DISTINCT
      parts[1] AS project_id,
      COALESCE(
        NULLIF(parts[4], ''),
        (SELECT ps.bundle_label FROM production_schedule ps
          WHERE parts[3] LIKE 'SG:%'
            AND ps.split_group_id::text = substring(parts[3] FROM 4)
          LIMIT 1)
      ) AS bundle_label
    FROM (
      SELECT string_to_array(pdl.bundle_id, '::') AS parts
      FROM production_daily_logs pdl, today_info ti
      WHERE pdl.bundle_id LIKE '%::%'
        AND split_part(pdl.bundle_id, '::', 2) ~ '^\d{4}-\d{2}-\d{2}$'
        AND split_part(pdl.bundle_id, '::', 2)::date = ti.current_week_monday
        AND array_length(string_to_array(pdl.bundle_id, '::'), 1) >= 3
    ) x
  ),
  -- Spillover: only from immediately previous week.
  -- Skip if any log in prev week already met the bundle's weekly target.
  -- Match logs by split_group_id OR by project+week (legacy bare key) OR by bundle_label.
  spillover_bundles AS (
    SELECT DISTINCT ON (ps.project_id, ps.stage_id, ps.bundle_label, COALESCE(ps.split_group_id::text, 'none'))
      ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label,
      ps.split_part, ps.split_total, ps.split_group_id, ps.scheduled_hours
    FROM production_schedule ps, today_info ti
    WHERE ps.status IN ('scheduled', 'in_progress', 'paused')
      AND ps.bundle_label IS NOT NULL
      AND ps.scheduled_week = ti.prev_week_monday
      AND NOT EXISTS (
        SELECT 1 FROM production_schedule ps2
        WHERE ps2.scheduled_week = ti.current_week_monday
          AND ps2.bundle_label IS NOT NULL
          AND ps2.status IN ('scheduled','in_progress','completed','expedice','paused')
          AND (
            (ps.split_group_id IS NOT NULL AND ps2.split_group_id = ps.split_group_id)
            OR (ps.split_group_id IS NULL
                AND ps2.project_id = ps.project_id
                AND ps2.stage_id IS NOT DISTINCT FROM ps.stage_id
                AND ps2.bundle_label = ps.bundle_label)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM production_daily_logs pdl
        WHERE (pdl.percent >= 100 OR pdl.phase IN ('Hotovo','Expedice'))
          AND (
            -- Match by split_group_id
            (ps.split_group_id IS NOT NULL
              AND pdl.bundle_id = ps.project_id || '::' || to_char(ti.prev_week_monday,'YYYY-MM-DD') || '::SG:' || ps.split_group_id::text)
            OR
            -- Match by bundle_label (modern format)
            (pdl.bundle_id LIKE ps.project_id || '::' || to_char(ti.prev_week_monday,'YYYY-MM-DD') || '::%::' || ps.bundle_label || '::%')
            OR
            -- Match by legacy bare key (single-bundle weeks)
            (pdl.bundle_id = ps.project_id || '::' || to_char(ti.prev_week_monday,'YYYY-MM-DD'))
          )
      )
    ORDER BY ps.project_id, ps.stage_id, ps.bundle_label, COALESCE(ps.split_group_id::text, 'none'), ps.scheduled_week DESC
  ),
  unplanned_bundles AS (
    SELECT
      wlb.project_id,
      NULL::uuid AS stage_id,
      ti.current_week_monday AS scheduled_week,
      wlb.bundle_label,
      NULL::integer AS split_part,
      NULL::integer AS split_total,
      NULL::text AS split_group_id_text,
      0::numeric AS scheduled_hours,
      false AS is_spillover,
      true AS is_unplanned
    FROM week_log_bundles wlb, today_info ti
    WHERE wlb.bundle_label IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM active_schedule ps
        WHERE ps.project_id = wlb.project_id
          AND ps.bundle_label = wlb.bundle_label
          AND ps.scheduled_week = ti.current_week_monday
      )
      AND NOT EXISTS (
        SELECT 1 FROM spillover_bundles sb
        WHERE sb.project_id = wlb.project_id
          AND sb.bundle_label = wlb.bundle_label
      )
  ),
  offplan_projects AS (
    SELECT
      wap.project_id,
      NULL::uuid AS stage_id,
      ti.current_week_monday AS scheduled_week,
      NULL::text AS bundle_label,
      NULL::integer AS split_part,
      NULL::integer AS split_total,
      NULL::text AS split_group_id_text,
      0::numeric AS scheduled_hours,
      false AS is_spillover,
      true AS is_unplanned
    FROM week_alveno_projects wap, today_info ti
    WHERE NOT EXISTS (
        SELECT 1 FROM active_schedule ps
        WHERE ps.project_id = wap.project_id
          AND ps.scheduled_week = ti.current_week_monday
      )
      AND NOT EXISTS (
        SELECT 1 FROM spillover_bundles sb
        WHERE sb.project_id = wap.project_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM week_dlog_projects wdp
        WHERE wdp.project_id = wap.project_id
      )
  ),
  bundles_in_week AS (
    SELECT
      ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label, ps.split_part,
      MAX(ps.split_total) AS split_total,
      MAX(ps.split_group_id::text) AS split_group_id_text,
      SUM(ps.scheduled_hours) AS scheduled_hours,
      false AS is_spillover,
      false AS is_unplanned
    FROM active_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
      AND ps.project_id IN (SELECT project_id FROM active_projects)
    GROUP BY ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label, ps.split_part
    UNION ALL
    SELECT
      sb.project_id, sb.stage_id, sb.scheduled_week, sb.bundle_label, sb.split_part,
      sb.split_total, sb.split_group_id::text, sb.scheduled_hours, true AS is_spillover, false AS is_unplanned
    FROM spillover_bundles sb
    UNION ALL
    SELECT
      ub.project_id, ub.stage_id, ub.scheduled_week, ub.bundle_label, ub.split_part,
      ub.split_total, ub.split_group_id_text, ub.scheduled_hours, ub.is_spillover, ub.is_unplanned
    FROM unplanned_bundles ub
    UNION ALL
    SELECT
      op.project_id, op.stage_id, op.scheduled_week, op.bundle_label, op.split_part,
      op.split_total, op.split_group_id_text, op.scheduled_hours, op.is_spillover, op.is_unplanned
    FROM offplan_projects op
  ),
  bundle_keys AS (
    SELECT DISTINCT ps.project_id, ps.stage_id, ps.bundle_label, ps.split_group_id
    FROM active_schedule ps, today_info ti
    WHERE ps.scheduled_week = ti.current_week_monday
  ),
  bundle_chain_hours AS (
    SELECT
      bk.project_id, bk.stage_id, bk.bundle_label, bk.split_group_id,
      COALESCE((
        SELECT SUM(ps.scheduled_hours) FROM active_schedule ps
        WHERE (bk.split_group_id IS NOT NULL AND ps.split_group_id = bk.split_group_id)
           OR (bk.split_group_id IS NULL
               AND ps.project_id = bk.project_id
               AND ps.bundle_label = bk.bundle_label
               AND ps.stage_id IS NOT DISTINCT FROM bk.stage_id
               AND ps.scheduled_week = (SELECT current_week_monday FROM today_info))
      ), 0) AS chain_total_hours,
      COALESCE((
        SELECT SUM(ps.scheduled_hours) FROM active_schedule ps, today_info ti
        WHERE ps.scheduled_week < ti.current_week_monday
          AND bk.split_group_id IS NOT NULL
          AND ps.split_group_id = bk.split_group_id
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
  raw_logs_today AS (
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
  raw_logs_fallback AS (
    SELECT DISTINCT ON (
      split_part(pdl.bundle_id, '::', 1),
      split_part(pdl.bundle_id, '::', 3),
      COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 4), ''), ''),
      COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 5), ''), '')
    )
      pdl.bundle_id AS raw_bundle_id,
      pdl.phase, pdl.percent, pdl.note_text, pdl.logged_at, pdl.day_index,
      string_to_array(pdl.bundle_id, '::') AS parts
    FROM production_daily_logs pdl, today_info ti
    WHERE pdl.bundle_id LIKE '%::%'
      AND split_part(pdl.bundle_id, '::', 2) ~ '^\d{4}-\d{2}-\d{2}$'
      AND array_length(string_to_array(pdl.bundle_id, '::'), 1) >= 3
      AND split_part(pdl.bundle_id, '::', 2)::date = ti.current_week_monday
      AND (split_part(pdl.bundle_id, '::', 2)::date + pdl.day_index) < report_date
      AND NOT EXISTS (
        SELECT 1 FROM raw_logs_today rt
        WHERE split_part(rt.raw_bundle_id, '::', 1) = split_part(pdl.bundle_id, '::', 1)
          AND split_part(rt.raw_bundle_id, '::', 3) = split_part(pdl.bundle_id, '::', 3)
          AND COALESCE(NULLIF(split_part(rt.raw_bundle_id, '::', 4), ''), '') = COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 4), ''), '')
          AND COALESCE(NULLIF(split_part(rt.raw_bundle_id, '::', 5), ''), '') = COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 5), ''), '')
      )
    ORDER BY
      split_part(pdl.bundle_id, '::', 1),
      split_part(pdl.bundle_id, '::', 3),
      COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 4), ''), ''),
      COALESCE(NULLIF(split_part(pdl.bundle_id, '::', 5), ''), ''),
      pdl.logged_at DESC
  ),
  raw_logs AS (
    SELECT * FROM raw_logs_today
    UNION ALL
    SELECT * FROM raw_logs_fallback
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
      || '::' || COALESCE(b.split_part::text, 'full')
      || CASE WHEN b.is_spillover THEN '::SPILL' WHEN b.is_unplanned THEN '::UNPLANNED' ELSE '' END AS bundle_id,
    b.project_id, p.project_name, b.stage_id, b.bundle_label,
    CASE
      WHEN COALESCE(b.split_total, 0) > 1 AND b.split_part IS NOT NULL
        THEN b.bundle_label || '-' || b.split_part::text
      ELSE b.bundle_label
    END AS bundle_display_label,
    b.scheduled_week,
    COALESCE(b.scheduled_hours, 0) AS scheduled_hours,
    NULL::text AS phase, 0 AS percent,
    CASE
      WHEN b.is_spillover THEN 100
      WHEN b.is_unplanned THEN 0
      ELSE COALESCE(bg.goal_pct, 0)
    END AS weekly_goal_pct,
    false AS is_on_track,
    NULL::text AS note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    NULL::timestamp with time zone AS logged_at,
    report_date AS log_day_date,
    CASE WHEN b.split_part IS NOT NULL THEN b.split_part::text ELSE NULL END AS bundle_split_part,
    b.is_unplanned
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
    lr.bundle_id, lr.p_project_id, p.project_name,
    NULL::uuid AS stage_id, lr.p_bundle_label AS bundle_label,
    CASE
      WHEN lr.p_bundle_label IS NOT NULL THEN
        CASE WHEN lr.p_bundle_split_part IS NOT NULL
          THEN lr.p_bundle_label || '-' || lr.p_bundle_split_part
          ELSE lr.p_bundle_label END
      ELSE NULL
    END AS bundle_display_label,
    NULL::date AS scheduled_week, 0::numeric AS scheduled_hours,
    lr.phase, lr.percent,
    lg.goal_pct AS weekly_goal_pct,
    CASE WHEN lg.goal_pct IS NOT NULL THEN lr.percent >= lg.goal_pct ELSE NULL END AS is_on_track,
    lr.note_text,
    COALESCE(pph.hodiny_plan, 0) AS total_plan_hours,
    lr.logged_at, lr.p_log_day_date AS log_day_date,
    lr.p_bundle_split_part AS bundle_split_part,
    false AS is_unplanned
  FROM logs_resolved lr
  LEFT JOIN projects p ON p.project_id = lr.p_project_id
  LEFT JOIN project_plan_hours pph ON pph.project_id = lr.p_project_id
  LEFT JOIN log_goal lg ON lg.bundle_id = lr.bundle_id

  ORDER BY 4 NULLS LAST, 1, 7 NULLS LAST, 11 DESC NULLS LAST;
$function$;