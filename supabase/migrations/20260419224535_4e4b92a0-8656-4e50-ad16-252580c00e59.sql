
-- Dedupe inbox rows orphaned by old midflight reconciliation, then revert markers.
-- Keep the row with the highest estimated_hours per (project_id, item_code) among recon-tagged rows.
WITH recon_rows AS (
  SELECT id, project_id, item_code, estimated_hours,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, item_code
      ORDER BY estimated_hours DESC, sent_at ASC, id ASC
    ) AS rn
  FROM public.production_inbox
  WHERE item_code IS NOT NULL
    AND (adhoc_reason = 'recon_scheduled' OR adhoc_reason LIKE 'recon_reduced%')
)
DELETE FROM public.production_inbox
WHERE id IN (SELECT id FROM recon_rows WHERE rn > 1);

-- Now revert remaining recon rows back to clean pending
UPDATE public.production_inbox
SET status = 'pending',
    adhoc_reason = NULL,
    split_group_id = NULL,
    split_part = NULL,
    split_total = NULL
WHERE adhoc_reason = 'recon_scheduled'
   OR adhoc_reason LIKE 'recon_reduced%';

-- Clean orphan midflight schedule rows
DELETE FROM public.production_schedule WHERE is_midflight = true;
DELETE FROM public.production_schedule WHERE is_historical = true;
DELETE FROM public.production_schedule WHERE item_code LIKE 'HIST_%';

-- Clean midflight expedice markers
DELETE FROM public.production_expedice WHERE is_midflight = true;

-- Clean midflight daily logs
DELETE FROM public.production_daily_logs WHERE bundle_id LIKE '%::MF_%';

-- Clean leftover midflight-tagged inbox markers
DELETE FROM public.production_inbox WHERE adhoc_reason LIKE 'midflight%';
