DO $$
DECLARE
  pid text := 'Z-2607-008';
  chain_id uuid;
  stage_default uuid;
BEGIN
  SELECT split_group_id INTO chain_id
  FROM production_schedule
  WHERE project_id=pid AND status<>'cancelled' AND split_group_id IS NOT NULL
  GROUP BY split_group_id ORDER BY count(*) DESC LIMIT 1;

  SELECT stage_id INTO stage_default
  FROM production_schedule
  WHERE project_id=pid AND status<>'cancelled' AND stage_id IS NOT NULL
  ORDER BY scheduled_week ASC LIMIT 1;

  WITH active_tpv AS (
    SELECT t.item_code, t.nazev, t.hodiny_plan::numeric AS tpv_h,
           floor(t.cena * COALESCE(t.pocet,1))::numeric AS tpv_czk_full
    FROM tpv_items t
    WHERE t.project_id=pid AND t.deleted_at IS NULL
      AND t.status IS DISTINCT FROM 'Zrušeno' AND COALESCE(t.cena,0)>0 AND COALESCE(t.hodiny_plan,0)>0
  ),
  sched AS (
    SELECT ps.id, regexp_replace(ps.item_code, '_[a-z0-9]{4,8}$','','i') AS code,
           ps.scheduled_week, ps.scheduled_hours, ps.scheduled_czk, ps.is_midflight, ps.status
    FROM production_schedule ps WHERE ps.project_id=pid
  ),
  locked_per_code AS (
    SELECT code, SUM(scheduled_hours) lh, SUM(scheduled_czk) lc
    FROM sched WHERE is_midflight OR status IN ('completed','expedice','cancelled')
    GROUP BY code
  ),
  editable_week_totals AS (
    SELECT s.scheduled_week, SUM(s.scheduled_hours) week_h
    FROM sched s WHERE NOT s.is_midflight AND s.status NOT IN ('completed','expedice','cancelled')
    GROUP BY s.scheduled_week
  ),
  total_editable AS (SELECT NULLIF(SUM(week_h),0) sum_h FROM editable_week_totals),
  week_ratio AS (
    SELECT wt.scheduled_week, COALESCE(wt.week_h / te.sum_h, 1.0/COUNT(*) OVER ()) AS ratio
    FROM editable_week_totals wt CROSS JOIN total_editable te
  ),
  targets AS (
    SELECT a.item_code, a.nazev, wr.scheduled_week,
           ROUND( GREATEST(0, a.tpv_h - COALESCE(lpc.lh,0)) * wr.ratio, 1 ) AS target_h,
           FLOOR( GREATEST(0, a.tpv_czk_full - COALESCE(lpc.lc,0)) * wr.ratio ) AS target_c
    FROM active_tpv a
    LEFT JOIN locked_per_code lpc ON lpc.code=a.item_code
    CROSS JOIN week_ratio wr
  )
  UPDATE production_schedule ps
  SET scheduled_hours = t.target_h, scheduled_czk = t.target_c
  FROM targets t
  WHERE ps.project_id=pid
    AND ps.status NOT IN ('completed','expedice','cancelled')
    AND NOT ps.is_midflight
    AND regexp_replace(ps.item_code, '_[a-z0-9]{4,8}$','','i') = t.item_code
    AND ps.scheduled_week = t.scheduled_week
    AND (ps.scheduled_hours <> t.target_h OR ps.scheduled_czk <> t.target_c);

  INSERT INTO production_schedule (
    project_id, stage_id, item_name, item_code, scheduled_week,
    scheduled_hours, scheduled_czk, position, status, split_group_id
  )
  SELECT pid, stage_default, t.nazev, t.item_code, t.scheduled_week,
         t.target_h, t.target_c, 999, 'scheduled', chain_id
  FROM (
    WITH active_tpv AS (
      SELECT t.item_code, t.nazev, t.hodiny_plan::numeric AS tpv_h,
             floor(t.cena * COALESCE(t.pocet,1))::numeric AS tpv_czk_full
      FROM tpv_items t
      WHERE t.project_id=pid AND t.deleted_at IS NULL
        AND t.status IS DISTINCT FROM 'Zrušeno' AND COALESCE(t.cena,0)>0 AND COALESCE(t.hodiny_plan,0)>0
    ),
    sched AS (
      SELECT regexp_replace(ps.item_code, '_[a-z0-9]{4,8}$','','i') AS code,
             ps.scheduled_week, ps.scheduled_hours, ps.is_midflight, ps.status
      FROM production_schedule ps WHERE ps.project_id=pid
    ),
    locked_per_code AS (
      SELECT code, SUM(scheduled_hours) lh
      FROM sched WHERE is_midflight OR status IN ('completed','expedice','cancelled')
      GROUP BY code
    ),
    editable_week_totals AS (
      SELECT s.scheduled_week, SUM(s.scheduled_hours) week_h
      FROM sched s WHERE NOT s.is_midflight AND s.status NOT IN ('completed','expedice','cancelled')
      GROUP BY s.scheduled_week
    ),
    total_editable AS (SELECT NULLIF(SUM(week_h),0) sum_h FROM editable_week_totals),
    week_ratio AS (
      SELECT wt.scheduled_week, COALESCE(wt.week_h / te.sum_h, 1.0/COUNT(*) OVER ()) AS ratio
      FROM editable_week_totals wt CROSS JOIN total_editable te
    )
    SELECT a.item_code, a.nazev, wr.scheduled_week,
           ROUND( GREATEST(0, a.tpv_h - COALESCE(lpc.lh,0)) * wr.ratio, 1 ) AS target_h,
           FLOOR( GREATEST(0, a.tpv_czk_full) * wr.ratio ) AS target_c
    FROM active_tpv a
    LEFT JOIN locked_per_code lpc ON lpc.code=a.item_code
    CROSS JOIN week_ratio wr
  ) t
  WHERE t.target_h > 0 AND NOT EXISTS (
    SELECT 1 FROM production_schedule ps
    WHERE ps.project_id=pid
      AND regexp_replace(ps.item_code, '_[a-z0-9]{4,8}$','','i') = t.item_code
      AND ps.scheduled_week = t.scheduled_week
      AND ps.status <> 'cancelled'
  );

  WITH wks AS (
    SELECT scheduled_week, ROW_NUMBER() OVER (ORDER BY scheduled_week) AS part,
           COUNT(*) OVER () AS total
    FROM (SELECT DISTINCT scheduled_week FROM production_schedule
          WHERE project_id=pid AND split_group_id=chain_id AND status<>'cancelled') x
  )
  UPDATE production_schedule ps
  SET split_part = w.part, split_total = w.total
  FROM wks w
  WHERE ps.project_id=pid AND ps.split_group_id=chain_id AND ps.status<>'cancelled'
    AND ps.scheduled_week = w.scheduled_week;
END $$;