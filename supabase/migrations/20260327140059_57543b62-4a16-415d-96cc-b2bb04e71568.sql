
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_records()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Clean up project_plan_hours for projects about to be purged
  DELETE FROM project_plan_hours WHERE project_id IN (
    SELECT project_id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days'
  );
  -- Clean up production_hours_log for projects about to be purged
  DELETE FROM production_hours_log WHERE ami_project_id IN (
    SELECT project_id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days'
  );
  DELETE FROM tpv_items WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
  DELETE FROM project_stages WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '14 days';
END;
$function$;
