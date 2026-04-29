
-- =====================================================================
-- REPAIR: Bloated bundles where planned weeks contain duplicated values
-- per item_code. Algorithm:
--   1. canonical (h, czk) per (split_group_id, item_code) = MAX across
--      planned (non-midflight) weeks
--   2. count of planned weeks per item_code = N
--   3. each planned week gets canonical / N (rounded to 1 decimal hours,
--      0 decimals czk); first week absorbs rounding remainder
--   4. midflight rows untouched
-- =====================================================================

WITH target_groups AS (
  SELECT unnest(ARRAY[
    'c722ec3f-8430-4a1a-a0cf-63e6fbb42fce'::uuid,
    '6e4c7c2e-dc86-4cc1-a7e5-356bd9644542'::uuid,
    'd4beee3c-59a5-4a8c-be91-569b2257f80f'::uuid,
    'a5804482-8d0b-438c-bddb-499a553a8807'::uuid
  ]) AS sg_id
),
planned_rows AS (
  SELECT ps.id, ps.split_group_id, ps.item_code, ps.scheduled_week,
         ps.scheduled_hours, ps.scheduled_czk
  FROM production_schedule ps
  JOIN target_groups tg ON tg.sg_id = ps.split_group_id
  WHERE ps.is_midflight = false
    AND ps.status IN ('scheduled','in_progress','paused')
    AND ps.item_code IS NOT NULL
),
canonical AS (
  SELECT split_group_id, item_code,
         MAX(scheduled_hours) AS canon_h,
         MAX(scheduled_czk)   AS canon_czk,
         COUNT(*)             AS n_weeks
  FROM planned_rows
  GROUP BY split_group_id, item_code
),
ordered_weeks AS (
  SELECT pr.id, pr.split_group_id, pr.item_code, pr.scheduled_week,
         ROW_NUMBER() OVER (
           PARTITION BY pr.split_group_id, pr.item_code
           ORDER BY pr.scheduled_week
         ) AS week_rank,
         c.canon_h, c.canon_czk, c.n_weeks
  FROM planned_rows pr
  JOIN canonical c
    ON c.split_group_id = pr.split_group_id
   AND c.item_code      = pr.item_code
),
new_values AS (
  SELECT
    id,
    -- equal share of hours, rounded to 0.1; first week gets remainder
    CASE
      WHEN week_rank = 1 THEN
        ROUND(canon_h - ROUND(canon_h / n_weeks, 1) * (n_weeks - 1), 1)
      ELSE
        ROUND(canon_h / n_weeks, 1)
    END AS new_h,
    CASE
      WHEN week_rank = 1 THEN
        ROUND(canon_czk - ROUND(canon_czk / n_weeks, 0) * (n_weeks - 1), 0)
      ELSE
        ROUND(canon_czk / n_weeks, 0)
    END AS new_czk
  FROM ordered_weeks
)
UPDATE production_schedule ps
   SET scheduled_hours = nv.new_h,
       scheduled_czk   = nv.new_czk
  FROM new_values nv
 WHERE ps.id = nv.id
   AND (ps.scheduled_hours <> nv.new_h OR ps.scheduled_czk <> nv.new_czk);
