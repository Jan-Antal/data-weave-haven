-- Safely remove test projects (Z-2201%, Z-TEST%, TEST-%) and all related data
-- Does NOT touch Z-25XX, Z-26XX, X14, X7 or any production projects

-- Z-2201% pattern
DELETE FROM public.production_daily_logs WHERE bundle_id IN (SELECT id::text FROM public.production_schedule WHERE project_id LIKE 'Z-2201%');
DELETE FROM public.production_quality_checks WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.production_quality_defects WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.production_schedule WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.production_inbox WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.tpv_items WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.project_stages WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.data_log WHERE project_id LIKE 'Z-2201%';
DELETE FROM public.projects WHERE project_id LIKE 'Z-2201%';

-- Z-TEST% pattern
DELETE FROM public.production_daily_logs WHERE bundle_id IN (SELECT id::text FROM public.production_schedule WHERE project_id LIKE 'Z-TEST%');
DELETE FROM public.production_quality_checks WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.production_quality_defects WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.production_schedule WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.production_inbox WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.tpv_items WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.project_stages WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.data_log WHERE project_id LIKE 'Z-TEST%';
DELETE FROM public.projects WHERE project_id LIKE 'Z-TEST%';

-- TEST-% pattern (old seed)
DELETE FROM public.production_daily_logs WHERE bundle_id IN (SELECT id::text FROM public.production_schedule WHERE project_id LIKE 'TEST-%');
DELETE FROM public.production_quality_checks WHERE project_id LIKE 'TEST-%';
DELETE FROM public.production_quality_defects WHERE project_id LIKE 'TEST-%';
DELETE FROM public.production_schedule WHERE project_id LIKE 'TEST-%';
DELETE FROM public.production_inbox WHERE project_id LIKE 'TEST-%';
DELETE FROM public.tpv_items WHERE project_id LIKE 'TEST-%';
DELETE FROM public.project_stages WHERE project_id LIKE 'TEST-%';
DELETE FROM public.data_log WHERE project_id LIKE 'TEST-%';
DELETE FROM public.projects WHERE project_id LIKE 'TEST-%';