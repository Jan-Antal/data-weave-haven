
-- Step 1: Update the validate trigger to accept 'expedice' status
CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'completed', 'paused', 'cancelled', 'expedice') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, completed, paused, cancelled, or expedice', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 2: Migrate existing completed items without expediced_at to 'expedice' status
UPDATE production_schedule 
SET status = 'expedice'
WHERE status = 'completed' AND expediced_at IS NULL;
