
-- 1) Vymazat denní logy patriace midflight bundle ID
DELETE FROM public.production_daily_logs
WHERE bundle_id LIKE '%::MF_%';

-- 2) Vymazat midflight a historické záznamy zo schedule
DELETE FROM public.production_schedule
WHERE is_midflight = true OR is_historical = true;

-- 3) Vymazat midflight expedice
DELETE FROM public.production_expedice
WHERE is_midflight = true;

-- 4) Vymazať inbox položky vytvorené midflight reconciliation logikou
DELETE FROM public.production_inbox
WHERE adhoc_reason LIKE 'midflight%'
   OR adhoc_reason LIKE 'recon_%';

-- 5) Vyčistiť reconciliation flagy v zostávajúcich inbox položkách
UPDATE public.production_inbox
SET adhoc_reason = NULL
WHERE adhoc_reason LIKE 'recon_%';

-- 6) Reset split metadát na pending inbox položkách
UPDATE public.production_inbox
SET split_group_id = NULL,
    split_part = NULL,
    split_total = NULL
WHERE status = 'pending'
  AND (split_group_id IS NOT NULL OR split_part IS NOT NULL OR split_total IS NOT NULL);

-- 7) Reset split metadát na aktívnych schedule položkách (scheduled / in_progress)
UPDATE public.production_schedule
SET split_group_id = NULL,
    split_part = NULL,
    split_total = NULL
WHERE status IN ('scheduled', 'in_progress')
  AND (split_group_id IS NOT NULL OR split_part IS NOT NULL OR split_total IS NOT NULL);
