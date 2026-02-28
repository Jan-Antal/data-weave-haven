
-- Rename table project_activity_log → data_log
ALTER TABLE public.project_activity_log RENAME TO data_log;

-- Update action_type values: etapa_* → stage_*
UPDATE public.data_log SET action_type = REPLACE(action_type, 'etapa_', 'stage_') WHERE action_type LIKE 'etapa_%';

-- Update cleanup function to reference new table name
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM data_log WHERE created_at < now() - interval '30 days';
END;
$function$;
