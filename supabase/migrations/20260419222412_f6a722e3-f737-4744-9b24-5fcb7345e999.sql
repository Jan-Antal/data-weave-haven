-- Allow 'completed' status in production_schedule (used by midflight historical bundles)
CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'paused', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, paused, cancelled, or completed', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;