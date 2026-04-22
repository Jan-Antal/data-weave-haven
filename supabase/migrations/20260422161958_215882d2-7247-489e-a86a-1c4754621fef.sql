ALTER TABLE public.production_schedule
ADD COLUMN IF NOT EXISTS bundle_label text,
ADD COLUMN IF NOT EXISTS bundle_type text;

ALTER TABLE public.production_schedule
DROP CONSTRAINT IF EXISTS production_schedule_bundle_type_check;

ALTER TABLE public.production_schedule
ADD CONSTRAINT production_schedule_bundle_type_check
CHECK (bundle_type IS NULL OR bundle_type IN ('full', 'split'));

WITH existing_groups AS (
  SELECT
    project_id,
    stage_id,
    COALESCE(split_group_id::text, scheduled_week::text || ':' || position::text) AS legacy_group_key,
    MIN(scheduled_week) AS first_week,
    MIN(position) AS first_position,
    CASE
      WHEN bool_or(split_group_id IS NOT NULL OR split_part IS NOT NULL OR split_total IS NOT NULL) THEN 'split'
      ELSE 'full'
    END AS inferred_type
  FROM public.production_schedule
  WHERE status IN ('scheduled', 'in_progress', 'paused', 'completed', 'returned')
    AND bundle_label IS NULL
  GROUP BY project_id, stage_id, COALESCE(split_group_id::text, scheduled_week::text || ':' || position::text)
),
numbered_groups AS (
  SELECT
    *,
    chr((64 + (((dense_rank() OVER (PARTITION BY project_id, stage_id ORDER BY first_week, first_position, legacy_group_key) - 1) % 26) + 1))::integer) AS assigned_label
  FROM existing_groups
)
UPDATE public.production_schedule ps
SET
  bundle_label = ng.assigned_label,
  bundle_type = COALESCE(ps.bundle_type, ng.inferred_type)
FROM numbered_groups ng
WHERE ps.project_id = ng.project_id
  AND ps.stage_id IS NOT DISTINCT FROM ng.stage_id
  AND COALESCE(ps.split_group_id::text, ps.scheduled_week::text || ':' || ps.position::text) = ng.legacy_group_key
  AND ps.bundle_label IS NULL;

UPDATE public.production_schedule
SET bundle_type = CASE
  WHEN split_group_id IS NOT NULL OR split_part IS NOT NULL OR split_total IS NOT NULL THEN 'split'
  ELSE 'full'
END
WHERE bundle_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_production_schedule_bundle_identity
ON public.production_schedule (project_id, stage_id, bundle_label, split_part);

CREATE INDEX IF NOT EXISTS idx_production_schedule_bundle_lookup
ON public.production_schedule (project_id, stage_id, scheduled_week, bundle_label);