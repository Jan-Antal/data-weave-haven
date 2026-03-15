
CREATE OR REPLACE FUNCTION public.clean_test_production_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_defects integer;
  deleted_checks integer;
  deleted_logs integer;
  deleted_schedule integer;
  deleted_inbox integer;
  extra_schedule integer;
BEGIN
  DELETE FROM production_quality_defects
  WHERE project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL)
     OR project_id LIKE 'TEST%'
     OR project_id LIKE 'test%';
  GET DIAGNOSTICS deleted_defects = ROW_COUNT;

  DELETE FROM production_quality_checks
  WHERE project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL)
     OR project_id LIKE 'TEST%'
     OR project_id LIKE 'test%';
  GET DIAGNOSTICS deleted_checks = ROW_COUNT;

  DELETE FROM production_daily_logs
  WHERE bundle_id IN (
    SELECT id::text FROM production_schedule
    WHERE project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL)
       OR project_id LIKE 'TEST%'
       OR project_id LIKE 'test%'
  );
  GET DIAGNOSTICS deleted_logs = ROW_COUNT;

  DELETE FROM production_schedule
  WHERE project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL)
     OR project_id LIKE 'TEST%'
     OR project_id LIKE 'test%';
  GET DIAGNOSTICS deleted_schedule = ROW_COUNT;

  DELETE FROM production_inbox
  WHERE project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL)
     OR project_id LIKE 'TEST%'
     OR project_id LIKE 'test%';
  GET DIAGNOSTICS deleted_inbox = ROW_COUNT;

  DELETE FROM production_schedule
  WHERE is_blocker = true
    AND project_id NOT IN (SELECT project_id FROM projects WHERE deleted_at IS NULL);
  GET DIAGNOSTICS extra_schedule = ROW_COUNT;
  deleted_schedule := deleted_schedule + extra_schedule;

  RETURN jsonb_build_object(
    'production_schedule', deleted_schedule,
    'production_inbox', deleted_inbox,
    'production_daily_logs', deleted_logs,
    'production_quality_checks', deleted_checks,
    'production_quality_defects', deleted_defects
  );
END;
$$;
